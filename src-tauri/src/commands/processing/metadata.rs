use std::path::Path;

use tauri::AppHandle;
use tokio::process::Command;

use crate::services::get_ffprobe_path;
use crate::types::VideoMetadata;
use crate::utils::CommandExt;

/// Get video metadata using FFprobe
#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<VideoMetadata, String> {
    let ffprobe_path = get_ffprobe_path(&app)
        .await
        .ok_or("FFprobe not found. Please install FFmpeg.")?;

    let mut cmd = Command::new(&ffprobe_path);
    cmd.args([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        &path,
    ]);
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("FFprobe failed to analyze video".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let streams = json
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or("No streams found")?;
    let format = json.get("format").ok_or("No format info")?;

    let video_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"));

    let audio_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("audio"));

    let filename = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let duration = format
        .get("duration")
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let (width, height, fps, video_codec) = if let Some(vs) = video_stream {
        let w = vs.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let h = vs.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let codec = vs
            .get("codec_name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let fps_str = vs
            .get("r_frame_rate")
            .and_then(|v| v.as_str())
            .unwrap_or("0/1");
        let fps_parts: Vec<&str> = fps_str.split('/').collect();
        let fps = if fps_parts.len() == 2 {
            let num = fps_parts[0].parse::<f64>().unwrap_or(0.0);
            let den = fps_parts[1].parse::<f64>().unwrap_or(1.0);
            if den > 0.0 {
                num / den
            } else {
                0.0
            }
        } else {
            fps_str.parse::<f64>().unwrap_or(0.0)
        };

        (w, h, fps, codec)
    } else {
        (0, 0, 0.0, "none".to_string())
    };

    let audio_codec = audio_stream
        .and_then(|a| a.get("codec_name"))
        .and_then(|c| c.as_str())
        .unwrap_or("none")
        .to_string();

    let bitrate = format
        .get("bit_rate")
        .and_then(|b| b.as_str())
        .and_then(|b| b.parse::<i64>().ok())
        .unwrap_or(0)
        / 1000;

    let file_size = format
        .get("size")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let format_name = format
        .get("format_name")
        .and_then(|f| f.as_str())
        .unwrap_or("unknown")
        .split(',')
        .next()
        .unwrap_or("unknown")
        .to_string();

    Ok(VideoMetadata {
        path,
        filename,
        duration,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        bitrate,
        file_size,
        format: format_name,
        has_audio: audio_stream.is_some(),
    })
}
