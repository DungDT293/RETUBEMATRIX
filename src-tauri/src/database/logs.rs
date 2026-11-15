use super::{get_db, MAX_LOG_ENTRIES};
use crate::types::{LogEntry, PluginLogsPage};
use chrono::Utc;
use rusqlite::params;
use std::io::Write;

#[derive(Clone, Debug)]
pub struct StructuredLogMetadata {
    pub trace_id: String,
    pub feature: String,
    pub operation: String,
    pub stage: String,
    pub status: String,
    pub error_code: Option<String>,
    pub retryable: bool,
}

fn infer_operation(message: &str) -> &'static str {
    let lower = message.to_lowercase();
    for (needle, operation) in [
        ("upload", "upload"),
        ("download", "download"),
        ("tải", "download"),
        ("publish", "publish"),
        ("đăng", "publish"),
        ("copyright", "copyright_check"),
        ("bản quyền", "copyright_check"),
        ("bkt", "bkt_check"),
        ("channel", "channel_sync"),
        ("kênh", "channel_sync"),
        ("plugin", "plugin_workflow"),
        ("profile", "profile"),
        ("quota", "quota"),
        ("retry", "retry"),
        ("recheck", "retry"),
        ("cancel", "cancel"),
        ("hủy", "cancel"),
        ("browser", "browser"),
        ("studio", "studio"),
    ] {
        if lower.contains(needle) {
            return operation;
        }
    }
    "unknown"
}

pub fn redact_log_text(value: &str) -> String {
    let mut value = value.to_string();
    if let Ok(re) = regex::Regex::new(
        r"(?i)(authorization(?:\s*[:=]\s*|\s+)(?:Bearer\s+)?)[^\s,;]+",
    ) {
        value = re.replace_all(&value, "$1[REDACTED]").into_owned();
    }
    let sensitive = [
        "token", "access_token", "refresh_token", "api_key", "cookie", "password", "passwd", "secret", "authorization",
    ];
    let mut redact_next = false;
    let mut safe = value
        .split_whitespace()
        .map(|token| {
            let lower = token.to_lowercase();
            let key = lower
                .split_once(['=', ':'])
                .map(|(key, _)| key)
                .unwrap_or(lower.as_str());
            if redact_next {
                redact_next = false;
                return "[REDACTED]".to_string();
            }
            if sensitive.iter().any(|name| key == *name) {
                if let Some((prefix, value)) = token.split_once(['=', ':']) {
                    if value.is_empty() {
                        redact_next = true;
                    }
                    return format!("{}=[REDACTED]", prefix);
                }
                redact_next = true;
                return token.to_string();
            }
            token.to_string()
        })
        .collect::<Vec<_>>()
        .join(" ");

    if let Ok(re) = regex::Regex::new(r"(?i)(\bBearer\s+)[^\s,;]+") {
        safe = re.replace_all(&safe, "$1[REDACTED]").into_owned();
    }
    if let Ok(re) = regex::Regex::new(
        r#"(?i)([\"'](?:token|access_token|refresh_token|api_key|cookie|password|passwd|secret|authorization)[\"']\s*:\s*)([\"'][^\"']*[\"']|[^,}\s]+)"#,
    ) {
        safe = re.replace_all(&safe, "$1[REDACTED]").into_owned();
    }

    let query_keys = [
        "access_token",
        "refresh_token",
        "api_key",
        "token",
        "cookie",
        "password",
        "passwd",
        "secret",
        "authorization",
    ];
    for key in query_keys {
        let mut search_from = 0;
        while let Some(relative) = safe[search_from..].to_lowercase().find(&format!("{key}=")) {
            let start = search_from + relative;
            let value_start = start + key.len() + 1;
            let value_end = safe[value_start..]
                .find(|character: char| character == '&' || character.is_whitespace() || character == ';')
                .map(|offset| value_start + offset)
                .unwrap_or(safe.len());
            if &safe[value_start..value_end] == "[REDACTED]" {
                search_from = value_end;
                continue;
            }
            safe.replace_range(value_start..value_end, "[REDACTED]");
            search_from = value_start + "[REDACTED]".len();
        }
    }
    safe
}

