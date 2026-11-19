use crate::database::{
    build_trends_cache_key, calculate_trends_ttl, clear_all_outliers_db, delete_outlier_video_db,
    get_google_trends_cache_db, get_outlier_settings_db, get_outlier_videos_db,
    update_outlier_settings_db, update_outlier_video_status_db, upsert_google_trends_cache_db,
    upsert_outlier_video_db, OutlierHunterSettings, OutlierVideo,
};
use crate::utils::CommandExt;
use base64::Engine;
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_outlier_settings_cmd() -> Result<OutlierHunterSettings, String> {
    get_outlier_settings_db()
}

#[tauri::command]
pub async fn update_outlier_settings_cmd(settings: OutlierHunterSettings) -> Result<(), String> {
    update_outlier_settings_db(&settings)
}

#[tauri::command]
pub async fn get_outlier_videos_cmd(
    status: Option<String>,
    niche: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<OutlierVideo>, String> {
    get_outlier_videos_db(status, niche, limit.unwrap_or(100))
}

#[tauri::command]
pub async fn update_outlier_video_status_cmd(
    id: String,
    status: String,
    local_filepath: Option<String>,
    reup_filepath: Option<String>,
    bkt_status: Option<String>,
) -> Result<(), String> {
    update_outlier_video_status_db(
        &id,
        &status,
        local_filepath.as_deref(),
        reup_filepath.as_deref(),
        bkt_status.as_deref(),
    )
}

#[tauri::command]
pub async fn delete_outlier_video_cmd(id: String) -> Result<(), String> {
    delete_outlier_video_db(&id)
}

#[tauri::command]
pub async fn clear_all_outliers_cmd() -> Result<(), String> {
    clear_all_outliers_db()
}

#[tauri::command]
pub async fn analyze_competitor_channel_cmd(
    app: AppHandle,
    channel_url: String,
    sort_by: Option<String>,
) -> Result<Value, String> {
    let payload = serde_json::json!({
        "channel_url": channel_url,
        "sort_by": sort_by.unwrap_or_else(|| "popular".to_string()),
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("analyze_competitor")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python analyze_competitor: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                return Ok(val);
            }
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let err_msg = if !stderr.trim().is_empty() {
        format!("Lỗi phân tích kênh đối thủ từ Python: {}", stderr.trim())
    } else {
        "Không nhận được dữ liệu phản hồi từ bộ phân tích kênh đối thủ.".to_string()
    };
    Ok(serde_json::json!({ "success": false, "error": err_msg, "videos": [] }))
}

#[tauri::command]
pub async fn trigger_outlier_scan_cmd(
    app: AppHandle,
    niche: Option<String>,
    time_range: Option<String>,
    geo: Option<String>,
) -> Result<Vec<OutlierVideo>, String> {
    let settings = get_outlier_settings_db()?;
    let target_niche = niche.unwrap_or_default();
    let payload = serde_json::json!({
        "settings": settings,
        "target_niche": target_niche,
        "time_range": time_range.unwrap_or_else(|| "all".to_string()),
        "geo": geo.unwrap_or_else(|| "VN".to_string()),
    });

    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("hunt_outliers")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python hunt_outliers: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse JSON array of discovered outlier videos from stdout
    let mut discovered: Vec<OutlierVideo> = Vec::new();
    let mut runner_error: Option<String> = None;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(false) = val.get("success").and_then(|v| v.as_bool()) {
                    let err = val
                        .get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Không rõ lỗi từ Python runner");
                    runner_error = Some(err.to_string());
                }
                if let Some(arr) = val.get("discovered_videos").and_then(|v| v.as_array()) {
                    for item in arr {
                        match serde_json::from_value::<OutlierVideo>(item.clone()) {
                            Ok(v) => {
                                let _ = upsert_outlier_video_db(&v);
                                discovered.push(v);
                            }
                            Err(e) => {
                                log::error!("Lỗi deserialize OutlierVideo từ python: {e}");
                            }
                        }
                    }
                }
            }
        }
    }

    if discovered.is_empty() {
        if let Some(err) = runner_error {
            return Err(format!("Lỗi engine quét đề xuất: {err}"));
        }
        if !output.status.success() {
            log::warn!("hunt_outliers stderr: {}", stderr);
            return Err(format!(
                "Tiến trình săn đề xuất kết thúc với mã lỗi {:?}: {}",
                output.status.code(),
                stderr.trim()
            ));
        }
    }

    if !discovered.is_empty() {
        return Ok(discovered);
    }

    // Nếu không có video mới phát hiện, trả về danh sách từ database lọc theo đúng ngách vừa quét
    let niche_filter = if target_niche.trim().is_empty()
        || target_niche.eq_ignore_ascii_case("all")
        || target_niche.eq_ignore_ascii_case("toàn bộ ngách")
        || target_niche.eq_ignore_ascii_case("toàn bộ ngách ngon")
    {
        None
    } else {
        Some(target_niche)
    };
    get_outlier_videos_db(None, niche_filter, 100)
}

#[tauri::command]
pub async fn trigger_outlier_ping_cmd(app: AppHandle) -> Result<Vec<OutlierVideo>, String> {
    let watchlist = get_outlier_videos_db(Some("watchlist".to_string()), None, 100)?;
    if watchlist.is_empty() {
        return get_outlier_videos_db(None, None, 100);
    }

    let payload = serde_json::json!({
        "videos": watchlist,
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("ping_momentum")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python ping_momentum: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                if let Some(arr) = val.get("updated_videos").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Ok(v) = serde_json::from_value::<OutlierVideo>(item.clone()) {
                            let _ = upsert_outlier_video_db(&v);
                        }
                    }
                }
            }
        }
    }

    get_outlier_videos_db(None, None, 100)
}

