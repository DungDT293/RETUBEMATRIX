//! RETubeMatrix - Modern YouTube Video Downloader
//!
//! This is the main entry point for the Tauri application.
//! The codebase is organized into the following modules:
//!
//! - `types`: Data structures (VideoInfo, DownloadProgress, etc.)
//! - `database`: SQLite operations for logs and history
//! - `utils`: Helper functions (format_size, parse_progress, etc.)
//! - `services`: Core services (yt-dlp, FFmpeg, Deno runtime)
//! - `commands`: Tauri commands exposed to the frontend

pub mod commands;
pub mod database;
pub mod services;
pub mod tray;
pub mod types;
pub mod utils;

pub use tray::{rebuild_tray_menu, should_setup_system_tray, show_main_window};

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(target_os = "linux")]
fn configure_linux_webkit_env() {
    // Work around WebKitGTK/GBM crashes seen on some Arch-based systems.
    // Let advanced users override this manually if they want to re-enable GBM.
    if std::env::var_os("WEBKIT_DMABUF_RENDERER_DISABLE_GBM").is_none() {
        std::env::set_var("WEBKIT_DMABUF_RENDERER_DISABLE_GBM", "1");
    }
}

fn dispatch_external_links(app_handle: &tauri::AppHandle, links: Vec<String>) {
    if links.is_empty() {
        return;
    }

    commands::enqueue_external_links(links.clone());
    let _ = app_handle.emit(
        "external-open-url",
        commands::ExternalOpenUrlEventPayload { urls: links },
    );
    show_main_window(app_handle);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Protocol-handler style links (retubematrix://download?...) embedded in argv.
            let links = commands::extract_external_links_from_argv(&argv);
            let has_links = !links.is_empty();
            if has_links {
                dispatch_external_links(app, links);
            }

            // CLI style invocation (retubematrix <url> [--quality ...]) while the app
            // is already running.
            if let Some(cli_request) = commands::build_cli_download_request_from_argv(&argv) {
                let requests = vec![cli_request];
                commands::enqueue_cli_download_requests(requests.clone());
                let _ = app.emit(
                    "external-cli-download",
                    commands::ExternalCliDownloadEventPayload { requests },
                );
                if !has_links {
                    return;
                }
            }
            show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Windows: remove native title bar so the frontend can render
            // a custom one that transitions seamlessly with the app theme.
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            for (_, window) in app.webview_windows() {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_always_on_top(true);
                let _ = window.set_always_on_top(false);
                let _ = window.set_focus();
            }

            // Queue deep links from cold-start arguments so frontend can consume on mount.
            let argv: Vec<String> = std::env::args().collect();
            let initial_links = commands::extract_external_links_from_argv(&argv);
            let has_initial_links = !initial_links.is_empty();
            if has_initial_links {
                commands::enqueue_external_links(initial_links);
            }

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event
                    .urls()
                    .into_iter()
                    .map(|url| url.to_string())
                    .collect::<Vec<_>>();
                let links = commands::extract_external_links_from_argv(&urls);
                dispatch_external_links(&app_handle, links);
            });

            // CLI invocation (retubematrix <url> [--quality ...]) on cold start.
            // Use the declared CLI schema when available, falling back to a
            // raw argv parse otherwise.
            {
                use tauri_plugin_cli::CliExt;
                let cli_request = match app.cli().matches() {
                    Ok(matches) => {
                        let mut cli_args = commands::CliDownloadArgs::default();
                        if let Some(data) = matches.args.get("source") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.url = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("url") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.url = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("quality") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.quality = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("output") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.output_path = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("target") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.target = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("audio") {
                            cli_args.audio = data.value.as_bool().unwrap_or(false);
                        }
                        if let Some(data) = matches.args.get("queue-only") {
                            cli_args.queue_only = data.value.as_bool().unwrap_or(false);
                        }
                        if let Some(data) = matches.args.get("skip-live") {
                            cli_args.skip_live = data.value.as_bool().unwrap_or(false);
                        }
                        if let Some(data) = matches.args.get("playlist") {
                            if data.value.as_bool().unwrap_or(false) {
                                cli_args.download_playlist = Some(true);
                            }
                        }
                        if let Some(data) = matches.args.get("no-playlist") {
                            if data.value.as_bool().unwrap_or(false) {
                                cli_args.download_playlist = Some(false);
                            }
                        }
                        if let Some(data) = matches.args.get("subtitle-mode") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.subtitle_mode = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("subtitle-langs") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.subtitle_langs = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("subtitle-format") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.subtitle_format = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("embed-subs") {
                            cli_args.subtitle_embed = data.value.as_bool().unwrap_or(false);
                        }
                        if let Some(data) = matches.args.get("download-sections") {
                            if let Some(value) = data.value.as_str() {
                                cli_args.download_sections = Some(value.to_string());
                            }
                        }
                        if let Some(data) = matches.args.get("live-from-start") {
                            cli_args.live_from_start = data.value.as_bool().unwrap_or(false);
                        }
                        commands::build_cli_download_request(&cli_args)
                    }
                    Err(_) => commands::build_cli_download_request_from_argv(&argv),
                };
                if let Some(request) = cli_request {
                    commands::enqueue_cli_download_requests(vec![request]);
                }
            }

            // Initialize the database
            if let Err(e) = database::init_database(&app.handle()) {
                log::error!("Failed to initialize database: {}", e);
            }

            // Start background channel polling
            services::polling::start_polling(app.handle().clone());

            if tray::should_setup_system_tray() {
                tray::setup_tray(app)?;
            } else {
                log::info!("System tray is disabled inside Flatpak");
            }

            show_main_window(&app.handle());
            for (_, window) in app.handle().webview_windows() {
                let _ = window.show();
                let _ = window.set_focus();
            }

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    .build(),
            )?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: hide window instead of quitting
            if should_setup_system_tray() {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();

                    static SHOWN_TRAY_NOTICE: AtomicBool = AtomicBool::new(false);
                    if !SHOWN_TRAY_NOTICE.swap(true, Ordering::SeqCst) {
                        use tauri_plugin_notification::NotificationExt;
                        let _ = window
                            .app_handle()
                            .notification()
                            .builder()
                            .title("RETubeMatrix")
                            .body("Ứng dụng đang chạy ngầm trong khay hệ thống để tự động theo dõi kênh và tải video mới.")
                            .show();
                    }

                    // macOS: optionally hide the dock icon too
                    #[cfg(target_os = "macos")]
                    if tray::HIDE_DOCK_ON_CLOSE.load(Ordering::SeqCst) {
                        let _ = window
                            .app_handle()
                            .set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Download commands
            commands::download_video,
            commands::stop_download,
            // Video info commands
            commands::get_video_info,
            commands::get_playlist_entries,
            commands::get_video_transcript,
            commands::read_companion_description,
            // yt-dlp commands
            commands::get_ytdlp_version,
            commands::check_ytdlp_update,
            commands::update_ytdlp,
            // yt-dlp channel commands
            commands::get_ytdlp_source_cmd,
            commands::set_ytdlp_source_cmd,
            commands::set_ytdlp_channel_cmd,
            commands::get_all_ytdlp_versions_cmd,
            commands::check_ytdlp_channel_update,
            commands::download_ytdlp_channel,
            // FFmpeg commands
            commands::check_ffmpeg,
            commands::get_ffmpeg_source_cmd,
            commands::set_ffmpeg_source_cmd,
            commands::check_ffmpeg_update,
            commands::download_ffmpeg,
            // Deno commands
            commands::check_deno,
            commands::check_deno_update,
            commands::download_deno,
            // Browser detection
            commands::detect_installed_browsers,
            commands::get_browser_profiles,
            // Log commands
            commands::get_logs,
            commands::get_plugin_logs,
            commands::clear_plugin_logs,
            commands::clear_logs,
            commands::export_logs,
            // History commands
            commands::get_history,
            commands::get_history_entries_by_ids,
            commands::find_duplicate_downloads,
            commands::delete_history,
            commands::clear_history,
            commands::get_history_count,
            commands::get_tags,
            commands::get_collections,
            commands::create_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::assign_history_tags,
            commands::assign_history_collections,
            commands::remove_history_tag,
            commands::remove_history_from_collection,
            commands::open_file_location,
            commands::check_file_exists,
            // Asset scope & history helpers
            commands::allow_asset_file,
            commands::sync_asset_scope_paths,
            commands::rename_downloaded_file,
            commands::sync_history_renamed_entry,
            commands::split_media_segments,
            commands::add_summary_only_history,
            commands::open_macos_privacy_settings,
            // AI commands
            commands::save_ai_config,
            commands::get_ai_config,
            commands::test_ai_connection,
            commands::generate_video_summary,
            commands::get_ai_models,
            commands::get_summary_languages,
            commands::ai_rewrite_viral_titles_cmd,
            commands::ai_generate_smart_description_cmd,
            commands::ai_analyze_hook_deep_cmd,
            commands::extract_video_seo_tags_cmd,
            // Processing commands
            commands::get_video_metadata,
            commands::generate_video_thumbnail,
            commands::run_reup_pipeline_v1_cmd,
            commands::run_reup_pipeline_v2_cmd,
            commands::scan_video_preflight_cmd,
            commands::run_preflight_scan_cmd,
            commands::probe_hardware_encoder_cmd,
            commands::run_reup_pipeline_adaptive_cmd,
            commands::scan_directory_videos_cmd,
            // Whisper commands
            commands::transcribe_url_with_whisper,
            // Plugin commands
            commands::list_plugins,
            commands::get_plugin_details,
            commands::inspect_plugin_package,
            commands::install_plugin_package,
            commands::list_plugin_store_entries,
            commands::prepare_plugin_store_package,
            commands::uninstall_plugin,
            commands::attach_plugin_workspace,
            commands::create_plugin_workspace,
            commands::update_plugin_state,
            commands::get_plugin_trigger_workflow,
            commands::update_plugin_trigger_workflow,
            commands::enqueue_plugin_workflow_trigger,
            commands::approve_plugin_permissions,
            commands::update_plugin_config_values,
            commands::set_plugin_provider,
            commands::set_plugin_timeout,
            commands::open_plugin_directory,
            commands::list_runtime_providers,
            commands::set_default_provider_for_language,
            commands::set_plugin_runtime_locale,
            // Channel commands
            commands::get_channel_video_filepath,
            commands::get_channel_video_edited_filepath,
            commands::get_channel_videos,
            commands::get_channel_info,
            commands::stop_channel_fetch,
            commands::follow_channel,
            commands::unfollow_channel,
            commands::get_followed_channels,
            commands::update_channel_settings,
            commands::save_channel_videos,
            commands::get_saved_channel_videos,
            commands::get_saved_channel_videos_by_video_ids,
            commands::update_channel_video_status,
            commands::update_channel_video_status_by_video_id,
            commands::get_new_videos_count,
            commands::update_channel_last_checked,
            commands::update_channel_info,
            commands::set_polling_network_config,
            commands::get_channel_stats,
            commands::get_all_channel_stats,
            commands::check_channel_now,
            commands::toggle_channel_auto_download,
            commands::update_channel_bkt_config,
            commands::set_channel_fast_track_cmd,
            commands::update_channel_reup_config_cmd,
            commands::open_channel_edited_folder_cmd,
            commands::get_channel_edited_folder_stats_cmd,
            commands::trigger_bkt_test_video,
            commands::trigger_bkt_test_videos_batch,
            commands::check_bkt_copyright_status_cmd,
            commands::extract_competitor_channel_seo_cmd,
            commands::apply_competitor_seo_to_profile_cmd,
            commands::nurture_competitor_channel_seo_cmd,
            commands::sync_channel_analytics_cmd,
            commands::get_outlier_settings_cmd,
            commands::update_outlier_settings_cmd,
            commands::get_outlier_videos_cmd,
            commands::update_outlier_video_status_cmd,
            commands::delete_outlier_video_cmd,
            commands::clear_all_outliers_cmd,
            commands::analyze_competitor_channel_cmd,
            commands::trigger_outlier_scan_cmd,
            commands::fetch_live_trending_topics_cmd,
            commands::analyze_google_trends_cmd,
            commands::trigger_outlier_ping_cmd,
            commands::find_keyword_goldmines_cmd,
            commands::analyze_video_hook_cmd,
            commands::set_telegram_config,
            commands::get_telegram_status,
            commands::send_telegram_reply,
            commands::load_download_queue,
            commands::save_download_queue,
            commands::clear_download_queue,
            commands::is_flatpak_environment,
            commands::get_system_hwid_cmd,
            // External deep-link commands
            commands::consume_pending_external_links,
            commands::open_external_url,
            commands::consume_pending_cli_download_requests,
            // CLI shortcut commands
            commands::get_cli_shortcut_status,
            commands::install_cli_shortcut,
            // System commands
            tray::set_hide_dock_on_close,
            tray::rebuild_tray_menu_cmd,
            tray::update_tray_schedule,
            tray::update_tray_download_status,
            tray::bring_main_window_to_front,
            // Browser Multi Profile & Upload commands
            commands::get_multibrowser_profiles,
            commands::save_multibrowser_profile,
            commands::delete_multibrowser_profile,
            commands::launch_multibrowser_profile,
            commands::upload_video_multibrowser,
            commands::test_multibrowser_proxy,
            commands::get_multibrowser_stats,
            commands::stop_multibrowser_profile,
            commands::bulk_stop_multibrowser_profiles,
            commands::arrange_multibrowser_windows,
            commands::clean_multibrowser_profile_cache,
            commands::clean_multibrowser_profile_cache_native,
            commands::cleanup_reup_artifacts_cmd,
            commands::update_multibrowser_profile_meta,
            commands::bulk_set_multibrowser_group,
            // BKT Test Channels commands
            commands::get_bkt_test_channels,
            commands::save_bkt_test_channel,
            commands::delete_bkt_test_channel,
            commands::toggle_bkt_channel_active,
            commands::get_bkt_test_jobs,
            commands::dispatch_batch_bkt_test,
            commands::publish_bkt_job_to_main_cmd,
            commands::publish_bkt_catchup_cmd,
            commands::recheck_bkt_job_cmd,
            commands::cancel_bkt_job,
            commands::cancel_all_bkt_jobs,
            commands::reset_bkt_channel_daily_quota,
            commands::get_daily_report_stats,
            commands::wait_bkt_job_completion,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                // macOS: user clicked dock icon while window is hidden → reopen
                // (On Windows/Linux this event doesn't fire — users use the system tray instead)
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } => {
                    if !has_visible_windows {
                        show_main_window(_app_handle);
                    }
                }
                tauri::RunEvent::ExitRequested { .. } => {
                    // Stop polling on exit
                    services::polling::stop_polling();
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod branding_tests {
    use serde_json::Value;

    fn config() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json should be valid JSON")
    }

    #[test]
    fn updater_points_to_own_repository() {
        let config = config();
        let endpoint = config["plugins"]["updater"]["endpoints"][0]
            .as_str()
            .expect("updater endpoint should exist");

        assert!(endpoint.contains("DungDT293/RETUBEMATRIX"));
        assert!(!endpoint.contains("vanloctech/youwee"));
    }

    #[test]
    fn deep_link_schemes_include_canonical_and_legacy() {
        let config = config();
        let schemes = config["plugins"]["deep-link"]["desktop"]["schemes"]
            .as_array()
            .expect("deep-link schemes should be an array");

        assert!(schemes.iter().any(|value| value == "retubematrix"));
        assert!(schemes.iter().any(|value| value == "youwee"));
    }
}
