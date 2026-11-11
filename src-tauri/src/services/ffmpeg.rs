use crate::types::{DependencySource, FfmpegStatus};
use crate::utils::{find_system_binary, unix_system_binary_dirs, CommandExt};
use md5::{Digest as Md5Digest, Md5};
use sha2::{Digest as Sha2Digest, Sha256};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReupProgressPayload {
    pub percent: f64,
    pub speed: Option<String>,
    pub fps: Option<f64>,
    pub eta_seconds: Option<u64>,
    pub status: String,
}

const SOURCE_CONFIG_FILE: &str = "ffmpeg-source.txt";
const RELEASE_VERSION_FILE: &str = "ffmpeg-release-version.txt";

pub fn system_ffmpeg_upgrade_message() -> String {
    #[cfg(target_os = "macos")]
    {
        return "System FFmpeg is managed externally. Update it with Homebrew (`brew upgrade ffmpeg`) or switch source to App managed.".to_string();
    }
    #[cfg(target_os = "windows")]
    {
        return "System FFmpeg is managed externally. Update it with your package manager (e.g. `winget`, `choco`, or `scoop`) or switch source to App managed.".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        return "System FFmpeg is managed externally. Update it with your distro package manager or switch source to App managed.".to_string();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "System FFmpeg is managed externally. Update it with your package manager or switch source to App managed.".to_string()
    }
}

fn get_ffmpeg_source_config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("bin").join(SOURCE_CONFIG_FILE))
}

fn get_ffmpeg_release_version_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("bin").join(RELEASE_VERSION_FILE))
}

pub async fn read_app_ffmpeg_release_version(app: &AppHandle) -> Option<String> {
    let version_path = get_ffmpeg_release_version_path(app)?;
    let content = tokio::fs::read_to_string(&version_path).await.ok()?;
    let version = content.trim();

    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

pub async fn write_app_ffmpeg_release_version(
    app: &AppHandle,
    version: &str,
) -> Result<(), String> {
    let version_path =
        get_ffmpeg_release_version_path(app).ok_or("Failed to get FFmpeg version path")?;

    if let Some(parent) = version_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    }

    tokio::fs::write(&version_path, version)
        .await
        .map_err(|e| format!("Failed to save FFmpeg release version: {}", e))?;

    Ok(())
}

pub async fn get_ffmpeg_source(app: &AppHandle) -> DependencySource {
    if let Some(config_path) = get_ffmpeg_source_config_path(app) {
        if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
            return DependencySource::from_str(content.trim());
        }
    }
    DependencySource::Auto
}

pub async fn set_ffmpeg_source(app: &AppHandle, source: &DependencySource) -> Result<(), String> {
    let config_path = get_ffmpeg_source_config_path(app).ok_or("Failed to get config path")?;

    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    }

    tokio::fs::write(&config_path, source.as_str())
        .await
        .map_err(|e| format!("Failed to save source config: {}", e))?;

    Ok(())
}

fn get_app_ffmpeg_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "ffmpeg.exe";
    #[cfg(not(windows))]
    let binary_name = "ffmpeg";

    // 1. Check bundled bin next to current running executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("bin").join(binary_name),
                exe_dir.join(binary_name),
                exe_dir.join("resources").join("bin").join(binary_name),
                exe_dir.join("resources").join(binary_name),
            ];
            for cand in candidates {
                if cand.exists() {
                    return Some(cand);
                }
            }
        }
    }

    // 2. Check Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidates = [
            res_dir.join("bin").join(binary_name),
            res_dir.join(binary_name),
            res_dir.join("resources").join("bin").join(binary_name),
        ];
        for cand in candidates {
            if cand.exists() {
                return Some(cand);
            }
        }
    }

    // 3. App data directory (downloaded or legacy)
    let app_data_dir = app.path().app_data_dir().ok()?;
    let bin_dir = app_data_dir.join("bin");
    let ffmpeg_path = bin_dir.join(binary_name);

    if ffmpeg_path.exists() {
        Some(ffmpeg_path)
    } else {
        None
    }
}

fn get_system_ffmpeg_path() -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "ffmpeg.exe";
    #[cfg(not(windows))]
    let binary_name = "ffmpeg";

    find_system_binary(binary_name, &unix_system_binary_dirs())
}

