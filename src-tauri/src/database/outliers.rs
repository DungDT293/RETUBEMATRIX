use super::connection::get_db;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OutlierHunterSettings {
    pub id: String,
    pub enabled: bool,
    pub niches: String, // JSON array of string niches
    pub min_views: i64,
    pub max_subscribers: i64,
    pub min_sub_outlier: f64,
    pub min_baseline_outlier: f64,
    pub min_duration: i64,
    pub min_vph: f64,
    pub min_engagement_rate: f64,
    pub min_comments: i64,
    pub auto_download: bool,
    pub auto_reup_level: String,
    pub auto_bkt_test: bool,
    pub scan_interval_minutes: i64,
    pub updated_at: String,
}

impl Default for OutlierHunterSettings {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            enabled: true,
            niches: "[\"review phim\",\"tin tức\",\"công nghệ\",\"giải trí\"]".to_string(),
            min_views: 3000,
            max_subscribers: 150000,
            min_sub_outlier: 1.8,
            min_baseline_outlier: 1.8,
            min_duration: 60,
            min_vph: 0.5,
            min_engagement_rate: 0.002,
            min_comments: 2,
            auto_download: false,
            auto_reup_level: "v1".to_string(),
            auto_bkt_test: false,
            scan_interval_minutes: 60,
            updated_at: String::new(),
        }
    }
}

fn deserialize_string_or_seq<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Ok("[]".to_string()),
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Array(arr) => Ok(serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string())),
        _ => Ok(value.to_string()),
    }
}

fn deserialize_optional_string_or_seq<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::String(s) => Ok(Some(s)),
        serde_json::Value::Array(arr) => Ok(Some(serde_json::to_string(&arr).unwrap_or_default())),
        _ => Ok(Some(value.to_string())),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct OutlierVideo {
    pub id: String,
    pub niche: String,
    pub title: String,
    pub thumbnail_url: String,
    pub channel_id: String,
    pub channel_name: String,
    pub subscribers: i64,
    pub views: i64,
    pub likes: i64,
    pub comments: i64,
    pub duration: i64,
    pub upload_timestamp: i64,
    pub hours_published: f64,
    pub avg_vph: f64,
    pub current_vph: Option<f64>,
    pub momentum_score: f64,
    pub sub_outlier_ratio: f64,
    pub baseline_median_views: i64,
    pub baseline_outlier_ratio: f64,
    pub engagement_rate: f64,
    #[serde(default, deserialize_with = "deserialize_string_or_seq")]
    pub view_history: String,
    pub status: String,
    pub local_filepath: Option<String>,
    pub reup_filepath: Option<String>,
    pub bkt_status: String,
    pub opportunity_score: Option<f64>,
    pub demand_signal: Option<String>,
    pub hook_analysis: Option<String>,
    pub created_at: String,
    pub last_ping_at: String,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_seq")]
    pub tags: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_seq")]
    pub categories: Option<String>,
}

/// Get outlier settings or create default
pub fn get_outlier_settings_db() -> Result<OutlierHunterSettings, String> {
    let conn = get_db()?;
    let query = "SELECT id, enabled, niches, min_views, max_subscribers, min_sub_outlier,
                        min_baseline_outlier, min_duration, min_vph, min_engagement_rate,
                        min_comments, auto_download, auto_reup_level, auto_bkt_test,
                        scan_interval_minutes, updated_at
                 FROM outlier_hunter_settings WHERE id = 'default' LIMIT 1";

    let res = conn.query_row(query, [], |row| {
        Ok(OutlierHunterSettings {
            id: row.get(0)?,
            enabled: row.get::<_, i64>(1)? != 0,
            niches: row.get(2)?,
            min_views: row.get(3)?,
            max_subscribers: row.get(4)?,
            min_sub_outlier: row.get(5)?,
            min_baseline_outlier: row.get(6)?,
            min_duration: row.get(7)?,
            min_vph: row.get(8)?,
            min_engagement_rate: row.get(9)?,
            min_comments: row.get(10)?,
            auto_download: row.get::<_, i64>(11)? != 0,
            auto_reup_level: row.get(12)?,
            auto_bkt_test: row.get::<_, i64>(13)? != 0,
            scan_interval_minutes: row.get(14)?,
            updated_at: row.get(15)?,
        })
    });

    match res {
        Ok(settings) => Ok(settings),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Seed default row with modern Ikigai golden niche thresholds
            conn.execute(
                "INSERT OR IGNORE INTO outlier_hunter_settings (
                    id, enabled, niches, min_views, max_subscribers, min_sub_outlier,
                    min_baseline_outlier, min_duration, min_vph, min_engagement_rate,
                    min_comments, auto_download, auto_reup_level, auto_bkt_test,
                    scan_interval_minutes, updated_at
                ) VALUES (
                    'default', 1, '[\"nấu ăn cho người ở 1 mình\",\"món ăn sinh viên tiết kiệm\",\"quản lý tài chính cá nhân\",\"công cụ ai kiếm tiền\",\"nhạc lofi chill học bài\",\"asmr satisfying âm thanh thư giãn\"]',
                    3000, 150000, 1.8, 1.8, 60, 0.5, 0.002, 2, 0, 'v1', 0, 60, datetime('now')
                )",
                [],
            )
            .map_err(|e| format!("Failed to seed outlier settings: {e}"))?;

            // Return default settings struct directly without re-locking get_db()
            Ok(OutlierHunterSettings {
                id: "default".to_string(),
                enabled: true,
                niches: "[\"nấu ăn cho người ở 1 mình\",\"món ăn sinh viên tiết kiệm\",\"quản lý tài chính cá nhân\",\"công cụ ai kiếm tiền\",\"nhạc lofi chill học bài\",\"asmr satisfying âm thanh thư giãn\"]".to_string(),
                min_views: 3000,
                max_subscribers: 150000,
                min_sub_outlier: 1.8,
                min_baseline_outlier: 1.8,
                min_duration: 60,
                min_vph: 0.5,
                min_engagement_rate: 0.002,
                min_comments: 2,
                auto_download: false,
                auto_reup_level: "v1".to_string(),
                auto_bkt_test: false,
                scan_interval_minutes: 60,
                updated_at: "".to_string(),
            })
        }
        Err(e) => Err(format!("Query outlier settings error: {e}")),
    }
}

