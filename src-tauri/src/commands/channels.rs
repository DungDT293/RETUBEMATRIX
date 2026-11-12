use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::commands::profiles::{create_runner_cmd, parse_json_from_output};
use crate::database;
use crate::services::{
    build_cookie_args, build_site_header_args, get_deno_path, get_ytdlp_path, run_ytdlp_with_stderr,
};
use crate::types::{ChannelInfo, ChannelVideo, FollowedChannel, PlaylistVideoEntry};
use crate::utils::CommandExt;
use crate::utils::{normalize_channel_content_urls, normalize_url, validate_url};

static CHANNEL_FETCH_CANCEL_GENERATION: AtomicU32 = AtomicU32::new(0);

fn current_channel_fetch_generation() -> u32 {
    CHANNEL_FETCH_CANCEL_GENERATION.load(Ordering::SeqCst)
}

fn is_channel_fetch_cancelled(generation: u32) -> bool {
    CHANNEL_FETCH_CANCEL_GENERATION.load(Ordering::SeqCst) != generation
}

#[tauri::command]
pub fn stop_channel_fetch() {
    CHANNEL_FETCH_CANCEL_GENERATION.fetch_add(1, Ordering::SeqCst);
}

fn sanitize_youtube_content_type(value: Option<&str>) -> String {
    match value {
        Some("shorts") => "shorts".to_string(),
        Some("streams") => "streams".to_string(),
        Some("videos_shorts") => "videos_shorts".to_string(),
        Some("videos") => "videos".to_string(),
        Some("all") => "all".to_string(),
        _ => "all".to_string(),
    }
}

fn sanitize_preferred_fps(value: Option<&str>) -> String {
    match value {
        Some("30") => "30".to_string(),
        _ => "original".to_string(),
    }
}

/// Build a fallback video URL based on the channel's platform.
/// Used when yt-dlp doesn't return a `url` or `webpage_url` field.
fn build_fallback_video_url(channel_url: &str, video_id: &str) -> String {
    if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
        format!("https://www.bilibili.com/video/{}", video_id)
    } else if channel_url.contains("youku.com") {
        format!("https://v.youku.com/v_show/id_{}.html", video_id)
    } else {
        // Default to YouTube
        format!("https://www.youtube.com/watch?v={}", video_id)
    }
}

async fn run_channel_ytdlp_with_progress(
    app: &AppHandle,
    args: &[&str],
    request_id: Option<u32>,
    limit: Option<u32>,
    cancel_generation: u32,
) -> Result<String, String> {
    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    if let Some((binary_path, _)) = get_ytdlp_path(app).await {
        let mut cmd = Command::new(binary_path);
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.hide_window();

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture yt-dlp stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture yt-dlp stderr".to_string())?;

        let app_for_progress = app.clone();
        let stdout_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut output = String::new();
            let mut fetched_count = 0_u32;

            while let Some(line) = reader.next_line().await? {
                if !line.trim().is_empty() {
                    fetched_count = fetched_count.saturating_add(1);
                    let _ = app_for_progress.emit(
                        "channel-fetch-progress",
                        serde_json::json!({
                            "requestId": request_id,
                            "fetched": fetched_count,
                            "limit": limit
                        }),
                    );
                }
                output.push_str(&line);
                output.push('\n');
            }

            Ok::<String, std::io::Error>(output)
        });

        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            let mut output = String::new();

            while let Some(line) = reader.next_line().await? {
                output.push_str(&line);
                output.push('\n');
            }

            Ok::<String, std::io::Error>(output)
        });

        let status = loop {
            tokio::select! {
                status = child.wait() => {
                    break status.map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(150)) => {
                    if is_channel_fetch_cancelled(cancel_generation) {
                        child.kill().await.ok();
                        let _ = child.wait().await;
                        let _ = stdout_task.await;
                        let _ = stderr_task.await;
                        return Err("Channel fetch cancelled".to_string());
                    }
                }
            }
        };
        let stdout = stdout_task
            .await
            .map_err(|e| format!("Failed to read yt-dlp stdout: {}", e))?
            .map_err(|e| format!("Failed to read yt-dlp stdout: {}", e))?;
        let stderr = stderr_task
            .await
            .map_err(|e| format!("Failed to read yt-dlp stderr: {}", e))?
            .map_err(|e| format!("Failed to read yt-dlp stderr: {}", e))?;

        if !status.success() && stdout.is_empty() {
            let detail = stderr
                .lines()
                .rev()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("yt-dlp exited with error");
            return Err(format!("Failed to fetch channel videos: {}", detail));
        }

        return Ok(stdout);
    }

    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    let output_result = run_ytdlp_with_stderr(app, args).await?;
    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    if !output_result.success && output_result.stdout.is_empty() {
        let detail = output_result
            .stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("yt-dlp exited with error");
        return Err(format!("Failed to fetch channel videos: {}", detail));
    }

    Ok(output_result.stdout)
}

