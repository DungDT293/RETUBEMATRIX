use std::path::PathBuf;
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

fn get_python_exe() -> String {
    if let Ok(exe) = std::env::var("PYTHON_EXE") {
        if !exe.trim().is_empty() && std::path::Path::new(&exe).exists() {
            return exe;
        }
    }

    // 1. Check next to running executable (bundled python or local virtualenv)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled = exe_dir.join("python").join("python.exe");
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled_root = exe_dir.join("python.exe");
            if bundled_root.exists() {
                return bundled_root.to_string_lossy().to_string();
            }
        }
    }

    // 2. Check user's %LOCALAPPDATA%\Programs\Python
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

pub fn create_runner_cmd(app: &AppHandle) -> (Command, PathBuf) {
    let python = get_python_exe();
    let runner = get_runner_path(app);

    let mut cmd = Command::new(&python);
    if let Some(parent) = runner.parent() {
        if parent.exists() && parent.is_dir() {
            cmd.current_dir(parent);
        }
    }
    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");
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

#[tauri::command]
pub async fn get_multibrowser_profiles(app: AppHandle) -> Result<Vec<MultiBrowserProfile>, String> {
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
            return Ok(p);
        }
    }

    let profiles = get_multibrowser_profiles(app).await?;
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
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn upload_video_multibrowser(
    app: AppHandle,
    params: MultiBrowserUploadParams,
) -> Result<MultiBrowserUploadResult, String> {
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

#[tauri::command]
pub async fn get_multibrowser_stats(app: AppHandle) -> Result<serde_json::Value, String> {
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

    Ok(val.get("stats").cloned().unwrap_or(serde_json::json!({})))
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

    Ok(())
}
