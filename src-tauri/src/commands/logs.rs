use crate::database::{
    clear_logs_from_db, clear_plugin_logs_from_db, export_logs_from_db,
    get_logs_from_db, get_plugin_logs_from_db,
};
use crate::types::{LogEntry, PluginLogsPage};

#[tauri::command]
pub fn get_logs(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    get_logs_from_db(filter, search, limit)
}

#[tauri::command]
pub fn get_plugin_logs(
    plugin_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<PluginLogsPage, String> {
    get_plugin_logs_from_db(plugin_id, limit, offset)
}

#[tauri::command]
pub fn clear_plugin_logs(plugin_id: String) -> Result<(), String> {
    clear_plugin_logs_from_db(plugin_id)
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    clear_logs_from_db()
}

#[tauri::command]
pub fn export_logs() -> Result<String, String> {
    export_logs_from_db()
}
