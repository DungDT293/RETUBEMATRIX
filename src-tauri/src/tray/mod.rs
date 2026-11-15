//! RETubeMatrix - System Tray Management Subsystem.
//!
//! Handles system tray icon lifecycle, dynamic menus, queue summary updates,
//! and window visibility events.

pub mod i18n;

use crate::{database, services};
use i18n::{set_tray_lang, tray_text};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// Whether to hide the dock icon when closing the window (macOS only)
pub static HIDE_DOCK_ON_CLOSE: AtomicBool = AtomicBool::new(false);

/// Schedule status text for tray menu (empty = no schedule active)
static TRAY_SCHEDULE_STATUS: Mutex<String> = Mutex::new(String::new());

/// Download queue summary shown in the tray menu.
static TRAY_DOWNLOAD_STATUS: Mutex<TrayDownloadStatus> = Mutex::new(TrayDownloadStatus {
    pending: 0,
    downloading: 0,
    completed: 0,
    error: 0,
    active: false,
});

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayDownloadStatus {
    pub pending: u32,
    pub downloading: u32,
    pub completed: u32,
    pub error: u32,
    pub active: bool,
}

/// Flatpak's GNOME runtime does not ship an AppIndicator implementation. Avoid
/// initializing Tauri's system tray there, as it would abort the application
/// before the WebView can start.
pub fn should_setup_system_tray() -> bool {
    !cfg!(target_os = "linux") || std::env::var_os("FLATPAK_ID").is_none()
}

/// Show the main window and restore dock icon if needed
pub fn show_main_window(app_handle: &tauri::AppHandle) {
    for (_, window) in app_handle.webview_windows() {
        #[cfg(target_os = "macos")]
        {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.set_always_on_top(false);
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn bring_main_window_to_front(app: tauri::AppHandle) {
    show_main_window(&app);
}

/// Tauri command: set the hide-dock-on-close preference
#[tauri::command]
pub fn set_hide_dock_on_close(hide: bool) {
    HIDE_DOCK_ON_CLOSE.store(hide, Ordering::SeqCst);
}

/// Tauri command: rebuild the system tray menu with current channel info
#[tauri::command]
pub fn rebuild_tray_menu_cmd(app: tauri::AppHandle, lang: Option<String>) {
    if let Some(l) = lang {
        set_tray_lang(l);
    }
    rebuild_tray_menu(&app);
}

/// Tauri command: update the schedule status shown in the tray menu
#[tauri::command]
pub fn update_tray_schedule(app: tauri::AppHandle, status: String) {
    if let Ok(mut stored) = TRAY_SCHEDULE_STATUS.lock() {
        *stored = status;
    }
    rebuild_tray_menu(&app);
}

/// Tauri command: update the download queue summary shown in the tray menu
#[tauri::command]
pub fn update_tray_download_status(app: tauri::AppHandle, status: TrayDownloadStatus) {
    let mut should_rebuild = false;
    if let Ok(mut stored) = TRAY_DOWNLOAD_STATUS.lock() {
        if *stored != status {
            *stored = status;
            should_rebuild = true;
        }
    }
    if should_rebuild {
        rebuild_tray_menu(&app);
    }
}

/// Setup system tray icon and menu
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Open RETubeMatrix").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../icons/tray-template.png"))
        .expect("Failed to load tray icon");
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../icons/32x32.png"))
        .expect("Failed to load tray icon");

    let app_handle = app.handle().clone();
    let app_handle_menu = app.handle().clone();

    let tray_builder = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("RETubeMatrix")
        .menu(&menu)
        .on_menu_event(move |_tray, event| {
            let id = event.id().as_ref();
            if let Some(channel_id) = id.strip_prefix("ch_") {
                show_main_window(&app_handle_menu);
                let _ = app_handle_menu.emit("tray-open-channel", channel_id.to_string());
            } else {
                match id {
                    "check_now" => {
                        services::polling::stop_polling();
                        services::polling::start_polling(app_handle_menu.clone());
                    }
                    "settings" => {
                        show_main_window(&app_handle_menu);
                        let _ = app_handle_menu.emit("tray-open-settings", ());
                    }
                    "check_update" => {
                        show_main_window(&app_handle_menu);
                        let _ = app_handle_menu.emit("tray-check-update", ());
                    }
                    "show" => {
                        show_main_window(&app_handle_menu);
                    }
                    "browser_extension" => {
                        show_main_window(&app_handle_menu);
                        let _ = app_handle_menu.emit("tray-open-extension", ());
                    }
                    "quit" => {
                        services::polling::stop_polling();
                        app_handle_menu.exit(0);
                    }
                    _ => {}
                }
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(&app_handle);
            }
        });

    #[cfg(target_os = "macos")]
    let tray_builder = tray_builder.icon_as_template(true);

    tray_builder.build(app)?;
    rebuild_tray_menu(&app.handle());

    Ok(())
}