/// Get the FFmpeg binary path (app data or system)
pub async fn get_ffmpeg_path(app: &AppHandle) -> Option<PathBuf> {
    match get_ffmpeg_source(app).await {
        DependencySource::System => get_system_ffmpeg_path(),
        DependencySource::App => get_app_ffmpeg_path(app),
        DependencySource::Auto => get_app_ffmpeg_path(app).or_else(get_system_ffmpeg_path),
    }
}

/// Check FFmpeg status
pub async fn check_ffmpeg_internal(app: &AppHandle) -> Result<FfmpegStatus, String> {
    if let Some(ffmpeg_path) = get_ffmpeg_path(app).await {
        let mut cmd = Command::new(&ffmpeg_path);
        cmd.args(["-version"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();

        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let binary_version = parse_ffmpeg_version(&stdout);
                let app_path = get_app_ffmpeg_path(app);
                let is_system = app_path.as_ref().map(|p| p != &ffmpeg_path).unwrap_or(true);
                let version = if is_system {
                    binary_version
                } else {
                    read_app_ffmpeg_release_version(app)
                        .await
                        .unwrap_or(binary_version)
                };

                return Ok(FfmpegStatus {
                    installed: true,
                    version: Some(version),
                    binary_path: Some(ffmpeg_path.to_string_lossy().to_string()),
                    is_system,
                });
            }
        }
    }

    Ok(FfmpegStatus {
        installed: false,
        version: None,
        binary_path: None,
        is_system: false,
    })
}

fn get_app_ffprobe_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "ffprobe.exe";
    #[cfg(not(windows))]
    let binary_name = "ffprobe";

    // 1. Check bundled bin next to current running executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("bin").join(binary_name),
                exe_dir.join(binary_name),
                exe_dir.join("resources").join("bin").join(binary_name),
                exe_dir.join("resources").join(binary_name),
            ];
            for cand in candidates {
                if cand.exists() {
                    return Some(cand);
                }
            }
        }
    }

    // 2. Check Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidates = [
            res_dir.join("bin").join(binary_name),
            res_dir.join(binary_name),
            res_dir.join("resources").join("bin").join(binary_name),
        ];
        for cand in candidates {
            if cand.exists() {
                return Some(cand);
            }
        }
    }

    // 3. App data directory
    let app_data_dir = app.path().app_data_dir().ok()?;
    let bin_dir = app_data_dir.join("bin");
    let p = bin_dir.join(binary_name);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

pub async fn get_ffprobe_path(app: &AppHandle) -> Option<PathBuf> {
    get_app_ffprobe_path(app).or_else(|| {
        #[cfg(windows)]
        let binary_name = "ffprobe.exe";
        #[cfg(not(windows))]
        let binary_name = "ffprobe";
        find_system_binary(binary_name, &unix_system_binary_dirs())
    })
}

pub async fn probe_audio_sample_rate(app: &AppHandle, input_path: &str) -> u32 {
    if let Some(ffprobe_path) = get_ffprobe_path(app).await {
        let mut cmd = Command::new(&ffprobe_path);
        cmd.args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=sample_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            input_path,
        ]);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.hide_window();

        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Ok(rate) = text.trim().parse::<u32>() {
                    if rate >= 8000 && rate <= 192000 {
                        return rate;
                    }
                }
            }
        }
    }
    // Default fallback: 48000 Hz (standard YouTube & broadcast audio)
    48000
}

/// Đo thời lượng thực tế của video nguồn bằng ffprobe
pub async fn probe_video_duration(app: &AppHandle, input_path: &str) -> Option<f64> {
    let ffprobe_path = get_ffprobe_path(app).await?;
    let mut cmd = Command::new(&ffprobe_path);
    cmd.args([
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.hide_window();

    let output = cmd.output().await.ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        text.trim().parse::<f64>().ok()
    } else {
        None
    }
}

/// Tính toán số luồng CPU an toàn chống nghẽn trên VPS ít core
pub fn get_safe_ffmpeg_threads() -> String {
    let available_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2);
    if available_cores <= 4 {
        // Trên VPS 2-4 vCPU, chừa lại 1 core cho hệ điều hành và browser không bị freeze
        (available_cores.saturating_sub(1)).max(1).to_string()
    } else {
        "0".to_string()
    }
}

