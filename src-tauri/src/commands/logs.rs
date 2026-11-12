use crate::database::{
    clear_logs_from_db, clear_plugin_logs_from_db, export_logs_from_db,
    get_logs_from_db, get_plugin_logs_from_db,
};
use crate::types::{LogEntry, PluginLogsPage};

#[tauri::command]
pub async fn get_logs(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    tokio::task::spawn_blocking(move || get_logs_from_db(filter, search, limit))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn get_plugin_logs(
    plugin_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<PluginLogsPage, String> {
    tokio::task::spawn_blocking(move || get_plugin_logs_from_db(plugin_id, limit, offset))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn clear_plugin_logs(plugin_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || clear_plugin_logs_from_db(plugin_id))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn clear_logs() -> Result<(), String> {
    tokio::task::spawn_blocking(clear_logs_from_db)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn export_logs() -> Result<String, String> {
    tokio::task::spawn_blocking(export_logs_from_db)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