/// Update outlier hunter settings
pub fn update_outlier_settings_db(s: &OutlierHunterSettings) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT INTO outlier_hunter_settings (
            id, enabled, niches, min_views, max_subscribers, min_sub_outlier,
            min_baseline_outlier, min_duration, min_vph, min_engagement_rate,
            min_comments, auto_download, auto_reup_level, auto_bkt_test,
            scan_interval_minutes, updated_at
        ) VALUES (
            'default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            enabled = excluded.enabled,
            niches = excluded.niches,
            min_views = excluded.min_views,
            max_subscribers = excluded.max_subscribers,
            min_sub_outlier = excluded.min_sub_outlier,
            min_baseline_outlier = excluded.min_baseline_outlier,
            min_duration = excluded.min_duration,
            min_vph = excluded.min_vph,
            min_engagement_rate = excluded.min_engagement_rate,
            min_comments = excluded.min_comments,
            auto_download = excluded.auto_download,
            auto_reup_level = excluded.auto_reup_level,
            auto_bkt_test = excluded.auto_bkt_test,
            scan_interval_minutes = excluded.scan_interval_minutes,
            updated_at = datetime('now')",
        params![
            if s.enabled { 1 } else { 0 },
            s.niches,
            s.min_views,
            s.max_subscribers,
            s.min_sub_outlier,
            s.min_baseline_outlier,
            s.min_duration,
            s.min_vph,
            s.min_engagement_rate,
            s.min_comments,
            if s.auto_download { 1 } else { 0 },
            s.auto_reup_level,
            if s.auto_bkt_test { 1 } else { 0 },
            s.scan_interval_minutes,
        ],
    )
    .map_err(|e| format!("Failed to update outlier settings: {e}"))?;

    Ok(())
}