pub fn classify_log_error(value: &str) -> (Option<String>, bool) {
    let lower = value.to_lowercase();
    if lower.contains("timeout") || lower.contains("timed out") {
        return (Some("NETWORK_TIMEOUT".to_string()), true);
    }
    if lower.contains("connection") || lower.contains("network") || lower.contains("reset") {
        return (Some("NETWORK_ERROR".to_string()), true);
    }
    if lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains("authentication")
        || lower.contains("cookie")
    {
        return (Some("AUTHENTICATION_FAILED".to_string()), false);
    }
    if lower.contains("quota") {
        return (Some("QUOTA_EXCEEDED".to_string()), false);
    }
    if lower.contains("not found") {
        return (Some("RESOURCE_NOT_FOUND".to_string()), false);
    }
    if lower.contains("invalid") {
        return (Some("INVALID_INPUT".to_string()), false);
    }
    (Some("UNKNOWN_ERROR".to_string()), false)
}

pub fn structured_log_defaults(
    log_type: &str,
    message: &str,
    details: Option<&str>,
) -> StructuredLogMetadata {
    let category = determine_log_category(message, details);
    let operation = infer_operation(message).to_string();
    let is_error = matches!(log_type, "error" | "stderr")
        || message.to_lowercase().contains("failed")
        || message.to_lowercase().contains("lỗi");
    let stage = if is_error {
        "error"
    } else if message.to_lowercase().contains("start")
        || message.to_lowercase().contains("bắt đầu")
    {
        "start"
    } else if matches!(log_type, "success") {
        "complete"
    } else {
        "progress"
    };
    let status = if is_error {
        "error"
    } else if matches!(log_type, "success") {
        "success"
    } else {
        "info"
    };
    let (error_code, retryable) = if is_error {
        classify_log_error(&format!("{message} {}", details.unwrap_or("")))
    } else {
        (None, false)
    };
    let error_code = error_code.map(|code| {
        if code == "UNKNOWN_ERROR" {
            format!("{}_{}_FAILED", category.to_uppercase(), operation.to_uppercase())
        } else {
            code
        }
    });
    StructuredLogMetadata {
        trace_id: uuid::Uuid::new_v4().to_string(),
        feature: category.to_string(),
        operation,
        stage: stage.to_string(),
        status: status.to_string(),
        error_code,
        retryable,
    }
}

/// Tự động phân loại danh mục file log tương ứng
#[cfg(test)]
mod tests {
    use super::{classify_log_error, redact_log_text, structured_log_defaults};

    #[test]
    fn structured_log_defaults_identify_feature_operation_and_stage() {
        let metadata = structured_log_defaults("error", "BKT upload failed", Some("timeout"));
        assert_eq!(metadata.feature, "bkt_test");
        assert_eq!(metadata.operation, "upload");
        assert_eq!(metadata.stage, "error");
        assert_eq!(metadata.status, "error");
        assert_eq!(metadata.error_code.as_deref(), Some("NETWORK_TIMEOUT"));
    }

