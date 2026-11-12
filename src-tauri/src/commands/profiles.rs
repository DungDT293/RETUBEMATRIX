use std::path::{Path, PathBuf};
use std::process::Stdio;
use base64::prelude::*;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::types::{
    MultiBrowserProfile, MultiBrowserProfileInput, MultiBrowserProxyTestResult,
    MultiBrowserUploadParams, MultiBrowserUploadResult,
};
use crate::utils::CommandExt;

fn get_python_exe(app: Option<&AppHandle>) -> String {
    if let Ok(exe) = std::env::var("PYTHON_EXE") {
        if !exe.trim().is_empty() && std::path::Path::new(&exe).exists() {
            return exe;
        }
    }

    // 1. Check next to running executable (bundled python or local virtualenv in NSIS / MSI)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("python").join("python.exe"),
                exe_dir.join("resources").join("python").join("python.exe"),
                exe_dir.join("_up_").join("python").join("python.exe"),
                exe_dir.join("python.exe"),
            ];
            for cand in candidates {
                if cand.exists() {
                    return cand.to_string_lossy().to_string();
                }
            }
        }
    }

    // 2. Check Tauri resource directory and app data directory
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let candidates = [
                res_dir.join("python").join("python.exe"),
                res_dir.join("resources").join("python").join("python.exe"),
                res_dir.join("_up_").join("python").join("python.exe"),
                res_dir.join("python.exe"),
            ];
            for cand in candidates {
                if cand.exists() {
                    return cand.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(app_data) = app.path().app_data_dir() {
            let cand = app_data.join("python").join("python.exe");
            if cand.exists() {
                return cand.to_string_lossy().to_string();
            }
        }
    }

    // 3. Dev mode / workspace root fallback (for clean dev machines without system python)
    if let Ok(cwd) = std::env::current_dir() {
        let candidates = [
            cwd.join("src-tauri").join("python").join("python.exe"),
            cwd.join("python").join("python.exe"),
            cwd.join("..").join("src-tauri").join("python").join("python.exe"),
        ];
        for cand in candidates {
            if cand.exists() {
                return cand.to_string_lossy().to_string();
            }
        }
    }
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let cand = std::path::PathBuf::from(manifest_dir).join("python").join("python.exe");
        if cand.exists() {
            return cand.to_string_lossy().to_string();
        }
    }

    // 4. Check user's %LOCALAPPDATA%\Programs\Python
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let base = std::path::PathBuf::from(local_app_data).join("Programs").join("Python");
        if base.exists() {
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let exe = entry.path().join("python.exe");
                    if exe.exists() {
                        return exe.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    // 3. Common system root & Program Files locations on Windows
    let system_candidates = [
        r"C:\Program Files\Python313\python.exe",
        r"C:\Program Files\Python312\python.exe",
        r"C:\Program Files\Python311\python.exe",
        r"C:\Program Files\Python310\python.exe",
        r"C:\Python313\python.exe",
        r"C:\Python312\python.exe",
        r"C:\Python311\python.exe",
        r"C:\Python310\python.exe",
    ];
    for cand in system_candidates {
        if std::path::Path::new(cand).exists() {
            return cand.to_string();
        }
    }

    // 4. Check PATH excluding WindowsApps dummy redirection
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let exe = dir.join("python.exe");
            if exe.exists() {
                let s = exe.to_string_lossy();
                if !s.to_lowercase().contains("windowsapps") {
                    return s.to_string();
                }
            }
        }
    }

    "python".to_string()
}

fn get_runner_path(app: &AppHandle) -> PathBuf {
    // 0. Trong dev mode, luôn ưu tiên mã nguồn thực tế tại workspace root để không bị stale cache
    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let p = PathBuf::from(manifest_dir).join("..").join("browser_engine").join("runner.py");
            if p.exists() {
                return p;
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            let candidates = [
                cwd.join("browser_engine").join("runner.py"),
                cwd.join("..").join("browser_engine").join("runner.py"),
                cwd.join("src-tauri").join("..").join("browser_engine").join("runner.py"),
            ];
            for cand in candidates {
                if cand.exists() {
                    return cand;
                }
            }
        }
    }

    // 1. Current executable directory (when installed via NSIS / MSI)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("browser_engine").join("runner.py"),
                exe_dir.join("resources").join("browser_engine").join("runner.py"),
                exe_dir.join("_up_").join("browser_engine").join("runner.py"),
                exe_dir.join("..").join("browser_engine").join("runner.py"),
            ];
            for cand in candidates {
                if cand.exists() {
                    return cand;
                }
            }
        }
    }

    // 2. Tauri resource directory
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("browser_engine").join("runner.py"),
            resource_dir.join("resources").join("browser_engine").join("runner.py"),
            resource_dir.join("_up_").join("browser_engine").join("runner.py"),
            resource_dir.join("runner.py"),
        ];
        for cand in candidates {
            if cand.exists() {
                return cand;
            }
        }
    }

    // 3. Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let candidates = [
            cwd.join("browser_engine").join("runner.py"),
            cwd.join("..").join("browser_engine").join("runner.py"),
            cwd.join("src-tauri").join("..").join("browser_engine").join("runner.py"),
        ];
        for cand in candidates {
            if cand.exists() {
                return cand;
            }
        }
    }

    // 4. AppData / LocalAppData directory
    if let Ok(app_data) = app.path().app_data_dir() {
        let cand = app_data.join("browser_engine").join("runner.py");
        if cand.exists() {
            return cand;
        }
    }

    PathBuf::from("browser_engine/runner.py")
}

pub fn resolve_browser_data_dir(
    env_override: Option<&str>,
    local_appdata: Option<&str>,
    tauri_local_data_dir: Option<&Path>,
) -> Option<PathBuf> {
    if let Some(raw) = env_override {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    if let Some(local) = local_appdata {
        let trimmed = local.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed).join("RETubeMatrix").join("browser_engine"));
        }
    }
    tauri_local_data_dir.map(|dir| {
        dir.parent()
            .map(|parent| parent.join("RETubeMatrix").join("browser_engine"))
            .unwrap_or_else(|| dir.join("browser_engine"))
    })
}