/// Thực thi lệnh FFmpeg với streaming progress thời gian thực lên Frontend
async fn execute_ffmpeg_with_progress(
    app: &AppHandle,
    mut cmd: Command,
    total_duration: f64,
    stage_name: &str,
) -> Result<(), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let stdout = child.stdout.take().ok_or_else(|| "Failed to open FFmpeg stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to open FFmpeg stderr".to_string())?;

    let app_handle = app.clone();
    let stage = stage_name.to_string();
    let stage_in_task = stage.clone();

    let progress_task = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut last_percent = 0.0;
        let mut current_speed: Option<String> = None;
        let mut current_fps: Option<f64> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("speed=") {
                current_speed = Some(val.trim().to_string());
            } else if let Some(val) = line.strip_prefix("fps=") {
                current_fps = val.trim().parse::<f64>().ok();
            } else if let Some(val) = line.strip_prefix("out_time_us=") {
                if let Ok(us) = val.trim().parse::<f64>() {
                    let sec = us / 1_000_000.0;
                    let percent = if total_duration > 0.0 {
                        ((sec / total_duration) * 100.0).clamp(0.0, 99.0)
                    } else {
                        50.0
                    };

                    if (percent - last_percent).abs() >= 1.0 || percent >= 98.0 {
                        last_percent = percent;
                        let eta = if let Some(ref spd) = current_speed {
                            if let Ok(s) = spd.trim_end_matches('x').parse::<f64>() {
                                if s > 0.0 && total_duration > sec {
                                    Some(((total_duration - sec) / s).round() as u64)
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        };

                        let _ = app_handle.emit(
                            "reup-pipeline-progress",
                            &ReupProgressPayload {
                                percent: (percent * 10.0).round() / 10.0,
                                speed: current_speed.clone(),
                                fps: current_fps,
                                eta_seconds: eta,
                                status: format!("Đang render {stage_in_task}: {:.1}%", percent),
                            },
                        );
                    }
                }
            }
        }
    });

    let stderr_task = tokio::spawn(async move {
        let mut err_str = String::new();
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(l)) = lines.next_line().await {
            err_str.push_str(&l);
            err_str.push('\n');
        }
        err_str
    });

    let status = child.wait().await.map_err(|e| format!("FFmpeg wait failed: {}", e))?;
    let _ = progress_task.await;
    let stderr_output = stderr_task.await.unwrap_or_default();

    if !status.success() {
        return Err(format!("FFmpeg failed: {}", stderr_output));
    }

    let _ = app.emit(
        "reup-pipeline-progress",
        &ReupProgressPayload {
            percent: 100.0,
            speed: None,
            fps: None,
            eta_seconds: None,
            status: format!("{stage} hoàn tất 100%"),
        },
    );

    Ok(())
}

/// Parse FFmpeg version from output
pub fn parse_ffmpeg_version(output: &str) -> String {
    if let Some(line) = output.lines().next() {
        if let Some(version_part) = line.strip_prefix("ffmpeg version ") {
            return version_part
                .split_whitespace()
                .next()
                .unwrap_or("unknown")
                .to_string();
        }
    }
    "unknown".to_string()
}

/// Extract date string (YYYY-MM-DD) from version string
/// Examples:
/// - "git-2026-01-25-1e1dde8" -> "2026-01-25"
/// - "2026-01-25" -> "2026-01-25"
fn extract_date_from_version(version: &str) -> Option<String> {
    // Look for YYYY-MM-DD pattern
    let re = regex::Regex::new(r"(\d{4})-(\d{2})-(\d{2})").ok()?;
    if let Some(caps) = re.captures(version) {
        Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]))
    } else {
        None
    }
}

fn ffmpeg_version_has_update(current_version: &str, latest_version: &str) -> bool {
    let current_normalized = current_version.replace('.', "-");
    let latest_normalized = latest_version.replace('.', "-");
    let current_date = extract_date_from_version(&current_normalized);
    let latest_date = extract_date_from_version(&latest_normalized);

    match (current_date, latest_date) {
        (Some(curr), Some(lat)) => lat > curr,
        _ => false,
    }
}

/// FFmpeg download info with checksum support
pub struct FfmpegDownloadInfo {
    pub url: &'static str,
    pub archive_type: &'static str,
    pub checksum_url: &'static str,
    pub checksum_filename: &'static str,
}