    #[test]
    fn redact_log_text_removes_credentials_and_cookies() {
        let safe = redact_log_text("token=secret cookie: abc password=hunter2 url=https://x.test");
        assert!(!safe.contains("secret"));
        assert!(!safe.contains("abc"));
        assert!(!safe.contains("hunter2"));
        assert!(safe.contains("[REDACTED]"));

        let safe_url = redact_log_text("https://example.test/watch?v=1&access_token=secret-token");
        assert!(!safe_url.contains("secret-token"));
        assert!(safe_url.contains("access_token=[REDACTED]"));

        let safe_json = redact_log_text(
            r#"{"access_token":"json-secret","api_key":"key-secret"} Authorization: Bearer bearer-secret"#,
        );
        assert!(!safe_json.contains("json-secret"));
        assert!(!safe_json.contains("key-secret"));
        assert!(!safe_json.contains("bearer-secret"), "{safe_json}");

        let safe_plain = redact_log_text(
            "api_key: api-secret access_token: access-secret refresh_token: refresh-secret",
        );
        assert!(!safe_plain.contains("api-secret"));
        assert!(!safe_plain.contains("access-secret"));
        assert!(!safe_plain.contains("refresh-secret"));

        let safe_auth = redact_log_text("authorization Bearer auth-secret");
        assert!(!safe_auth.contains("auth-secret"));

        let safe_query = redact_log_text(
            "https://example.test/?api_key=redact-key-secret&access_token=redact-access-secret&refresh_token=redact-refresh-secret&cookie=redact-cookie-secret&password=redact-password-secret&authorization=redact-auth-secret",
        );
        for secret in [
            "redact-key-secret",
            "redact-access-secret",
            "redact-refresh-secret",
            "redact-cookie-secret",
            "redact-password-secret",
            "redact-auth-secret",
        ] {
            assert!(!safe_query.contains(secret), "{safe_query}");
        }
    }

    #[test]
    fn classify_log_error_marks_retryable_transport_errors() {
        let (code, retryable) = classify_log_error("Network timeout while calling YouTube");
        assert_eq!(code, Some("NETWORK_TIMEOUT".to_string()));
        assert!(retryable);
    }
}

pub fn determine_log_category(message: &str, details: Option<&str>) -> &'static str {
    let lower = format!("{} {}", message, details.unwrap_or("")).to_lowercase();
    if lower.contains("bkt")
        || lower.contains("bản quyền")
        || lower.contains("copyright")
        || lower.contains("studio")
        || lower.contains("quota")
        || lower.contains("unlisted")
    {
        "bkt_test"
    } else if lower.contains("outlier")
        || lower.contains("săn đề xuất")
        || lower.contains("ikigai")
        || lower.contains("vph")
        || lower.contains("niche")
        || lower.contains("ngách")
    {
        "outlier"
    } else if lower.contains("reup")
        || lower.contains("pipeline")
        || lower.contains("lách")
        || lower.contains("md5")
        || lower.contains("pitch")
        || lower.contains("asetrate")
    {
        "reup"
    } else if lower.contains("ai")
        || lower.contains("gemini")
        || lower.contains("stable-diffusion")
        || lower.contains("thumbnail")
        || lower.contains("tiêu đề")
        || lower.contains("horde")
    {
        "ai"
    } else if lower.contains("channel")
        || lower.contains("kênh")
        || lower.contains("theo dõi")
        || lower.contains("rss")
    {
        "channels"
    } else {
        "download"
    }
}

/// Ghi nhật ký vào file riêng theo chức năng (download.log, channels.log, bkt_test.log, outlier.log, reup.log, ai.log)
pub fn append_category_log(
    category: &str,
    log_type: &str,
    message: &str,
    details: Option<&str>,
    metadata: &StructuredLogMetadata,
) {
    if let Some(mut dir) = crate::database::connection::get_app_data_dir() {
        dir.push("logs");
        let _ = std::fs::create_dir_all(&dir);
        let log_file = dir.join(format!("{category}.log"));
        let record = serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "log_type": log_type,
            "message": redact_log_text(message),
            "details": details.map(redact_log_text),
            "trace_id": metadata.trace_id,
            "feature": metadata.feature,
            "operation": metadata.operation,
            "stage": metadata.stage,
            "status": metadata.status,
            "error_code": metadata.error_code,
            "retryable": metadata.retryable,
        });
        let mut line = serde_json::to_string(&record).unwrap_or_default();
        line.push('\n');

        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

