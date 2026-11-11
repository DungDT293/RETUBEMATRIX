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
pub struct MultiBrowserProfileInput {
    pub id: Option<String>,
    pub profile_name: String,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub youtube_preferred_channel: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiBrowserUploadParams {
    pub profile_id: String,
    pub video_path: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
    #[serde(default)]
    pub schedule_date: Option<String>,
    #[serde(default)]
    pub schedule_time: Option<String>,
    #[serde(default)]
    pub pinned_comment: Option<String>,
    #[serde(default)]
    pub preferred_channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiBrowserUploadResult {
    pub success: bool,
    pub video_url: Option<String>,
    #[serde(default)]
    pub youtube_video_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiBrowserProxyTestResult {
    pub success: bool,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
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
    #[serde(default)]
    pub canonical_url: Option<String>,
}