pub fn get_browser_data_dir(app: Option<&AppHandle>) -> Option<PathBuf> {
    let env_override = std::env::var("RETUBEMATRIX_BROWSER_DATA_DIR").ok();
    let local_appdata = std::env::var("LOCALAPPDATA").ok();
    let tauri_local = app.and_then(|a| a.path().local_data_dir().ok());
    resolve_browser_data_dir(
        env_override.as_deref(),
        local_appdata.as_deref(),
        tauri_local.as_deref(),
    )
}

pub fn create_runner_cmd(app: &AppHandle) -> (Command, PathBuf) {
    let python = get_python_exe(Some(app));
    let runner = get_runner_path(app);

    let mut cmd = Command::new(&python);
    if let Some(parent) = runner.parent() {
        if parent.exists() && parent.is_dir() {
            cmd.current_dir(parent);
        }
    }
    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONDONTWRITEBYTECODE", "1");
    if let Some(data_dir) = get_browser_data_dir(Some(app)) {
        cmd.env("RETUBEMATRIX_BROWSER_DATA_DIR", &data_dir);
    }
    cmd.arg("-X").arg("utf8");

    // Inject YTDLP_BIN to ensure Outlier Hunter and Background Engines always find yt-dlp
    let ytdlp_candidates = [
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("bin").join("retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("retubematrix-yt-dlp.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("bin").join("youwee-yt-dlp-x86_64-pc-windows-msvc.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("bin").join("yt-dlp.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("youwee-yt-dlp.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("yt-dlp.exe"))),
        app.path().resource_dir().ok().map(|r| r.join("bin").join("retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe")),
        app.path().resource_dir().ok().map(|r| r.join("bin").join("retubematrix-yt-dlp.exe")),
        app.path().resource_dir().ok().map(|r| r.join("bin").join("youwee-yt-dlp-x86_64-pc-windows-msvc.exe")),
        app.path().resource_dir().ok().map(|r| r.join("bin").join("yt-dlp.exe")),
        app.path().app_data_dir().ok().map(|a| a.join("bin").join("yt-dlp.exe")),
        std::env::current_dir().ok().map(|cwd| cwd.join("src-tauri").join("bin").join("retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe")),
        std::env::current_dir().ok().map(|cwd| cwd.join("bin").join("retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe")),
    ];
    for cand in ytdlp_candidates.into_iter().flatten() {
        if cand.exists() {
            cmd.env("YTDLP_BIN", cand.to_string_lossy().to_string());
            break;
        }
    }

    // Inject BROWSERMULTI_EXECUTABLE to ensure BrowserMulti always finds bundled Chromium v155
    let browsermulti_candidates = [
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("resources").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe"))),
        std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("_up_").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe"))),
        app.path().resource_dir().ok().map(|r| r.join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
        app.path().resource_dir().ok().map(|r| r.join("resources").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
        app.path().resource_dir().ok().map(|r| r.join("_up_").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
        std::env::current_dir().ok().map(|cwd| cwd.join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
        std::env::current_dir().ok().map(|cwd| cwd.join("..").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
        std::env::current_dir().ok().map(|cwd| cwd.join("src-tauri").join("..").join("roots").join("browsermulti").join("155.0.8059.12").join("chrome.exe")),
    ];
    for cand in browsermulti_candidates.into_iter().flatten() {
        if cand.exists() {
            cmd.env("BROWSERMULTI_EXECUTABLE", cand.to_string_lossy().to_string());
            break;
        }
    }

    (cmd, runner)
}

pub fn parse_json_from_output(stdout: &str, stderr: &str) -> Result<serde_json::Value, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        let err_detail = if !stderr.trim().is_empty() {
            format!(" Chi tiết: {}", stderr.trim())
        } else {
            String::new()
        };
        return Err(format!("Tiến trình Python không trả về dữ liệu kết quả.{err_detail}"));
    }

    // Thử parse toàn bộ chuỗi
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Ok(v);
    }

    // Tìm dòng JSON cuối cùng
    for line in trimmed.lines().rev() {
        let line = line.trim();
        if line.starts_with('{') && line.ends_with('}') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                return Ok(v);
            }
        }
    }

    Err(format!(
        "Lỗi phân tích JSON từ đầu ra Python: {trimmed} | Lỗi: {stderr}"
    ))
}

use std::sync::Mutex;
use std::time::Instant;

static STATS_CACHE: Mutex<Option<(Instant, serde_json::Value)>> = Mutex::new(None);

pub fn clear_stats_cache() {
    if let Ok(mut guard) = STATS_CACHE.lock() {
        *guard = None;
    }
}

/// Kiểm tra xem profile có thuộc Pool Kênh Test Bản Quyền (BKT Test) hay không.
pub fn is_bkt_test_profile(
    p: &MultiBrowserProfile,
    bkt_profile_ids: Option<&std::collections::HashSet<String>>,
) -> bool {
    if let Some(ids) = bkt_profile_ids {
        if ids.contains(&p.id) {
            return true;
        }
    }
    let group = p.group.as_deref().unwrap_or("").trim().to_lowercase();
    let name = p.profile_name.trim().to_lowercase();
    group == "kênh test bkt"
        || group == "kenh test bkt"
        || group.contains("kênh test bkt")
        || group.contains("bkt test")
        || name.starts_with("[bkt test]")
        || name.contains("[bkt test]")
}

/// Đọc toàn bộ profiles thô từ profiles.json hoặc Python runner (kể cả hồ sơ BKT test).
pub async fn get_all_raw_multibrowser_profiles(app: AppHandle) -> Result<Vec<MultiBrowserProfile>, String> {
    // FAST PATH: Đọc trực tiếp từ profiles.json của RETubeMatrix trên đĩa ngoài reactor thread.
    // TUYỆT ĐỐI KHÔNG đọc trộm hoặc fallback sang BrowserMulti hay reupytb để đảm bảo dữ liệu RETubeMatrix hoàn toàn cô lập và sạch sẽ.
    let data_dir_opt = get_browser_data_dir(Some(&app));
    if let Some(profiles_opt) = tokio::task::spawn_blocking(move || {
        let data_dir = data_dir_opt?;
        let retube_profile_path = data_dir.join("profiles.json");

        if !retube_profile_path.exists() {
            // Chỉ fallback sang Python tự phục hồi nếu chính thư mục profiles nội bộ của RETubeMatrix đã có folder con.
            let profiles_dir = data_dir.join("profiles");
            if let Ok(mut entries) = std::fs::read_dir(&profiles_dir) {
                if entries.any(|entry| entry.ok().map(|ent| ent.path().is_dir()).unwrap_or(false)) {
                    return None;
                }
            }
            return Some(Vec::new());
        }

        let content = std::fs::read_to_string(&retube_profile_path).ok()?;
        if let Ok(profiles) = serde_json::from_str::<Vec<MultiBrowserProfile>>(&content) {
            return Some(profiles);
        }
        // Lenient fallback parsing to prevent falling back to Python on minor type differences
        if let Ok(raw_list) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
            let profiles: Vec<MultiBrowserProfile> = raw_list
                .into_iter()
                .filter_map(|val| {
                    let id = val.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let profile_name = val
                        .get("profile_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&id)
                        .to_string();
                    if id.is_empty() && profile_name.is_empty() {
                        return None;
                    }
                    Some(MultiBrowserProfile {
                        id: if id.is_empty() { profile_name.clone() } else { id },
                        profile_name,
                        group: val.get("group").and_then(|v| v.as_str()).map(String::from),
                        profile_dir: val
                            .get("profile_dir")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        proxy: val.get("proxy").and_then(|v| v.as_str()).map(String::from),
                        proxy_scheme: val
                            .get("proxy_scheme")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        youtube_preferred_channel: val
                            .get("youtube_preferred_channel")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        youtube_channels: val
                            .get("youtube_channels")
                            .and_then(|v| v.as_array())
                            .cloned(),
                        note: val.get("note").and_then(|v| v.as_str()).map(String::from),
                        color: val.get("color").and_then(|v| v.as_str()).map(String::from),
                        tags: val.get("tags").and_then(|v| v.as_array()).map(|arr| {
                            arr.iter()
                                .filter_map(|s| s.as_str().map(String::from))
                                .collect()
                        }),
                        fingerprint_seed: val.get("fingerprint_seed").cloned(),
                        fingerprint_os: val
                            .get("fingerprint_os")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        fingerprint_browser_version: val
                            .get("fingerprint_browser_version")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        fingerprint_webgl: val
                            .get("fingerprint_webgl")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        fingerprint_canvas: val
                            .get("fingerprint_canvas")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        fingerprint_timezone: val
                            .get("fingerprint_timezone")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        fingerprint_language: val
                            .get("fingerprint_language")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        proxy_risk: val
                            .get("proxy_risk")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        proxy_score: val.get("proxy_score").cloned(),
                        proxy_country: val
                            .get("proxy_country")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        last_run_status: val
                            .get("last_run_status")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        last_run_time: val
                            .get("last_run_time")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        last_run_error: val
                            .get("last_run_error")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                    })
                })
                .collect();
            return Some(profiles);
        }
        None
    })
    .await
    .ok()
    .flatten()
    {
        return Ok(profiles_opt);
    }

    let (mut cmd, runner) = create_runner_cmd(&app);
    if !runner.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner.display()
        ));
    }
    cmd.arg(&runner).arg("--action").arg("list_profiles");
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy python runner ({e}). Đảm bảo máy tính đã cài đặt Python 3.10+."))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;

    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err_msg = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi không xác định");
        return Err(err_msg.to_string());
    }

    let profiles: Vec<MultiBrowserProfile> = serde_json::from_value(
        val.get("profiles").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    )
    .map_err(|e| format!("Lỗi ánh xạ dữ liệu profiles: {e}"))?;

    Ok(profiles)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_multibrowser_profiles(
    app: AppHandle,
    include_bkt: Option<bool>,
    include_bkt_test: Option<bool>,
    includeBkt: Option<bool>,
    includeBktTest: Option<bool>,
) -> Result<Vec<MultiBrowserProfile>, String> {
    let include = include_bkt
        .or(include_bkt_test)
        .or(includeBkt)
        .or(includeBktTest)
        .unwrap_or(false);
    let mut profiles = get_all_raw_multibrowser_profiles(app).await?;
    if !include {
        let bkt_ids: std::collections::HashSet<String> = crate::database::get_bkt_test_channels_db()
            .unwrap_or_default()
            .into_iter()
            .map(|c| c.profile_id)
            .collect();
        profiles.retain(|p| !is_bkt_test_profile(p, Some(&bkt_ids)));
    }
    Ok(profiles)
}

