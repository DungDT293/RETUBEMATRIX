use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::database;
use crate::services::{
    build_cookie_args, build_site_header_args, get_deno_path, run_ytdlp_with_stderr,
};
use crate::types::{ChannelVideo, FollowedChannel};
use crate::utils::normalize_channel_content_urls;

/// Cookie/proxy configuration synced from the frontend for background polling.
#[derive(Clone, Default)]
pub struct PollingNetworkConfig {
    pub cookie_mode: Option<String>,
    pub cookie_browser: Option<String>,
    pub cookie_browser_profile: Option<String>,
    pub cookie_file_path: Option<String>,
    pub cookie_skip_patterns: Option<Vec<String>>,
    pub proxy_url: Option<String>,
}

static POLLING_NETWORK_CONFIG: Mutex<PollingNetworkConfig> = Mutex::new(PollingNetworkConfig {
    cookie_mode: None,
    cookie_browser: None,
    cookie_browser_profile: None,
    cookie_file_path: None,
    cookie_skip_patterns: None,
    proxy_url: None,
});

/// Update the cookie/proxy config used by the background polling loop.
/// Called from the frontend whenever settings change.
pub fn set_network_config(config: PollingNetworkConfig) {
    if let Ok(mut guard) = POLLING_NETWORK_CONFIG.lock() {
        *guard = config;
    }
}

/// Read a snapshot of the current network config.
fn get_network_config() -> PollingNetworkConfig {
    POLLING_NETWORK_CONFIG
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// Build a fallback video URL based on the channel's platform.
fn build_fallback_video_url(channel_url: &str, video_id: &str) -> String {
    if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
        format!("https://www.bilibili.com/video/{}", video_id)
    } else if channel_url.contains("youku.com") {
        format!("https://v.youku.com/v_show/id_{}.html", video_id)
    } else {
        format!("https://www.youtube.com/watch?v={}", video_id)
    }
}

/// Flag to control polling (stop on app exit)
pub static POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Minimum polling interval in seconds (default: 15 minutes = 900 seconds)
pub static POLLING_INTERVAL_SECS: AtomicU64 = AtomicU64::new(900);

/// Event emitted when new videos are found
#[derive(Clone, serde::Serialize)]
pub struct NewVideosEvent {
    pub channel_id: String,
    pub channel_name: String,
    pub new_count: usize,
    pub total_new: i64,
}

/// Event emitted to trigger auto-download on frontend
#[derive(Clone, serde::Serialize)]
pub struct AutoDownloadEvent {
    pub channel_id: String,
    pub channel_name: String,
    pub quality: String,
    pub format: String,
    pub video_codec: String,
    pub preferred_fps: String,
    pub audio_bitrate: String,
    pub download_threads: i64,
}

/// Event emitted when a video is flagged for testing on a BKT channel
#[derive(Clone, serde::Serialize)]
pub struct BktTestVideoEvent {
    pub channel_id: String,
    pub channel_name: String,
    pub video_id: String,
    pub title: String,
    pub url: String,
    pub bkt_profile_id: String,
}

pub const COPYRIGHT_RISK_KEYWORDS: &[&str] = &[
    "vevo",
    "official artist",
    "sony music",
    "universal music",
    "warner music",
    "umg",
    "sme",
    "wmg",
    " - topic",
    "official music video",
    "official video",
    "copyright",
    "all rights reserved",
    "records",
    "entertainment",
    "bản quyền",
    "độc quyền",
    "mv official",
    "official mv",
    "t-series",
    "zee music",
    "disney",
    "netflix",
];