/// Get videos from a channel URL (uses yt-dlp, supports YouTube/Bilibili/etc.)
#[tauri::command]
pub async fn get_channel_videos(
    app: AppHandle,
    url: String,
    limit: Option<u32>,
    start: Option<u32>,
    request_id: Option<u32>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    validate_url(&url)?;
    let cancel_generation = current_channel_fetch_generation();
    let youtube_content_type = sanitize_youtube_content_type(youtube_content_type.as_deref());
    let urls = normalize_channel_content_urls(&url, Some(&youtube_content_type));

    let is_youtube = urls
        .iter()
        .any(|url| url.contains("youtube.com") || url.contains("youtu.be"));
    let max_attempts = if is_youtube { 1 } else { 2 };

    let mut last_error = String::new();

    for attempt in 0..max_attempts {
        if attempt > 0 {
            // Wait before retry
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        let mut entries = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();
        let mut errors = Vec::new();

        for source_url in &urls {
            if is_channel_fetch_cancelled(cancel_generation) {
                return Err("Channel fetch cancelled".to_string());
            }

            let source_is_youtube =
                source_url.contains("youtube.com") || source_url.contains("youtu.be");

            match fetch_channel_videos_once(
                &app,
                source_url,
                limit,
                start,
                request_id,
                cancel_generation,
                source_is_youtube,
                cookie_mode.as_deref(),
                cookie_browser.as_deref(),
                cookie_browser_profile.as_deref(),
                cookie_file_path.as_deref(),
                cookie_skip_patterns.as_deref(),
                proxy_url.as_deref(),
            )
            .await
            {
                Ok(source_entries) => {
                    for entry in source_entries {
                        if seen_ids.insert(entry.id.clone()) {
                            entries.push(entry);
                        }
                    }
                }
                Err(e) => errors.push(e),
            }
        }

        if !entries.is_empty() {
            return Ok(entries);
        }

        last_error = if errors.is_empty() {
            "No videos found in channel".to_string()
        } else {
            errors.join("; ")
        };

        // Only retry for non-YouTube (Bilibili rate-limiting)
        if is_youtube {
            break;
        }
    }

    Err(last_error)
}

/// Inner function: single attempt to fetch channel videos via yt-dlp
async fn fetch_channel_videos_once(
    app: &AppHandle,
    url: &str,
    limit: Option<u32>,
    start: Option<u32>,
    request_id: Option<u32>,
    cancel_generation: u32,
    is_youtube: bool,
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    cookie_skip_patterns: Option<&[String]>,
    proxy_url: Option<&str>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    // Only use --flat-playlist for YouTube; other platforms (Bilibili, etc.)
    // return minimal data in flat mode (no title, thumbnail, duration)
    if is_youtube {
        args.push("--flat-playlist".to_string());
    }

    if let Some(start) = start.filter(|start| *start > 1) {
        args.push("--playlist-start".to_string());
        args.push(start.to_string());
    }

    if let Some(effective_limit) = limit.filter(|limit| *limit > 0) {
        let playlist_end = start
            .filter(|start| *start > 1)
            .map(|start| start.saturating_add(effective_limit).saturating_sub(1))
            .unwrap_or(effective_limit);
        args.push("--playlist-end".to_string());
        args.push(playlist_end.to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.extend(build_site_header_args(url));

    // Add cookie args
    let cookie_args = build_cookie_args(
        url,
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        cookie_skip_patterns,
    );
    args.extend(cookie_args);

    // Add proxy args
    if let Some(proxy) = proxy_url {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.to_string());
        }
    }

    args.push("--".to_string());
    args.push(url.to_string());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output =
        run_channel_ytdlp_with_progress(app, &args_ref, request_id, limit, cancel_generation)
            .await?;

    let fetched_count = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32;
    let _ = app.emit(
        "channel-fetch-progress",
        serde_json::json!({
            "requestId": request_id,
            "fetched": fetched_count,
            "limit": limit
        }),
    );

    let mut entries: Vec<PlaylistVideoEntry> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if id.is_empty() {
                continue;
            }

            let title = json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let video_url = json
                .get("url")
                .or_else(|| json.get("webpage_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_fallback_video_url(url, &id));

            let thumbnail = json
                .get("thumbnail")
                .or_else(|| {
                    json.get("thumbnails")
                        .and_then(|t| t.as_array())
                        .and_then(|arr| arr.first())
                })
                .and_then(|v| {
                    if v.is_string() {
                        v.as_str().map(|s| s.to_string())
                    } else {
                        v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
                    }
                })
                // Bilibili thumbnails use http:// which gets blocked as mixed content
                .map(|u| u.replace("http://", "https://"));

            let duration = json.get("duration").and_then(|v| v.as_f64());
            let channel = json
                .get("channel")
                .or_else(|| json.get("uploader"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let upload_date = json
                .get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let view_count = json
                .get("view_count")
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)));

            entries.push(PlaylistVideoEntry {
                id,
                title,
                url: video_url,
                thumbnail,
                duration,
                channel,
                upload_date,
                playlist_title: None,
                view_count,
            });
        }
    }

    if entries.is_empty() {
        return Err("No videos found in channel".to_string());
    }

    Ok(entries)
}

/// Extract Bilibili UID from a URL (e.g. space.bilibili.com/12345 → Some("12345"))
fn extract_bilibili_uid(url: &str) -> Option<String> {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("");
        if host == "space.bilibili.com" || host == "www.space.bilibili.com" {
            // Path is like /12345 or /12345/video
            let segments: Vec<&str> = parsed.path().trim_matches('/').split('/').collect();
            if let Some(uid) = segments.first() {
                if uid.chars().all(|c| c.is_ascii_digit()) && !uid.is_empty() {
                    return Some(uid.to_string());
                }
            }
        }
    }
    None
}

/// Fetch Bilibili channel info directly from Bilibili API (name + avatar).
/// Uses /x/web-interface/card which does NOT require WBI signing.
/// Returns (name, avatar_url) or None if the API call fails.
async fn fetch_bilibili_channel_info(uid: &str) -> Option<(String, Option<String>)> {
    let api_url = format!("https://api.bilibili.com/x/web-interface/card?mid={}", uid);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let resp = client
        .get(&api_url)
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
        .ok()?;

    let json: serde_json::Value = resp.json().await.ok()?;

    // Response: { "code": 0, "data": { "card": { "name": "...", "face": "https://..." } } }
    if json.get("code").and_then(|v| v.as_i64()) != Some(0) {
        return None;
    }

    let card = json.get("data")?.get("card")?;
    let name = card.get("name").and_then(|v| v.as_str())?.to_string();
    let face = card
        .get("face")
        .and_then(|v| v.as_str())
        .map(|s| s.replace("http://", "https://"));

    Some((name, face))
}

