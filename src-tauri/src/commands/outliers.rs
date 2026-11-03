use crate::database::{
    clear_all_outliers_db, delete_outlier_video_db, get_outlier_settings_db,
    get_outlier_videos_db, update_outlier_settings_db, update_outlier_video_status_db,
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

    Ok(serde_json::json!({ "success": true, "videos": [] }))
}

#[tauri::command]
pub async fn trigger_outlier_scan_cmd(
    app: AppHandle,
    niche: Option<String>,
) -> Result<Vec<OutlierVideo>, String> {
    let settings = get_outlier_settings_db()?;
    let payload = serde_json::json!({
        "settings": settings,
        "target_niche": niche.unwrap_or_default(),
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
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
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

    if discovered.is_empty() && !output.status.success() {
        log::warn!("hunt_outliers stderr: {}", stderr);
    }

    // Return fresh list from database
    get_outlier_videos_db(None, None, 100)
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