/// Rebuild the system tray menu with current followed channels and new video counts.
pub fn rebuild_tray_menu(app_handle: &tauri::AppHandle) {
    if !should_setup_system_tray() {
        return;
    }

    let handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let channels = database::get_followed_channels_db().unwrap_or_default();
        let channel_count = channels.len();
        let download_status = tray_download_status();
        let remote_status_label = tray_remote_status_label();

        let mut channel_items = Vec::new();
        for ch in &channels {
            let count = database::get_new_videos_count_db(Some(ch.id.clone())).unwrap_or(0);
            let label = if count > 0 {
                format!("{} ({} {})", ch.name, count, tray_text("new_suffix"))
            } else {
                ch.name.clone()
            };
            channel_items.push((format!("ch_{}", ch.id), label));
        }

        let data = TrayData {
            channel_count,
            channel_items,
            download_status,
            remote_status_label,
        };

        let handle_for_main = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Err(e) = rebuild_tray_menu_inner(&handle_for_main, data) {
                log::error!("Failed to rebuild tray menu: {}", e);
            }
        });
    });
}

fn tray_download_status() -> TrayDownloadStatus {
    TRAY_DOWNLOAD_STATUS
        .lock()
        .map(|status| status.clone())
        .unwrap_or(TrayDownloadStatus {
            pending: 0,
            downloading: 0,
            completed: 0,
            error: 0,
            active: false,
        })
}

fn tray_download_summary(status: &TrayDownloadStatus) -> String {
    let total = status.pending + status.downloading + status.completed + status.error;
    let activity = if status.active || status.downloading > 0 {
        tray_text("downloading")
    } else {
        tray_text("idle")
    };
    format!("{} ({})", activity, total)
}

fn tray_remote_status_label() -> String {
    let status = services::telegram::get_status();
    let state = match status.state {
        services::telegram::TelegramStatusState::Running => tray_text("running"),
        services::telegram::TelegramStatusState::Disabled => tray_text("disabled"),
        services::telegram::TelegramStatusState::Error => tray_text("errors"),
    };

    if let Some(message) = status.message.filter(|message| !message.trim().is_empty()) {
        format!("{}: {}", state, message)
    } else {
        state.to_string()
    }
}

struct TrayData {
    channel_count: usize,
    channel_items: Vec<(String, String)>,
    download_status: TrayDownloadStatus,
    remote_status_label: String,
}

fn rebuild_tray_menu_inner(
    app_handle: &tauri::AppHandle,
    data: TrayData,
) -> Result<(), Box<dyn std::error::Error>> {
    let submenu_label = format!("{} ({})", tray_text("followed_channels"), data.channel_count);
    let mut submenu = SubmenuBuilder::new(app_handle, &submenu_label);

    if data.channel_items.is_empty() {
        let item = MenuItemBuilder::with_id("no_channels", tray_text("no_channels"))
            .enabled(false)
            .build(app_handle)?;
        submenu = submenu.item(&item);
    } else {
        for (item_id, label) in data.channel_items {
            let item = MenuItemBuilder::with_id(item_id, &label).build(app_handle)?;
            submenu = submenu.item(&item);
        }
    }

    let built_submenu = submenu.build()?;
    let download_label = format!(
        "{} - {}",
        tray_text("download_queue"),
        tray_download_summary(&data.download_status)
    );
    let download_status_item = MenuItemBuilder::with_id("download_status", &download_label)
        .enabled(false)
        .build(app_handle)?;
    let download_pending_item = MenuItemBuilder::with_id(
        "download_pending",
        format!("{}: {}", tray_text("pending"), data.download_status.pending),
    )
    .enabled(false)
    .build(app_handle)?;
    let download_downloading_item = MenuItemBuilder::with_id(
        "download_downloading",
        format!(
            "{}: {}",
            tray_text("downloading"),
            data.download_status.downloading
        ),
    )
    .enabled(false)
    .build(app_handle)?;
    let download_completed_item = MenuItemBuilder::with_id(
        "download_completed",
        format!("{}: {}", tray_text("completed"), data.download_status.completed),
    )
    .enabled(false)
    .build(app_handle)?;
    let download_error_item = MenuItemBuilder::with_id(
        "download_error",
        format!("{}: {}", tray_text("errors"), data.download_status.error),
    )
    .enabled(false)
    .build(app_handle)?;
    let download_submenu = SubmenuBuilder::new(app_handle, tray_text("download_queue"))
        .item(&download_status_item)
        .separator()
        .item(&download_downloading_item)
        .item(&download_pending_item)
        .item(&download_completed_item)
        .item(&download_error_item)
        .build()?;

    let remote_status = MenuItemBuilder::with_id(
        "remote_download_status",
        format!(
            "{} - {}",
            tray_text("remote_download"),
            data.remote_status_label
        ),
    )
    .enabled(false)
    .build(app_handle)?;

    let check_now =
        MenuItemBuilder::with_id("check_now", tray_text("check_all")).build(app_handle)?;
    let settings = MenuItemBuilder::with_id("settings", tray_text("settings")).build(app_handle)?;
    let check_update =
        MenuItemBuilder::with_id("check_update", tray_text("check_update")).build(app_handle)?;
    let show = MenuItemBuilder::with_id("show", tray_text("open")).build(app_handle)?;
    let browser_extension =
        MenuItemBuilder::with_id("browser_extension", tray_text("browser_extension"))
            .build(app_handle)?;
    let quit = MenuItemBuilder::with_id("quit", tray_text("quit")).build(app_handle)?;

    let menu = MenuBuilder::new(app_handle)
        .item(&show)
        .separator()
        .item(&download_submenu)
        .item(&remote_status)
        .separator()
        .item(&built_submenu)
        .item(&check_now)
        .separator()
        .item(&settings)
        .item(&browser_extension)
        .separator()
        .item(&check_update)
        .separator()
        .item(&quit)
        .build()?;

    if let Some(tray) = app_handle.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}