#[tauri::command]
pub async fn save_multibrowser_profile(
    app: AppHandle,
    profile: MultiBrowserProfileInput,
) -> Result<MultiBrowserProfile, String> {
    let is_update = profile.id.as_ref().map(|id| !id.trim().is_empty()).unwrap_or(false);
    let action = if is_update { "update_profile" } else { "add_profile" };

    let data_json = serde_json::to_string(&profile).map_err(|e| e.to_string())?;
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    if !runner.exists() {
        return Err(format!(
            "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
            runner.display()
        ));
    }
    cmd.arg(&runner).arg("--action").arg(action);
    if let Some(ref prof_id) = profile.id {
        if !prof_id.trim().is_empty() {
            cmd.arg("--profile-id").arg(prof_id);
        }
    }
    cmd.arg("--data-b64").arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể thực thi tiến trình Python ({e}). Đảm bảo máy tính đã cài đặt Python 3.10+."))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;

    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Thất bại khi lưu profile");
        return Err(err.to_string());
    }

    if let Some(prof_val) = val.get("profile") {
        if let Ok(p) = serde_json::from_value::<MultiBrowserProfile>(prof_val.clone()) {
            clear_stats_cache();
            return Ok(p);
        }
    }

    let profiles = get_all_raw_multibrowser_profiles(app).await?;
    let target_name = profile.profile_name.trim();
    let found = profiles
        .into_iter()
        .find(|p| {
            if let Some(ref id) = profile.id {
                &p.id == id || &p.profile_name == target_name
            } else {
                &p.profile_name == target_name
            }
        })
        .ok_or_else(|| "Đã lưu nhưng không tìm lại được profile vừa lưu".to_string())?;

    clear_stats_cache();
    Ok(found)
}

