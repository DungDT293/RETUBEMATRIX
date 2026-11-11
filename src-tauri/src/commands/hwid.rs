//! Hardware ID Tauri Command

use crate::utils::hwid::{get_system_hwid, HwidInfo};

#[tauri::command]
pub fn get_system_hwid_cmd() -> Result<HwidInfo, String> {
    get_system_hwid()
}
