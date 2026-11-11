use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiBrowserProfile {
    pub id: String,
    pub profile_name: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub profile_dir: Option<String>,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub proxy_scheme: Option<String>,
    #[serde(default)]
    pub youtube_preferred_channel: Option<String>,
    #[serde(default)]
    pub youtube_channels: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub fingerprint_seed: Option<serde_json::Value>,
    #[serde(default)]
    pub fingerprint_os: Option<String>,
    #[serde(default)]
    pub fingerprint_browser_version: Option<String>,
    #[serde(default)]
    pub fingerprint_webgl: Option<String>,
    #[serde(default)]
    pub fingerprint_canvas: Option<String>,
    #[serde(default)]
    pub fingerprint_timezone: Option<String>,
    #[serde(default)]
    pub fingerprint_language: Option<String>,
    #[serde(default)]
    pub proxy_risk: Option<String>,
    #[serde(default)]
    pub proxy_score: Option<serde_json::Value>,
    #[serde(default)]
    pub proxy_country: Option<String>,
    #[serde(default)]
    pub last_run_status: Option<String>,
    #[serde(default)]
    pub last_run_time: Option<String>,
    #[serde(default)]
    pub last_run_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiBrowserProfileInput {
    pub id: Option<String>,
    #[serde(alias = "profile_name")]
    pub profile_name: String,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default, alias = "youtube_preferred_channel")]
    pub youtube_preferred_channel: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiBrowserUploadParams {
    #[serde(alias = "profile_id")]
    pub profile_id: String,
    #[serde(alias = "video_path")]
    pub video_path: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default, alias = "thumbnail_path")]
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
    #[serde(default, alias = "schedule_date")]
    pub schedule_date: Option<String>,
    #[serde(default, alias = "schedule_time")]
    pub schedule_time: Option<String>,
    #[serde(default, alias = "pinned_comment")]
    pub pinned_comment: Option<String>,
    #[serde(default, alias = "preferred_channel")]
    pub preferred_channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiBrowserUploadResult {
    pub success: bool,
    #[serde(default, alias = "video_url")]
    pub video_url: Option<String>,
    #[serde(default, alias = "youtube_video_id")]
    pub youtube_video_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiBrowserProxyTestResult {
    pub success: bool,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default, alias = "latency_ms")]
    pub latency_ms: Option<u64>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub org: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub scheme: Option<String>,
    #[serde(default, alias = "canonical_url")]
    pub canonical_url: Option<String>,
}