/// Add a log entry to the database (internal use)
pub fn add_log_internal(
    log_type: &str,
    message: &str,
    details: Option<&str>,
    url: Option<&str>,
) -> Result<LogEntry, String> {
    let metadata = structured_log_defaults(log_type, message, details);
    let category = determine_log_category(message, details);
    let safe_message = redact_log_text(message);
    let safe_details = details.map(redact_log_text);
    let safe_url = url.map(redact_log_text);
    append_category_log(category, log_type, &safe_message, safe_details.as_deref(), &metadata);

    let conn = get_db()?;

    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let created_at = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO logs (id, timestamp, log_type, message, details, url, trace_id, feature, operation, stage, status, error_code, retryable, duration_ms, context_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id, timestamp, log_type, safe_message, safe_details, safe_url,
            metadata.trace_id, metadata.feature, metadata.operation, metadata.stage,
            metadata.status, metadata.error_code, metadata.retryable as i64, Option::<i64>::None,
            Option::<String>::None, created_at
        ],
    )
    .map_err(|e| format!("Failed to insert log: {}", e))?;

    // Prune old entries if exceeding limit
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM logs", [], |row| row.get(0))
        .unwrap_or(0);

    if count > MAX_LOG_ENTRIES {
        let to_delete = count - MAX_LOG_ENTRIES;
        conn.execute(
            "DELETE FROM logs WHERE id IN (
                SELECT id FROM logs ORDER BY created_at ASC LIMIT ?1
            )",
            params![to_delete],
        )
        .ok();
    }

    Ok(LogEntry {
        id,
        timestamp,
        log_type: log_type.to_string(),
        message: safe_message,
        details: safe_details,
        url: safe_url,
        trace_id: Some(metadata.trace_id),
        feature: Some(metadata.feature),
        operation: Some(metadata.operation),
        stage: Some(metadata.stage),
        status: Some(metadata.status),
        error_code: metadata.error_code,
        retryable: Some(metadata.retryable),
        duration_ms: None,
        context_json: None,
    })
}