/// Get outlier videos with optional filter and limit
pub fn get_outlier_videos_db(
    status: Option<String>,
    niche: Option<String>,
    limit: i64,
) -> Result<Vec<OutlierVideo>, String> {
    let conn = get_db()?;
    let limit_val = if limit <= 0 { 100 } else { limit };

    let mut query = "SELECT id, niche, title, thumbnail_url, channel_id, channel_name,
                            subscribers, views, likes, comments, duration, upload_timestamp,
                            hours_published, avg_vph, current_vph, momentum_score,
                            sub_outlier_ratio, baseline_median_views, baseline_outlier_ratio,
                            engagement_rate, view_history, status, local_filepath,
                            reup_filepath, bkt_status, opportunity_score, demand_signal,
                            hook_analysis, created_at, last_ping_at, tags, categories
                     FROM outlier_videos WHERE 1=1".to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(st) = status.filter(|s| !s.is_empty() && s != "all") {
        query.push_str(" AND status = ?");
        params_vec.push(rusqlite::types::Value::Text(st));
    }

    if let Some(nc) = niche.filter(|n| !n.is_empty() && n != "all") {
        query.push_str(" AND niche = ?");
        params_vec.push(rusqlite::types::Value::Text(nc));
    }

    query.push_str(" ORDER BY momentum_score DESC, baseline_outlier_ratio DESC LIMIT ?");
    params_vec.push(rusqlite::types::Value::Integer(limit_val));

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Prepare query failed: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(OutlierVideo {
                id: row.get(0)?,
                niche: row.get(1)?,
                title: row.get(2)?,
                thumbnail_url: row.get(3)?,
                channel_id: row.get(4)?,
                channel_name: row.get(5)?,
                subscribers: row.get(6)?,
                views: row.get(7)?,
                likes: row.get(8)?,
                comments: row.get(9)?,
                duration: row.get(10)?,
                upload_timestamp: row.get(11)?,
                hours_published: row.get(12)?,
                avg_vph: row.get(13)?,
                current_vph: row.get(14)?,
                momentum_score: row.get(15)?,
                sub_outlier_ratio: row.get(16)?,
                baseline_median_views: row.get(17)?,
                baseline_outlier_ratio: row.get(18)?,
                engagement_rate: row.get(19)?,
                view_history: row.get(20)?,
                status: row.get(21)?,
                local_filepath: row.get(22)?,
                reup_filepath: row.get(23)?,
                bkt_status: row.get(24)?,
                opportunity_score: row.get(25)?,
                demand_signal: row.get(26)?,
                hook_analysis: row.get(27)?,
                created_at: row.get(28)?,
                last_ping_at: row.get(29)?,
                tags: row.get(30)?,
                categories: row.get(31)?,
            })
        })
        .map_err(|e| format!("Query map failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Upsert outlier video record
pub fn upsert_outlier_video_db(v: &OutlierVideo) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT INTO outlier_videos (
            id, niche, title, thumbnail_url, channel_id, channel_name,
            subscribers, views, likes, comments, duration, upload_timestamp,
            hours_published, avg_vph, current_vph, momentum_score,
            sub_outlier_ratio, baseline_median_views, baseline_outlier_ratio,
            engagement_rate, view_history, status, local_filepath,
            reup_filepath, bkt_status, opportunity_score, demand_signal,
            hook_analysis, created_at, last_ping_at, tags, categories
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6,
            ?7, ?8, ?9, ?10, ?11, ?12,
            ?13, ?14, ?15, ?16,
            ?17, ?18, ?19,
            ?20, ?21, ?22, ?23,
            ?24, ?25, ?26, ?27,
            ?28, ?29, ?30, ?31, ?32
        )
        ON CONFLICT(id) DO UPDATE SET
            views = excluded.views,
            likes = excluded.likes,
            comments = excluded.comments,
            hours_published = excluded.hours_published,
            avg_vph = excluded.avg_vph,
            current_vph = excluded.current_vph,
            momentum_score = excluded.momentum_score,
            sub_outlier_ratio = excluded.sub_outlier_ratio,
            baseline_median_views = excluded.baseline_median_views,
            baseline_outlier_ratio = excluded.baseline_outlier_ratio,
            engagement_rate = excluded.engagement_rate,
            view_history = excluded.view_history,
            opportunity_score = CASE WHEN excluded.opportunity_score IS NOT NULL AND excluded.opportunity_score > 0.0 THEN excluded.opportunity_score ELSE outlier_videos.opportunity_score END,
            demand_signal = CASE WHEN excluded.demand_signal IS NOT NULL AND excluded.demand_signal != '' THEN excluded.demand_signal ELSE outlier_videos.demand_signal END,
            hook_analysis = CASE WHEN excluded.hook_analysis IS NOT NULL AND excluded.hook_analysis != '' THEN excluded.hook_analysis ELSE outlier_videos.hook_analysis END,
            tags = CASE WHEN excluded.tags IS NOT NULL AND excluded.tags != '' THEN excluded.tags ELSE outlier_videos.tags END,
            categories = CASE WHEN excluded.categories IS NOT NULL AND excluded.categories != '' THEN excluded.categories ELSE outlier_videos.categories END,
            last_ping_at = excluded.last_ping_at",
        params![
            v.id,
            v.niche,
            v.title,
            v.thumbnail_url,
            v.channel_id,
            v.channel_name,
            v.subscribers,
            v.views,
            v.likes,
            v.comments,
            v.duration,
            v.upload_timestamp,
            v.hours_published,
            v.avg_vph,
            v.current_vph,
            v.momentum_score,
            v.sub_outlier_ratio,
            v.baseline_median_views,
            v.baseline_outlier_ratio,
            v.engagement_rate,
            v.view_history,
            v.status,
            v.local_filepath,
            v.reup_filepath,
            v.bkt_status,
            v.opportunity_score,
            v.demand_signal,
            v.hook_analysis,
            v.created_at,
            v.last_ping_at,
            v.tags,
            v.categories,
        ],
    )
    .map_err(|e| format!("Failed to upsert outlier video: {e}"))?;

    Ok(())
}

/// Update status & pipeline paths of outlier video
pub fn update_outlier_video_status_db(
    id: &str,
    status: &str,
    local_filepath: Option<&str>,
    reup_filepath: Option<&str>,
    bkt_status: Option<&str>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE outlier_videos
         SET status = ?2,
             local_filepath = COALESCE(?3, local_filepath),
             reup_filepath = COALESCE(?4, reup_filepath),
             bkt_status = COALESCE(?5, bkt_status)
         WHERE id = ?1",
        params![id, status, local_filepath, reup_filepath, bkt_status],
    )
    .map_err(|e| format!("Failed to update outlier video status: {e}"))?;

    Ok(())
}

/// Delete outlier video
pub fn delete_outlier_video_db(id: &str) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM outlier_videos WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete outlier video: {e}"))?;

    Ok(())
}

/// Clear all outlier videos
pub fn clear_all_outliers_db() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM outlier_videos", [])
        .map_err(|e| format!("Failed to clear all outlier videos: {e}"))?;

    Ok(())
}

