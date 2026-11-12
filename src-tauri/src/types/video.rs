use serde::{Deserialize, Serialize};

/// Video information returned from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub channel: Option<String>,
    pub uploader: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub description: Option<String>,
    pub is_playlist: bool,
    pub playlist_count: Option<u32>,
    pub extractor: Option<String>,
    pub extractor_key: Option<String>,
    // Live stream fields
    pub is_live: Option<bool>,       // true if currently live streaming
    pub was_live: Option<bool>,      // true if was a live stream (now ended)
    pub live_status: Option<String>, // "is_live", "was_live", "not_live", "is_upcoming"
    // VidIQ / SEO / Enhanced metadata
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub channel_follower_count: Option<u64>,
    pub like_count: Option<u64>,
    pub comment_count: Option<u64>,
}

/// Format option from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FormatOption {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    pub tbr: Option<f64>,
    pub format_note: Option<String>,
    pub fps: Option<f64>,
    pub quality: Option<f64>,
}

/// Response containing video info and available formats
#[derive(Clone, Serialize, Debug)]
pub struct VideoInfoResponse {
    pub info: VideoInfo,
    pub formats: Vec<FormatOption>,
}

/// Playlist entry with basic video info
#[derive(Clone, Serialize, Debug)]
pub struct PlaylistVideoEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub channel: Option<String>,
    pub upload_date: Option<String>,
    pub playlist_title: Option<String>,
    pub view_count: Option<i64>,
}

/// Subtitle information
#[derive(Clone, Serialize, Debug)]
pub struct SubtitleInfo {
    pub lang: String,
    pub name: String,
    pub is_auto: bool,
}

/// Technical metadata extracted from a media file via FFprobe
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub path: String,
    pub filename: String,
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub bitrate: i64,
    pub file_size: i64,
    pub format: String,
    pub has_audio: bool,
}