/// Get FFmpeg download URL for current platform
/// All platforms now support SHA256 checksum verification
pub fn get_ffmpeg_download_info() -> FfmpegDownloadInfo {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-arm64.tar.gz",
            }
        }
        #[cfg(target_arch = "x86_64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-x64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-x64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-x64.tar.gz",
            }
        }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-arm64.tar.gz",
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        FfmpegDownloadInfo {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
            archive_type: "zip",
            checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
            checksum_filename: "ffmpeg-master-latest-win64-gpl.zip",
        }
    }
    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
                archive_type: "tar.xz",
                checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
                checksum_filename: "ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
            }
        }
        #[cfg(not(target_arch = "aarch64"))]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz",
                archive_type: "tar.xz",
                checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
                checksum_filename: "ffmpeg-master-latest-linux64-gpl.tar.xz",
            }
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        FfmpegDownloadInfo {
            url: "",
            archive_type: "",
            checksum_url: "",
            checksum_filename: "",
        }
    }
}

/// FFmpeg update info
#[derive(Debug, Clone, serde::Serialize)]
pub struct FfmpegUpdateInfo {
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FfmpegReleaseInfo {
    pub version: String,
    pub html_url: Option<String>,
}

/// Get the GitHub API URL for checking latest release
fn get_ffmpeg_release_api_url() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "https://api.github.com/repos/vanloctech/ffmpeg-macos/releases/latest"
    }
    #[cfg(target_os = "windows")]
    {
        "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"
    }
    #[cfg(target_os = "linux")]
    {
        "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        ""
    }
}

pub fn normalize_ffmpeg_release_version(tag_name: &str) -> String {
    tag_name
        .trim()
        .strip_prefix("ffmpeg-")
        .unwrap_or(tag_name.trim())
        .trim_start_matches('v')
        .to_string()
}

pub async fn get_latest_ffmpeg_release_info() -> Result<FfmpegReleaseInfo, String> {
    let api_url = get_ffmpeg_release_api_url();
    if api_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch release info: HTTP {}",
            response.status()
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    let tag_name = json["tag_name"].as_str().ok_or("No tag_name in release")?;

    Ok(FfmpegReleaseInfo {
        version: normalize_ffmpeg_release_version(tag_name),
        html_url: json["html_url"].as_str().map(|s| s.to_string()),
    })
}

/// Check if FFmpeg update is available
pub async fn check_ffmpeg_update_internal(app: &AppHandle) -> Result<FfmpegUpdateInfo, String> {
    // Get current installed version
    let current_status = check_ffmpeg_internal(app).await?;

    if !current_status.installed {
        return Ok(FfmpegUpdateInfo {
            has_update: false,
            current_version: None,
            latest_version: None,
            release_url: None,
        });
    }

    let current_version = current_status.version.clone();

    // Only check updates for bundled FFmpeg (not system)
    if current_status.is_system {
        return Ok(FfmpegUpdateInfo {
            has_update: false,
            current_version,
            latest_version: None,
            release_url: Some("System FFmpeg - update via package manager".to_string()),
        });
    }

    let latest_release = get_latest_ffmpeg_release_info().await?;
    let latest_version = latest_release.version;

    // Compare versions by extracting date parts
    // Current version format: "git-2026-01-25-1e1dde8" -> extract "2026-01-25"
    // Latest version format: "2026.01.25" or "ffmpeg-2026.01.25" -> extract "2026.01.25"
    let has_update = if let Some(ref current) = current_version {
        ffmpeg_version_has_update(current, &latest_version)
    } else {
        false
    };

    Ok(FfmpegUpdateInfo {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_url: latest_release.html_url,
    })
}

/// Strip all metadata and clean streams from a media file using FFmpeg stream copy
pub async fn clean_video_metadata(
    app: &AppHandle,
    input_path: &str,
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path(app)
        .await
        .ok_or_else(|| "FFmpeg binary not found".to_string())?;

    let path = std::path::Path::new(input_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", input_path));
    }

    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let temp_clean_path = parent.join(format!(
        "clean_{}_{}",
        uuid::Uuid::new_v4().simple(),
        path.file_name().and_then(|n| n.to_str()).unwrap_or("output.mp4")
    ));

    let temp_clean_str = temp_clean_path.to_string_lossy().to_string();

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-i",
        input_path,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_metadata:s",
        "-1",
        "-c",
        "copy",
        &temp_clean_str,
    ]);
    cmd.hide_window();

    let output = cmd.output().await.map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

    if !output.status.success() {
        std::fs::remove_file(&temp_clean_path).ok();
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg stripping failed: {}", stderr));
    }

    // Replace original file with cleaned file
    std::fs::remove_file(input_path).map_err(|e| format!("Failed to remove original file: {}", e))?;
    std::fs::rename(&temp_clean_path, input_path).map_err(|e| format!("Failed to rename cleaned file: {}", e))?;

    // Append harmless identifier padding to guarantee 100% unique MD5/SHA256 from source
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(input_path) {
        let dummy = format!("\0YOUWEE_{}", uuid::Uuid::new_v4().simple());
        let _ = file.write_all(dummy.as_bytes());
    }

    log::info!("Successfully stripped metadata, changed hash MD5, and cleaned streams: {}", input_path);
    Ok(())
}

