//! Reup pipeline commands (Lv1 / Lv2).
//!
//! Tách khỏi module Processing cũ để có thể xóa phần UI/FFmpeg không còn dùng
//! mà vẫn giữ nguyên API mà trang Reup & BKT gọi.

use tauri::AppHandle;

/// Khâu 3: Trigger Reup Pipeline V1 (95% gốc - 5% biến đổi, sạch metadata, đổi hash MD5)
#[tauri::command]
pub async fn run_reup_pipeline_v1_cmd(
    app: AppHandle,
    input_path: String,
    output_path: Option<String>,
) -> Result<crate::services::ReupPipelineResult, String> {
    crate::services::run_reup_pipeline_v1(&app, &input_path, output_path.as_deref()).await
}

/// Khâu 3: Trigger Reup Pipeline V2 (Cấp độ 2 lách sâu khi dính cờ bản quyền)
#[tauri::command]
pub async fn run_reup_pipeline_v2_cmd(
    app: AppHandle,
    input_path: String,
    output_path: Option<String>,
) -> Result<crate::services::ReupPipelineResult, String> {
    crate::services::run_reup_pipeline_v2(&app, &input_path, output_path.as_deref()).await
}

/// Preflight: Quét sơ bộ video phát hiện Logo tĩnh & Subtitle
#[tauri::command]
pub async fn scan_video_preflight_cmd(
    app: AppHandle,
    video_path: Option<String>,
    input_path: Option<String>,
) -> Result<crate::services::PreflightReport, String> {
    let path = video_path
        .or(input_path)
        .ok_or_else(|| "Thiếu đường dẫn tệp video".to_string())?;
    crate::services::run_preflight_scan(&app, &path).await
}

/// Preflight: Quét sơ bộ video phát hiện Logo tĩnh & Subtitle (IPC chuẩn hoá)
#[tauri::command]
pub async fn run_preflight_scan_cmd(
    app: AppHandle,
    input_path: Option<String>,
    video_path: Option<String>,
) -> Result<crate::services::PreflightReport, String> {
    let path = input_path
        .or(video_path)
        .ok_or_else(|| "Thiếu đường dẫn tệp video (cần input_path hoặc video_path)".to_string())?;
    crate::services::run_preflight_scan(&app, &path).await
}

/// Probe: Tự động phát hiện GPU Hardware Acceleration hỗ trợ cho FFmpeg
#[tauri::command]
pub async fn probe_hardware_encoder_cmd(
    app: AppHandle,
) -> Result<String, String> {
    Ok(crate::services::probe_hardware_encoder(&app).await)
}

/// Khâu 3: Trigger Reup Pipeline Adaptive (Thích ứng theo kết quả Preflight)
#[tauri::command]
pub async fn run_reup_pipeline_adaptive_cmd(
    app: AppHandle,
    input_path: String,
    output_path: Option<String>,
    apply_delogo: Option<bool>,
    apply_bottom_blur: Option<bool>,
    logo_position: Option<String>,
    preflight: Option<crate::services::PreflightReport>,
) -> Result<crate::services::ReupPipelineResult, String> {
    let resolved_preflight = preflight.or_else(|| {
        if apply_delogo.is_some() || apply_bottom_blur.is_some() {
            let has_logo = apply_delogo.unwrap_or(false);
            let has_subtitles = apply_bottom_blur.unwrap_or(false);
            let pos = logo_position.unwrap_or_else(|| "top_right".to_string());
            let recommended = match (has_logo, has_subtitles) {
                (true, true) => "adaptive_logo_subtitle".to_string(),
                (true, false) => "adaptive_logo".to_string(),
                (false, true) => "adaptive_subtitle".to_string(),
                (false, false) => "clean_stream".to_string(),
            };
            Some(crate::services::PreflightReport {
                has_logo,
                logo_corner: if has_logo { Some(pos.clone()) } else { None },
                logo_position: if has_logo { Some(pos) } else { None },
                has_subtitles,
                subtitle_roi_ratio: if has_subtitles { Some(0.18) } else { None },
                recommended_pipeline: recommended,
                scan_time_ms: 0,
                scan_duration_ms: 0,
            })
        } else {
            None
        }
    });

    crate::services::run_reup_pipeline_adaptive(&app, &input_path, output_path.as_deref(), resolved_preflight).await
}