/// Đánh giá rủi ro bản quyền của kênh và video (Khâu 1)
/// Trả về: (risk_status: "green" | "red", risk_reason: Option<String>, is_duplicate: bool)
pub fn evaluate_channel_and_video_risk(
    channel_name: &str,
    video_title: &str,
    video_id: &str,
    canonical_url: &str,
) -> (String, Option<String>, bool) {
    let ch_lower = channel_name.to_lowercase();
    let title_lower = video_title.to_lowercase();

    // 1. Kiểm tra từ khóa bản quyền cao trên tên kênh và tiêu đề
    for &kw in COPYRIGHT_RISK_KEYWORDS {
        if ch_lower.contains(kw) || title_lower.contains(kw) {
            return (
                "red".to_string(),
                Some(format!("Phát hiện từ khóa kênh/nội dung bản quyền cao: {}", kw)),
                false,
            );
        }
    }

    // 2. Kiểm tra trùng lặp lịch sử tuyệt đối
    if database::is_video_in_history_db(video_id, canonical_url) {
        return (
            "red".to_string(),
            Some("Video đã tồn tại trong lịch sử tải (history)".to_string()),
            true,
        );
    }

    // 3. Vượt qua kiểm tra an toàn
    (
        "green".to_string(),
        Some("Kênh ngách an toàn / Nội dung sạch".to_string()),
        false,
    )
}

fn html_escape_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

