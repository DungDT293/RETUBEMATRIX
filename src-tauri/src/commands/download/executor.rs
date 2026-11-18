//! Core video download executor and tokio fallback engine.

use std::collections::{BTreeMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database::{add_history_internal, add_log_internal, update_history_download};
use crate::services::{
    add_safe_filename_args, apply_reup_modifications, build_cookie_args,
    build_site_header_args, build_youtube_extractor_args, build_ytdlp_advanced_args,
    clean_video_metadata, enqueue_post_download_workflow, get_deno_path, get_ffmpeg_path,
    get_ytdlp_path, get_ytdlp_source, redact_ytdlp_advanced_args,
    resolve_download_workflow_snapshot, system_ytdlp_not_found_message,
    ReupModOptions, YtdlpAdvancedOption,
};
use crate::types::{
    BackendError, DependencySource, DownloadProgress, PluginWorkflowStepSnapshot,
};
use crate::utils::{
    build_format_string, format_size, normalize_url, parse_progress, sanitize_output_path,
    validate_url, CommandExt,
};

use super::args::*;
use super::parser::*;
use super::process::*;
use super::templates::*;
use super::workflows::*;
use super::CANCEL_FLAG;


#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    quality: String,
    format: String,
    download_playlist: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
    number_playlist_items: Option<bool>,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
    number_queue_items: Option<bool>,
    filename_metadata_enabled: Option<bool>,
    filename_metadata_fields: Option<Vec<String>>,
    split_embedded_chapters: Option<bool>,
    number_chapter_files: Option<bool>,
    auto_organize_collections: Option<bool>,
    playlist_collection_name: Option<String>,
    video_codec: String,
    preferred_fps: Option<String>,
    audio_bitrate: String,
    playlist_limit: Option<u32>,
    subtitle_mode: String,
    subtitle_langs: String,
    subtitle_embed: bool,
    subtitle_format: String,
    log_stderr: Option<bool>,
    _use_bun_runtime: Option<bool>, // Deprecated - now auto uses deno
    use_actual_player_js: Option<bool>,
    history_id: Option<String>,
    // Cookie settings
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    // Embed settings
    embed_metadata: Option<bool>,
    embed_thumbnail: Option<bool>,
    // Proxy settings
    proxy_url: Option<String>,
    // Live stream settings
    live_from_start: Option<bool>,
    skip_live: Option<bool>,
    // Speed limit settings
    speed_limit: Option<String>,
    // External downloader settings
    use_aria2: Option<bool>,
    aria2_args: Option<String>,
    // Vetted yt-dlp advanced options
    ytdlp_advanced_options_enabled: Option<bool>,
    ytdlp_advanced_options: Option<Vec<YtdlpAdvancedOption>>,
    // SponsorBlock settings
    sponsorblock_remove: Option<String>, // comma-separated categories to remove
    sponsorblock_mark: Option<String>,   // comma-separated categories to mark as chapters
    // Download sections (time range)
    download_sections: Option<String>, // e.g. "*10:30-14:30" for partial download
    // Title (optional, passed from frontend for display purposes)
    title: Option<String>,
    // Thumbnail URL (optional, passed from frontend for non-YouTube sites)
    thumbnail: Option<String>,
    // Source/extractor name (optional, from yt-dlp extractor e.g. "BiliBili", "TikTok")
    source: Option<String>,
    // Legacy snapshot of plugin ids enabled when the job was queued
    post_download_plugins: Option<Vec<String>>,
    // Snapshot of workflow steps by trigger at queue time
    plugin_workflow_snapshots: Option<BTreeMap<String, Vec<PluginWorkflowStepSnapshot>>>,
    // Full workflow step snapshot used for post-processing
    post_download_workflow_steps: Option<Vec<PluginWorkflowStepSnapshot>>,
    // When false, caller is responsible for firing the final download.failed workflow.
    emit_failed_workflow: Option<bool>,
    // Caller context used in plugin payload
    download_kind: Option<String>,
    // Reup Pipeline & Filename Template
    custom_filename_template: Option<String>,
    reup_mod_enabled: Option<bool>,
    reup_mod_speed: Option<f64>,
    reup_mod_pitch: Option<f64>,
    reup_mod_flip: Option<bool>,
    reup_mod_crop: Option<f64>,
) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);
    let post_download_plugins = post_download_plugins.unwrap_or_default();
    let mut plugin_workflow_snapshots = plugin_workflow_snapshots.unwrap_or_default();
    if !plugin_workflow_snapshots.contains_key("download.completed") {
        let completed_steps = resolve_download_workflow_snapshot(
            &app,
            "download.completed",
            post_download_workflow_steps,
            &post_download_plugins,
        );
        plugin_workflow_snapshots.insert("download.completed".to_string(), completed_steps);
    }
    let emit_failed_workflow = emit_failed_workflow.unwrap_or(true);
    let download_kind = download_kind.unwrap_or_else(|| "download".to_string());

    if skip_live.unwrap_or(false) {
        if let Some(live_status) = skipped_live_status(
            &app,
            &url,
            cookie_mode.as_deref(),
            cookie_browser.as_deref(),
            cookie_browser_profile.as_deref(),
            cookie_file_path.as_deref(),
            cookie_skip_patterns.as_deref(),
            proxy_url.as_deref(),
        )
        .await?
        {
            add_log_internal(
                "info",
                &format!(
                    "Skipped live video due to --skip-live (status: {})",
                    live_status
                ),
                None,
                Some(&url),
            )
            .ok();
            return Err(BackendError::new(
                crate::types::code::YT_SKIPPED_LIVE,
                format!("Skipped live video (status: {})", live_status),
            )
            .with_retryable(false)
            .with_param("liveStatus", live_status)
            .to_wire_string());
        }
    }

    let should_log_stderr = log_stderr.unwrap_or(true);
    let sanitized_path = sanitize_output_path(&output_path)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let format_string =
        build_format_string(&quality, &format, &video_codec, preferred_fps.as_deref());
    let number_playlist_items = number_playlist_items.unwrap_or(false);
    let number_queue_items = number_queue_items.unwrap_or(false);
    let filename_metadata_enabled = filename_metadata_enabled.unwrap_or(false);
    let filename_metadata_fields = filename_metadata_fields.unwrap_or_default();
    let split_embedded_chapters = split_embedded_chapters.unwrap_or(false);
    let number_chapter_files = number_chapter_files.unwrap_or(true);
    let has_filename_metadata =
        build_filename_metadata_prefix(filename_metadata_enabled, &filename_metadata_fields)
            .is_some();
    let output_template = if let Some(ref tmpl) = custom_filename_template {
        if !tmpl.trim().is_empty() {
            resolve_filename_template(tmpl.trim())
        } else {
            build_output_template(
                number_playlist_items,
                playlist_index,
                playlist_total,
                number_queue_items,
                queue_index,
                queue_total,
                filename_metadata_enabled,
                &filename_metadata_fields,
            )
        }
    } else {
        build_output_template(
            number_playlist_items,
            playlist_index,
            playlist_total,
            number_queue_items,
            queue_index,
            queue_total,
            filename_metadata_enabled,
            &filename_metadata_fields,
        )
    };

    // Use a temp file to capture the final filepath from yt-dlp.
    // On Windows with non-UTF-8 locales (e.g. Chinese/GBK), stdout is encoded
    // in the system ANSI code page which cannot represent all Unicode characters
    // (such as ⧸ U+29F8 used by yt-dlp to replace / in filenames).
    // --print-to-file always writes UTF-8, so we get the exact filepath.
    let filepath_tmp =
        std::env::temp_dir().join(format!("youwee-fp-{}-{}.txt", id, uuid::Uuid::new_v4()));

    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--no-warnings".to_string(),
        "-f".to_string(),
        format_string,
        "--paths".to_string(),
        output_path_arg(&sanitized_path),
        "-o".to_string(),
        output_template,
        "--print-to-file".to_string(),
        "after_move:filepath".to_string(),
        filepath_tmp.to_string_lossy().to_string(),
        "--no-keep-video".to_string(),
        "--no-keep-fragments".to_string(),
        "--retries".to_string(),
        "3".to_string(),
        "--fragment-retries".to_string(),
        "3".to_string(),
        "--extractor-retries".to_string(),
        "2".to_string(),
        "--file-access-retries".to_string(),
        "2".to_string(),
    ];
    add_safe_filename_args(&mut args, Some(&sanitized_path));
    if has_filename_metadata {
        args.push("--output-na-placeholder".to_string());
        args.push("unknown".to_string());
    }

    if split_embedded_chapters {
        args.push("--split-chapters".to_string());
        args.push("-o".to_string());
        args.push(format!(
            "chapter:{}",
            build_chapter_output_template(
                number_playlist_items,
                playlist_index,
                playlist_total,
                number_queue_items,
                queue_index,
                queue_total,
                number_chapter_files,
            )
        ));
    }

    // Auto use Deno runtime for YouTube (required for JS extractor)
    // Use --js-runtimes instead of --extractor-args (handles spaces in path correctly)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    // Add FFmpeg location if available
    if let Some(ffmpeg_path) = get_ffmpeg_path(&app).await {
        if let Some(parent) = ffmpeg_path.parent() {
            args.push("--ffmpeg-location".to_string());
            args.push(parent.to_string_lossy().to_string());
        }
    }

    // Subtitle settings
    append_subtitle_args(
        &mut args,
        &subtitle_mode,
        &subtitle_langs,
        subtitle_embed,
        &subtitle_format,
    );

    args.extend(build_site_header_args(&url));

    args.extend(build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    ));

    // Proxy settings
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    let ytdlp_advanced_options = ytdlp_advanced_options.unwrap_or_default();
    let advanced_args = build_ytdlp_advanced_args(
        &url,
        ytdlp_advanced_options_enabled.unwrap_or(false),
        &ytdlp_advanced_options,
    )
    .map_err(|e| e.to_wire_string())?;
    if !advanced_args.skipped_options.is_empty() {
        add_log_internal(
            "info",
            &format!(
                "Skipped yt-dlp advanced option(s) for Bilibili because RETubeMatrix uses app-managed headers: {}",
                advanced_args.skipped_options.join(", ")
            ),
            None,
            Some(&url),
        )
        .ok();
    }
    args.extend(advanced_args.args);

    // Default to IPv4 to prevent Windows IPv6 DNS/routing hangs and YouTube 403 blocks,
    // unless the user explicitly configured --force-ipv6 in advanced options.
    if !args.iter().any(|a| a == "--force-ipv6" || a == "--force-ipv4") {
        args.push("--force-ipv4".to_string());
    }

    // Merge YouTube extractor settings into a single --extractor-args value.
    // See: https://github.com/yt-dlp/yt-dlp/issues/14680
    let is_youtube_url = url.contains("youtube.com") || url.contains("youtu.be");
    if is_youtube_url {
        if let Some(extractor_args) = build_youtube_extractor_args(
            use_actual_player_js.unwrap_or(false),
            advanced_args.youtube_player_client.as_deref(),
        ) {
            args.push("--extractor-args".to_string());
            args.push(extractor_args);
        }
    } else if advanced_args.youtube_player_client.is_some() {
        add_log_internal(
            "info",
            "Skipped YouTube player client preset because the download URL is not YouTube.",
            None,
            Some(&url),
        )
        .ok();
    }

    // Live stream settings
    if live_from_start.unwrap_or(false) {
        args.push("--live-from-start".to_string());
        args.push("--no-part".to_string());
    }

    // Speed limit settings
    if let Some(limit) = speed_limit.as_ref() {
        if !limit.is_empty() {
            args.push("--limit-rate".to_string());
            args.push(limit.clone());
        }
    }

    // External downloader settings (aria2c)
    if use_aria2.unwrap_or(false) {
        args.push("--downloader".to_string());
        args.push("aria2c".to_string());
        if let Some(raw_args) = aria2_args.as_ref() {
            if let Some(normalized_args) = normalize_aria2_args(raw_args) {
                args.push("--downloader-args".to_string());
                args.push(normalized_args);
            }
        }
    }

    // Force overwrite to avoid HTTP 416 errors from stale .part files
    args.push("--force-overwrites".to_string());

    // Playlist handling
    if !download_playlist {
        args.push("--no-playlist".to_string());
    } else if let Some(limit) = playlist_limit {
        if limit > 0 {
            args.push("--playlist-end".to_string());
            args.push(limit.to_string());
        }
    }

    // Audio formats
    let is_audio_format =
        format == "mp3" || format == "m4a" || format == "opus" || quality == "audio";

    if is_audio_format {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        match format.as_str() {
            "mp3" => args.push("mp3".to_string()),
            "m4a" => args.push("m4a".to_string()),
            "opus" => args.push("opus".to_string()),
            _ => args.push("mp3".to_string()),
        }
        args.push("--audio-quality".to_string());
        match audio_bitrate.as_str() {
            "128" => args.push("128K".to_string()),
            _ => args.push("0".to_string()),
        }
    } else {
        args.push("--merge-output-format".to_string());
        args.push(format.clone());
    }

    // Embed metadata and thumbnail
    if embed_metadata.unwrap_or(false) {
        args.push("--embed-metadata".to_string());
    } else {
        // Luôn đảm bảo không add metadata và không ghi info json để giữ video sạch
        args.push("--no-add-metadata".to_string());
        args.push("--no-embed-info-json".to_string());
    }
    // Luôn ghi file thumbnail độc lập chất lượng cao (.jpg) cùng thư mục và cùng tên với video để phục vụ Reup / Đăng kênh
    args.push("--write-thumbnail".to_string());
    args.push("--convert-thumbnails".to_string());
    args.push("jpg".to_string());
    // Luôn ghi file mô tả gốc (.description) cùng thư mục và cùng tên với video để phục vụ Reup & AI thay thế tên kênh
    args.push("--write-description".to_string());

    if embed_thumbnail.unwrap_or(false) {
        args.push("--embed-thumbnail".to_string());
    } else {
        args.push("--no-embed-thumbnail".to_string());
    }

    // SponsorBlock settings
    if let Some(ref remove_cats) = sponsorblock_remove {
        if !remove_cats.is_empty() {
            args.push("--sponsorblock-remove".to_string());
            args.push(remove_cats.clone());
        }
    }
    if let Some(ref mark_cats) = sponsorblock_mark {
        if !mark_cats.is_empty() {
            args.push("--sponsorblock-mark".to_string());
            args.push(mark_cats.clone());
        }
    }

    // Download sections (time range)
    if let Some(ref sections) = download_sections {
        if !sections.is_empty() {
            args.push("--download-sections".to_string());
            args.push(sections.clone());
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    // Get binary info for logging
    let binary_info = get_ytdlp_path(&app).await;
    let binary_path_str = binary_info
        .as_ref()
        .map(|(p, is_bundled)| format!("{} (bundled: {})", p.display(), is_bundled))
        .unwrap_or_else(|| "sidecar".to_string());

    // Log command with binary path
    let command_args_for_log = redact_ytdlp_advanced_args(&args);
    let command_str = format!(
        "[{}] yt-dlp {}",
        binary_path_str,
        command_args_for_log.join(" ")
    );
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let trigger_source = source.clone().or_else(|| detect_source(&url));
    let trigger_time_range = extract_time_range(&download_sections);
    let before_start_steps =
        workflow_steps_for_trigger(&app, "download.beforeStart", &plugin_workflow_snapshots);
    let completed_workflow_steps =
        workflow_steps_for_trigger(&app, "download.completed", &plugin_workflow_snapshots);
    let failed_workflow_steps =
        workflow_steps_for_trigger(&app, "download.failed", &plugin_workflow_snapshots);

    // Try to get yt-dlp path (prioritizes bundled version for stability)
    if let Some((binary_path, _)) = get_ytdlp_path(&app).await {
        // Build extended PATH with deno/bun locations for JavaScript runtime support
        let home_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let mut path_entries: Vec<std::path::PathBuf> = std::env::var_os("PATH")
            .map(|paths| std::env::split_paths(&paths).collect())
            .unwrap_or_default();
        path_entries.extend([
            std::path::PathBuf::from(&home_dir).join(".deno/bin"),
            std::path::PathBuf::from(&home_dir).join(".bun/bin"),
            std::path::PathBuf::from("/opt/homebrew/bin"),
            std::path::PathBuf::from("/usr/local/bin"),
        ]);
        let extended_path = std::env::join_paths(path_entries)
            .unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default());

        let mut cmd = Command::new(&binary_path);
        cmd.args(&args)
            .env("HOME", &home_dir)
            .env("PATH", &extended_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();

        let process = match cmd.spawn() {
            Ok(process) => process,
            Err(error) => {
                if emit_failed_workflow {
                    enqueue_failed_workflow(
                        &app,
                        &failed_workflow_steps,
                        &id,
                        trigger_source.clone(),
                        &sanitized_path,
                        Some(format.clone()),
                        Some(quality.clone()),
                        &url,
                        title.clone(),
                        thumbnail.clone(),
                        history_id.clone(),
                        trigger_time_range.clone(),
                        &download_kind,
                    );
                }
                return Err(BackendError::from_message(format!(
                    "Failed to start yt-dlp: {}",
                    error
                ))
                .to_wire_string());
            }
        };

        enqueue_before_start_workflow(
            &app,
            &before_start_steps,
            &id,
            trigger_source.clone(),
            &sanitized_path,
            Some(format.clone()),
            Some(quality.clone()),
            &url,
            title.clone(),
            thumbnail.clone(),
            history_id.clone(),
            trigger_time_range.clone(),
            &download_kind,
        );

        return handle_tokio_download(
            app,
            id,
            process,
            quality,
            format,
            url,
            should_log_stderr,
            title,
            thumbnail,
            source,
            download_sections,
            history_id.clone(),
            filepath_tmp.clone(),
            sanitized_path.clone(),
            completed_workflow_steps.clone(),
            failed_workflow_steps.clone(),
            emit_failed_workflow,
            download_kind.clone(),
            auto_organize_collections.unwrap_or(false),
            playlist_collection_name.clone(),
            split_embedded_chapters,
            reup_mod_enabled,
            reup_mod_speed,
            reup_mod_pitch,
            reup_mod_flip,
            reup_mod_crop,
        )
        .await;
    }

    let ytdlp_source = get_ytdlp_source(&app).await;
    if ytdlp_source == DependencySource::System {
        if emit_failed_workflow {
            enqueue_failed_workflow(
                &app,
                &failed_workflow_steps,
                &id,
                trigger_source.clone(),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                trigger_time_range.clone(),
                &download_kind,
            );
        }
        return Err(BackendError::new(
            crate::types::code::YTDLP_SYSTEM_NOT_FOUND,
            system_ytdlp_not_found_message(),
        )
        .to_wire_string());
    }

    // Fallback to sidecar
    let sidecar_result = app.shell().sidecar("yt-dlp");

    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, child) = match sidecar.args(&args).spawn() {
                Ok(result) => result,
                Err(error) => {
                    if emit_failed_workflow {
                        enqueue_failed_workflow(
                            &app,
                            &failed_workflow_steps,
                            &id,
                            trigger_source.clone(),
                            &sanitized_path,
                            Some(format.clone()),
                            Some(quality.clone()),
                            &url,
                            title.clone(),
                            thumbnail.clone(),
                            history_id.clone(),
                            trigger_time_range.clone(),
                            &download_kind,
                        );
                    }
                    return Err(BackendError::from_message(format!(
                        "Failed to start bundled yt-dlp: {}",
                        error
                    ))
                    .to_wire_string());
                }
            };

            enqueue_before_start_workflow(
                &app,
                &before_start_steps,
                &id,
                trigger_source.clone(),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                trigger_time_range.clone(),
                &download_kind,
            );

            // Only use frontend title if it's not a URL (placeholder)
            let metadata_title: Option<String> = title.clone().filter(|t| !t.starts_with("http"));
            let mut current_title = metadata_title.clone();
            let mut current_index: Option<u32> = None;
            let mut total_count: Option<u32> = None;
            let mut total_filesize: u64 = 0;
            let mut current_stream_size: Option<u64> = None;
            let mut final_filepath: Option<String> = None;
            let mut printed_filepaths: Vec<String> = Vec::new();
            let mut observed_filepaths: Vec<String> = Vec::new();
            let mut recent_output: VecDeque<String> = VecDeque::new();

            let quality_display = match quality.as_str() {
                "8k" => Some("8K".to_string()),
                "4k" => Some("4K".to_string()),
                "2k" => Some("2K".to_string()),
                "1080" => Some("1080p".to_string()),
                "720" => Some("720p".to_string()),
                "480" => Some("480p".to_string()),
                "360" => Some("360p".to_string()),
                "audio" => Some("Audio".to_string()),
                "best" => Some("Best".to_string()),
                _ => None,
            };

            while let Some(event) = rx.recv().await {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    child.kill().ok();
                    kill_all_download_processes();
                    return Err(BackendError::from_message("Download cancelled").to_wire_string());
                }

                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = decode_process_output(&line_bytes);
                        push_recent_output(&mut recent_output, &line);
                        if let Some(filepath) = parse_ytdlp_output_filepath(&line) {
                            push_unique_filepath(&mut observed_filepaths, &filepath);
                        }

                        // Parse playlist item info
                        if line.contains("Downloading item") {
                            if let Some(re) =
                                regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok()
                            {
                                if let Some(caps) = re.captures(&line) {
                                    current_index =
                                        caps.get(1).and_then(|m| m.as_str().parse().ok());
                                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                                }
                            }
                        }

                        // Extract title from [download] messages
                        // Handles both: "Destination: /path/file.mp4" and "/path/file.mp4 has already been downloaded"
                        if line.contains("[download]")
                            && (line.contains("Destination:")
                                || line.contains("has already been downloaded")
                                || line.contains("[ExtractAudio]"))
                        {
                            let path_sep = if line.contains('\\') { '\\' } else { '/' };
                            if let Some(start) = line.rfind(path_sep) {
                                let filename = &line[start + 1..];
                                // Remove suffix if present
                                let filename =
                                    filename.trim_end_matches(" has already been downloaded");
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }

                        // Capture final filepath
                        let trimmed = line.trim();
                        if !trimmed.is_empty()
                            && !trimmed.starts_with('[')
                            && !trimmed.starts_with("Deleting")
                            && !trimmed.starts_with("WARNING")
                            && !trimmed.starts_with("ERROR")
                            && (trimmed.ends_with(".mp3")
                                || trimmed.ends_with(".m4a")
                                || trimmed.ends_with(".opus")
                                || trimmed.ends_with(".mp4")
                                || trimmed.ends_with(".mkv")
                                || trimmed.ends_with(".webm")
                                || trimmed.ends_with(".flac")
                                || trimmed.ends_with(".wav"))
                        {
                            final_filepath = Some(trimmed.to_string());
                        }

                        // Parse filesize
                        if line.contains(" of ")
                            && (line.contains("MiB")
                                || line.contains("GiB")
                                || line.contains("KiB"))
                        {
                            if let Some(re) =
                                regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok()
                            {
                                if let Some(caps) = re.captures(&line) {
                                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                                        if let Ok(size) = num.as_str().parse::<f64>() {
                                            let size_bytes = match unit.as_str() {
                                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                                "KiB" => (size * 1024.0) as u64,
                                                _ => size as u64,
                                            };
                                            if current_stream_size != Some(size_bytes) {
                                                if let Some(prev_size) = current_stream_size {
                                                    total_filesize += prev_size;
                                                }
                                                current_stream_size = Some(size_bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Parse progress
                        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                            parse_progress(&line)
                        {
                            if pi.is_some() {
                                current_index = pi;
                            }
                            if pc.is_some() {
                                total_count = pc;
                            }

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: None,
                                filepath: None,
                                downloaded_size,
                                elapsed_time,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let stderr_line = decode_process_output(&bytes);
                        let stderr_line = stderr_line.trim().to_string();
                        push_recent_output(&mut recent_output, &stderr_line);
                        if let Some(filepath) = parse_ytdlp_output_filepath(&stderr_line) {
                            push_unique_filepath(&mut observed_filepaths, &filepath);
                        }

                        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                            parse_progress(&stderr_line)
                        {
                            if pi.is_some() {
                                current_index = pi;
                            }
                            if pc.is_some() {
                                total_count = pc;
                            }

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: None,
                                filepath: None,
                                downloaded_size,
                                elapsed_time,
                            };
                            app.emit("download-progress", progress).ok();
                        }

                        if should_log_stderr && !stderr_line.is_empty() {
                            add_log_internal("stderr", &stderr_line, None, Some(&url)).ok();
                        }
                    }
                    CommandEvent::Error(err) => {
                        let error = BackendError::from_message(format!("Process error: {}", err));
                        add_log_internal("error", error.message(), None, Some(&url)).ok();
                        if emit_failed_workflow {
                            enqueue_failed_workflow(
                                &app,
                                &failed_workflow_steps,
                                &id,
                                source.clone().or_else(|| detect_source(&url)),
                                &sanitized_path,
                                Some(format.clone()),
                                quality_display.clone().or_else(|| Some(quality.clone())),
                                &url,
                                current_title.clone(),
                                thumbnail.clone(),
                                history_id.clone(),
                                extract_time_range(&download_sections),
                                &download_kind,
                            );
                        }
                        return Err(error.to_wire_string());
                    }
                    CommandEvent::Terminated(status) => {
                        if CANCEL_FLAG.load(Ordering::SeqCst) {
                            add_log_internal(
                                "info",
                                "Download cancelled by user",
                                None,
                                Some(&url),
                            )
                            .ok();
                            return Err(
                                BackendError::from_message("Download cancelled").to_wire_string()
                            );
                        }

                        // Primary filepath source: read from --print-to-file temp file (UTF-8)
                        if let Ok(contents) = std::fs::read_to_string(&filepath_tmp) {
                            printed_filepaths = parse_printed_filepaths(&contents);
                            if let Some(path) = printed_filepaths.first() {
                                final_filepath = Some(path.clone());
                            }
                        }
                        std::fs::remove_file(&filepath_tmp).ok();

                        if status.code == Some(0) {
                            if let Some(filepath) = final_filepath.as_deref() {
                                push_unique_filepath(&mut observed_filepaths, filepath);
                            }
                            let output_paths = job_output_filepaths(
                                &sanitized_path,
                                &printed_filepaths,
                                &observed_filepaths,
                            );
                            final_filepath = output_paths.first().cloned();

                            if !output_paths.is_empty() {
                                let proc_title = if reup_mod_enabled.unwrap_or(false) {
                                    "Đang render lách bản quyền video (Reup)..."
                                } else {
                                    "Đang làm sạch metadata & đổi MD5 video..."
                                };
                                let progress = DownloadProgress {
                                    id: id.clone(),
                                    percent: 99.0,
                                    speed: String::new(),
                                    eta: String::new(),
                                    status: "downloading".to_string(),
                                    title: Some(proc_title.to_string()),
                                    playlist_index: current_index,
                                    playlist_count: total_count,
                                    filesize: None,
                                    resolution: None,
                                    format_ext: None,
                                    error_message: None,
                                    error_code: None,
                                    error_params: None,
                                    history_id: None,
                                    filepath: None,
                                    downloaded_size: None,
                                    elapsed_time: None,
                                };
                                app.emit("download-progress", progress).ok();
                            }

                            for path in &output_paths {
                                if reup_mod_enabled.unwrap_or(false) {
                                    let reup_options = ReupModOptions {
                                        speed: reup_mod_speed,
                                        pitch: reup_mod_pitch,
                                        flip_horizontal: reup_mod_flip.unwrap_or(false),
                                        crop_percent: reup_mod_crop,
                                    };
                                    if let Err(e) = apply_reup_modifications(&app, path, &reup_options).await {
                                        log::warn!("Reup mod warning for {}: {}", path, e);
                                    }
                                } else {
                                    if let Err(e) = clean_video_metadata(&app, path).await {
                                        log::warn!("Clean video metadata warning for {}: {}", path, e);
                                    }
                                }
                            }

                            let actual_filesize = final_filepath
                                .as_ref()
                                .and_then(|fp| std::fs::metadata(fp).ok())
                                .map(|m| m.len());

                            let reported_filesize = actual_filesize.or_else(|| {
                                if let Some(last_size) = current_stream_size {
                                    Some(total_filesize + last_size)
                                } else if total_filesize > 0 {
                                    Some(total_filesize)
                                } else {
                                    None
                                }
                            });

                            let display_title = display_title_for_download(
                                metadata_title.clone(),
                                current_title.clone(),
                                &final_filepath,
                                total_count,
                            );
                            let auto_collection_names = build_auto_collection_names(
                                auto_organize_collections.unwrap_or(false),
                                playlist_collection_name.as_deref(),
                                split_embedded_chapters && output_paths.len() > 1,
                                display_title.as_deref(),
                            );

                            // Log success
                            let success_msg = format!(
                                "Downloaded: {}",
                                display_title
                                    .clone()
                                    .unwrap_or_else(|| "Unknown".to_string())
                            );
                            let details = format!(
                                "Size: {} · Quality: {} · Format: {}",
                                reported_filesize
                                    .map(format_size)
                                    .unwrap_or_else(|| "Unknown".to_string()),
                                quality_display.clone().unwrap_or_else(|| quality.clone()),
                                format.clone()
                            );
                            add_log_internal("success", &success_msg, Some(&details), Some(&url))
                                .ok();

                            // Save each emitted output to history. The first file remains the
                            // queue representative; split chapters are extra history rows.
                            let mut progress_history_id = None;
                            for (index, filepath) in output_paths.iter().enumerate() {
                                let time_range = extract_time_range(&download_sections);
                                let file_filesize = std::fs::metadata(filepath)
                                    .ok()
                                    .map(|m| m.len())
                                    .or(if index == 0 { reported_filesize } else { None });
                                let entry_title = if index == 0 {
                                    display_title
                                        .clone()
                                        .unwrap_or_else(|| "Unknown".to_string())
                                } else {
                                    title_from_filepath(filepath)
                                        .or_else(|| display_title.clone())
                                        .unwrap_or_else(|| "Unknown".to_string())
                                };

                                if index == 0 {
                                    if let Some(ref hist_id) = history_id {
                                        update_history_download(
                                            hist_id.clone(),
                                            filepath.clone(),
                                            file_filesize,
                                            quality_display.clone(),
                                            Some(format.clone()),
                                            time_range,
                                        )
                                        .ok();
                                        assign_history_auto_collections(
                                            hist_id,
                                            &auto_collection_names,
                                        );
                                        progress_history_id = Some(hist_id.clone());
                                        continue;
                                    }
                                }

                                let history_row_id = add_history_internal(
                                    url.clone(),
                                    entry_title,
                                    thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                                    filepath.clone(),
                                    file_filesize,
                                    None,
                                    quality_display.clone(),
                                    Some(format.clone()),
                                    source.clone().or_else(|| detect_source(&url)),
                                    time_range,
                                )
                                .ok();
                                if let Some(ref hist_id) = history_row_id {
                                    assign_history_auto_collections(
                                        hist_id,
                                        &auto_collection_names,
                                    );
                                }
                                if index == 0 {
                                    progress_history_id = history_row_id;
                                }
                            }

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 100.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "finished".to_string(),
                                title: display_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: reported_filesize,
                                resolution: quality_display.clone(),
                                format_ext: Some(format.clone()),
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: progress_history_id.clone(),
                                filepath: final_filepath.clone(),
                                downloaded_size: None,
                                elapsed_time: None,
                            };
                            app.emit("download-progress", progress).ok();
                            for (index, filepath) in output_paths.iter().enumerate() {
                                let file_filesize = std::fs::metadata(filepath)
                                    .ok()
                                    .map(|m| m.len())
                                    .or(if index == 0 { reported_filesize } else { None });
                                let plugin_title = if index == 0 {
                                    display_title.clone()
                                } else {
                                    title_from_filepath(filepath).or_else(|| display_title.clone())
                                };
                                run_completed_plugins(
                                    &app,
                                    &completed_workflow_steps,
                                    &id,
                                    source.clone().or_else(|| detect_source(&url)),
                                    filepath,
                                    file_filesize,
                                    Some(format.clone()),
                                    quality_display.clone().or_else(|| Some(quality.clone())),
                                    &url,
                                    plugin_title,
                                    thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                                    if index == 0 {
                                        progress_history_id.clone()
                                    } else {
                                        None
                                    },
                                    extract_time_range(&download_sections),
                                    &download_kind,
                                )
                                .await;
                            }
                            return Ok(());
                        } else {
                            if CANCEL_FLAG.load(Ordering::SeqCst) {
                                let error = download_cancelled_error();
                                add_log_internal("info", error.message(), None, Some(&url)).ok();
                                return Err(error.to_wire_string());
                            }

                            let recent_lines: Vec<String> = recent_output.iter().cloned().collect();
                            let error = build_download_error_message(status.code, &recent_lines);
                            add_log_internal("error", error.message(), None, Some(&url)).ok();

                            // Emit error progress so frontend can display error message
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 0.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "error".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: Some(error.message().to_string()),
                                error_code: Some(error.code().to_string()),
                                error_params: error.params().cloned(),
                                history_id: None,
                                filepath: None,
                                downloaded_size: None,
                                elapsed_time: None,
                            };
                            app.emit("download-progress", progress).ok();

                            if emit_failed_workflow && !failed_workflow_steps.is_empty() {
                                let payload = build_trigger_payload(
                                    &id,
                                    source.clone().or_else(|| detect_source(&url)),
                                    "download.failed",
                                    &sanitized_path,
                                    None,
                                    Some(format.clone()),
                                    quality_display.clone().or_else(|| Some(quality.clone())),
                                    &url,
                                    current_title.clone(),
                                    thumbnail.clone(),
                                    history_id.clone(),
                                    extract_time_range(&download_sections),
                                    &download_kind,
                                );
                                let _ = enqueue_post_download_workflow(
                                    &app,
                                    failed_workflow_steps.clone(),
                                    payload,
                                );
                            }

                            return Err(error.to_wire_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(())
        }
        Err(_) => {
            if ytdlp_source == DependencySource::App {
                if emit_failed_workflow {
                    enqueue_failed_workflow(
                        &app,
                        &failed_workflow_steps,
                        &id,
                        trigger_source.clone(),
                        &sanitized_path,
                        Some(format.clone()),
                        Some(quality.clone()),
                        &url,
                        title.clone(),
                        thumbnail.clone(),
                        history_id.clone(),
                        trigger_time_range.clone(),
                        &download_kind,
                    );
                }
                return Err(BackendError::new(
                    crate::types::code::YTDLP_APP_NOT_FOUND,
                    "App-managed yt-dlp not found. Please install it from Settings > Dependencies.",
                )
                .with_retryable(false)
                .to_wire_string());
            }

            // Fallback to system yt-dlp
            let mut cmd = Command::new("yt-dlp");
            cmd.args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();

            let process = match cmd.spawn() {
                Ok(process) => process,
                Err(error) => {
                    if emit_failed_workflow {
                        enqueue_failed_workflow(
                            &app,
                            &failed_workflow_steps,
                            &id,
                            trigger_source,
                            &sanitized_path,
                            Some(format.clone()),
                            Some(quality.clone()),
                            &url,
                            title.clone(),
                            thumbnail.clone(),
                            history_id.clone(),
                            trigger_time_range,
                            &download_kind,
                        );
                    }
                    return Err(BackendError::from_message(format!(
                        "Failed to start yt-dlp: {}",
                        error
                    ))
                    .to_wire_string());
                }
            };

            enqueue_before_start_workflow(
                &app,
                &before_start_steps,
                &id,
                source.clone().or_else(|| detect_source(&url)),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                extract_time_range(&download_sections),
                &download_kind,
            );

            handle_tokio_download(
                app,
                id,
                process,
                quality,
                format,
                url,
                should_log_stderr,
                title,
                thumbnail,
                source,
                download_sections,
                history_id.clone(),
                filepath_tmp,
                sanitized_path,
                completed_workflow_steps,
                failed_workflow_steps,
                emit_failed_workflow,
                download_kind,
                auto_organize_collections.unwrap_or(false),
                playlist_collection_name,
                split_embedded_chapters,
                reup_mod_enabled,
                reup_mod_speed,
                reup_mod_pitch,
                reup_mod_flip,
                reup_mod_crop,
            )
            .await
        }
    }
}

async fn handle_tokio_download(
    app: AppHandle,
    id: String,
    mut process: tokio::process::Child,
    quality: String,
    format: String,
    url: String,
    should_log_stderr: bool,
    title: Option<String>,
    thumbnail: Option<String>,
    source: Option<String>,
    download_sections: Option<String>,
    history_id: Option<String>,
    filepath_tmp: std::path::PathBuf,
    output_directory: String,
    completed_workflow_steps: Vec<PluginWorkflowStepSnapshot>,
    failed_workflow_steps: Vec<PluginWorkflowStepSnapshot>,
    emit_failed_workflow: bool,
    download_kind: String,
    auto_organize_collections: bool,
    playlist_collection_name: Option<String>,
    split_embedded_chapters: bool,
    reup_mod_enabled: Option<bool>,
    reup_mod_speed: Option<f64>,
    reup_mod_pitch: Option<f64>,
    reup_mod_flip: Option<bool>,
    reup_mod_crop: Option<f64>,
) -> Result<(), String> {
    let stdout = process
        .stdout
        .take()
        .ok_or_else(|| BackendError::from_message("Failed to get stdout").to_wire_string())?;
    let stderr = process.stderr.take();
    let mut stdout_reader = BufReader::new(stdout);

    // Only use frontend title if it's not a URL (placeholder)
    let metadata_title: Option<String> = title.filter(|t| !t.starts_with("http"));
    let mut current_title = metadata_title.clone();
    let mut current_index: Option<u32> = None;
    let mut total_count: Option<u32> = None;
    let mut total_filesize: u64 = 0;
    let mut current_stream_size: Option<u64> = None;
    let mut final_filepath: Option<String> = None;
    let mut printed_filepaths: Vec<String> = Vec::new();
    let recent_output = Arc::new(Mutex::new(VecDeque::new()));
    let observed_filepaths = Arc::new(Mutex::new(Vec::new()));

    let quality_display = match quality.as_str() {
        "8k" => Some("8K".to_string()),
        "4k" => Some("4K".to_string()),
        "2k" => Some("2K".to_string()),
        "1080" => Some("1080p".to_string()),
        "720" => Some("720p".to_string()),
        "480" => Some("480p".to_string()),
        "360" => Some("360p".to_string()),
        "audio" => Some("Audio".to_string()),
        "best" => Some("Best".to_string()),
        _ => None,
    };

    // Spawn task to read stderr in parallel (for live stream progress)
    let stderr_app = app.clone();
    let stderr_id = id.clone();
    let stderr_url = url.clone();
    let stderr_recent_output = recent_output.clone();
    let stderr_observed_filepaths = observed_filepaths.clone();
    let stderr_task = if let Some(stderr_handle) = stderr {
        Some(tokio::spawn(async move {
            let mut stderr_reader = BufReader::new(stderr_handle);
            let mut line_buf = Vec::new();
            loop {
                line_buf.clear();
                match stderr_reader.read_until(b'\n', &mut line_buf).await {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(_) => break,
                }
                while line_buf.last().map_or(false, |&b| b == b'\n' || b == b'\r') {
                    line_buf.pop();
                }
                let line = decode_process_output(&line_buf);

                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    break;
                }
                push_recent_output_shared(&stderr_recent_output, &line);
                if let Some(filepath) = parse_ytdlp_output_filepath(&line) {
                    if let Ok(mut paths) = stderr_observed_filepaths.lock() {
                        push_unique_filepath(&mut paths, &filepath);
                    }
                }

                // Parse progress from stderr (live streams output here)
                if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                    parse_progress(&line)
                {
                    let progress = DownloadProgress {
                        id: stderr_id.clone(),
                        percent,
                        speed,
                        eta,
                        status: "downloading".to_string(),
                        title: None,
                        playlist_index: pi,
                        playlist_count: pc,
                        filesize: None,
                        resolution: None,
                        format_ext: None,
                        error_message: None,
                        error_code: None,
                        error_params: None,
                        history_id: None,
                        filepath: None,
                        downloaded_size,
                        elapsed_time,
                    };
                    stderr_app.emit("download-progress", progress).ok();
                }

                // Log stderr if enabled
                if should_log_stderr && !line.trim().is_empty() {
                    add_log_internal("stderr", line.trim(), None, Some(&stderr_url)).ok();
                }
            }
        }))
    } else {
        None
    };

    // Read stdout — use raw byte reading + decode_process_output to handle
    // non-UTF-8 encodings (e.g. GBK on Chinese Windows).
    let mut stdout_line_buf = Vec::new();
    loop {
        stdout_line_buf.clear();
        match stdout_reader.read_until(b'\n', &mut stdout_line_buf).await {
            Ok(0) => break, // EOF
            Ok(_) => {}
            Err(_) => break,
        }
        while stdout_line_buf
            .last()
            .map_or(false, |&b| b == b'\n' || b == b'\r')
        {
            stdout_line_buf.pop();
        }
        let line = decode_process_output(&stdout_line_buf);

        if CANCEL_FLAG.load(Ordering::SeqCst) {
            process.kill().await.ok();
            kill_all_download_processes();
            return Err(BackendError::from_message("Download cancelled").to_wire_string());
        }
        push_recent_output_shared(&recent_output, &line);
        if let Some(filepath) = parse_ytdlp_output_filepath(&line) {
            if let Ok(mut paths) = observed_filepaths.lock() {
                push_unique_filepath(&mut paths, &filepath);
            }
        }

        // Parse progress and emit events
        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
            parse_progress(&line)
        {
            if pi.is_some() {
                current_index = pi;
            }
            if pc.is_some() {
                total_count = pc;
            }

            let progress = DownloadProgress {
                id: id.clone(),
                percent,
                speed,
                eta,
                status: "downloading".to_string(),
                title: current_title.clone(),
                playlist_index: current_index,
                playlist_count: total_count,
                filesize: None,
                resolution: None,
                format_ext: None,
                error_message: None,
                error_code: None,
                error_params: None,
                history_id: None,
                filepath: None,
                downloaded_size,
                elapsed_time,
            };
            app.emit("download-progress", progress).ok();
        }

        // Extract title from [download] messages
        // Handles both: "Destination: /path/file.mp4" and "/path/file.mp4 has already been downloaded"
        if line.contains("[download]")
            && (line.contains("Destination:") || line.contains("has already been downloaded"))
        {
            let path_sep = if line.contains('\\') { '\\' } else { '/' };
            if let Some(start) = line.rfind(path_sep) {
                let filename = &line[start + 1..];
                // Remove suffix if present
                let filename = filename.trim_end_matches(" has already been downloaded");
                if let Some(end) = filename.rfind('.') {
                    current_title = Some(filename[..end].to_string());
                }
            }
        }

        // Capture final filepath
        let trimmed = line.trim();
        if !trimmed.is_empty()
            && !trimmed.starts_with('[')
            && (trimmed.ends_with(".mp3")
                || trimmed.ends_with(".m4a")
                || trimmed.ends_with(".opus")
                || trimmed.ends_with(".mp4")
                || trimmed.ends_with(".mkv")
                || trimmed.ends_with(".webm")
                || trimmed.ends_with(".flac")
                || trimmed.ends_with(".wav"))
        {
            final_filepath = Some(trimmed.to_string());
        }

        // Capture audio filepath from [ExtractAudio] Destination lines
        // e.g. "[ExtractAudio] Destination: C:\Users\...\song.mp3"
        if line.contains("[ExtractAudio]") && line.contains("Destination:") {
            if let Some(pos) = line.find("Destination:") {
                let path = line[pos + "Destination:".len()..].trim();
                if !path.is_empty() {
                    final_filepath = Some(path.to_string());
                }
            }
        }

        // Parse filesize
        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB")) {
            if let Some(re) = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok() {
                if let Some(caps) = re.captures(&line) {
                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                        if let Ok(size) = num.as_str().parse::<f64>() {
                            let size_bytes = match unit.as_str() {
                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                "KiB" => (size * 1024.0) as u64,
                                _ => size as u64,
                            };
                            if current_stream_size != Some(size_bytes) {
                                if let Some(prev_size) = current_stream_size {
                                    total_filesize += prev_size;
                                }
                                current_stream_size = Some(size_bytes);
                            }
                        }
                    }
                }
            }
        }
    }

    // Wait for stderr task to finish reading all lines.
    if let Some(task) = stderr_task {
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), task).await;
    }

    // Wait for process to fully exit before reading the temp file.
    // yt-dlp writes --print-to-file after_move:filepath near process exit;
    // reading before wait() can race and miss the path.
    let status = match process.wait().await {
        Ok(status) => status,
        Err(error) => {
            if emit_failed_workflow {
                enqueue_failed_workflow(
                    &app,
                    &failed_workflow_steps,
                    &id,
                    source.clone().or_else(|| detect_source(&url)),
                    &output_directory,
                    Some(format.clone()),
                    quality_display.clone().or_else(|| Some(quality.clone())),
                    &url,
                    current_title.clone(),
                    thumbnail.clone(),
                    history_id.clone(),
                    extract_time_range(&download_sections),
                    &download_kind,
                );
            }
            return Err(
                BackendError::from_message(format!("Process error: {}", error)).to_wire_string(),
            );
        }
    };

    // Primary filepath source: read from the --print-to-file temp file (UTF-8).
    // This is reliable on all platforms, especially Windows with non-UTF-8 locales
    // where stdout encoding (GBK) corrupts Unicode characters in file paths.
    if let Ok(contents) = std::fs::read_to_string(&filepath_tmp) {
        printed_filepaths = parse_printed_filepaths(&contents);
        if let Some(path) = printed_filepaths.first() {
            final_filepath = Some(path.clone());
        }
    }
    // Clean up the temp file
    std::fs::remove_file(&filepath_tmp).ok();

    if status.success() {
        if let Some(filepath) = final_filepath.as_deref() {
            if let Ok(mut paths) = observed_filepaths.lock() {
                push_unique_filepath(&mut paths, filepath);
            }
        }
        let observed_filepaths = observed_filepaths
            .lock()
            .map(|paths| paths.clone())
            .unwrap_or_default();
        let output_paths =
            job_output_filepaths(&output_directory, &printed_filepaths, &observed_filepaths);

        if !output_paths.is_empty() {
            let proc_title = if reup_mod_enabled.unwrap_or(false) {
                "Đang render lách bản quyền video (Reup)..."
            } else {
                "Đang làm sạch metadata & đổi MD5 video..."
            };
            let progress = DownloadProgress {
                id: id.clone(),
                percent: 99.0,
                speed: String::new(),
                eta: String::new(),
                status: "downloading".to_string(),
                title: Some(proc_title.to_string()),
                playlist_index: current_index,
                playlist_count: total_count,
                filesize: None,
                resolution: None,
                format_ext: None,
                error_message: None,
                error_code: None,
                error_params: None,
                history_id: None,
                filepath: None,
                downloaded_size: None,
                elapsed_time: None,
            };
            app.emit("download-progress", progress).ok();
        }

        // Tự động làm sạch metadata, đổi MD5 hoặc áp dụng lách bản quyền cho video sau khi tải về thành công
        for path in &output_paths {
            if reup_mod_enabled.unwrap_or(false) {
                let reup_options = ReupModOptions {
                    speed: reup_mod_speed,
                    pitch: reup_mod_pitch,
                    flip_horizontal: reup_mod_flip.unwrap_or(false),
                    crop_percent: reup_mod_crop,
                };
                if let Err(e) = apply_reup_modifications(&app, path, &reup_options).await {
                    log::warn!("Reup mod warning for {}: {}", path, e);
                }
            } else {
                if let Err(e) = clean_video_metadata(&app, path).await {
                    log::warn!("Clean video metadata warning for {}: {}", path, e);
                }
            }
        }

        final_filepath = output_paths.first().cloned();

        let actual_filesize = final_filepath
            .as_ref()
            .and_then(|fp| std::fs::metadata(fp).ok())
            .map(|m| m.len());

        let reported_filesize = actual_filesize.or_else(|| {
            if let Some(last_size) = current_stream_size {
                Some(total_filesize + last_size)
            } else if total_filesize > 0 {
                Some(total_filesize)
            } else {
                None
            }
        });

        let display_title =
            display_title_for_download(metadata_title, current_title, &final_filepath, total_count);
        let auto_collection_names = build_auto_collection_names(
            auto_organize_collections,
            playlist_collection_name.as_deref(),
            split_embedded_chapters && output_paths.len() > 1,
            display_title.as_deref(),
        );

        let success_msg = format!(
            "Downloaded: {}",
            display_title
                .clone()
                .unwrap_or_else(|| "Unknown".to_string())
        );
        let details = format!(
            "Size: {} · Quality: {} · Format: {}",
            reported_filesize
                .map(format_size)
                .unwrap_or_else(|| "Unknown".to_string()),
            quality_display.clone().unwrap_or_else(|| quality.clone()),
            format.clone()
        );
        add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();

        let mut progress_history_id = None;
        for (index, filepath) in output_paths.iter().enumerate() {
            let time_range = extract_time_range(&download_sections);
            let file_filesize = std::fs::metadata(filepath)
                .ok()
                .map(|m| m.len())
                .or(if index == 0 { reported_filesize } else { None });
            let entry_title = if index == 0 {
                display_title
                    .clone()
                    .unwrap_or_else(|| "Unknown".to_string())
            } else {
                title_from_filepath(filepath)
                    .or_else(|| display_title.clone())
                    .unwrap_or_else(|| "Unknown".to_string())
            };

            if index == 0 {
                if let Some(ref hist_id) = history_id {
                    update_history_download(
                        hist_id.clone(),
                        filepath.clone(),
                        file_filesize,
                        quality_display.clone(),
                        Some(format.clone()),
                        time_range,
                    )
                    .ok();
                    assign_history_auto_collections(hist_id, &auto_collection_names);
                    progress_history_id = Some(hist_id.clone());
                    continue;
                }
            }

            let history_row_id = add_history_internal(
                url.clone(),
                entry_title,
                thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                filepath.clone(),
                file_filesize,
                None,
                quality_display.clone(),
                Some(format.clone()),
                source.clone().or_else(|| detect_source(&url)),
                time_range,
            )
            .ok();
            if let Some(ref hist_id) = history_row_id {
                assign_history_auto_collections(hist_id, &auto_collection_names);
            }
            if index == 0 {
                progress_history_id = history_row_id;
            }
        }

        let progress = DownloadProgress {
            id: id.clone(),
            percent: 100.0,
            speed: String::new(),
            eta: String::new(),
            status: "finished".to_string(),
            title: display_title.clone(),
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: reported_filesize,
            resolution: quality_display.clone(),
            format_ext: Some(format.clone()),
            error_message: None,
            error_code: None,
            error_params: None,
            history_id: progress_history_id.clone(),
            filepath: final_filepath.clone(),
            downloaded_size: None,
            elapsed_time: None,
        };
        app.emit("download-progress", progress).ok();
        for (index, filepath) in output_paths.iter().enumerate() {
            let file_filesize = std::fs::metadata(filepath)
                .ok()
                .map(|m| m.len())
                .or(if index == 0 { reported_filesize } else { None });
            let plugin_title = if index == 0 {
                display_title.clone()
            } else {
                title_from_filepath(filepath).or_else(|| display_title.clone())
            };
            run_completed_plugins(
                &app,
                &completed_workflow_steps,
                &id,
                source.clone().or_else(|| detect_source(&url)),
                filepath,
                file_filesize,
                Some(format.clone()),
                quality_display.clone().or_else(|| Some(quality.clone())),
                &url,
                plugin_title,
                thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                if index == 0 {
                    progress_history_id.clone()
                } else {
                    None
                },
                extract_time_range(&download_sections),
                &download_kind,
            )
            .await;
        }
        Ok(())
    } else {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            let error = download_cancelled_error();
            add_log_internal("info", error.message(), None, Some(&url)).ok();
            return Err(error.to_wire_string());
        }

        let recent_lines = recent_output_snapshot(&recent_output);
        let error = build_download_error_message(status.code(), &recent_lines);
        add_log_internal("error", error.message(), None, Some(&url)).ok();

        // Emit error progress so frontend can display error message
        let progress = DownloadProgress {
            id: id.clone(),
            percent: 0.0,
            speed: String::new(),
            eta: String::new(),
            status: "error".to_string(),
            title: current_title.clone(),
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: None,
            resolution: None,
            format_ext: None,
            error_message: Some(error.message().to_string()),
            error_code: Some(error.code().to_string()),
            error_params: error.params().cloned(),
            history_id: None,
            filepath: None,
            downloaded_size: None,
            elapsed_time: None,
        };
        app.emit("download-progress", progress).ok();

        if emit_failed_workflow && !failed_workflow_steps.is_empty() {
            let payload = build_trigger_payload(
                &id,
                source.clone().or_else(|| detect_source(&url)),
                "download.failed",
                &output_directory,
                None,
                Some(format.clone()),
                quality_display.clone().or_else(|| Some(quality.clone())),
                &url,
                current_title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                extract_time_range(&download_sections),
                &download_kind,
            );
            let _ = enqueue_post_download_workflow(&app, failed_workflow_steps, payload);
        }

        Err(error.to_wire_string())
    }
}

#[tauri::command]
pub async fn stop_download() -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    kill_all_download_processes();
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    kill_all_download_processes();
    Ok(())
}