/// Get channel metadata (name + avatar) using yt-dlp -J
#[tauri::command]
pub async fn get_channel_info(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<ChannelInfo, String> {
    validate_url(&url)?;
    let cancel_generation = current_channel_fetch_generation();
    let youtube_content_type = sanitize_youtube_content_type(youtube_content_type.as_deref());
    let url = normalize_channel_content_urls(&url, Some(&youtube_content_type))
        .into_iter()
        .next()
        .unwrap_or_else(|| normalize_url(&url));

    // For Bilibili URLs, try the native API first (accurate name + avatar).
    // This avoids spawning a second yt-dlp process that could trigger rate-limiting.
    let is_bilibili = url.contains("bilibili.com") || url.contains("b23.tv");
    if is_bilibili {
        if let Some(uid) = extract_bilibili_uid(&url) {
            if let Some((name, avatar_url)) = fetch_bilibili_channel_info(&uid).await {
                return Ok(ChannelInfo { name, avatar_url });
            }
        }
    }

    let is_youtube = url.contains("youtube.com") || url.contains("youtu.be");

    let mut args = vec![
        "-J".to_string(),
        "--playlist-items".to_string(),
        "1".to_string(),
        "--no-download".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    // Only use --flat-playlist for YouTube; other platforms return
    // minimal data in flat mode (no channel name, no thumbnails)
    if is_youtube {
        args.push("--flat-playlist".to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.extend(build_site_header_args(&url));

    // Add cookie args
    let cookie_args = build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    );
    args.extend(cookie_args);

    // Add proxy args
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_channel_ytdlp_with_progress(&app, &args_ref, None, None, cancel_generation)
        .await
        .map_err(|_| "Failed to fetch channel info".to_string())?;

    // Parse top-level JSON (channel/playlist metadata)
    let json: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse channel info: {}", e))?;

    // For non-flat-playlist output, data may be inside entries[0]
    let first_entry = json
        .get("entries")
        .and_then(|e| e.as_array())
        .and_then(|arr| arr.first());

    // Extract channel name: top-level → entries[0] → fallback
    let name = json
        .get("channel")
        .or_else(|| json.get("uploader"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        // Fallback: look inside entries[0]
        .or_else(|| {
            first_entry.and_then(|entry| {
                entry
                    .get("channel")
                    .or_else(|| entry.get("uploader"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
            })
        })
        // Last resort: top-level title
        .or_else(|| {
            json.get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or("Channel")
        .to_string();

    // Extract avatar URL from thumbnails array
    // YouTube-specific: "avatar_uncropped" > 900x900 > yt3.googleusercontent.com
    // Generic fallback: largest thumbnail or first available
    let avatar_url = json
        .get("thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|thumbnails| {
            // First: look for avatar_uncropped (YouTube)
            if let Some(avatar) = thumbnails
                .iter()
                .find(|t| t.get("id").and_then(|v| v.as_str()) == Some("avatar_uncropped"))
            {
                return avatar
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }

            // Second: look for 900x900 (YouTube channel avatar)
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("width").and_then(|v| v.as_i64()) == Some(900)
                    && t.get("height").and_then(|v| v.as_i64()) == Some(900)
            }) {
                return avatar
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }

            // Third: look for any yt3.googleusercontent.com URL (YouTube avatar host)
            for t in thumbnails.iter().rev() {
                if let Some(url) = t.get("url").and_then(|v| v.as_str()) {
                    if url.contains("yt3.googleusercontent.com") && !url.contains("fcrop64") {
                        return Some(url.to_string());
                    }
                }
            }

            // Generic fallback: pick the largest thumbnail by width, or the last one
            let best = thumbnails
                .iter()
                .filter_map(|t| {
                    let url = t.get("url").and_then(|v| v.as_str())?;
                    let w = t.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                    Some((url, w))
                })
                .max_by_key(|(_, w)| *w);
            best.map(|(url, _)| url.to_string())
        })
        // Fallback: try entries[0] thumbnails (for non-flat-playlist output)
        .or_else(|| {
            first_entry
                .and_then(|entry| entry.get("thumbnails"))
                .and_then(|t| t.as_array())
                .and_then(|thumbnails| {
                    let best = thumbnails
                        .iter()
                        .filter_map(|t| {
                            let url = t.get("url").and_then(|v| v.as_str())?;
                            let w = t.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                            Some((url, w))
                        })
                        .max_by_key(|(_, w)| *w);
                    best.map(|(url, _)| url.to_string())
                })
        })
        // Also check top-level "thumbnail" field
        .or_else(|| {
            json.get("thumbnail")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        // Check entries[0] "thumbnail" field
        .or_else(|| {
            first_entry
                .and_then(|entry| entry.get("thumbnail"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        // Normalize http:// to https:// (Bilibili CDN uses http:// by default)
        .map(|u| u.replace("http://", "https://"));

    Ok(ChannelInfo { name, avatar_url })
}

/// Follow a channel
#[tauri::command]
pub async fn follow_channel(
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: Option<String>,
    download_quality: Option<String>,
    download_format: Option<String>,
    download_video_codec: Option<String>,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<String, String> {
    let platform = platform.unwrap_or_else(|| "youtube".to_string());
    let download_quality = download_quality.unwrap_or_else(|| "best".to_string());
    let download_format = download_format.unwrap_or_else(|| "mp4".to_string());
    let download_video_codec = download_video_codec.unwrap_or_else(|| "h264".to_string());
    let download_preferred_fps = sanitize_preferred_fps(download_preferred_fps.as_deref());
    let download_audio_bitrate = download_audio_bitrate.unwrap_or_else(|| "192".to_string());
    let youtube_content_type = if platform == "youtube" {
        sanitize_youtube_content_type(youtube_content_type.as_deref())
    } else {
        "videos".to_string()
    };
    database::follow_channel_db(
        url,
        name,
        thumbnail,
        platform,
        download_quality,
        download_format,
        download_video_codec,
        download_audio_bitrate,
        download_preferred_fps,
        youtube_content_type,
    )
}

/// Unfollow a channel
#[tauri::command]
pub async fn unfollow_channel(id: String) -> Result<(), String> {
    database::unfollow_channel_db(id)
}

/// Get all followed channels
#[tauri::command]
pub async fn get_followed_channels() -> Result<Vec<FollowedChannel>, String> {
    database::get_followed_channels_db()
}

/// Update channel settings
#[tauri::command]
pub async fn update_channel_settings(
    id: String,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: Option<String>,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: Option<String>,
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: Option<i64>,
    youtube_content_type: Option<String>,
    reup_mod_enabled: Option<bool>,
    reup_mod_speed: Option<f64>,
    reup_mod_pitch: Option<f64>,
    reup_mod_flip: Option<bool>,
    reup_mod_crop: Option<f64>,
    custom_filename_template: Option<String>,
) -> Result<(), String> {
    database::update_channel_settings_db(
        id,
        check_interval,
        auto_download,
        download_quality,
        download_format,
        download_video_codec.unwrap_or_else(|| "h264".to_string()),
        download_audio_bitrate.unwrap_or_else(|| "192".to_string()),
        sanitize_preferred_fps(download_preferred_fps.as_deref()),
        filter_min_duration,
        filter_max_duration,
        filter_include_keywords,
        filter_exclude_keywords,
        filter_max_videos,
        download_threads.unwrap_or(1),
        sanitize_youtube_content_type(youtube_content_type.as_deref()),
        reup_mod_enabled,
        reup_mod_speed,
        reup_mod_pitch,
        reup_mod_flip,
        reup_mod_crop,
        custom_filename_template,
    )
}

/// Save videos for a channel (from fetch results)
#[tauri::command]
pub async fn save_channel_videos(
    channel_id: String,
    videos: Vec<ChannelVideo>,
) -> Result<usize, String> {
    database::save_channel_videos_db(channel_id, videos)
}

/// Get videos for a channel from DB
#[tauri::command]
pub async fn get_saved_channel_videos(
    channel_id: String,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ChannelVideo>, String> {
    database::get_channel_videos_db(channel_id, status, limit)
}

/// Get channel videos from DB by exact video IDs
#[tauri::command]
pub async fn get_saved_channel_videos_by_video_ids(
    channel_id: String,
    video_ids: Vec<String>,
) -> Result<Vec<ChannelVideo>, String> {
    database::get_channel_videos_by_video_ids_db(channel_id, video_ids)
}

/// Update a channel video's status
#[tauri::command]
pub async fn update_channel_video_status(id: String, status: String) -> Result<(), String> {
    database::update_channel_video_status_db(id, status)
}

/// Update a channel video's status by channel URL + video_id (YouTube ID)
#[tauri::command]
pub async fn update_channel_video_status_by_video_id(
    channel_url: String,
    video_id: String,
    status: String,
) -> Result<(), String> {
    // First find the channel_id by URL
    let channel_id = database::get_channel_id_by_url_db(channel_url)?
        .ok_or_else(|| "Channel not found".to_string())?;
    database::update_channel_video_status_by_video_id_db(channel_id, video_id, status)
}

/// Get count of new (unwatched) videos across all channels
#[tauri::command]
pub async fn get_new_videos_count(channel_id: Option<String>) -> Result<i64, String> {
    database::get_new_videos_count_db(channel_id)
}

/// Update last checked timestamp for a channel
#[tauri::command]
pub async fn update_channel_last_checked(
    id: String,
    last_video_id: Option<String>,
) -> Result<(), String> {
    database::update_channel_last_checked_db(id, last_video_id)
}

/// Update channel name and thumbnail (avatar)
#[tauri::command]
pub async fn update_channel_info(
    id: String,
    name: String,
    thumbnail: Option<String>,
) -> Result<(), String> {
    database::update_channel_info_db(id, name, thumbnail)
}

/// Sync cookie/proxy settings from frontend so the background polling loop can use them.
#[tauri::command]
pub async fn set_polling_network_config(
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<(), String> {
    use crate::services::polling::{set_network_config, PollingNetworkConfig};

    set_network_config(PollingNetworkConfig {
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        cookie_skip_patterns,
        proxy_url,
    });
    Ok(())
}

/// Get statistics for a specific channel
#[tauri::command]
pub async fn get_channel_stats(channel_id: String) -> Result<crate::types::ChannelStats, String> {
    database::get_channel_stats_db(&channel_id)
}

/// Get statistics for all followed channels
#[tauri::command]
pub async fn get_all_channel_stats() -> Result<Vec<crate::types::ChannelStats>, String> {
    database::get_all_channels_stats_db()
}

/// Check a specific channel for new videos immediately
#[tauri::command]
pub async fn check_channel_now(app: AppHandle, channel_id: String) -> Result<usize, String> {
    let channel = database::get_followed_channel_db(channel_id.clone())?;
    let new_count = crate::services::polling::check_channel_for_new_videos(&app, &channel).await?;

    if new_count > 0 {
        let _ = database::update_channel_last_checked_db(
            channel.id.clone(),
            None,
        );

        let total_new = database::get_new_videos_count_db(None).unwrap_or(0);

        let _ = app.emit(
            "channel-new-videos",
            crate::services::polling::NewVideosEvent {
                channel_id: channel.id.clone(),
                channel_name: channel.name.clone(),
                new_count,
                total_new,
            },
        );

        crate::rebuild_tray_menu(&app);

        if channel.auto_download {
            let _ = app.emit(
                "channel-auto-download",
                crate::services::polling::AutoDownloadEvent {
                    channel_id: channel.id.clone(),
                    channel_name: channel.name.clone(),
                    quality: channel.download_quality.clone(),
                    format: channel.download_format.clone(),
                    video_codec: channel.download_video_codec.clone(),
                    preferred_fps: channel.download_preferred_fps.clone(),
                    audio_bitrate: channel.download_audio_bitrate.clone(),
                    download_threads: channel.download_threads,
                },
            );
        }
    } else {
        let _ = database::update_channel_last_checked_db(
            channel.id.clone(),
            channel.last_video_id.clone(),
        );
    }

    Ok(new_count)
}

/// Toggle auto-download for a channel
#[tauri::command]
pub async fn toggle_channel_auto_download(
    channel_id: String,
    enabled: bool,
) -> Result<(), String> {
    database::toggle_channel_auto_download_db(&channel_id, enabled)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CopyrightCheckItemResult {
    pub bkt_check_status: String,
    pub bkt_restriction: String,
    pub monetization: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BktCopyrightCheckReport {
    pub success: bool,
    pub checked_count: usize,
    pub results: std::collections::HashMap<String, CopyrightCheckItemResult>,
    pub error: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub restriction: Option<String>,
}

/// Cập nhật cấu hình chế độ Test trên kênh BKT cho một kênh theo dõi
#[tauri::command]
pub async fn update_channel_bkt_config(
    channel_id: String,
    bkt_test_mode: bool,
    bkt_profile_id: Option<String>,
) -> Result<(), String> {
    database::update_channel_bkt_config_db(&channel_id, bkt_test_mode, bkt_profile_id.as_deref())
}

/// Ép tải một video (dù là Màu Đỏ) để chạy Reup Pipeline v1 và test trên kênh BKT
#[tauri::command]
pub async fn trigger_bkt_test_video(
    app: AppHandle,
    channel_video_id: String,
    channel_id: Option<String>,
    bkt_profile_id: Option<String>,
) -> Result<(), String> {
    let (ch_id, vid_id) = {
        let conn = database::get_db()?;
        if let Some(c_id) = channel_id.filter(|s| !s.trim().is_empty()) {
            let v_id: String = conn
                .query_row(
                    "SELECT video_id FROM channel_videos WHERE (id = ?1 OR video_id = ?1) AND channel_id = ?2 LIMIT 1",
                    rusqlite::params![channel_video_id, c_id],
                    |row| row.get(0),
                )
                .unwrap_or(channel_video_id);
            (c_id, v_id)
        } else {
            conn.query_row(
                "SELECT channel_id, video_id FROM channel_videos WHERE id = ?1 OR video_id = ?1 LIMIT 1",
                rusqlite::params![channel_video_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|e| format!("Video not found in database: {e}"))?
        }
    };

    database::update_channel_video_risk_db(
        &ch_id,
        &vid_id,
        "red",
        Some("Người dùng kích hoạt: Chế độ Test trên kênh BKT (Shadow Check)"),
        true,
    )?;
    database::update_channel_video_bkt_status_db(&vid_id, "pending", None, None)?;

    let channel = database::get_followed_channel_db(ch_id.clone())?;
    let bkt_profile = bkt_profile_id
        .filter(|p| !p.trim().is_empty())
        .or_else(|| channel.bkt_profile_id.clone())
        .or_else(|| {
            database::get_bkt_test_channels_db()
                .ok()?
                .into_iter()
                .find(|c| c.is_active && c.remaining_quota > 0 && !c.profile_id.is_empty())
                .map(|c| c.profile_id)
        })
        .unwrap_or_default();

    let _ = app.emit(
        "channel-bkt-test-queued",
        crate::services::polling::BktTestVideoEvent {
            channel_id: ch_id.clone(),
            channel_name: channel.name,
            video_id: vid_id.clone(),
            title: format!("BKT Test Video ({vid_id})"),
            url: format!("https://www.youtube.com/watch?v={vid_id}"),
            bkt_profile_id: bkt_profile,
        },
    );

    Ok(())
}

#[derive(serde::Deserialize)]
pub struct TriggerBktItem {
    pub channel_video_id: String,
    pub channel_id: Option<String>,
    pub bkt_profile_id: Option<String>,
}

/// Kích hoạt hàng loạt video sang chế độ Test BKT trong 1 transaction duy nhất để tránh nghẽn SQLite / treo UI
#[tauri::command]
pub async fn trigger_bkt_test_videos_batch(
    app: AppHandle,
    items: Vec<TriggerBktItem>,
) -> Result<usize, String> {
    if items.is_empty() {
        return Ok(0);
    }

    let mut success_count = 0;
    let events = {
        let conn = database::get_db()?;
        let mut emitted_events = Vec::new();

        for item in &items {
            let channel_video_id = &item.channel_video_id;
            let (ch_id, vid_id) = if let Some(c_id) = item.channel_id.as_deref().filter(|s| !s.trim().is_empty()) {
                let v_id: String = conn
                    .query_row(
                        "SELECT video_id FROM channel_videos WHERE (id = ?1 OR video_id = ?1) AND channel_id = ?2 LIMIT 1",
                        rusqlite::params![channel_video_id, c_id],
                        |row| row.get(0),
                    )
                    .unwrap_or_else(|_| channel_video_id.clone());
                (c_id.to_string(), v_id)
            } else {
                match conn.query_row(
                    "SELECT channel_id, video_id FROM channel_videos WHERE id = ?1 OR video_id = ?1 LIMIT 1",
                    rusqlite::params![channel_video_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                ) {
                    Ok(pair) => pair,
                    Err(_) => continue,
                }
            };

            let _ = conn.execute(
                "UPDATE channel_videos SET
                    risk_status = 'red',
                    risk_reason = 'Người dùng kích hoạt: Chế độ Test trên kênh BKT (Shadow Check)',
                    is_bkt_test = 1
                 WHERE (channel_id = ?1 AND (video_id = ?2 OR id = ?2))",
                rusqlite::params![ch_id, vid_id],
            );

            let _ = conn.execute(
                "UPDATE channel_videos SET bkt_check_status = 'pending' WHERE (video_id = ?1 OR id = ?1)",
                rusqlite::params![vid_id],
            );

            let bkt_profile = item.bkt_profile_id.clone().unwrap_or_default();

            emitted_events.push(crate::services::polling::BktTestVideoEvent {
                channel_id: ch_id,
                channel_name: String::new(),
                video_id: vid_id.clone(),
                title: format!("BKT Test Video ({vid_id})"),
                url: format!("https://www.youtube.com/watch?v={vid_id}"),
                bkt_profile_id: bkt_profile,
            });
            success_count += 1;
        }

        emitted_events
    };

    for ev in events {
        let _ = app.emit("channel-bkt-test-queued", ev);
    }

    Ok(success_count)
}

/// Kiểm tra trạng thái bản quyền (Shadow Check) qua Python runner
#[tauri::command]
pub async fn check_bkt_copyright_status_cmd(
    app: AppHandle,
    channel_video_id: Option<String>,
    profile_id: Option<String>,
) -> Result<BktCopyrightCheckReport, String> {
    let rows: Vec<(String, String, Option<String>)> = {
        let conn = database::get_db()?;
        let mut stmt = conn
            .prepare(
                "SELECT cv.video_id, COALESCE(cv.bkt_youtube_id, cv.video_id), fc.bkt_profile_id
                 FROM channel_videos cv
                 JOIN followed_channels fc ON cv.channel_id = fc.id
                 WHERE (?1 IS NULL AND cv.is_bkt_test = 1 AND cv.bkt_check_status = 'pending')
                    OR (?1 IS NOT NULL AND (cv.video_id = ?1 OR cv.id = ?1))",
            )
            .map_err(|e| format!("Database query error: {e}"))?;

        let res = stmt
            .query_map(rusqlite::params![channel_video_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| format!("Query map error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        res
    };

    let mut profile_video_map: std::collections::HashMap<String, Vec<(String, String)>> = std::collections::HashMap::new();

    if rows.is_empty() {
        if let Some(prof) = profile_id.filter(|s| !s.trim().is_empty()) {
            let yt_ids: Vec<String> = if let Some(ref vid) = channel_video_id {
                if !vid.trim().is_empty() { vec![vid.trim().to_string()] } else { vec![] }
            } else {
                vec![]
            };
            profile_video_map.insert(prof, yt_ids.into_iter().map(|y| (y.clone(), y)).collect());
        } else {
            return Ok(BktCopyrightCheckReport {
                success: true,
                checked_count: 0,
                results: std::collections::HashMap::new(),
                error: Some("Không tìm thấy video nào đang ở trạng thái chờ kiểm tra BKT.".to_string()),
                status: None,
                restriction: None,
            });
        }
    } else {
        for (orig_vid, yt_vid, prof_opt) in &rows {
            let prof = prof_opt.clone().or_else(|| profile_id.clone()).unwrap_or_default();
            if !prof.is_empty() {
                profile_video_map.entry(prof).or_default().push((orig_vid.clone(), yt_vid.clone()));
            }
        }
    }

    if profile_video_map.is_empty() {
        // Fallback: Tìm Kênh Test Bản Quyền đang hoạt động nếu kênh đối thủ chưa cấu hình profile cố định
        if let Ok(bkt_channels) = database::get_bkt_test_channels_db() {
            if let Some(fallback_ch) = bkt_channels
                .into_iter()
                .find(|c| c.is_active && !c.profile_id.trim().is_empty())
            {
                let prof = fallback_ch.profile_id.trim().to_string();
                for (orig_vid, yt_vid, _) in &rows {
                    profile_video_map
                        .entry(prof.clone())
                        .or_default()
                        .push((orig_vid.clone(), yt_vid.clone()));
                }
            }
        }
    }

    if profile_video_map.is_empty() {
        return Err("Chưa cấu hình Hồ sơ trình duyệt BKT (bkt_profile_id) hoặc Kênh Test Bản Quyền cho kênh này. Vui lòng vào Cài đặt kênh hoặc thêm Kênh Test Bản Quyền.".to_string());
    }

    let mut all_results: std::collections::HashMap<String, CopyrightCheckItemResult> = std::collections::HashMap::new();

    for (profile_id, vids) in profile_video_map {
        let yt_ids: Vec<String> = vids.iter().map(|(_, y)| y.clone()).collect();
        let payload = serde_json::json!({
            "profile_id": profile_id,
            "video_ids": yt_ids,
        });

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(payload.to_string());

        let (mut cmd, runner_path) = create_runner_cmd(&app);
        if !runner_path.exists() {
            return Err(format!(
                "Không tìm thấy file mã nguồn browser_engine/runner.py tại '{}'. Vui lòng kiểm tra lại gói cài đặt ứng dụng.",
                runner_path.display()
            ));
        }
        cmd.arg(&runner_path)
            .arg("--action")
            .arg("check_copyright_status")
            .arg("--data-b64")
            .arg(&b64)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        use crate::utils::CommandExt;
        cmd.hide_window();

        let output = cmd.output().await.map_err(|e| format!("Lỗi khởi chạy Python check_copyright_status: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        let parsed = match parse_json_from_output(&stdout, &stderr) {
            Ok(p) => p,
            Err(e) => {
                log::warn!("Check copyright JSON parse warning: {e}");
                return Ok(BktCopyrightCheckReport {
                    success: false,
                    checked_count: 0,
                    results: all_results,
                    error: Some(format!("Lỗi phân tích phản hồi từ Studio: {e}")),
                    status: Some("failed".to_string()),
                    restriction: None,
                });
            }
        };

        if !parsed.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            let err_msg = parsed
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Không thể truy cập YouTube Studio để kiểm tra bản quyền");
            return Ok(BktCopyrightCheckReport {
                success: false,
                checked_count: 0,
                results: all_results,
                error: Some(err_msg.to_string()),
                status: Some("failed".to_string()),
                restriction: None,
            });
        }

        if let Some(res_obj) = parsed.get("results").and_then(|r| r.as_object()) {
            if vids.is_empty() {
                // Video IDs were discovered dynamically from Studio DOM
                for (dom_vid, item) in res_obj {
                    let status = item.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending");
                    let restriction = item.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("YouTube đang kiểm tra...");
                    let monetization = item.get("monetization").and_then(|s| s.as_str()).map(|s| s.to_string());

                    all_results.insert(
                        dom_vid.clone(),
                        CopyrightCheckItemResult {
                            bkt_check_status: status.to_string(),
                            bkt_restriction: restriction.to_string(),
                            monetization,
                        },
                    );
                }
            } else {
                for (orig_vid, yt_vid) in &vids {
                    if let Some(item) = res_obj.get(yt_vid) {
                        let status = item.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending");
                        let restriction = item.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("YouTube đang kiểm tra...");
                        let monetization = item.get("monetization").and_then(|s| s.as_str()).map(|s| s.to_string());

                        let _ = database::update_channel_video_bkt_status_db(
                            orig_vid,
                            status,
                            Some(restriction),
                            Some(yt_vid),
                        );

                        if status == "red_matched" {
                            log::warn!("[BKT SHADOW CHECK] Video {} dính bản quyền ({restriction}) -> Khóa & Kích hoạt Pipeline Lv.2", orig_vid);
                            let _ = database::update_channel_video_risk_db(
                                "",
                                orig_vid,
                                "red",
                                Some(&format!("Dính bản quyền kênh BKT: {}", restriction)),
                                true,
                            );

                            if let Ok(conn) = database::get_db() {
                                let filepath: Option<String> = conn.query_row(
                                    "SELECT filepath FROM history WHERE media_id = ?1 OR canonical_url LIKE ?2 LIMIT 1",
                                    rusqlite::params![format!("youtube:{orig_vid}"), format!("%{orig_vid}%")],
                                    |row| row.get(0),
                                ).ok();

                                if let Some(fp) = filepath {
                                    if std::path::Path::new(&fp).exists() {
                                        log::info!("[BKT REUP LV2] Tự động kích hoạt run_reup_pipeline_v2 cho file: {}", fp);
                                        let app_cloned = app.clone();
                                        tokio::spawn(async move {
                                            let _ = crate::services::run_reup_pipeline_v2(&app_cloned, &fp, None).await;
                                        });
                                    }
                                }
                            }
                        }

                        all_results.insert(
                            orig_vid.clone(),
                            CopyrightCheckItemResult {
                                bkt_check_status: status.to_string(),
                                bkt_restriction: restriction.to_string(),
                                monetization,
                            },
                        );
                    }
                }
            }
        }
    }

    if all_results.is_empty() {
        return Ok(BktCopyrightCheckReport {
            success: false,
            checked_count: 0,
            results: all_results,
            error: Some("Không tìm thấy dữ liệu kiểm tra bản quyền trên YouTube Studio. Vui lòng đảm bảo hồ sơ đã đăng nhập Studio và video đã được tải lên.".to_string()),
            status: Some("failed".to_string()),
            restriction: None,
        });
    }

    let mut overall_status = None;
    let mut overall_restriction = None;
    if !all_results.is_empty() {
        if all_results.values().any(|r| r.bkt_check_status == "red_matched") {
            overall_status = Some("red_matched".to_string());
            overall_restriction = all_results.values()
                .find(|r| r.bkt_check_status == "red_matched")
                .map(|r| r.bkt_restriction.clone());
        } else if all_results.values().any(|r| r.bkt_check_status == "pending") {
            overall_status = Some("pending".to_string());
            overall_restriction = Some("YouTube đang kiểm tra...".to_string());
        } else {
            overall_status = Some("green_clean".to_string());
            overall_restriction = Some("None (Sạch bản quyền)".to_string());
        }
    }

    Ok(BktCopyrightCheckReport {
        success: true,
        checked_count: all_results.len(),
        results: all_results,
        error: None,
        status: overall_status,
        restriction: overall_restriction,
    })
}

#[tauri::command]
pub async fn extract_competitor_channel_seo_cmd(
    app: AppHandle,
    channel_url: String,
) -> Result<serde_json::Value, String> {
    use base64::prelude::*;
    let (mut cmd, runner) = create_runner_cmd(&app);
    let payload = serde_json::json!({
        "channel_url": channel_url.trim()
    });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    cmd.arg(&runner)
        .arg("--action")
        .arg("extract_channel_seo")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy extract_channel_seo: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể trích xuất SEO của kênh đối thủ");
        return Err(err.to_string());
    }

    Ok(val)
}

#[tauri::command]
pub async fn apply_competitor_seo_to_profile_cmd(
    app: AppHandle,
    profile_id: String,
    channel_keywords: Vec<String>,
    default_tags: Vec<String>,
    made_for_kids: Option<bool>,
) -> Result<serde_json::Value, String> {
    use base64::prelude::*;
    let (mut cmd, runner) = create_runner_cmd(&app);
    let payload = serde_json::json!({
        "profile_id": profile_id.trim(),
        "channel_keywords": channel_keywords,
        "default_tags": default_tags,
        "made_for_kids": made_for_kids.unwrap_or(false)
    });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    cmd.arg(&runner)
        .arg("--action")
        .arg("configure_channel_settings")
        .arg("--profile-id")
        .arg(&profile_id)
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy configure_channel_settings: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi khi cấu hình cài đặt YouTube Studio");
        return Err(err.to_string());
    }

    Ok(val)
}

#[tauri::command]
pub async fn nurture_competitor_channel_seo_cmd(
    app: AppHandle,
    profile_id: String,
    duration_minutes: Option<i64>,
    competitor_titles: Option<Vec<String>>,
    competitor_hashtags: Option<Vec<String>>,
    competitor_keywords: Option<Vec<String>>,
    competitor_urls: Option<Vec<String>>,
    preferred_channel: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::prelude::*;
    let (mut cmd, runner) = create_runner_cmd(&app);
    let payload = serde_json::json!({
        "profile_id": profile_id.trim(),
        "duration_minutes": duration_minutes.unwrap_or(15),
        "competitor_titles": competitor_titles.unwrap_or_default(),
        "competitor_hashtags": competitor_hashtags.unwrap_or_default(),
        "competitor_keywords": competitor_keywords.unwrap_or_default(),
        "competitor_urls": competitor_urls.unwrap_or_default(),
        "preferred_channel": preferred_channel.unwrap_or_default(),
    });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    cmd.arg(&runner)
        .arg("--action")
        .arg("nurture_channel")
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy nurture_channel: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Lỗi khi nuôi kênh theo SEO đối thủ");
        return Err(err.to_string());
    }

    Ok(val)
}

/// Tìm đường dẫn tệp video trên ổ cứng theo video_id.
/// Ưu tiên tìm trong bảng history, nếu không thấy thì quét thư mục Downloads.
#[tauri::command]
pub async fn get_channel_video_filepath(
    app: AppHandle,
    video_id: String,
) -> Result<Option<String>, String> {
    use tauri::Manager;

    let clean_id = video_id.trim();
    if clean_id.is_empty() {
        return Ok(None);
    }

    // 1. Tìm trong SQLite history theo media_id hoặc url/canonical_url LIKE %video_id%
    if let Ok(conn) = database::get_db() {
        let sql = "SELECT filepath FROM history 
                   WHERE media_id = ?1 OR canonical_url LIKE ?2 OR url LIKE ?2 
                   ORDER BY downloaded_at DESC LIMIT 1";
        let found_path: Option<String> = conn
            .query_row(
                sql,
                rusqlite::params![format!("youtube:{clean_id}"), format!("%{clean_id}%")],
                |row| row.get(0),
            )
            .ok();

        if let Some(ref fp) = found_path {
            if std::path::Path::new(fp).exists() {
                return Ok(Some(fp.clone()));
            }
        }
    }

    // 2. Quét thư mục Downloads của hệ thống xem có file .mp4 chứa video_id không
    if let Ok(dl_dir) = app.path().download_dir() {
        if dl_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&dl_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let fname = path.file_name().and_then(|f| f.to_str()).unwrap_or_default();
                        if fname.contains(clean_id) {
                            let lower = fname.to_lowercase();
                            if lower.ends_with(".mp4") || lower.ends_with(".mkv") || lower.ends_with(".webm") {
                                return Ok(Some(path.to_string_lossy().to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn sync_channel_analytics_cmd(
    app: AppHandle,
    profile_id: String,
    channel_url: Option<String>,
    channel_id: Option<String>,
    channel_name: Option<String>,
    company_id: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::prelude::*;
    let (mut cmd, runner) = create_runner_cmd(&app);
    let payload = serde_json::json!({
        "channel_url": channel_url,
        "channel_id": channel_id,
        "channel_name": channel_name,
        "company_id": company_id,
    });
    let data_json = payload.to_string();
    let data_b64 = BASE64_STANDARD.encode(data_json.as_bytes());

    cmd.arg(&runner)
        .arg("--action")
        .arg("sync_channel_analytics")
        .arg("--profile-id")
        .arg(&profile_id)
        .arg("--data-b64")
        .arg(&data_b64);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Không thể chạy sync_channel_analytics: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let val = parse_json_from_output(&stdout, &stderr)?;
    if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("Không thể trích xuất số liệu YouTube Studio");
        return Err(err.to_string());
    }

    Ok(val)
}