#[tauri::command]
pub async fn find_keyword_goldmines_cmd(
    app: AppHandle,
    seed_keyword: String,
) -> Result<Value, String> {
    let payload = serde_json::json!({
        "seed_keyword": seed_keyword,
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("find_goldmines")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python find_goldmines: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                return Ok(val);
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "keywords": [] }))
}

#[tauri::command]
pub async fn analyze_video_hook_cmd(
    app: AppHandle,
    video_id: String,
) -> Result<Value, String> {
    let payload = serde_json::json!({
        "video_id": video_id,
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("analyze_hook")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python analyze_hook: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                return Ok(val);
            }
        }
    }

    Ok(serde_json::json!({
        "success": false,
        "has_transcript": false,
        "hook_30s": "",
        "full_transcript_preview": "Không tìm thấy phụ đề",
        "key_points": []
    }))
}

#[tauri::command]
pub async fn fetch_live_trending_topics_cmd(
    app: AppHandle,
    geo: Option<String>,
    limit: Option<i64>,
) -> Result<Value, String> {
    let payload = serde_json::json!({
        "geo": geo.unwrap_or_else(|| "VN".to_string()),
        "limit": limit.unwrap_or(20),
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("fetch_trending")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python fetch_trending: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                return Ok(val);
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "topics": [] }))
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn analyze_google_trends_cmd(
    app: AppHandle,
    keyword: String,
    compare_keyword: Option<String>,
    compareKeyword: Option<String>,
    geo: Option<String>,
    time_range: Option<String>,
    timeRange: Option<String>,
    hl: Option<String>,
) -> Result<Value, String> {
    let clean_keyword = keyword.trim().to_string();
    if clean_keyword.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "Từ khóa tìm kiếm không được để trống",
            "is_low_volume": true,
            "timeline": [],
            "top_queries": [],
            "rising_queries": [],
            "momentum": {
                "verdict": "stable",
                "verdictLabel": "Không có dữ liệu",
                "currentScore": 0,
                "avgScore": 0.0,
                "peakScore": 0,
                "peakTime": "",
                "deltaPercent": 0.0,
            },
            "recommendation": {
                "urgency": "low",
                "actionText": "Vui lòng nhập từ khóa hợp lệ để bắt đầu phân tích.",
                "contentAngle": ""
            }
        }));
    }

    let clean_compare = compare_keyword
        .or(compareKeyword)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let clean_geo = geo
        .unwrap_or_else(|| "VN".to_string())
        .trim()
        .to_uppercase();

    let clean_time = time_range
        .or(timeRange)
        .unwrap_or_else(|| "today 12-m".to_string())
        .trim()
        .to_string();

    let clean_hl = hl
        .unwrap_or_else(|| "vi".to_string())
        .trim()
        .to_string();

    // 1. Kiểm tra SQLite Cache trước khi gọi Python runner
    let cache_key = build_trends_cache_key(
        &clean_keyword,
        clean_compare.as_deref(),
        &clean_geo,
        &clean_time,
    );

    if let Ok(Some(cached_val)) = get_google_trends_cache_db(&cache_key) {
        log::info!("Phục vụ dữ liệu Google Trends từ SQLite Cache: {cache_key}");
        return Ok(cached_val);
    }

    // 2. Chuẩn bị payload và gọi Python runner
    let payload = serde_json::json!({
        "keyword": clean_keyword,
        "compare_keyword": clean_compare,
        "geo": clean_geo,
        "time_range": clean_time,
        "hl": clean_hl,
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

    let (mut cmd, runner_path) = crate::commands::profiles::create_runner_cmd(&app);
    if !runner_path.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner_path.display()
        ));
    }
    cmd.arg(&runner_path)
        .arg("--action")
        .arg("analyze_trends")
        .arg("--data-b64")
        .arg(&b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi khởi chạy Python analyze_trends: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                // Nếu lấy thành công và có dữ liệu timeline hợp lệ, lưu vào cache theo TTL
                let is_rate_limited = val
                    .get("is_rate_limited")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let has_timeline = val
                    .get("timeline")
                    .and_then(|v| v.as_array())
                    .map(|a| !a.is_empty())
                    .unwrap_or(false);

                if !is_rate_limited && has_timeline {
                    let ttl = calculate_trends_ttl(&clean_time);
                    let _ = upsert_google_trends_cache_db(
                        &cache_key,
                        &clean_keyword,
                        clean_compare.as_deref(),
                        &clean_geo,
                        &clean_time,
                        &val,
                        ttl,
                    );
                }
                return Ok(val);
            }
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let err_msg = if !stderr.trim().is_empty() {
        format!("Lỗi phân tích Google Trends từ Python: {}", stderr.trim())
    } else {
        "Không nhận được phản hồi dữ liệu từ bộ phân tích Google Trends.".to_string()
    };

    Ok(serde_json::json!({
        "success": false,
        "error": err_msg,
        "is_low_volume": true,
        "timeline": [],
        "top_queries": [],
        "rising_queries": [],
        "momentum": {
            "verdict": "stable",
            "verdictLabel": "Không có phản hồi",
            "currentScore": 0,
            "avgScore": 0.0,
            "peakScore": 0,
            "peakTime": "",
            "deltaPercent": 0.0,
        },
        "recommendation": {
            "urgency": "low",
            "actionText": "Hệ thống chưa nhận được dữ liệu từ Google Trends. Vui lòng thử lại sau.",
            "contentAngle": ""
        }
    }))
}

