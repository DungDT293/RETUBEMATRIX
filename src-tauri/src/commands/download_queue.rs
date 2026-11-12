use crate::database::{
    clear_download_queue_from_db, load_download_queue_from_db, save_download_queue_to_db,
};

#[tauri::command]
pub async fn load_download_queue(queue_kind: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || load_download_queue_from_db(queue_kind))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn save_download_queue(queue_kind: String, items_json: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || save_download_queue_to_db(queue_kind, items_json))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn clear_download_queue(queue_kind: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || clear_download_queue_from_db(queue_kind))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
