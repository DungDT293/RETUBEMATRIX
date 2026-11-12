use serde::{Deserialize, Serialize};

/// Channel metadata (name + avatar) extracted from yt-dlp -J
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChannelInfo {
    pub name: String,
    pub avatar_url: Option<String>,
}

/// A followed YouTube channel
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FollowedChannel {
    pub id: String,
    pub url: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub platform: String,
    pub last_checked_at: Option<String>,
    pub last_video_id: Option<String>,
    pub check_interval: i64, // minutes
    pub auto_download: bool,
    pub download_quality: String,
    pub download_format: String,
    pub created_at: String,
    // Auto-download filter settings
    pub filter_min_duration: Option<i64>,        // seconds
    pub filter_max_duration: Option<i64>,        // seconds
    pub filter_include_keywords: Option<String>, // comma-separated
    pub filter_exclude_keywords: Option<String>, // comma-separated
    pub filter_max_videos: Option<i64>,          // max videos per check
    pub download_threads: i64,                   // concurrent download threads (default 1)
    pub download_video_codec: String,            // video codec (h264, vp9, av1, auto)
    pub download_audio_bitrate: String,          // audio bitrate (128, 192, 256, 320, auto)
    pub download_preferred_fps: String,          // original, 30
    pub youtube_content_type: String,            // videos, shorts, streams, videos_shorts
    pub total_videos: Option<i64>,
    pub youtube_channel_id: Option<String>,
    pub reup_mod_enabled: Option<bool>,
    pub reup_mod_speed: Option<f64>,
    pub reup_mod_pitch: Option<f64>,
    pub reup_mod_flip: Option<bool>,
    pub reup_mod_crop: Option<f64>,
    pub custom_filename_template: Option<String>,
    pub risk_status: Option<String>,
    pub risk_reason: Option<String>,
    pub bkt_test_mode: Option<bool>,
    pub bkt_profile_id: Option<String>,
    pub target_profile_id: Option<String>,
}

/// A video belonging to a followed channel
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChannelVideo {
    pub id: String,
    pub channel_id: String,
    pub video_id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub upload_date: Option<String>,
    pub upload_timestamp: Option<i64>,
    pub video_type: Option<String>,
    pub status: String, // "new", "downloaded", "skipped", "downloading"
    pub created_at: String,
    pub view_count: Option<i64>,
    pub risk_status: Option<String>,
    pub risk_reason: Option<String>,
    pub is_bkt_test: Option<bool>,
    pub bkt_youtube_id: Option<String>,
    pub bkt_check_status: Option<String>,
    pub bkt_restriction: Option<String>,
    pub reup_pipeline_level: Option<i64>,
}

/// Posting schedule analysis result
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PostingScheduleAnalysis {
    pub time_range: Option<String>,
    pub top_days: Vec<u8>,
    pub formatted: String,
    pub sample_size: usize,
}

/// Channel statistics summary
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChannelStats {
    pub channel_id: String,
    pub total_videos: Option<i64>,
    pub total_scanned: i64,
    pub total_downloaded: i64,
    pub posting_schedule: Option<PostingScheduleAnalysis>,
}
