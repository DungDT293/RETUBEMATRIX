//! Hardware ID Tauri Command

use crate::utils::hwid::{get_system_hwid, HwidInfo};

#[tauri::command]
pub async fn get_system_hwid_cmd() -> Result<HwidInfo, String> {
    tokio::task::spawn_blocking(get_system_hwid)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
