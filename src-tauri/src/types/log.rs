use serde::{Deserialize, Serialize};

/// Log entry structure
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub log_type: String, // "command" | "success" | "error" | "stderr" | "info"
    pub message: String,
    pub details: Option<String>,
    pub url: Option<String>,
    pub trace_id: Option<String>,
    pub feature: Option<String>,
    pub operation: Option<String>,
    pub stage: Option<String>,
    pub status: Option<String>,
    pub error_code: Option<String>,
    pub retryable: Option<bool>,
    pub duration_ms: Option<i64>,
    pub context_json: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PluginLogsPage {
    pub items: Vec<LogEntry>,
    pub total: i64,
    pub has_more: bool,
}
