//! Plugin workflows integration for download lifecycle events.

use std::collections::BTreeMap;
use tauri::AppHandle;
use crate::database::add_log_internal;
use crate::services::{
    build_cookie_args, build_proxy_args, build_site_header_args, get_deno_path,
    is_upcoming_live_error, run_ytdlp_with_stderr, enqueue_post_download_workflow,
    resolve_download_workflow_snapshot,
};
use crate::types::{BackendError, PluginWorkflowStepSnapshot, PostDownloadPluginPayload};


pub(crate) async fn skipped_live_status(
    app: &AppHandle,
    url: &str,
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    cookie_skip_patterns: Option<&[String]>,
    proxy_url: Option<&str>,
) -> Result<Option<String>, String> {
    let mut args = vec![
        "--print".to_string(),
        "live_status".to_string(),
        "--output-na-placeholder".to_string(),
        "not_live".to_string(),
        "--no-warnings".to_string(),
        "--no-playlist".to_string(),
        "--socket-timeout".to_string(),
        "15".to_string(),
    ];

    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--".to_string());
    args.push(url.to_string());

    let mut extra_args = build_site_header_args(url);
    extra_args.extend(build_cookie_args(
        url,
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        cookie_skip_patterns,
    ));
    extra_args.extend(build_proxy_args(proxy_url));
    if let Some(separator_index) = args.iter().position(|arg| arg == "--") {
        args.splice(separator_index..separator_index, extra_args);
    }

    let command_str = format!("yt-dlp {}", args.join(" "));
    add_log_internal("command", &command_str, None, Some(url)).ok();

    let args_ref: Vec<&str> = args.iter().map(|arg| arg.as_str()).collect();
    let output = run_ytdlp_with_stderr(app, &args_ref).await?;

    if !output.stderr.trim().is_empty() {
        add_log_internal("stderr", output.stderr.trim(), None, Some(url)).ok();
    }

    if !output.success {
        let message = output.stderr.trim();
        if is_upcoming_live_error(message) {
            return Ok(Some("is_upcoming".to_string()));
        }
        return Err(BackendError::from_message(if message.is_empty() {
            "Failed to check live status before download.".to_string()
        } else {
            format!("Failed to check live status before download: {}", message)
        })
        .to_wire_string());
    }

    let status = output.stdout.lines().last().unwrap_or("").trim();
    if status.is_empty() || status == "not_live" {
        Ok(None)
    } else {
        Ok(Some(status.to_string()))
    }
}

pub(crate) fn workflow_steps_for_trigger(
    app: &AppHandle,
    trigger: &str,
    workflow_snapshots: &BTreeMap<String, Vec<PluginWorkflowStepSnapshot>>,
) -> Vec<PluginWorkflowStepSnapshot> {
    workflow_snapshots
        .get(trigger)
        .cloned()
        .unwrap_or_else(|| resolve_download_workflow_snapshot(app, trigger, None, &[]))
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn build_trigger_payload(
    job_id: &str,
    source: Option<String>,
    trigger: &str,
    output_path: &str,
    filesize: Option<u64>,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) -> PostDownloadPluginPayload {
    let display_name = title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| url.to_string());

    PostDownloadPluginPayload {
        job_id: job_id.to_string(),
        source,
        trigger: trigger.to_string(),
        filepath: String::new(),
        filename: display_name,
        directory: output_path.to_string(),
        filesize,
        format,
        quality,
        url: url.to_string(),
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind: download_kind.to_string(),
        workflow_run_id: None,
        workflow_step_index: None,
        workflow_step_plugin_id: None,
        chain_state: None,
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn enqueue_failed_workflow(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    output_path: &str,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let payload = build_trigger_payload(
        job_id,
        source,
        "download.failed",
        output_path,
        None,
        format,
        quality,
        url,
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind,
    );
    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn enqueue_before_start_workflow(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    output_path: &str,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let payload = build_trigger_payload(
        job_id,
        source,
        "download.beforeStart",
        output_path,
        None,
        format,
        quality,
        url,
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind,
    );
    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}

pub(crate) async fn run_completed_plugins(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    filepath: &str,
    filesize: Option<u64>,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let path = std::path::Path::new(filepath);
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(filepath)
        .to_string();
    let directory = path
        .parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_default();

    let payload = PostDownloadPluginPayload {
        job_id: job_id.to_string(),
        source,
        trigger: "download.completed".to_string(),
        filepath: filepath.to_string(),
        filename,
        directory,
        filesize,
        format,
        quality,
        url: url.to_string(),
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind: download_kind.to_string(),
        workflow_run_id: None,
        workflow_step_index: None,
        workflow_step_plugin_id: None,
        chain_state: None,
    };

    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}