#[tauri::command]
pub async fn delete_multibrowser_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("delete_profile")
        .arg("--profile-id")
        .arg(&profile_id);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi thực thi delete_profile: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;

    let is_ok = match val.get("success") {
        Some(v) if v.is_boolean() => v.as_bool().unwrap_or(false),
        Some(v) if v.is_object() || v.is_string() => true,
        _ => false,
    };
    if !is_ok {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể xóa profile");
        return Err(err.to_string());
    }

    clear_stats_cache();

    Ok(())
}

#[tauri::command]
pub async fn test_multibrowser_proxy(
    app: AppHandle,
    proxy: String,
) -> Result<MultiBrowserProxyTestResult, String> {
    let payload = serde_json::json!({ "proxy": proxy.trim() });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("test_proxy")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Lỗi thực thi test_proxy: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;

    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể kết nối proxy");
        return Err(err.to_string());
    }

    let res: MultiBrowserProxyTestResult = serde_json::from_value(val)
        .map_err(|e| format!("Lỗi ánh xạ dữ liệu proxy: {e}"))?;

    Ok(res)
}

#[tauri::command]
pub async fn launch_multibrowser_profile(
    app: AppHandle,
    profile_id: String,
    target_url: Option<String>,
) -> Result<(), String> {
    clear_stats_cache();
    let (mut cmd, runner) = create_runner_cmd(&app);

    tokio::spawn(async move {
        cmd.arg(&runner)
            .arg("--action")
            .arg("open_profile")
            .arg("--profile-id")
            .arg(&profile_id);
        if let Some(ref url) = target_url {
            if !url.trim().is_empty() {
                cmd.arg("--target-url").arg(url.trim());
            }
        }
        cmd.hide_window();

        if let Ok(mut child) = cmd.spawn() {
            let _ = child.wait().await;
            clear_stats_cache();
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn upload_video_multibrowser(
    app: AppHandle,
    mut params: MultiBrowserUploadParams,
) -> Result<MultiBrowserUploadResult, String> {
    // Luôn đảm bảo tiêu đề YouTube không bao giờ vượt quá 100 ký tự
    let raw_t = params.title.trim();
    if raw_t.chars().count() > 100 {
        params.title = raw_t.chars().take(100).collect();
    } else {
        params.title = raw_t.to_string();
    }

    log::info!(
        "Khởi chạy upload_video_multibrowser cho profile_id: {}, video: {}, title_len: {}, tags: {:?}",
        params.profile_id,
        params.video_path,
        params.title.chars().count(),
        params.tags
    );
    let data_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("upload_video")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.hide_window();

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Không thể khởi chạy quy trình đăng video: {e}"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_handle = app.clone();
    let profile_id = params.profile_id.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_handle.emit(
                "browser-upload-log",
                serde_json::json!({
                    "profile_id": &profile_id,
                    "log": line
                }),
            );
        }
    });

    let mut final_json_str = String::new();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            final_json_str = trimmed.to_string();
        } else {
            let _ = app.emit(
                "browser-upload-log",
                serde_json::json!({
                    "profile_id": &params.profile_id,
                    "log": line
                }),
            );
        }
    }

    let status = child.wait().await.map_err(|e| format!("Lỗi chờ tiến trình upload: {e}"))?;
    clear_stats_cache();

    if !status.success() && final_json_str.is_empty() {
        return Ok(MultiBrowserUploadResult {
            success: false,
            video_url: None,
            youtube_video_id: None,
            error: Some("Quá trình đăng video bị ngắt quãng hoặc gặp sự cố".to_string()),
        });
    }

    let mut res: MultiBrowserUploadResult = serde_json::from_str(&final_json_str).unwrap_or(
        MultiBrowserUploadResult {
            success: false,
            video_url: None,
            youtube_video_id: None,
            error: Some(format!("Kết quả đầu ra không hợp lệ: {final_json_str}")),
        },
    );

    if res.youtube_video_id.is_none() {
        if let Some(ref url) = res.video_url {
            if let Some(pos) = url.find("youtu.be/") {
                let id: String = url[pos + 9..].chars().take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
                if !id.is_empty() {
                    res.youtube_video_id = Some(id);
                }
            } else if let Some(pos) = url.find("v=") {
                let id: String = url[pos + 2..].chars().take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
                if !id.is_empty() {
                    res.youtube_video_id = Some(id);
                }
            }
        }
    }

    Ok(res)
}

fn parse_utc_datetime(raw: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S%.f")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S"))
    {
        return Some(chrono::DateTime::from_naive_utc_and_offset(ndt, chrono::Utc));
    }
    None
}

pub fn is_today_utc(iso_ts: &str, now_utc: chrono::DateTime<chrono::Utc>) -> bool {
    parse_utc_datetime(iso_ts)
        .map(|dt| dt.date_naive() == now_utc.date_naive())
        .unwrap_or(false)
}

