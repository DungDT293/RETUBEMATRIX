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