#[derive(Clone, serde::Deserialize, serde::Serialize, Debug)]
pub struct ReupModOptions {
    pub speed: Option<f64>,          // e.g. 1.03 (1.02x - 1.05x)
    pub pitch: Option<f64>,          // e.g. 1.02
    pub flip_horizontal: bool,       // true / false
    pub crop_percent: Option<f64>,   // e.g. 0.015 (1.5%)
}

/// Apply subtle reup modifications (speed, pitch, hflip, crop, clean metadata, unique hash)
pub async fn apply_reup_modifications(
    app: &AppHandle,
    input_path: &str,
    options: &ReupModOptions,
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path(app)
        .await
        .ok_or_else(|| "FFmpeg binary not found".to_string())?;

    let path = std::path::Path::new(input_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", input_path));
    }

    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let temp_mod_path = parent.join(format!(
        "reup_{}_{}",
        uuid::Uuid::new_v4().simple(),
        path.file_name().and_then(|n| n.to_str()).unwrap_or("output.mp4")
    ));
    let temp_mod_str = temp_mod_path.to_string_lossy().to_string();

    let mut vf_filters: Vec<String> = Vec::new();
    let mut af_filters: Vec<String> = Vec::new();

    if options.flip_horizontal {
        vf_filters.push("hflip".to_string());
    }

    if let Some(crop) = options.crop_percent {
        if crop > 0.005 && crop < 0.20 {
            let scale = 1.0 - crop;
            vf_filters.push(format!("crop=in_w*{:.4}:in_h*{:.4}", scale, scale));
        }
    }

    let sr = probe_audio_sample_rate(app, input_path).await;
    let spd = options.speed.unwrap_or(1.0);
    let ptc = options.pitch.unwrap_or(1.0);

    let has_speed = (spd - 1.0).abs() > 0.005 && spd >= 0.5 && spd <= 2.0;
    let has_pitch = (ptc - 1.0).abs() > 0.005 && ptc >= 0.8 && ptc <= 1.5;

    if has_speed {
        vf_filters.push(format!("setpts=PTS/{:.4}", spd));
    }

    if has_pitch {
        af_filters.push(format!("asetrate={sr}*{:.4},aresample={sr}", ptc));
        let tempo = spd / ptc;
        if (tempo - 1.0).abs() > 0.005 {
            af_filters.push(format!("atempo={:.6}", tempo));
        }
    } else if has_speed {
        af_filters.push(format!("atempo={:.6}", spd));
    }

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args(["-y", "-i", input_path]);

    if !vf_filters.is_empty() {
        cmd.args(["-vf", &vf_filters.join(",")]);
    }
    if !af_filters.is_empty() {
        cmd.args(["-af", &af_filters.join(",")]);
    }

    cmd.args([
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map_metadata", "-1",
        "-map_metadata:s", "-1",
        &temp_mod_str,
    ]);
    cmd.hide_window();

    let output = cmd.output().await.map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    if !output.status.success() {
        std::fs::remove_file(&temp_mod_path).ok();
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg reup modification failed: {}", stderr));
    }

    std::fs::remove_file(input_path).map_err(|e| format!("Failed to remove original file: {}", e))?;
    std::fs::rename(&temp_mod_path, input_path).map_err(|e| format!("Failed to rename modified file: {}", e))?;

    // Append harmless identifier padding to guarantee 100% unique MD5/SHA256 from source
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(input_path) {
        let dummy = format!("\0YOUWEE_REUP_{}", uuid::Uuid::new_v4().simple());
        let _ = file.write_all(dummy.as_bytes());
    }

    log::info!("Successfully applied reup modifications (speed/flip/crop/pitch/clean/MD5): {}", input_path);
    Ok(())
}