fn build_history_session(session_id: String, mut runs: Vec<serde_json::Value>, index: usize) -> serde_json::Value {
    runs.sort_by_key(|run| {
        run.get("finished_at")
            .and_then(|v| v.as_str())
            .and_then(parse_utc_datetime)
    });

    let mut min_start: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut max_finish: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut first_action: Option<String> = None;
    let mut mixed_action = false;
    let mut has_error = false;
    let mut has_running = false;
    let mut has_stopped = false;
    let mut has_success = false;
    let mut other_status: Option<String> = None;
    let mut profile_keys = std::collections::HashSet::new();

    for (idx, run) in runs.iter().enumerate() {
        if let Some(finished) = run.get("finished_at").and_then(|v| v.as_str()).and_then(parse_utc_datetime) {
            let dur_ms = (run.get("duration_seconds").and_then(|v| v.as_f64()).unwrap_or(0.0).max(0.0) * 1000.0).round() as i64;
            let start = finished - chrono::Duration::milliseconds(dur_ms);
            min_start = Some(min_start.map_or(start, |cur| cur.min(start)));
            max_finish = Some(max_finish.map_or(finished, |cur| cur.max(finished)));
        }
        if let Some(act) = run.get("action").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            match &first_action {
                None => first_action = Some(act.to_string()),
                Some(existing) if existing != act => mixed_action = true,
                _ => {}
            }
        }
        if let Some(st) = run.get("status").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            match st {
                "error" => has_error = true,
                "running" => has_running = true,
                "stopped" | "cancelled" => has_stopped = true,
                "success" => has_success = true,
                _ => {
                    if other_status.is_none() {
                        other_status = Some(st.to_string());
                    }
                }
            }
        }
        let pkey = run
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| run.get("profile_name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
            .map(String::from)
            .unwrap_or_else(|| idx.to_string());
        profile_keys.insert(pkey);
    }

    let duration_seconds = match (min_start, max_finish) {
        (Some(s), Some(f)) if f > s => {
            (((f - s).num_milliseconds() as f64 / 1000.0) * 100.0).round() / 100.0
        }
        _ => 0.0,
    };

    let status = if has_error {
        "error".to_string()
    } else if has_running {
        "running".to_string()
    } else if has_stopped {
        "stopped".to_string()
    } else if has_success && other_status.is_none() {
        "success".to_string()
    } else {
        other_status.unwrap_or_default()
    };

    let action = if mixed_action {
        "mixed".to_string()
    } else {
        first_action.unwrap_or_default()
    };

    let sid = if session_id.is_empty() {
        format!("legacy-{index}")
    } else {
        session_id
    };

    runs.reverse();
    serde_json::json!({
        "session_id": sid,
        "action": action,
        "status": status,
        "started_at": min_start.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
        "finished_at": max_finish.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
        "duration_seconds": duration_seconds,
        "profile_count": profile_keys.len(),
        "runs": runs,
    })
}

pub fn compute_run_history_summary(
    history_path: Option<&Path>,
    now_utc: chrono::DateTime<chrono::Utc>,
) -> serde_json::Value {
    let mut parsed_records: Vec<serde_json::Value> = Vec::new();
    if let Some(path) = history_path {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let all_lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
                let start = all_lines.len().saturating_sub(500);
                for line in &all_lines[start..] {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                        if val.is_object() {
                            parsed_records.push(val);
                        }
                    }
                }
            }
        }
    }

    let today_run_count = parsed_records
        .iter()
        .filter(|r| {
            r.get("finished_at")
                .and_then(|v| v.as_str())
                .map(|ts| is_today_utc(ts, now_utc))
                .unwrap_or(false)
        })
        .count();

    let session_slice_start = parsed_records.len().saturating_sub(160);
    let session_runs = &parsed_records[session_slice_start..];
    let mut explicit: std::collections::BTreeMap<String, Vec<serde_json::Value>> = std::collections::BTreeMap::new();
    let mut legacy: Vec<Vec<serde_json::Value>> = Vec::new();
    let mut current: Vec<serde_json::Value> = Vec::new();
    let mut current_end: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut current_action = String::new();
    let max_gap = chrono::Duration::minutes(20);

    for run in session_runs {
        let sid = run.get("session_id").and_then(|v| v.as_str()).unwrap_or("").trim();
        if !sid.is_empty() {
            explicit.entry(sid.to_string()).or_default().push(run.clone());
            continue;
        }
        let finish_dt = run.get("finished_at").and_then(|v| v.as_str()).and_then(parse_utc_datetime);
        let dur_ms = (run.get("duration_seconds").and_then(|v| v.as_f64()).unwrap_or(0.0).max(0.0) * 1000.0).round() as i64;
        let start_dt = finish_dt.map(|f| f - chrono::Duration::milliseconds(dur_ms));
        let action = run.get("action").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let same_chain = !current.is_empty()
            && match (start_dt, current_end) {
                (Some(s), Some(ce)) => s <= ce + max_gap,
                _ => false,
            }
            && (current_action.is_empty() || action == current_action);

        if !same_chain {
            if !current.is_empty() {
                legacy.push(current);
            }
            current = vec![run.clone()];
            current_action = action;
            current_end = finish_dt;
        } else {
            current.push(run.clone());
            if let Some(f) = finish_dt {
                if current_end.map_or(true, |ce| f > ce) {
                    current_end = Some(f);
                }
            }
        }
    }
    if !current.is_empty() {
        legacy.push(current);
    }

    let mut sessions: Vec<serde_json::Value> = Vec::new();
    for (idx, (sid, grouped)) in explicit.into_iter().enumerate() {
        sessions.push(build_history_session(sid, grouped, idx));
    }
    let base_idx = sessions.len();
    for (idx, grouped) in legacy.into_iter().enumerate() {
        sessions.push(build_history_session(String::new(), grouped, base_idx + idx));
    }
    sessions.sort_by(|a, b| {
        let fa = a.get("finished_at").and_then(|v| v.as_str()).unwrap_or("");
        let fb = b.get("finished_at").and_then(|v| v.as_str()).unwrap_or("");
        fb.cmp(fa)
    });
    sessions.truncate(20);

    let today_runtime_seconds: f64 = sessions
        .iter()
        .filter(|s| {
            s.get("finished_at")
                .and_then(|v| v.as_str())
                .map(|ts| is_today_utc(ts, now_utc))
                .unwrap_or(false)
        })
        .map(|s| s.get("duration_seconds").and_then(|v| v.as_f64()).unwrap_or(0.0))
        .sum();
    let today_session_count = sessions
        .iter()
        .filter(|s| {
            s.get("finished_at")
                .and_then(|v| v.as_str())
                .map(|ts| is_today_utc(ts, now_utc))
                .unwrap_or(false)
        })
        .count();

    let mut recent_runs: Vec<serde_json::Value> = parsed_records.into_iter().rev().take(20).collect();
    let last_run = recent_runs.first().cloned();
    if recent_runs.len() > 20 {
        recent_runs.truncate(20);
    }

    serde_json::json!({
        "last_run": last_run,
        "today_runtime_seconds": (today_runtime_seconds * 100.0).round() / 100.0,
        "today_run_count": today_run_count,
        "today_session_count": today_session_count,
        "recent_runs": recent_runs,
        "recent_sessions": sessions,
    })
}