/// Get logs from database with optional filters
pub fn get_logs_from_db(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    let conn = get_db()?;

    let limit = limit.unwrap_or(100).min(500);

    // Build query dynamically
    let filter_active = filter
        .as_ref()
        .map(|f| f != "all" && !f.is_empty())
        .unwrap_or(false);
    let search_active = search.as_ref().map(|s| !s.is_empty()).unwrap_or(false);

    let mut query =
        String::from("SELECT id, timestamp, log_type, message, details, url, trace_id, feature, operation, stage, status, error_code, retryable, duration_ms, context_json FROM logs WHERE 1=1");

    if filter_active {
        query.push_str(" AND log_type = ?1");
    }

    if search_active {
        if filter_active {
            query.push_str(" AND (message LIKE ?2 OR details LIKE ?2 OR url LIKE ?2 OR feature LIKE ?2 OR operation LIKE ?2 OR error_code LIKE ?2 OR trace_id LIKE ?2)");
        } else {
            query.push_str(" AND (message LIKE ?1 OR details LIKE ?1 OR url LIKE ?1 OR feature LIKE ?1 OR operation LIKE ?1 OR error_code LIKE ?1 OR trace_id LIKE ?1)");
        }
    }

    query.push_str(" ORDER BY created_at DESC LIMIT ?");
    // Append correct limit param number
    if filter_active && search_active {
        query = query.replace("LIMIT ?", "LIMIT ?3");
    } else if filter_active || search_active {
        query = query.replace("LIMIT ?", "LIMIT ?2");
    } else {
        query = query.replace("LIMIT ?", "LIMIT ?1");
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    // Helper to parse row into LogEntry
    fn parse_row(row: &rusqlite::Row) -> rusqlite::Result<LogEntry> {
        Ok(LogEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            log_type: row.get(2)?,
            message: row.get(3)?,
            details: row.get(4)?,
            url: row.get(5)?,
            trace_id: row.get(6)?,
            feature: row.get(7)?,
            operation: row.get(8)?,
            stage: row.get(9)?,
            status: row.get(10)?,
            error_code: row.get(11)?,
            retryable: row.get::<_, Option<i64>>(12)?.map(|value| value != 0),
            duration_ms: row.get(13)?,
            context_json: row.get(14)?,
        })
    }

    let logs: Vec<LogEntry> = match (filter_active, search_active) {
        (true, true) => {
            let f = filter.as_ref().unwrap();
            let s = format!("%{}%", search.as_ref().unwrap());
            stmt.query_map(params![f, s, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("Failed to parse log row: {}", e))?
        }
        (true, false) => {
            let f = filter.as_ref().unwrap();
            stmt.query_map(params![f, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("Failed to parse log row: {}", e))?
        }
        (false, true) => {
            let s = format!("%{}%", search.as_ref().unwrap());
            stmt.query_map(params![s, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("Failed to parse log row: {}", e))?
        }
        (false, false) => stmt
            .query_map(params![limit], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("Failed to parse log row: {}", e))?,
    };

    Ok(logs)
}

pub fn get_plugin_logs_from_db(
    plugin_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<PluginLogsPage, String> {
    let conn = get_db()?;
    let limit = limit.unwrap_or(100).min(500);
    let offset = offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, log_type, message, details, url, trace_id, feature, operation, stage, status, error_code, retryable, duration_ms, context_json
             FROM logs
             WHERE details LIKE ?1 OR details LIKE ?2
             ORDER BY created_at DESC
             LIMIT ?3 OFFSET ?4",
        )
        .map_err(|e| format!("Failed to prepare plugin log query: {}", e))?;

    let legacy_pattern = format!("%Plugin ID: {}%", plugin_id);
    let runtime_pattern = format!("%pluginId: {}%", plugin_id);
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM logs
             WHERE details LIKE ?1 OR details LIKE ?2",
            params![legacy_pattern, runtime_pattern],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count plugin logs: {}", e))?;

    let logs = stmt
        .query_map(
            params![legacy_pattern, runtime_pattern, limit, offset],
            |row| {
                Ok(LogEntry {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    log_type: row.get(2)?,
                    message: row.get(3)?,
                    details: row.get(4)?,
                    url: row.get(5)?,
                    trace_id: row.get(6)?,
                    feature: row.get(7)?,
                    operation: row.get(8)?,
                    stage: row.get(9)?,
                    status: row.get(10)?,
                    error_code: row.get(11)?,
                    retryable: row.get::<_, Option<i64>>(12)?.map(|value| value != 0),
                    duration_ms: row.get(13)?,
                    context_json: row.get(14)?,
                })
            },
        )
        .map_err(|e| format!("Plugin log query failed: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to parse plugin log row: {}", e))?;

    Ok(PluginLogsPage {
        items: logs,
        total,
        has_more: offset + limit < total,
    })
}

pub fn clear_plugin_logs_from_db(plugin_id: String) -> Result<(), String> {
    let conn = get_db()?;
    let legacy_pattern = format!("%Plugin ID: {}%", plugin_id);
    let runtime_pattern = format!("%pluginId: {}%", plugin_id);

    conn.execute(
        "DELETE FROM logs WHERE details LIKE ?1 OR details LIKE ?2",
        params![legacy_pattern, runtime_pattern],
    )
    .map_err(|e| format!("Failed to clear plugin logs: {}", e))?;

    Ok(())
}

/// Clear all logs
pub fn clear_logs_from_db() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM logs", [])
        .map_err(|e| format!("Failed to clear logs: {}", e))?;
    Ok(())
}

/// Export logs as JSON
pub fn export_logs_from_db() -> Result<String, String> {
    let logs = get_logs_from_db(None, None, Some(MAX_LOG_ENTRIES))?;
    serde_json::to_string_pretty(&logs).map_err(|e| format!("Failed to serialize logs: {}", e))
}