/// Calculate MD5 and SHA256 checksums of a file
pub fn calculate_file_hashes(filepath: &str) -> Result<(String, String), String> {
    use std::io::Read;
    let mut file = std::fs::File::open(filepath)
        .map_err(|e| format!("Cannot open file for hashing ({}): {}", filepath, e))?;

    let mut md5_hasher = Md5::new();
    let mut sha_hasher = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file for hash: {}", e))?;
        if n == 0 {
            break;
        }
        md5_hasher.update(&buffer[..n]);
        sha_hasher.update(&buffer[..n]);
    }

    let md5_hash = hex::encode(md5_hasher.finalize());
    let sha_hash = hex::encode(sha_hasher.finalize());
    Ok((md5_hash, sha_hash))
}

/// Append 16-64 random bytes to video container to guarantee 100% unique MD5/SHA256
pub fn append_random_padding_bytes(filepath: &str, byte_count: usize) -> Result<(), String> {
    use std::io::Write;
    let byte_count = byte_count.clamp(16, 64);
    let mut bytes = Vec::with_capacity(byte_count + 16);
    bytes.extend_from_slice(b"\0REUPYTB_");
    let u1 = uuid::Uuid::new_v4();
    let u2 = uuid::Uuid::new_v4();
    bytes.extend_from_slice(u1.as_bytes());
    if byte_count > 32 {
        bytes.extend_from_slice(&u2.as_bytes()[..(byte_count - 32).min(16)]);
    }

    // Trên Windows, file có thể bị khóa tạm thời ngay sau khi FFmpeg hoặc thao tác rename hoàn tất.
    // Thử lại tối đa 5 lần với khoảng nghỉ 100ms.
    let mut last_err = String::new();
    for _ in 0..5 {
        match std::fs::OpenOptions::new().append(true).open(filepath) {
            Ok(mut file) => {
                file.write_all(&bytes)
                    .map_err(|e| format!("Failed to write padding bytes: {}", e))?;
                file.flush()
                    .map_err(|e| format!("Failed to flush padding bytes: {}", e))?;
                drop(file);
                return Ok(());
            }
            Err(e) => {
                last_err = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
    Err(format!("Failed to open file for padding after retries: {last_err}"))
}

/// Detailed result of Reup Pipeline execution
#[derive(Clone, serde::Deserialize, serde::Serialize, Debug)]
pub struct ReupPipelineResult {
    pub success: bool,
    pub level: u8,
    pub risk_status: String, // "green" | "red"
    pub original_md5: Option<String>,
    pub new_md5: Option<String>,
    pub original_sha256: Option<String>,
    pub new_sha256: Option<String>,
    pub output_path: String,
    pub message: String,
}

/// Khâu 3: Reup Pipeline Cấp độ 1 (Giữ 95% gốc - 5% biến đổi, sạch metadata & hash MD5 mới)
/// - Video Filter: scale 1.01x, crop 1-2%, setpts=PTS/1.03 (tốc độ 1.03x)
/// - Audio Filter: asetrate=44100*1.02, aresample=44100, atempo=1.0098 (khớp tốc độ video 1.03x)
/// - Metadata: -map_metadata -1 -metadata title="" -metadata artist="" -metadata comment="" -fflags +bitexact
/// - Hash: Ghi thêm 16-64 bytes padding ngẫu nhiên vào cuối container file
pub async fn run_reup_pipeline_v1(
    app: &AppHandle,
    input_path: &str,
    output_path: Option<&str>,
) -> Result<ReupPipelineResult, String> {
    let (orig_md5, orig_sha) = calculate_file_hashes(input_path).unwrap_or_default();

    let ffmpeg_path = get_ffmpeg_path(app)
        .await
        .ok_or_else(|| "FFmpeg binary not found".to_string())?;

    let in_path = std::path::Path::new(input_path);
    if !in_path.exists() {
        return Err(format!("File does not exist: {}", input_path));
    }

    let target_output_buf = match output_path {
        Some(out) if !out.trim().is_empty() => std::path::PathBuf::from(out.trim()),
        _ => in_path.to_path_buf(),
    };

    if let Some(parent) = target_output_buf.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Không thể tạo thư mục cha {}: {}", parent.display(), e))?;
        }
    }

    let parent_dir = target_output_buf.parent().unwrap_or_else(|| std::path::Path::new("."));
    let temp_output_path = parent_dir.join(format!(
        "reup_v1_tmp_{}_{}",
        uuid::Uuid::new_v4().simple(),
        target_output_buf.file_name().and_then(|n| n.to_str()).unwrap_or("output.mp4")
    ));
    let temp_output_str = temp_output_path.to_string_lossy().to_string();
    let sr = probe_audio_sample_rate(app, input_path).await;
    let total_duration = probe_video_duration(app, input_path).await.unwrap_or(0.0);
    let safe_threads = get_safe_ffmpeg_threads();

    let vf = "scale=iw*1.01:ih*1.01,crop=iw/1.01:ih/1.01,setpts=PTS/1.03";
    let af = format!("asetrate={sr}*1.02,aresample={sr},atempo={:.6}", 1.03 / 1.02);

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-threads", &safe_threads,
        "-progress", "pipe:1",
        "-nostats",
        "-i", input_path,
        "-vf", vf,
        "-af", &af,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "20",
        "-tune", "fastdecode",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map_metadata", "-1",
        "-metadata", "title=",
        "-metadata", "artist=",
        "-metadata", "comment=",
        "-fflags", "+bitexact",
        &temp_output_str,
    ]);
    cmd.hide_window();

    if let Err(e) = execute_ffmpeg_with_progress(app, cmd, total_duration, "Reup Cấp 1").await {
        std::fs::remove_file(&temp_output_path).ok();
        return Err(format!("FFmpeg Reup Pipeline V1 failed: {}", e));
    }

    let target_output_str = target_output_buf.to_string_lossy().to_string();
    let is_in_place = target_output_buf == in_path;

    if is_in_place {
        std::fs::remove_file(input_path).map_err(|e| format!("Failed to remove original file: {}", e))?;
        if std::fs::rename(&temp_output_path, input_path).is_err() {
            std::fs::copy(&temp_output_path, input_path)
                .map_err(|e| format!("Failed to copy processed file in-place: {}", e))?;
            std::fs::remove_file(&temp_output_path).ok();
        }
    } else {
        if target_output_buf.exists() {
            std::fs::remove_file(&target_output_buf).ok();
        }
        if std::fs::rename(&temp_output_path, &target_output_buf).is_err() {
            std::fs::copy(&temp_output_path, &target_output_buf)
                .map_err(|e| format!("Failed to copy processed file to target: {}", e))?;
            std::fs::remove_file(&temp_output_path).ok();
        }
    }

    // Append 32 random bytes padding
    append_random_padding_bytes(&target_output_str, 32)?;

    let (new_md5, new_sha) = calculate_file_hashes(&target_output_str).unwrap_or_default();

    log::info!(
        "[REUP V1] Transformed: {} -> {} (MD5: {} -> {}, SHA256: {} -> {})",
        input_path, target_output_str, orig_md5, new_md5, orig_sha, new_sha
    );

    Ok(ReupPipelineResult {
        success: true,
        level: 1,
        risk_status: "green".to_string(),
        original_md5: Some(orig_md5),
        new_md5: Some(new_md5),
        original_sha256: Some(orig_sha),
        new_sha256: Some(new_sha),
        output_path: target_output_str,
        message: "Khâu 3: Pipeline Cấp 1 (95% gốc - 5% biến đổi, sạch metadata & hash MD5 mới) thành công".to_string(),
    })
}