#[tauri::command]
pub async fn get_multibrowser_stats(app: AppHandle) -> Result<serde_json::Value, String> {
    // 1. Kiểm tra cache trong bộ nhớ (hiệu lực 3.5 giây) để loại bỏ 100% độ trễ khi chuyển tab Dashboard / Profiles
    if let Ok(guard) = STATS_CACHE.lock() {
        if let Some((instant, ref val)) = *guard {
            if instant.elapsed().as_secs_f32() < 3.5 {
                return Ok(val.clone());
            }
        }
    }

    // 2. FAST PATH trong Rust: Tính toán chỉ số trực tiếp từ profiles.json mà không cần khởi tạo tiến trình Python (0.1ms vs 1500ms)
    // TUYỆT ĐỐI KHÔNG tính hồ sơ thuộc pool Kênh Test BKT vào chỉ số hồ sơ kiếm tiền / kênh đích của Chức năng 2.
    if let Ok(raw_profiles) = get_all_raw_multibrowser_profiles(app.clone()).await {
        let bkt_ids: std::collections::HashSet<String> = crate::database::get_bkt_test_channels_db()
            .unwrap_or_default()
            .into_iter()
            .map(|c| c.profile_id)
            .collect();
        let profiles: Vec<MultiBrowserProfile> = raw_profiles
            .into_iter()
            .filter(|p| !is_bkt_test_profile(p, Some(&bkt_ids)))
            .collect();
        let now_utc = chrono::Utc::now();
        let total = profiles.len();
        let running_profiles: Vec<serde_json::Value> = profiles
            .iter()
            .filter(|p| {
                let s = p.last_run_status.as_deref().unwrap_or("");
                s == "running" || s == "opening"
            })
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "name": p.profile_name,
                    "action": "browser"
                })
            })
            .collect();
        let running_count = running_profiles.len();

        let mut error_profiles: Vec<&MultiBrowserProfile> = profiles
            .iter()
            .filter(|p| p.last_run_status.as_deref() == Some("error"))
            .collect();
        error_profiles.sort_by(|a, b| {
            let ta = a.last_run_time.as_deref().unwrap_or("");
            let tb = b.last_run_time.as_deref().unwrap_or("");
            tb.cmp(ta)
        });

        let error_today = error_profiles
            .iter()
            .filter(|p| {
                p.last_run_time
                    .as_deref()
                    .map(|ts| is_today_utc(ts, now_utc))
                    .unwrap_or(false)
            })
            .count();

        let success_today = profiles
            .iter()
            .filter(|p| {
                p.last_run_status.as_deref() == Some("success")
                    && p.last_run_time
                        .as_deref()
                        .map(|ts| is_today_utc(ts, now_utc))
                        .unwrap_or(false)
            })
            .count();

        let ready = profiles
            .iter()
            .filter(|p| !matches!(p.last_run_status.as_deref(), Some("running" | "opening" | "error")))
            .count();

        let recent_errors: Vec<serde_json::Value> = error_profiles
            .into_iter()
            .take(5)
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "name": p.profile_name,
                    "time": p.last_run_time.clone().unwrap_or_default(),
                    "error": p.last_run_error.clone().unwrap_or_else(|| "Không có chi tiết lỗi".to_string())
                })
            })
            .collect();

        // Đọc lịch sử chạy gần nhất chỉ từ user_data_root/logs/run_history.jsonl ngoài Tokio reactor thread
        let data_dir_opt = get_browser_data_dir(Some(&app));
        let data_dir_str = data_dir_opt
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let history_path_opt = data_dir_opt.map(|d| d.join("logs").join("run_history.jsonl"));

        let run_summary = tokio::task::spawn_blocking(move || {
            compute_run_history_summary(history_path_opt.as_deref(), now_utc)
        })
        .await
        .unwrap_or_else(|_| serde_json::json!({
            "last_run": null,
            "today_runtime_seconds": 0,
            "today_run_count": 0,
            "today_session_count": 0,
            "recent_runs": [],
            "recent_sessions": []
        }));

        let stats_val = serde_json::json!({
            "total_profiles": total,
            "running": running_count,
            "success_today": success_today,
            "error_today": error_today,
            "ready": ready,
            "running_profiles": running_profiles,
            "recent_errors": recent_errors,
            "warnings": [],
            "run_summary": run_summary,
            "system_info": {
                "os": "Windows",
                "ram": "Sẵn sàng (Tối ưu)",
                "python": "Python 3 (Cực nhanh)",
                "data_dir": data_dir_str
            }
        });

        if let Ok(mut guard) = STATS_CACHE.lock() {
            *guard = Some((Instant::now(), stats_val.clone()));
        }

        return Ok(stats_val);
    }

    // 3. Fallback: Nếu không đọc được profiles.json trực tiếp mới gọi Python
    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner).arg("--action").arg("get_stats");
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy get_stats: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể lấy thống kê");
        return Err(err.to_string());
    }

    let stats_res = val.get("stats").cloned().unwrap_or(serde_json::json!({}));
    if let Ok(mut guard) = STATS_CACHE.lock() {
        *guard = Some((Instant::now(), stats_res.clone()));
    }

    Ok(stats_res)
}

#[tauri::command]
pub async fn stop_multibrowser_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("stop_profile")
        .arg("--profile-id")
        .arg(&profile_id);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể dừng profile: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể dừng hồ sơ");
        return Err(err.to_string());
    }

    clear_stats_cache();
    Ok(())
}

#[tauri::command]
pub async fn bulk_stop_multibrowser_profiles(app: AppHandle, profile_ids: Vec<String>) -> Result<(), String> {
    let payload = serde_json::json!({ "profile_ids": profile_ids });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("bulk_stop")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể dừng hàng loạt profile: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi dừng hàng loạt");
        return Err(err.to_string());
    }

    clear_stats_cache();
    Ok(())
}

