use tauri::AppHandle;

use crate::services::{
    approve_plugin_permissions_internal, attach_plugin_workspace_internal,
    create_plugin_workspace_internal, enqueue_plugin_trigger_workflow, get_plugin_details_internal,
    get_plugin_trigger_workflow_internal, get_runtime_provider_status_internal,
    inspect_plugin_package_internal, install_plugin_package_internal,
    list_plugin_store_entries_internal, list_plugins_internal, list_runtime_providers_internal,
    open_plugin_directory_internal, prepare_plugin_store_package_internal,
    set_default_provider_for_language_internal, set_plugin_provider_internal,
    set_plugin_runtime_locale_internal, set_plugin_timeout_internal, uninstall_plugin_internal,
    update_plugin_config_values_internal, update_plugin_state_internal,
    update_plugin_trigger_workflow_internal, AttachPluginWorkspaceInput,
    CreatePluginWorkspaceInput, PluginConfigValuesInput, PluginPermissionApprovalInput,
    PluginRuntimeLocaleInput,
};
use crate::types::{
    PluginPackageInspection, PluginProvider, PluginRuntimeLanguage, PluginStoreEntry,
    PluginSummary, PluginTriggerWorkflow, PluginWorkflowStepSnapshot, PluginWorkspaceSummary,
    PostDownloadPluginPayload, PreparedPluginStorePackage, RuntimeProviderStatus,
};

#[tauri::command]
pub async fn list_plugins(app: AppHandle) -> Result<Vec<PluginSummary>, String> {
    tokio::task::spawn_blocking(move || list_plugins_internal(&app))
        .await
        .map_err(|e| format!("Failed to join plugin list task: {}", e))?
}

#[tauri::command]
pub async fn get_plugin_details(
    app: AppHandle,
    plugin_id: String,
) -> Result<PluginSummary, String> {
    tokio::task::spawn_blocking(move || get_plugin_details_internal(&app, &plugin_id))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn inspect_plugin_package(
    app: AppHandle,
    path: String,
) -> Result<PluginPackageInspection, String> {
    inspect_plugin_package_internal(&app, path).await
}

#[tauri::command]
pub async fn install_plugin_package(
    app: AppHandle,
    path: String,
    trusted: bool,
) -> Result<PluginSummary, String> {
    install_plugin_package_internal(&app, path, trusted).await
}

#[tauri::command]
pub async fn list_plugin_store_entries(
    app: AppHandle,
    force_refresh: Option<bool>,
) -> Result<Vec<PluginStoreEntry>, String> {
    list_plugin_store_entries_internal(app, force_refresh.unwrap_or(false)).await
}

#[tauri::command]
pub async fn prepare_plugin_store_package(
    app: AppHandle,
    plugin_id: String,
    version: Option<String>,
) -> Result<PreparedPluginStorePackage, String> {
    prepare_plugin_store_package_internal(&app, plugin_id, version).await
}

#[tauri::command]
pub async fn uninstall_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || uninstall_plugin_internal(&app, &plugin_id))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn attach_plugin_workspace(
    app: AppHandle,
    input: AttachPluginWorkspaceInput,
) -> Result<PluginSummary, String> {
    tokio::task::spawn_blocking(move || attach_plugin_workspace_internal(&app, input))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn create_plugin_workspace(
    app: AppHandle,
    input: CreatePluginWorkspaceInput,
) -> Result<PluginWorkspaceSummary, String> {
    tokio::task::spawn_blocking(move || create_plugin_workspace_internal(&app, input))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn update_plugin_state(
    app: AppHandle,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || update_plugin_state_internal(&app, &plugin_id, enabled))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn get_plugin_trigger_workflow(
    app: AppHandle,
    trigger: String,
) -> Result<PluginTriggerWorkflow, String> {
    tokio::task::spawn_blocking(move || get_plugin_trigger_workflow_internal(&app, &trigger))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn update_plugin_trigger_workflow(
    app: AppHandle,
    workflow: PluginTriggerWorkflow,
) -> Result<PluginTriggerWorkflow, String> {
    tokio::task::spawn_blocking(move || update_plugin_trigger_workflow_internal(&app, workflow))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn enqueue_plugin_workflow_trigger(
    app: AppHandle,
    trigger: String,
    payload: PostDownloadPluginPayload,
    workflow_steps: Option<Vec<PluginWorkflowStepSnapshot>>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        Ok(enqueue_plugin_trigger_workflow(
            &app,
            &trigger,
            workflow_steps,
            payload,
        ))
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn approve_plugin_permissions(
    app: AppHandle,
    plugin_id: String,
    permissions: PluginPermissionApprovalInput,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        approve_plugin_permissions_internal(&app, &plugin_id, permissions)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn update_plugin_config_values(
    app: AppHandle,
    plugin_id: String,
    input: PluginConfigValuesInput,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || update_plugin_config_values_internal(&app, &plugin_id, input))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn set_plugin_provider(
    app: AppHandle,
    plugin_id: String,
    provider: PluginProvider,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_plugin_provider_internal(&app, &plugin_id, provider))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn set_plugin_timeout(
    app: AppHandle,
    plugin_id: String,
    timeout_sec: Option<u64>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_plugin_timeout_internal(&app, &plugin_id, timeout_sec))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn open_plugin_directory(app: AppHandle, plugin_id: String) -> Result<(), String> {
    open_plugin_directory_internal(&app, &plugin_id).await
}

#[tauri::command]
pub async fn list_runtime_providers(app: AppHandle) -> Result<Vec<RuntimeProviderStatus>, String> {
    Ok(list_runtime_providers_internal(&app).await)
}

#[tauri::command]
pub async fn get_runtime_provider_status(
    app: AppHandle,
    provider: PluginProvider,
) -> Result<RuntimeProviderStatus, String> {
    Ok(get_runtime_provider_status_internal(&app, provider).await)
}

#[tauri::command]
pub async fn set_default_provider_for_language(
    app: AppHandle,
    language: PluginRuntimeLanguage,
    provider: PluginProvider,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        set_default_provider_for_language_internal(&app, language, provider)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn set_plugin_runtime_locale(
    app: AppHandle,
    input: PluginRuntimeLocaleInput,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_plugin_runtime_locale_internal(&app, input))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
