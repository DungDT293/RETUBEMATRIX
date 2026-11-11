use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTimelineEvent {
    pub id: String,
    pub event_type: String, // "bkt_test", "download", "auto_publish", "video_discovered"
    pub time: String,       // "11:27"
    pub timestamp: String,  // full ISO string
    pub title: String,
    pub channel_name: Option<String>,
    pub status: String,     // "green_clean", "red_matched", "checking", "downloaded", "published", "failed"
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReportStats {
    pub target_date: String,             // "2026-11-09"
    pub total_discovered_today: i64,      // Video cào mới hôm nay
    pub total_downloaded_today: i64,      // Video đã tải về hôm nay
    pub total_download_size_bytes: i64,   // Tổng dung lượng video đã tải hôm nay
    pub total_bkt_tested_today: i64,      // Tổng video test BKT hôm nay
    pub bkt_clean_count: i64,             // Video Sạch Bản Quyền (green_clean)
    pub bkt_claimed_count: i64,           // Video Dính Bản Quyền (red_matched)
    pub bkt_pending_count: i64,           // Video đang kiểm tra hoặc chờ
    pub total_published_main_today: i64,  // Video đã xuất bản lên Kênh Đích hôm nay
    pub test_quota_total: i64,            // Tổng quota test trong ngày
    pub test_quota_used: i64,             // Đã dùng hôm nay
    pub test_quota_remaining: i64,        // Còn lại hôm nay
    pub timeline_events: Vec<DailyTimelineEvent>,
}