#[tauri::command]
pub async fn arrange_multibrowser_windows(app: AppHandle, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let data_json = params.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("arrange_windows")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể sắp xếp cửa sổ: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể sắp xếp cửa sổ");
        return Err(err.to_string());
    }

    Ok(val.get("result").cloned().unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub async fn clean_multibrowser_profile_cache(app: AppHandle, profile_id: String) -> Result<String, String> {
    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("clean_cache")
        .arg("--profile-id")
        .arg(&profile_id);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể dọn dẹp cache: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi dọn dẹp cache");
        return Err(err.to_string());
    }

    let msg = val.get("message").and_then(|v| v.as_str()).unwrap_or("Đã dọn dẹp cache");
    Ok(msg.to_string())
}

const PROTECTED_PROFILE_WHITELIST: &[&str] = &[
    "local state",
    "cookies",
    "cookies-journal",
    "login data",
    "login data-journal",
    "preferences",
    "preferences.bak",
    "secure preferences",
    "web data",
    "web data-journal",
    "local storage",
    "indexeddb",
    "sync data",
    "sessions",
    "session storage",
    "extension state",
    "extensions",
    "network",
    "history",
    "history-journal",
    "bookmarks",
    "service worker",
    "blob_storage",
    "transportsecurity",
];

const TARGET_CACHE_PATH_PARTS: &[&[&str]] = &[
    &["Default", "Cache"],
    &["Default", "Code Cache"],
    &["Default", "GPUCache"],
    &["Default", "DawnCache"],
    &["Default", "Media Cache"],
    &["Default", "File System"],
    &["Default", "VideoDecodeStats"],
    &["Cache"],
    &["Code Cache"],
    &["GPUCache"],
    &["DawnCache"],
    &["Media Cache"],
    &["GrShaderCache"],
    &["ShaderCache"],
    &["Crashpad", "reports"],
    &["Crashpad", "completed"],
    &["BrowserMetrics"],
];

fn is_protected_profile_path(path: &Path) -> bool {
    for comp in path.components() {
        let s = comp.as_os_str().to_string_lossy().to_lowercase();
        if PROTECTED_PROFILE_WHITELIST.contains(&s.as_str()) {
            return true;
        }
    }
    false
}

pub fn clean_profile_cache_native_internal(profile_dir: &Path) -> u64 {
    let mut total_freed: u64 = 0;
    if !profile_dir.exists() || !profile_dir.is_dir() {
        return 0;
    }

    for path_parts in TARGET_CACHE_PATH_PARTS {
        let mut target = profile_dir.to_path_buf();
        for part in *path_parts {
            target = target.join(part);
        }

        if !target.exists() || is_protected_profile_path(&target) {
            continue;
        }

        if target.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&target) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if is_protected_profile_path(&ep) {
                        continue;
                    }
                    if ep.is_file() {
                        if let Ok(meta) = ep.metadata() {
                            total_freed += meta.len();
                        }
                        let _ = std::fs::remove_file(&ep);
                    } else if ep.is_dir() {
                        if let Ok(sub_entries) = std::fs::read_dir(&ep) {
                            for sub in sub_entries.flatten() {
                                let sp = sub.path();
                                if is_protected_profile_path(&sp) {
                                    continue;
                                }
                                if let Ok(m) = sp.metadata() {
                                    if m.is_file() {
                                        total_freed += m.len();
                                    }
                                }
                            }
                        }
                        let _ = std::fs::remove_dir_all(&ep);
                    }
                }
            }
            let _ = std::fs::remove_dir_all(&target);
        } else if target.is_file() {
            if let Ok(meta) = target.metadata() {
                total_freed += meta.len();
            }
            let _ = std::fs::remove_file(&target);
        }
    }

    total_freed
}

fn is_safe_profile_dirname(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.contains(['/', '\\', ':', '\0'])
        && !trimmed.contains("..")
}

pub fn resolve_profile_dir_path(data_dir: &Path, profile_id: &str) -> Result<PathBuf, String> {
    let profiles_root = data_dir.join("profiles");
    let profiles_json = data_dir.join("profiles.json");
    let lookup_key = profile_id.trim();

    if profiles_json.is_file() {
        if let Ok(content) = std::fs::read_to_string(&profiles_json) {
            if let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                let matched = rows.iter().find(|row| {
                    let row_id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                    let row_name = row.get("profile_name").and_then(|v| v.as_str()).unwrap_or("").trim();
                    (!row_id.is_empty() && row_id.eq_ignore_ascii_case(lookup_key))
                        || (!row_name.is_empty() && row_name == lookup_key)
                });
                if let Some(row) = matched {
                    let raw_dir = row
                        .get("profile_dir")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .unwrap_or("");
                    if !is_safe_profile_dirname(raw_dir) {
                        return Err(format!("Tên thư mục hồ sơ không hợp lệ cho profile_id: {profile_id}"));
                    }
                    let resolved = profiles_root.join(raw_dir);
                    if resolved.is_dir() {
                        return Ok(resolved);
                    }
                    return Err(format!("Không tìm thấy thư mục hồ sơ '{}' cho profile_id: {profile_id}", raw_dir));
                }
            }
        }
    }

    if is_safe_profile_dirname(lookup_key) {
        let direct = profiles_root.join(lookup_key);
        if direct.is_dir() {
            return Ok(direct);
        }
    }

    Err(format!("Không tìm thấy thư mục hồ sơ cho profile_id: {profile_id}"))
}