/// Khâu 3: Reup Pipeline Cấp độ 2 (Dự phòng lách sâu khi dính bản quyền hoặc báo Đỏ)
/// - Video Filter: hflip (lật gương), eq=contrast=1.04:brightness=0.02:saturation=1.05 (chỉnh màu LUT), scale 1.02x, crop 2%, speed 1.05x
/// - Audio Filter: asetrate=44100*1.04, aresample=44100, atempo=1.0096 (khớp tốc độ 1.05x)
/// - Metadata: Xóa sạch EXIF và gắn cờ bitexact
/// - Hash: Đổi hoàn toàn MD5 & SHA256 với 48 bytes random padding
pub async fn run_reup_pipeline_v2(
    app: &AppHandle,
    input_path: &str,
    output_path: Option<&str>,
) -> Result<ReupPipelineResult, String> {
    let (orig_md5, orig_sha) = calculate_file_hashes(input_path).unwrap_or_default();

    let ffmpeg_path = get_ffmpeg_path(app)
        .await
        .ok_or_else(|| "FFmpeg binary not found".to_string())?;

    let in_path = std::path::Path::new(input_path);
    if !in_path.exists() {
        return Err(format!("File does not exist: {}", input_path));
    }

    let target_output_buf = match output_path {
        Some(out) if !out.trim().is_empty() => std::path::PathBuf::from(out.trim()),
        _ => in_path.to_path_buf(),
    };

    if let Some(parent) = target_output_buf.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Không thể tạo thư mục cha {}: {}", parent.display(), e))?;
        }
    }

    let parent_dir = target_output_buf.parent().unwrap_or_else(|| std::path::Path::new("."));
    let temp_output_path = parent_dir.join(format!(
        "reup_v2_tmp_{}_{}",
        uuid::Uuid::new_v4().simple(),
        target_output_buf.file_name().and_then(|n| n.to_str()).unwrap_or("output.mp4")
    ));
    let temp_output_str = temp_output_path.to_string_lossy().to_string();
    let sr = probe_audio_sample_rate(app, input_path).await;
    let total_duration = probe_video_duration(app, input_path).await.unwrap_or(0.0);
    let safe_threads = get_safe_ffmpeg_threads();

    let vf = "hflip,scale=iw*1.03:ih*1.03,crop=iw/1.03:ih/1.03,noise=alls=2:allf=t+u,eq=contrast=1.05:brightness=0.03:saturation=1.05,setpts=PTS/1.05";
    let af = format!("asetrate={sr}*1.04,aresample={sr},atempo={:.6}", 1.05 / 1.04);

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-threads", &safe_threads,
        "-progress", "pipe:1",
        "-nostats",
        "-i", input_path,
        "-vf", vf,
        "-af", &af,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "21",
        "-tune", "fastdecode",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map_metadata", "-1",
        "-metadata", "title=",
        "-metadata", "artist=",
        "-metadata", "comment=",
        "-fflags", "+bitexact",
        &temp_output_str,
    ]);
    cmd.hide_window();

    if let Err(e) = execute_ffmpeg_with_progress(app, cmd, total_duration, "Reup Cấp 2").await {
        std::fs::remove_file(&temp_output_path).ok();
        return Err(format!("FFmpeg Reup Pipeline V2 failed: {}", e));
    }

    let target_output_str = target_output_buf.to_string_lossy().to_string();
    let is_in_place = target_output_buf == in_path;

    if is_in_place {
        std::fs::remove_file(input_path).map_err(|e| format!("Failed to remove original file: {}", e))?;
        if std::fs::rename(&temp_output_path, input_path).is_err() {
            std::fs::copy(&temp_output_path, input_path)
                .map_err(|e| format!("Failed to copy processed file in-place: {}", e))?;
            std::fs::remove_file(&temp_output_path).ok();
        }
    } else {
        if target_output_buf.exists() {
            std::fs::remove_file(&target_output_buf).ok();
        }
        if std::fs::rename(&temp_output_path, &target_output_buf).is_err() {
            std::fs::copy(&temp_output_path, &target_output_buf)
                .map_err(|e| format!("Failed to copy processed file to target: {}", e))?;
            std::fs::remove_file(&temp_output_path).ok();
        }
    }

    // Append 48 random bytes padding
    append_random_padding_bytes(&target_output_str, 48)?;

    let (new_md5, new_sha) = calculate_file_hashes(&target_output_str).unwrap_or_default();

    log::info!(
        "[REUP V2] Deep transformed: {} -> {} (MD5: {} -> {}, SHA256: {} -> {})",
        input_path, target_output_str, orig_md5, new_md5, orig_sha, new_sha
    );

    Ok(ReupPipelineResult {
        success: true,
        level: 2,
        risk_status: "green".to_string(),
        original_md5: Some(orig_md5),
        new_md5: Some(new_md5),
        original_sha256: Some(orig_sha),
        new_sha256: Some(new_sha),
        output_path: target_output_str,
        message: "Khâu 3: Pipeline Cấp 2 (Lật gương, can thiệp LUT/EQ màu & pitch sâu) hoàn tất".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{ffmpeg_version_has_update, normalize_ffmpeg_release_version};

    #[test]
    fn normalizes_ffmpeg_macos_release_tags() {
        assert_eq!(
            normalize_ffmpeg_release_version("ffmpeg-2026.06.11"),
            "2026.06.11"
        );
        assert_eq!(
            normalize_ffmpeg_release_version("v2026.06.11"),
            "2026.06.11"
        );
    }

    #[test]
    fn compares_binary_git_versions_with_release_versions() {
        assert!(ffmpeg_version_has_update(
            "git-2026-06-10-5f998e3",
            "2026.06.11"
        ));
        assert!(!ffmpeg_version_has_update("2026.06.11", "2026.06.11"));
    }
}