/// Resolve YouTube UC channel ID from channel URL or channel page
pub async fn resolve_youtube_channel_id(channel_url: &str) -> Option<String> {
    if let Some(pos) = channel_url.find("/channel/") {
        let sub = &channel_url[pos + 9..];
        let cid: String = sub
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
            .collect();
        if cid.starts_with("UC") && cid.len() == 24 {
            return Some(cid);
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let resp = client.get(channel_url).send().await.ok()?;
    let text = resp.text().await.ok()?;

    let re = regex::Regex::new(r#"(?:itemprop="channelId" content="|itemprop="identifier" content="|"externalId":")\s*(UC[\w-]{22})"#).ok()?;
    if let Some(caps) = re.captures(&text) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let re_fallback = regex::Regex::new(r#"https://www\.youtube\.com/channel/(UC[\w-]{22})"#).ok()?;
    if let Some(caps) = re_fallback.captures(&text) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    None
}

/// Fast RSS check for YouTube channels (real-time, zero-overhead, ~200ms)
pub async fn fast_check_channel_rss(
    _app: &AppHandle,
    channel: &FollowedChannel,
) -> Result<usize, String> {
    if !channel.url.contains("youtube.com") && !channel.url.contains("youtu.be") {
        return Ok(0);
    }

    let cid = match &channel.youtube_channel_id {
        Some(id) if !id.is_empty() && id.starts_with("UC") => id.clone(),
        _ => {
            if let Some(resolved) = resolve_youtube_channel_id(&channel.url).await {
                let _ = database::update_channel_youtube_id_db(&channel.id, &resolved);
                resolved
            } else {
                return Ok(0);
            }
        }
    };

    let rss_url = format!("https://www.youtube.com/feeds/videos.xml?channel_id={}", cid);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&rss_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("RSS returned status {}", resp.status()));
    }

    let xml = resp.text().await.map_err(|e| e.to_string())?;

    let entry_re = regex::Regex::new(r#"(?s)<entry>(.*?)</entry>"#).map_err(|e| e.to_string())?;
    let vid_re = regex::Regex::new(r#"<yt:videoId>(.*?)</yt:videoId>"#).map_err(|e| e.to_string())?;
    let title_re = regex::Regex::new(r#"<title>(.*?)</title>"#).map_err(|e| e.to_string())?;
    let pub_re = regex::Regex::new(r#"<published>(.*?)</published>"#).map_err(|e| e.to_string())?;
    let thumb_re = regex::Regex::new(r#"<media:thumbnail[^>]*url="([^"]+)""#).map_err(|e| e.to_string())?;

    let mut new_videos: Vec<ChannelVideo> = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    for entry_match in entry_re.captures_iter(&xml) {
        let entry_str = &entry_match[1];
        let video_id = match vid_re.captures(entry_str).and_then(|c| c.get(1)) {
            Some(m) => m.as_str().trim().to_string(),
            None => continue,
        };

        if database::has_channel_video_db(&channel.id, &video_id).unwrap_or(false) {
            continue;
        }

        let title = title_re
            .captures(entry_str)
            .and_then(|c| c.get(1))
            .map(|m| html_escape_decode(m.as_str().trim()))
            .unwrap_or_else(|| "Unknown".to_string());

        let published_str = pub_re
            .captures(entry_str)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim());
        let (upload_date, upload_timestamp) = if let Some(pub_str) = published_str {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(pub_str) {
                (Some(dt.format("%Y%m%d").to_string()), Some(dt.timestamp()))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let thumbnail = thumb_re
            .captures(entry_str)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id)));

        let canonical_url = format!("https://www.youtube.com/watch?v={}", video_id);
        let (risk_status, risk_reason, is_duplicate) = evaluate_channel_and_video_risk(
            &channel.name,
            &title,
            &video_id,
            &canonical_url,
        );

        let is_bkt = if risk_status == "red" && !is_duplicate && channel.bkt_test_mode == Some(true) && channel.bkt_profile_id.is_some() {
            Some(true)
        } else {
            Some(false)
        };

        let status = if is_duplicate {
            "ignored".to_string()
        } else if risk_status == "red" && !is_bkt.unwrap_or(false) {
            "ignored".to_string()
        } else {
            "new".to_string()
        };

        let bkt_check_status = if is_bkt == Some(true) {
            Some("pending".to_string())
        } else {
            None
        };

        let video = ChannelVideo {
            id: uuid::Uuid::new_v4().to_string(),
            channel_id: channel.id.clone(),
            video_id: video_id.clone(),
            title,
            url: canonical_url,
            thumbnail,
            duration: None,
            upload_date,
            upload_timestamp,
            video_type: Some("video".to_string()),
            status,
            created_at: now.clone(),
            view_count: None,
            risk_status: Some(risk_status),
            risk_reason,
            is_bkt_test: is_bkt,
            bkt_youtube_id: None,
            bkt_check_status,
            bkt_restriction: None,
            reup_pipeline_level: Some(1),
        };

        new_videos.push(video);
    }

    if new_videos.is_empty() {
        return Ok(0);
    }

    let new_count = new_videos.len();
    let first_video_id = new_videos.first().map(|v| v.video_id.clone());

    database::save_channel_videos_db(channel.id.clone(), new_videos)?;
    let _ = database::update_channel_last_checked_db(channel.id.clone(), first_video_id);

    Ok(new_count)
}

/// Start the background polling loop
pub fn start_polling(app: AppHandle) {
    POLLING_ACTIVE.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        log::info!("Channel polling started");

        let mut last_fast_check = 0i64;

        loop {
            // Check if polling should stop
            if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                log::info!("Channel polling stopped");
                break;
            }

            // Sleep 15 seconds between ticks
            tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;

            // Check again after sleep
            if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                break;
            }

            // Get all followed channels
            let channels = match database::get_followed_channels_db() {
                Ok(channels) => channels,
                Err(e) => {
                    log::error!("Failed to get followed channels for polling: {}", e);
                    continue;
                }
            };

            if channels.is_empty() {
                continue;
            }

            let now_ts = chrono::Utc::now().timestamp();

            // 1. FAST REAL-TIME RSS CHECK (Runs every 45-60s for YouTube channels)
            if now_ts - last_fast_check >= 45 {
                last_fast_check = now_ts;
                for channel in &channels {
                    if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                        break;
                    }

                    match fast_check_channel_rss(&app, channel).await {
                        Ok(new_count) => {
                            if new_count > 0 {
                                log::info!("Fast RSS found {} new videos for {}", new_count, channel.name);
                                let total_new = database::get_new_videos_count_db(None).unwrap_or(0);
                                let _ = app.emit(
                                    "channel-new-videos",
                                    NewVideosEvent {
                                        channel_id: channel.id.clone(),
                                        channel_name: channel.name.clone(),
                                        new_count,
                                        total_new,
                                    },
                                );
                                crate::rebuild_tray_menu(&app);
                                send_notification(&app, &channel.name, new_count);

                                if channel.auto_download {
                                    let _ = app.emit(
                                        "channel-auto-download",
                                        AutoDownloadEvent {
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

                                if channel.bkt_test_mode == Some(true) {
                                    if let Some(ref prof_id) = channel.bkt_profile_id {
                                        if let Ok(bkt_vids) = database::get_channel_videos_db(channel.id.clone(), Some("new".to_string()), Some(5)) {
                                            for bv in bkt_vids {
                                                if bv.is_bkt_test == Some(true) {
                                                    let _ = app.emit(
                                                        "channel-bkt-test-queued",
                                                        BktTestVideoEvent {
                                                            channel_id: channel.id.clone(),
                                                            channel_name: channel.name.clone(),
                                                            video_id: bv.video_id,
                                                            title: bv.title,
                                                            url: bv.url,
                                                            bkt_profile_id: prof_id.clone(),
                                                        },
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            log::debug!("Fast RSS check for {} skipped/failed: {}", channel.name, e);
                        }
                    }
                }
            }

            // 2. DEEP SYNC (Runs on channel's check_interval)
            for channel in &channels {
                if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                    break;
                }

                // Check individual channel interval
                if !should_check_channel(channel) {
                    continue;
                }

                match check_channel_for_new_videos(&app, channel).await {
                    Ok(new_count) => {
                        let _ = database::update_channel_last_checked_db(
                            channel.id.clone(),
                            None,
                        );

                        if new_count > 0 {
                            let total_new = database::get_new_videos_count_db(None).unwrap_or(0);
                            let _ = app.emit(
                                "channel-new-videos",
                                NewVideosEvent {
                                    channel_id: channel.id.clone(),
                                    channel_name: channel.name.clone(),
                                    new_count,
                                    total_new,
                                },
                            );
                            crate::rebuild_tray_menu(&app);
                            send_notification(&app, &channel.name, new_count);

                            if channel.auto_download {
                                let _ = app.emit(
                                    "channel-auto-download",
                                    AutoDownloadEvent {
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

                            if channel.bkt_test_mode == Some(true) {
                                if let Some(ref prof_id) = channel.bkt_profile_id {
                                    if let Ok(bkt_vids) = database::get_channel_videos_db(channel.id.clone(), Some("new".to_string()), Some(5)) {
                                        for bv in bkt_vids {
                                            if bv.is_bkt_test == Some(true) {
                                                let _ = app.emit(
                                                    "channel-bkt-test-queued",
                                                    BktTestVideoEvent {
                                                        channel_id: channel.id.clone(),
                                                        channel_name: channel.name.clone(),
                                                        video_id: bv.video_id,
                                                        title: bv.title,
                                                        url: bv.url,
                                                        bkt_profile_id: prof_id.clone(),
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed deep check for channel {}: {}", channel.name, e);
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
    });
}

/// Stop polling
pub fn stop_polling() {
    POLLING_ACTIVE.store(false, Ordering::SeqCst);
}

/// Check if enough time has passed since last check for a channel
fn should_check_channel(channel: &FollowedChannel) -> bool {
    match &channel.last_checked_at {
        Some(last_checked) => {
            if let Ok(last) = chrono::DateTime::parse_from_rfc3339(last_checked) {
                let now = chrono::Utc::now();
                let elapsed = now.signed_duration_since(last);
                let interval_mins = channel.check_interval;
                elapsed.num_minutes() >= interval_mins
            } else {
                true // Can't parse, check anyway
            }
        }
        None => true, // Never checked
    }
}

/// Check a channel for new videos
pub async fn check_channel_for_new_videos(
    app: &AppHandle,
    channel: &FollowedChannel,
) -> Result<usize, String> {
    // Luôn ưu tiên quét toàn bộ các tab (all) nếu content_type là 'all' hoặc 'videos' mặc định
    let content_type = if channel.youtube_content_type.is_empty() || channel.youtube_content_type == "videos" {
        "all"
    } else {
        &channel.youtube_content_type
    };
    let channel_urls =
        normalize_channel_content_urls(&channel.url, Some(content_type));
    let net = get_network_config();
    let mut output = String::new();

    for channel_url in channel_urls {
        let is_youtube = channel_url.contains("youtube.com") || channel_url.contains("youtu.be");

        let mut args = vec![
            "--dump-json".to_string(),
            "--no-warnings".to_string(),
            "--socket-timeout".to_string(),
            "30".to_string(),
        ];

        // Nếu user cấu hình max_videos thì dùng playlist-end, còn không thì quét toàn bộ kênh
        if let Some(limit) = channel.filter_max_videos {
            if limit > 0 {
                args.push("--playlist-end".to_string());
                args.push(limit.to_string());
            }
        }

        // Only use --flat-playlist for YouTube; other platforms (Bilibili, etc.)
        // return minimal data in flat mode (no title, thumbnail, duration)
        if is_youtube {
            args.push("--flat-playlist".to_string());
            // Trích xuất ngày giờ đăng xấp xỉ trong flat-playlist của YouTube
            args.push("--extractor-args".to_string());
            args.push("youtubetab:approximate_date".to_string());
        }

        // Add Deno runtime for YouTube
        if is_youtube {
            if let Some(deno_path) = get_deno_path(app).await {
                args.push("--js-runtimes".to_string());
                args.push(format!("deno:{}", deno_path.to_string_lossy()));
            }
        }

        args.extend(build_site_header_args(&channel_url));

        // Load cookie/proxy settings synced from the frontend
        let cookie_args = build_cookie_args(
            &channel_url,
            net.cookie_mode.as_deref(),
            net.cookie_browser.as_deref(),
            net.cookie_browser_profile.as_deref(),
            net.cookie_file_path.as_deref(),
            net.cookie_skip_patterns.as_deref(),
        );
        args.extend(cookie_args);

        if let Some(proxy) = net.proxy_url.as_ref() {
            if !proxy.is_empty() {
                args.push("--proxy".to_string());
                args.push(proxy.clone());
            }
        }

        args.push("--".to_string());
        args.push(channel_url.clone());

        let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

        let output_result = match run_ytdlp_with_stderr(app, &args_ref).await {
            Ok(res) => res,
            Err(e) => {
                log::warn!("Failed to run yt-dlp for {}: {}", channel_url, e);
                continue;
            }
        };

        if !output_result.success && output_result.stdout.is_empty() {
            let stderr_lower = output_result.stderr.to_lowercase();
            // Nếu kênh không có tab shorts hoặc streams hoặc videos thì bỏ qua tab đó một cách an toàn
            if stderr_lower.contains("does not have a")
                || stderr_lower.contains("not found")
                || stderr_lower.contains("tab") {
                log::info!("Tab not present for {}, skipping: {}", channel_url, output_result.stderr);
                continue;
            }
            log::warn!("yt-dlp returned error for {}: {}", channel_url, output_result.stderr);
            continue;
        }

        output.push_str(&output_result.stdout);
        if !output.ends_with('\n') {
            output.push('\n');
        }
    }

    let mut new_videos: Vec<ChannelVideo> = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    // Map extracted channel_id for RSS timestamps fallback
    let mut detected_channel_id: Option<String> = None;
    let mut rss_timestamps: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if detected_channel_id.is_none() {
                if let Some(cid) = json.get("playlist_channel_id")
                    .or_else(|| json.get("playlist_id"))
                    .or_else(|| json.get("channel_id"))
                    .and_then(|v| v.as_str()) {
                    if cid.starts_with("UC") {
                        detected_channel_id = Some(cid.to_string());
                        let _ = database::update_channel_youtube_id_db(&channel.id, cid);
                        // Fetch YouTube RSS XML to populate exact timestamps
                        let rss_url = format!("https://www.youtube.com/feeds/videos.xml?channel_id={}", cid);
                        if let Ok(resp) = reqwest::get(&rss_url).await {
                            if let Ok(xml_content) = resp.text().await {
                                let re = regex::Regex::new(r#"<yt:videoId>(.*?)</yt:videoId>[\s\S]*?<published>(.*?)</published>"#).ok();
                                if let Some(regex) = re {
                                    for cap in regex.captures_iter(&xml_content) {
                                        if let (Some(vid), Some(pub_date)) = (cap.get(1), cap.get(2)) {
                                            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(pub_date.as_str()) {
                                                rss_timestamps.insert(vid.as_str().to_string(), dt.timestamp());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Parse total_videos of channel if available in yt-dlp metadata
            if let Some(total_videos) = json
                .get("playlist_count")
                .or_else(|| json.get("n_entries"))
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
            {
                let _ = database::update_channel_total_videos_db(&channel.id, total_videos);
            }

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
                .unwrap_or_else(|| build_fallback_video_url(&channel.url, &id));

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
            let mut upload_date = json
                .get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let mut upload_timestamp = json
                .get("release_timestamp")
                .or_else(|| json.get("timestamp"))
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
                .or_else(|| {
                    let date_str = json.get("upload_date").and_then(|v| v.as_str())?;
                    if date_str.len() == 8 {
                        chrono::NaiveDate::parse_from_str(date_str, "%Y%m%d")
                            .ok()
                            .and_then(|d| d.and_hms_opt(0, 0, 0))
                            .map(|dt| dt.and_utc().timestamp())
                    } else {
                        None
                    }
                });

            // Fallback from RSS timestamps if available (provides exact hour/minute for latest videos)
            if let Some(ts) = rss_timestamps.get(&id) {
                upload_timestamp = Some(*ts);
                if upload_date.is_none() {
                    if let Some(dt) = chrono::DateTime::from_timestamp(*ts, 0) {
                        upload_date = Some(dt.format("%Y%m%d").to_string());
                    }
                }
            }

            // If upload_date is still missing but we have timestamp, format it
            if upload_date.is_none() {
                if let Some(ts) = upload_timestamp {
                    if let Some(dt) = chrono::DateTime::from_timestamp(ts, 0) {
                        upload_date = Some(dt.format("%Y%m%d").to_string());
                    }
                }
            }

            let is_stream = video_url.contains("/live/")
                || json
                    .get("playlist_webpage_url")
                    .or_else(|| json.get("webpage_url"))
                    .and_then(|v| v.as_str())
                    .map(|u| u.contains("/streams"))
                    .unwrap_or(false)
                || json
                    .get("playlist_title")
                    .and_then(|v| v.as_str())
                    .map(|t| t.to_lowercase().contains("live"))
                    .unwrap_or(false)
                || json
                    .get("live_status")
                    .and_then(|v| v.as_str())
                    .map(|s| s == "is_live" || s == "was_live" || s == "post_live")
                    .unwrap_or(false);

            let is_short = video_url.contains("/shorts/")
                || json
                    .get("playlist_webpage_url")
                    .and_then(|v| v.as_str())
                    .map(|u| u.contains("/shorts"))
                    .unwrap_or(false)
                || duration.map(|d| d > 0.0 && d <= 60.0).unwrap_or(false);

            let video_type = if is_stream {
                "stream".to_string()
            } else if is_short {
                "shorts".to_string()
            } else {
                "video".to_string()
            };

            // Apply filters
            if let Some(min_dur) = channel.filter_min_duration {
                if let Some(dur) = duration {
                    if dur < min_dur as f64 {
                        continue;
                    }
                }
            }
            if let Some(max_dur) = channel.filter_max_duration {
                if let Some(dur) = duration {
                    if dur > max_dur as f64 {
                        continue;
                    }
                }
            }

            // Keyword filters
            if let Some(ref include_kw) = channel.filter_include_keywords {
                if !include_kw.is_empty() {
                    let keywords: Vec<&str> = include_kw.split(',').map(|s| s.trim()).collect();
                    let title_lower = title.to_lowercase();
                    if !keywords
                        .iter()
                        .any(|kw| title_lower.contains(&kw.to_lowercase()))
                    {
                        continue;
                    }
                }
            }
            if let Some(ref exclude_kw) = channel.filter_exclude_keywords {
                if !exclude_kw.is_empty() {
                    let keywords: Vec<&str> = exclude_kw.split(',').map(|s| s.trim()).collect();
                    let title_lower = title.to_lowercase();
                    if keywords
                        .iter()
                        .any(|kw| title_lower.contains(&kw.to_lowercase()))
                    {
                        continue;
                    }
                }
            }

            let (risk_status, risk_reason, is_duplicate) = evaluate_channel_and_video_risk(
                &channel.name,
                &title,
                &id,
                &video_url,
            );

            let is_bkt = if risk_status == "red" && !is_duplicate && channel.bkt_test_mode == Some(true) && channel.bkt_profile_id.is_some() {
                Some(true)
            } else {
                Some(false)
            };

            let status = if is_duplicate {
                "ignored".to_string()
            } else if risk_status == "red" && !is_bkt.unwrap_or(false) {
                "ignored".to_string()
            } else {
                "new".to_string()
            };

            let bkt_check_status = if is_bkt == Some(true) {
                Some("pending".to_string())
            } else {
                None
            };

            new_videos.push(ChannelVideo {
                id: uuid::Uuid::new_v4().to_string(),
                channel_id: channel.id.clone(),
                video_id: id,
                title,
                url: video_url,
                thumbnail,
                duration,
                upload_date,
                upload_timestamp,
                video_type: Some(video_type),
                status,
                created_at: now.clone(),
                view_count: None,
                risk_status: Some(risk_status),
                risk_reason,
                is_bkt_test: is_bkt,
                bkt_youtube_id: None,
                bkt_check_status,
                bkt_restriction: None,
                reup_pipeline_level: Some(1),
            });
        }
    }

    if new_videos.is_empty() {
        return Ok(0);
    }

    // Save new videos to DB
    let new_count = new_videos.len();

    // Update last_video_id to the first (newest) video
    let first_video_id = new_videos.first().map(|v| v.video_id.clone());
    let _ = database::update_channel_last_checked_db(channel.id.clone(), first_video_id);

    let _ = database::save_channel_videos_db(channel.id.clone(), new_videos);

    // Cập nhật tổng số video thực tế đã quét vào database cho kênh này
    if let Ok(all_saved) = database::get_channel_videos_db(channel.id.clone(), None, Some(0)) {
        let total = all_saved.len() as i64;
        if total > 0 {
            let _ = database::update_channel_total_videos_db(&channel.id, total);
        }
    }

    Ok(new_count)
}

/// Send a desktop notification for new videos
fn send_notification(app: &AppHandle, channel_name: &str, new_count: usize) {
    use tauri_plugin_notification::NotificationExt;

    let title = "RETubeMatrix • Theo dõi Kênh";
    let body = if new_count == 1 {
        format!("{}: Phát hiện 1 video mới! Đang tự động xử lý...", channel_name)
    } else {
        format!("{}: Phát hiện {} video mới! Đang tự động xử lý...", channel_name, new_count)
    };

    let _ = app.notification().builder().title(title).body(&body).show();
}
