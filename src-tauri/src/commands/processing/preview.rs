use std::process::Stdio;

use tauri::{AppHandle, Manager};
use tokio::process::Command;

use crate::services::get_ffmpeg_path;
use crate::utils::CommandExt;

/// Generate a cached JPEG thumbnail for a downloaded video.
#[tauri::command]
pub async fn generate_video_thumbnail(
    app: AppHandle,
    input_path: String,
) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await.ok_or_else(|| {
        log::error!("FFmpeg not found — cannot generate thumbnail");
        "FFmpeg not found. Please install FFmpeg from the Dependencies tab in Settings.".to_string()
    })?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to get app data directory")?;
    let preview_dir = app_data_dir.join("previews");
    std::fs::create_dir_all(&preview_dir).ok();

    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let thumb_path = preview_dir.join(format!("thumb_{}.jpg", hash));

    if thumb_path.exists() {
        log::info!("[THUMBNAIL] Cache hit: {}", thumb_path.display());
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    log::info!("[THUMBNAIL] Generating thumbnail for '{}'", input_path);

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-ss",
        "1",
        "-i",
        &input_path,
        "-frames:v",
        "1",
        "-vf",
        "scale=-2:720",
        "-q:v",
        "2",
        thumb_path.to_str().unwrap(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        std::fs::remove_file(&thumb_path).ok();
        log::error!("[THUMBNAIL] FFmpeg failed for '{}': {}", input_path, stderr);
        return Err(format!("FFmpeg thumbnail failed: {}", stderr));
    }

    log::info!("[THUMBNAIL] Generated: {}", thumb_path.display());
    Ok(thumb_path.to_string_lossy().to_string())
}