#[tauri::command]
pub async fn clean_multibrowser_profile_cache_native(
    app: AppHandle,
    profile_id: String,
) -> Result<String, String> {
    let data_dir = get_browser_data_dir(Some(&app))
        .ok_or_else(|| "Không xác định được thư mục dữ liệu RETubeMatrix".to_string())?;
    tokio::task::spawn_blocking(move || {
        let profile_dir = resolve_profile_dir_path(&data_dir, &profile_id)?;

        let singleton_lock = profile_dir.join("SingletonLock");
        if singleton_lock.exists() {
            if std::fs::OpenOptions::new().write(true).open(&singleton_lock).is_err() {
                return Err("Hồ sơ đang mở trong trình duyệt. Vui lòng đóng trình duyệt trước khi dọn dẹp cache.".to_string());
            }
        }
        let lockfile = profile_dir.join("lockfile");
        if lockfile.exists() {
            if std::fs::OpenOptions::new().write(true).open(&lockfile).is_err() {
                return Err("Hồ sơ đang mở trong trình duyệt. Vui lòng đóng trình duyệt trước khi dọn dẹp cache.".to_string());
            }
        }

        let freed_bytes = clean_profile_cache_native_internal(&profile_dir);
        let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);

        log::info!(
            "[CLEAN CACHE NATIVE] Đã dọn dẹp cache cho profile {} ({}): {:.2} MB",
            profile_id,
            profile_dir.display(),
            freed_mb
        );

        Ok(format!(
            "Đã giải phóng {:.2} MB cache rác. Phiên đăng nhập Google Studio được bảo toàn 100%.",
            freed_mb
        ))
    })
    .await
    .map_err(|e| format!("Task execution error: {e}"))?
}

#[tauri::command]
pub async fn update_multibrowser_profile_meta(
    app: AppHandle,
    profile_id: String,
    note: Option<String>,
    tags: Option<Vec<String>>,
    color: Option<String>,
) -> Result<(), String> {
    let mut payload = serde_json::Map::new();
    if let Some(n) = note {
        payload.insert("note".to_string(), serde_json::Value::String(n));
    }
    if let Some(t) = tags {
        payload.insert("tags".to_string(), serde_json::json!(t));
    }
    if let Some(c) = color {
        payload.insert("color".to_string(), serde_json::Value::String(c));
    }
    let data_json = serde_json::Value::Object(payload).to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("update_profile_meta")
        .arg("--profile-id")
        .arg(&profile_id)
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể cập nhật metadata hồ sơ: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi cập nhật metadata");
        return Err(err.to_string());
    }

    clear_stats_cache();
    Ok(())
}

#[tauri::command]
pub async fn bulk_set_multibrowser_group(
    app: AppHandle,
    profile_ids: Vec<String>,
    group: String,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "profile_ids": profile_ids,
        "group": group,
    });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    let (mut cmd, runner) = create_runner_cmd(&app);
    cmd.arg(&runner)
        .arg("--action")
        .arg("bulk_set_group")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể cập nhật nhóm: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi cập nhật nhóm");
        return Err(err.to_string());
    }

    clear_stats_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{compute_run_history_summary, is_today_utc, resolve_browser_data_dir, resolve_profile_dir_path};
    use std::path::{Path, PathBuf};

    fn make_temp_dir(label: &str) -> PathBuf {
        let unique = format!(
            "retubematrix_test_{}_{}_{}",
            label,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        );
        let dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn resolve_browser_data_dir_prefers_env_then_localappdata_then_tauri_parent() {
        let tauri_local = Path::new(r"C:\Users\Alice\AppData\Local\com.retubematrix.app");
        assert_eq!(
            resolve_browser_data_dir(Some(r"D:\CustomData"), Some(r"C:\Users\Alice\AppData\Local"), Some(tauri_local)),
            Some(PathBuf::from(r"D:\CustomData"))
        );
        assert_eq!(
            resolve_browser_data_dir(None, Some(r"C:\Users\Alice\AppData\Local"), Some(tauri_local)),
            Some(PathBuf::from(r"C:\Users\Alice\AppData\Local").join("RETubeMatrix").join("browser_engine"))
        );
        assert_eq!(
            resolve_browser_data_dir(Some("   "), None, Some(tauri_local)),
            Some(PathBuf::from(r"C:\Users\Alice\AppData\Local").join("RETubeMatrix").join("browser_engine"))
        );
    }

    #[test]
    fn is_today_utc_filters_stale_runs_by_utc_date() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        assert!(is_today_utc("2026-11-12T00:05:00+00:00", now));
        assert!(is_today_utc("2026-11-12T06:00:00+07:00", now) == false);
        assert!(!is_today_utc("2026-11-11T23:59:59+00:00", now));
        assert!(!is_today_utc("", now));
    }

    #[test]
    fn compute_run_history_summary_aggregates_today_metrics_and_sessions() {
        let dir = make_temp_dir("run_history");
        let log_file = dir.join("run_history.jsonl");
        let lines = [
            r#"{"id":"p1","profile_name":"One","action":"upload","status":"success","duration_seconds":10.5,"finished_at":"2026-11-12T08:00:00+00:00","session_id":"s-today"}"#,
            r#"{"id":"p2","profile_name":"Two","action":"upload","status":"success","duration_seconds":20.0,"finished_at":"2026-11-12T08:00:30+00:00","session_id":"s-today"}"#,
            r#"{"id":"p3","profile_name":"Old","action":"nurture","status":"error","duration_seconds":5.0,"finished_at":"2026-11-11T12:00:00+00:00","session_id":"s-old"}"#,
        ];
        std::fs::write(&log_file, lines.join("\n")).unwrap();

        let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let summary = compute_run_history_summary(Some(&log_file), now);
        assert_eq!(summary["today_run_count"], 2);
        assert_eq!(summary["today_session_count"], 1);
        assert!(summary["today_runtime_seconds"].as_f64().unwrap() >= 40.0);
        assert_eq!(summary["recent_runs"].as_array().unwrap().len(), 3);
        assert_eq!(summary["recent_sessions"].as_array().unwrap().len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_profile_dir_path_maps_uuid_and_rejects_traversal() {
        let dir = make_temp_dir("resolve_profile_dir");
        let profiles_root = dir.join("profiles");
        let target_folder = profiles_root.join("kênh-a_deadbeef");
        std::fs::create_dir_all(&target_folder).unwrap();
        std::fs::write(
            dir.join("profiles.json"),
            r#"[{"id":"uuid-123","profile_name":"Kenh A","profile_dir":"kênh-a_deadbeef"}]"#,
        )
        .unwrap();

        let resolved = resolve_profile_dir_path(&dir, "uuid-123").unwrap();
        assert_eq!(resolved, target_folder);
        assert!(resolve_profile_dir_path(&dir, "../escape").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
