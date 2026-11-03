use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktTestChannel {
    pub id: String,
    pub name: String,
    pub profile_id: String,
    #[serde(default)]
    pub youtube_channel_name: Option<String>,
    #[serde(default)]
    pub youtube_channel_id: Option<String>,
    pub daily_quota: i64,
    pub daily_used: i64,
    pub last_reset_date: String,
    pub is_active: bool,
    pub priority: i64,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // Extra computed/display field
    #[serde(default)]
    pub remaining_quota: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktTestChannelInput {
    pub id: Option<String>,
    pub name: String,
    pub profile_id: String,
    #[serde(default)]
    pub youtube_channel_name: Option<String>,
    #[serde(default)]
    pub youtube_channel_id: Option<String>,
    #[serde(default = "default_quota")]
    pub daily_quota: i64,
    #[serde(default = "default_active")]
    pub is_active: bool,
    #[serde(default = "default_priority")]
    pub priority: i64,
    #[serde(default)]
    pub note: Option<String>,
}

fn default_quota() -> i64 {
    15
}

fn default_active() -> bool {
    true
}

fn default_priority() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktTestJob {
    pub id: String,
    pub test_channel_id: String,
    #[serde(default)]
    pub test_channel_name: Option<String>,
    pub video_source_type: String, // 'channel_video' | 'history' | 'outlier' | 'local_file'
    #[serde(default)]
    pub source_ref_id: Option<String>,
    pub video_title: String,
    pub video_path: String,
    #[serde(default)]
    pub reup_path: Option<String>,
    #[serde(default)]
    pub youtube_video_id: Option<String>,
    pub status: String, // 'queued' | 'reuping' | 'uploading' | 'checking' | 'green_clean' | 'red_matched' | 'failed'
    #[serde(default)]
    pub restriction: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    pub tested_date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktBatchItemRequest {
    pub video_title: String,
    pub video_path: String,
    #[serde(default)]
    pub video_source_type: Option<String>,
    #[serde(default)]
    pub source_ref_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktBatchDispatchRequest {
    pub items: Vec<BktBatchItemRequest>,
    /// Optional specific channel ID. If None, auto load-balance across active channels with quota.
    #[serde(default)]
    pub target_test_channel_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktDispatchItemResult {
    pub video_title: String,
    pub assigned_channel_id: Option<String>,
    pub assigned_channel_name: Option<String>,
    pub job_id: Option<String>,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BktDispatchResult {
    pub success: bool,
    pub total_requested: usize,
    pub total_dispatched: usize,
    pub results: Vec<BktDispatchItemResult>,
    pub error: Option<String>,
}

