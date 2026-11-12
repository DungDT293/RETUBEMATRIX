use super::get_db;
use crate::types::{ChannelStats, ChannelVideo, FollowedChannel, PostingScheduleAnalysis};
use chrono::{Datelike, Timelike, Utc};
use rusqlite::{params, params_from_iter, types::Value};

/// Follow a channel
pub fn follow_channel_db(
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: String,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_audio_bitrate: String,
    download_preferred_fps: String,
    youtube_content_type: String,
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let rows = conn.execute(
        "INSERT OR IGNORE INTO followed_channels (id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, now],
    )
    .map_err(|e| format!("Failed to follow channel: {}", e))?;

    if rows > 0 {
        return Ok(id);
    }

    conn.query_row(
        "SELECT id FROM followed_channels WHERE url = ?1",
        params![url],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| format!("Failed to get existing channel: {}", e))
}

/// Unfollow a channel
pub fn unfollow_channel_db(id: String) -> Result<(), String> {
    let conn = get_db()?;
    // Delete channel videos first (cascade may not work with all SQLite builds)
    conn.execute(
        "DELETE FROM channel_videos WHERE channel_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete channel videos: {}", e))?;
    conn.execute("DELETE FROM followed_channels WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to unfollow channel: {}", e))?;
    Ok(())
}

/// Get all followed channels
pub fn get_followed_channels_db() -> Result<Vec<FollowedChannel>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, url, name, thumbnail, platform, last_checked_at, last_video_id,
                    check_interval, auto_download, download_quality, download_format, created_at,
                    filter_min_duration, filter_max_duration, filter_include_keywords,
                    filter_exclude_keywords, filter_max_videos, download_threads,
                    download_video_codec, download_audio_bitrate, download_preferred_fps,
                    youtube_content_type, total_videos, youtube_channel_id,
                    reup_mod_enabled, reup_mod_speed, reup_mod_pitch, reup_mod_flip, reup_mod_crop,
                    custom_filename_template, risk_status, risk_reason, bkt_test_mode, bkt_profile_id,
                    COALESCE(target_profile_id, bkt_profile_id) AS target_profile_id
             FROM followed_channels ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let channels = stmt
        .query_map([], |row| {
            Ok(FollowedChannel {
                id: row.get(0)?,
                url: row.get(1)?,
                name: row.get(2)?,
                thumbnail: row.get(3)?,
                platform: row.get(4)?,
                last_checked_at: row.get(5)?,
                last_video_id: row.get(6)?,
                check_interval: row.get(7)?,
                auto_download: row.get::<_, i64>(8)? != 0,
                download_quality: row.get(9)?,
                download_format: row.get(10)?,
                created_at: row.get(11)?,
                filter_min_duration: row.get(12)?,
                filter_max_duration: row.get(13)?,
                filter_include_keywords: row.get(14)?,
                filter_exclude_keywords: row.get(15)?,
                filter_max_videos: row.get(16)?,
                download_threads: row.get(17)?,
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
                total_videos: row.get(22)?,
                youtube_channel_id: row.get(23)?,
                reup_mod_enabled: row.get::<_, Option<i64>>(24)?.map(|v| v != 0),
                reup_mod_speed: row.get(25)?,
                reup_mod_pitch: row.get(26)?,
                reup_mod_flip: row.get::<_, Option<i64>>(27)?.map(|v| v != 0),
                reup_mod_crop: row.get(28)?,
                custom_filename_template: row.get(29)?,
                risk_status: row.get(30)?,
                risk_reason: row.get(31)?,
                bkt_test_mode: row.get::<_, Option<i64>>(32)?.map(|v| v != 0),
                bkt_profile_id: row.get(33)?,
                target_profile_id: row.get(34)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(channels)
}

/// Get a single followed channel by ID
pub fn get_followed_channel_db(id: String) -> Result<FollowedChannel, String> {
    let conn = get_db()?;
    conn.query_row(
        "SELECT id, url, name, thumbnail, platform, last_checked_at, last_video_id,
                check_interval, auto_download, download_quality, download_format, created_at,
                filter_min_duration, filter_max_duration, filter_include_keywords,
                filter_exclude_keywords, filter_max_videos, download_threads,
                download_video_codec, download_audio_bitrate, download_preferred_fps,
                youtube_content_type, total_videos, youtube_channel_id,
                reup_mod_enabled, reup_mod_speed, reup_mod_pitch, reup_mod_flip, reup_mod_crop,
                custom_filename_template, risk_status, risk_reason, bkt_test_mode, bkt_profile_id,
                COALESCE(target_profile_id, bkt_profile_id) AS target_profile_id
         FROM followed_channels WHERE id = ?1",
        params![id],
        |row| {
            Ok(FollowedChannel {
                id: row.get(0)?,
                url: row.get(1)?,
                name: row.get(2)?,
                thumbnail: row.get(3)?,
                platform: row.get(4)?,
                last_checked_at: row.get(5)?,
                last_video_id: row.get(6)?,
                check_interval: row.get(7)?,
                auto_download: row.get::<_, i64>(8)? != 0,
                download_quality: row.get(9)?,
                download_format: row.get(10)?,
                created_at: row.get(11)?,
                filter_min_duration: row.get(12)?,
                filter_max_duration: row.get(13)?,
                filter_include_keywords: row.get(14)?,
                filter_exclude_keywords: row.get(15)?,
                filter_max_videos: row.get(16)?,
                download_threads: row.get(17)?,
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
                total_videos: row.get(22)?,
                youtube_channel_id: row.get(23)?,
                reup_mod_enabled: row.get::<_, Option<i64>>(24)?.map(|v| v != 0),
                reup_mod_speed: row.get(25)?,
                reup_mod_pitch: row.get(26)?,
                reup_mod_flip: row.get::<_, Option<i64>>(27)?.map(|v| v != 0),
                reup_mod_crop: row.get(28)?,
                custom_filename_template: row.get(29)?,
                risk_status: row.get(30)?,
                risk_reason: row.get(31)?,
                bkt_test_mode: row.get::<_, Option<i64>>(32)?.map(|v| v != 0),
                bkt_profile_id: row.get(33)?,
                target_profile_id: row.get(34)?,
            })
        },
    )
    .map_err(|e| format!("Channel not found: {}", e))
}

/// Update channel settings
pub fn update_channel_settings_db(
    id: String,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_audio_bitrate: String,
    download_preferred_fps: String,
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: i64,
    youtube_content_type: String,
    reup_mod_enabled: Option<bool>,
    reup_mod_speed: Option<f64>,
    reup_mod_pitch: Option<f64>,
    reup_mod_flip: Option<bool>,
    reup_mod_crop: Option<f64>,
    custom_filename_template: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET
            check_interval = ?1, auto_download = ?2, download_quality = ?3,
            download_format = ?4, download_video_codec = ?5, download_audio_bitrate = ?6,
            download_preferred_fps = ?7, filter_min_duration = ?8, filter_max_duration = ?9,
            filter_include_keywords = ?10, filter_exclude_keywords = ?11, filter_max_videos = ?12,
            download_threads = ?13, youtube_content_type = ?14,
            reup_mod_enabled = ?15, reup_mod_speed = ?16, reup_mod_pitch = ?17,
            reup_mod_flip = ?18, reup_mod_crop = ?19, custom_filename_template = ?20
         WHERE id = ?21",
        params![
            check_interval,
            auto_download as i64,
            download_quality,
            download_format,
            download_video_codec,
            download_audio_bitrate,
            download_preferred_fps,
            filter_min_duration,
            filter_max_duration,
            filter_include_keywords,
            filter_exclude_keywords,
            filter_max_videos,
            download_threads,
            youtube_content_type,
            reup_mod_enabled.map(|v| if v { 1 } else { 0 }),
            reup_mod_speed,
            reup_mod_pitch,
            reup_mod_flip.map(|v| if v { 1 } else { 0 }),
            reup_mod_crop,
            custom_filename_template,
            id,
        ],
    )
    .map_err(|e| format!("Failed to update channel settings: {}", e))?;
    Ok(())
}

/// Update last checked info for a channel
pub fn update_channel_last_checked_db(
    id: String,
    last_video_id: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE followed_channels SET last_checked_at = ?1, last_video_id = ?2 WHERE id = ?3",
        params![now, last_video_id, id],
    )
    .map_err(|e| format!("Failed to update last checked: {}", e))?;
    Ok(())
}

/// Update YouTube Channel ID (UC...) for fast RSS polling
pub fn update_channel_youtube_id_db(id: &str, youtube_channel_id: &str) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET youtube_channel_id = ?1 WHERE id = ?2",
        params![youtube_channel_id, id],
    )
    .map_err(|e| format!("Failed to update youtube_channel_id: {}", e))?;
    Ok(())
}

/// Update BKT test mode and profile for a followed channel
pub fn update_channel_bkt_config_db(
    channel_id: &str,
    bkt_test_mode: bool,
    bkt_profile_id: Option<&str>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET
            bkt_test_mode = ?1,
            bkt_profile_id = ?2,
            target_profile_id = ?2
         WHERE id = ?3",
        params![if bkt_test_mode { 1 } else { 0 }, bkt_profile_id, channel_id],
    )
    .map_err(|e| format!("Failed to update channel BKT config: {}", e))?;
    Ok(())
}

/// Update risk evaluation and BKT status for a channel video
pub fn update_channel_video_risk_db(
    channel_id: &str,
    video_id: &str,
    risk_status: &str,
    risk_reason: Option<&str>,
    is_bkt_test: bool,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET
            risk_status = ?1,
            risk_reason = ?2,
            is_bkt_test = ?3
         WHERE (channel_id = ?4 OR ?4 = '') AND (video_id = ?5 OR id = ?5)",
        params![risk_status, risk_reason, if is_bkt_test { 1 } else { 0 }, channel_id, video_id],
    )
    .map_err(|e| format!("Failed to update video risk: {}", e))?;

    if !channel_id.is_empty() {
        let _ = recalculate_channel_risk_with_conn(&conn, channel_id);
    } else {
        let _ = recalculate_channel_risk_by_video_with_conn(&conn, video_id);
    }

    Ok(())
}

/// Update BKT check status, restriction, and YouTube ID after unlisted test upload
pub fn update_channel_video_bkt_status_db(
    video_id: &str,
    status: &str,
    restriction: Option<&str>,
    bkt_youtube_id: Option<&str>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET
            bkt_check_status = ?1,
            bkt_restriction = COALESCE(?2, bkt_restriction),
            bkt_youtube_id = COALESCE(?3, bkt_youtube_id)
         WHERE video_id = ?4",
        params![status, restriction, bkt_youtube_id, video_id],
    )
    .map_err(|e| format!("Failed to update BKT check status: {}", e))?;
    let _ = recalculate_channel_risk_by_video_with_conn(&conn, video_id);
    Ok(())
}

/// Recalculate channel risk status using an already-locked connection.
/// IMPORTANT: DB_CONNECTION uses a non-reentrant std::sync::Mutex, so nested helpers MUST share `conn`.
pub fn recalculate_channel_risk_with_conn(
    conn: &rusqlite::Connection,
    channel_id: &str,
) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT video_id, risk_status, bkt_check_status FROM channel_videos
             WHERE channel_id = ?1
             ORDER BY COALESCE(upload_timestamp, 0) DESC, created_at DESC LIMIT 50",
        )
        .map_err(|e| format!("Query videos error: {}", e))?;

    let rows: Vec<(String, Option<String>, Option<String>)> = stmt
        .query_map(params![channel_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| format!("Map error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut consecutive_red = 0;
    let mut max_consecutive_red = 0;
    let mut total_red = 0;

    for (_vid, risk_opt, bkt_opt) in &rows {
        let is_red = risk_opt.as_deref() == Some("red") || bkt_opt.as_deref() == Some("red_matched");
        if is_red {
            consecutive_red += 1;
            total_red += 1;
            if consecutive_red > max_consecutive_red {
                max_consecutive_red = consecutive_red;
            }
        } else {
            consecutive_red = 0;
        }
    }

    let (status, reason, disable_auto) = if max_consecutive_red >= 2 {
        ("red", "Phát hiện 2 video liên tiếp dính bản quyền (Khóa kênh & ngừng tải tự động)", true)
    } else if total_red >= 1 {
        ("yellow", "Kênh có video dính bản quyền (Cảnh báo rủi ro)", false)
    } else {
        ("green", "Kênh sạch bản quyền (Toàn bộ video an toàn)", false)
    };

    if disable_auto {
        conn.execute(
            "UPDATE followed_channels SET risk_status = ?1, risk_reason = ?2, auto_download = 0 WHERE id = ?3",
            params![status, reason, channel_id],
        )
        .map_err(|e| format!("Update channel risk error: {}", e))?;
    } else {
        conn.execute(
            "UPDATE followed_channels SET risk_status = ?1, risk_reason = ?2 WHERE id = ?3",
            params![status, reason, channel_id],
        )
        .map_err(|e| format!("Update channel risk error: {}", e))?;
    }

    Ok(status.to_string())
}

/// Find channel_id by video_id and recalculate channel risk using an already-locked connection.
pub fn recalculate_channel_risk_by_video_with_conn(
    conn: &rusqlite::Connection,
    video_id: &str,
) -> Result<Option<String>, String> {
    let channel_id: Option<String> = conn
        .query_row(
            "SELECT channel_id FROM channel_videos WHERE video_id = ?1 OR id = ?1 LIMIT 1",
            params![video_id],
            |r| r.get(0),
        )
        .ok();

    if let Some(cid) = channel_id {
        let res = recalculate_channel_risk_with_conn(conn, &cid)?;
        Ok(Some(res))
    } else {
        Ok(None)
    }
}

/// Recalculate channel risk status based on videos:
/// - 2 consecutive videos with copyright issue ('red') -> channel marked RED (Blacklisted, stop scanning/downloading)
/// - 1 video with copyright issue -> channel marked YELLOW
/// - Otherwise -> channel marked GREEN
pub fn recalculate_channel_risk_db(channel_id: &str) -> Result<String, String> {
    let conn = get_db()?;
    recalculate_channel_risk_with_conn(&conn, channel_id)
}

/// Automatically find channel_id by video_id and recalculate channel risk
pub fn recalculate_channel_risk_by_video_db(video_id: &str) -> Result<Option<String>, String> {
    let conn = get_db()?;
    recalculate_channel_risk_by_video_with_conn(&conn, video_id)
}

/// Check if a video already exists in channel_videos
pub fn has_channel_video_db(channel_id: &str, video_id: &str) -> Result<bool, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT 1 FROM channel_videos WHERE channel_id = ?1 AND video_id = ?2 LIMIT 1")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    let exists = stmt.exists(params![channel_id, video_id]).unwrap_or(false);
    Ok(exists)
}

/// Save channel videos (upsert - skip existing or update metadata)
pub fn save_channel_videos_db(
    channel_id: String,
    videos: Vec<ChannelVideo>,
) -> Result<usize, String> {
    let conn = get_db()?;
    let mut inserted = 0;

    for video in &videos {
        let video_type = video
            .video_type
            .clone()
            .unwrap_or_else(|| "video".to_string());
        let result = conn.execute(
            "INSERT INTO channel_videos
                (id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                 risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
             ON CONFLICT(channel_id, video_id) DO UPDATE SET
                upload_timestamp = COALESCE(excluded.upload_timestamp, channel_videos.upload_timestamp),
                video_type = COALESCE(excluded.video_type, channel_videos.video_type),
                duration = COALESCE(excluded.duration, channel_videos.duration),
                upload_date = COALESCE(excluded.upload_date, channel_videos.upload_date),
                thumbnail = COALESCE(excluded.thumbnail, channel_videos.thumbnail),
                view_count = COALESCE(excluded.view_count, channel_videos.view_count),
                risk_status = COALESCE(excluded.risk_status, channel_videos.risk_status),
                risk_reason = COALESCE(excluded.risk_reason, channel_videos.risk_reason),
                is_bkt_test = COALESCE(excluded.is_bkt_test, channel_videos.is_bkt_test),
                bkt_youtube_id = COALESCE(excluded.bkt_youtube_id, channel_videos.bkt_youtube_id),
                bkt_check_status = COALESCE(excluded.bkt_check_status, channel_videos.bkt_check_status),
                bkt_restriction = COALESCE(excluded.bkt_restriction, channel_videos.bkt_restriction),
                reup_pipeline_level = COALESCE(excluded.reup_pipeline_level, channel_videos.reup_pipeline_level)",
            params![
                video.id,
                channel_id,
                video.video_id,
                video.title,
                video.url,
                video.thumbnail,
                video.duration,
                video.upload_date,
                video.upload_timestamp,
                video_type,
                video.status,
                video.created_at,
                video.view_count,
                video.risk_status.as_deref().unwrap_or("green"),
                video.risk_reason,
                video.is_bkt_test.map(|v| if v { 1 } else { 0 }).unwrap_or(0),
                video.bkt_youtube_id,
                video.bkt_check_status,
                video.bkt_restriction,
                video.reup_pipeline_level.unwrap_or(1),
            ],
        );

        if let Ok(rows) = result {
            if rows > 0 {
                inserted += 1;
            }
        }
    }

    Ok(inserted)
}

/// Get videos for a channel
pub fn get_channel_videos_db(
    channel_id: String,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ChannelVideo>, String> {
    let conn = get_db()?;
    let limit_val = limit.unwrap_or(0);

    let has_status = status
        .as_ref()
        .map(|s| !s.is_empty() && s != "all")
        .unwrap_or(false);

    let parse_row = |row: &rusqlite::Row| -> rusqlite::Result<ChannelVideo> {
        Ok(ChannelVideo {
            id: row.get(0)?,
            channel_id: row.get(1)?,
            video_id: row.get(2)?,
            title: row.get(3)?,
            url: row.get(4)?,
            thumbnail: row.get(5)?,
            duration: row.get(6)?,
            upload_date: row.get(7)?,
            upload_timestamp: row.get(8)?,
            video_type: row.get(9)?,
            status: row.get(10)?,
            created_at: row.get(11)?,
            view_count: row.get(12)?,
            risk_status: row.get(13)?,
            risk_reason: row.get(14)?,
            is_bkt_test: row.get::<_, Option<i64>>(15)?.map(|v| v != 0),
            bkt_youtube_id: row.get(16)?,
            bkt_check_status: row.get(17)?,
            bkt_restriction: row.get(18)?,
            reup_pipeline_level: row.get(19)?,
        })
    };

    let videos: Vec<ChannelVideo> = if has_status {
        let s = status.unwrap();
        if limit_val > 0 {
            let mut stmt = conn
                .prepare(
                    "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                            risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
                     FROM channel_videos WHERE channel_id = ?1 AND status = ?2
                     ORDER BY created_at DESC LIMIT ?3",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let res = stmt.query_map(params![channel_id, s, limit_val], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            res
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                            risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
                     FROM channel_videos WHERE channel_id = ?1 AND status = ?2
                     ORDER BY created_at DESC",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let res = stmt.query_map(params![channel_id, s], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            res
        }
    } else {
        if limit_val > 0 {
            let mut stmt = conn
                .prepare(
                    "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                            risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
                     FROM channel_videos WHERE channel_id = ?1
                     ORDER BY created_at DESC LIMIT ?2",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let res = stmt.query_map(params![channel_id, limit_val], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            res
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                            risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
                     FROM channel_videos WHERE channel_id = ?1
                     ORDER BY created_at DESC",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let res = stmt.query_map(params![channel_id], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            res
        }
    };

    Ok(videos)
}

/// Get videos for a channel by exact video IDs
pub fn get_channel_videos_by_video_ids_db(
    channel_id: String,
    video_ids: Vec<String>,
) -> Result<Vec<ChannelVideo>, String> {
    if video_ids.is_empty() {
        return Ok(Vec::new());
    }

    let conn = get_db()?;
    sync_channel_video_statuses_from_history(&conn, &channel_id, &video_ids)?;

    let placeholders = std::iter::repeat("?")
        .take(video_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
         FROM channel_videos
         WHERE channel_id = ? AND video_id IN ({placeholders})"
    );

    let mut values = Vec::with_capacity(video_ids.len() + 1);
    values.push(Value::Text(channel_id));
    values.extend(video_ids.into_iter().map(Value::Text));

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let videos = stmt
        .query_map(params_from_iter(values), |row| {
            Ok(ChannelVideo {
                id: row.get(0)?,
                channel_id: row.get(1)?,
                video_id: row.get(2)?,
                title: row.get(3)?,
                url: row.get(4)?,
                thumbnail: row.get(5)?,
                duration: row.get(6)?,
                upload_date: row.get(7)?,
                upload_timestamp: row.get(8)?,
                video_type: row.get(9)?,
                status: row.get(10)?,
                created_at: row.get(11)?,
                view_count: row.get(12)?,
                risk_status: row.get(13)?,
                risk_reason: row.get(14)?,
                is_bkt_test: row.get::<_, Option<i64>>(15)?.map(|v| v != 0),
                bkt_youtube_id: row.get(16)?,
                bkt_check_status: row.get(17)?,
                bkt_restriction: row.get(18)?,
                reup_pipeline_level: row.get(19)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(videos)
}

fn sync_channel_video_statuses_from_history(
    conn: &rusqlite::Connection,
    channel_id: &str,
    video_ids: &[String],
) -> Result<(), String> {
    if video_ids.is_empty() {
        return Ok(());
    }

    let placeholders = std::iter::repeat("?")
        .take(video_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT cv.id, h.filepath
         FROM channel_videos cv
         JOIN history h ON h.filepath != ''
            AND (h.url = cv.url OR h.url LIKE '%' || cv.video_id || '%')
         WHERE cv.channel_id = ?
            AND cv.video_id IN ({placeholders})
            AND cv.status != 'downloaded'"
    );

    let mut values = Vec::with_capacity(video_ids.len() + 1);
    values.push(Value::Text(channel_id.to_string()));
    values.extend(video_ids.iter().cloned().map(Value::Text));

    let candidate_ids = {
        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare history sync query: {}", e))?;
        let rows = stmt
            .query_map(params_from_iter(values), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("History sync query failed: {}", e))?;
        rows.filter_map(|row| row.ok())
            .filter(|(_, filepath)| std::path::Path::new(filepath).exists())
            .map(|(id, _)| id)
            .collect::<Vec<_>>()
    };

    for id in candidate_ids {
        conn.execute(
            "UPDATE channel_videos SET status = 'downloaded' WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to sync channel video status from history: {}", e))?;
    }

    Ok(())
}

/// Update video status
pub fn update_channel_video_status_db(id: String, status: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| format!("Failed to update video status: {}", e))?;
    Ok(())
}

/// Update video status by channel_id + video_id (YouTube video ID)
pub fn update_channel_video_status_by_video_id_db(
    channel_id: String,
    video_id: String,
    status: String,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET status = ?1 WHERE channel_id = ?2 AND video_id = ?3",
        params![status, channel_id, video_id],
    )
    .map_err(|e| format!("Failed to update video status: {}", e))?;
    Ok(())
}

/// Get channel_id for a followed channel by URL
pub fn get_channel_id_by_url_db(url: String) -> Result<Option<String>, String> {
    let conn = get_db()?;
    let result = conn.query_row(
        "SELECT id FROM followed_channels WHERE url = ?1",
        params![url],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get channel id: {}", e)),
    }
}

/// Update channel name and thumbnail (avatar)
pub fn update_channel_info_db(
    id: String,
    name: String,
    thumbnail: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET name = ?1, thumbnail = ?2 WHERE id = ?3",
        params![name, thumbnail, id],
    )
    .map_err(|e| format!("Failed to update channel info: {}", e))?;
    Ok(())
}

/// Get count of new videos for a channel
pub fn get_new_videos_count_db(channel_id: Option<String>) -> Result<i64, String> {
    let conn = get_db()?;
    let count: i64 = if let Some(cid) = channel_id {
        conn.query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE channel_id = ?1 AND status = 'new'",
            params![cid],
            |row| row.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE status = 'new'",
            [],
            |row| row.get(0),
        )
    }
    .map_err(|e| format!("Failed to count new videos: {}", e))?;

    Ok(count)
}

/// Update total videos count for a channel
pub fn update_channel_total_videos_db(channel_id: &str, total_videos: i64) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET total_videos = ?1 WHERE id = ?2",
        params![total_videos, channel_id],
    )
    .map_err(|e| format!("Failed to update total videos: {}", e))?;
    Ok(())
}

/// Extract effective timestamp: from upload_timestamp if available, or parse upload_date (YYYYMMDD)
fn get_effective_timestamp(video: &ChannelVideo) -> Option<i64> {
    if let Some(ts) = video.upload_timestamp {
        if ts > 0 {
            return Some(ts);
        }
    }
    if let Some(date_str) = &video.upload_date {
        let clean = date_str.trim();
        if clean.len() == 8 && clean.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(naive) = chrono::NaiveDate::parse_from_str(clean, "%Y%m%d") {
                return naive.and_hms_opt(12, 0, 0).map(|dt| dt.and_utc().timestamp());
            }
        } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(clean) {
            return Some(dt.timestamp());
        }
    }
    None
}

/// Analyze posting schedule for a list of videos
pub fn analyze_posting_schedule(videos: &[ChannelVideo]) -> Option<PostingScheduleAnalysis> {
    if videos.is_empty() {
        return None;
    }

    let mut hour_weights = [0f64; 24];
    let mut day_weights = [0f64; 8]; // 1-indexed: 1 = Mon .. 7 = Sun
    let mut day_counts = [0usize; 8];
    let mut exact_hour_samples = 0usize;
    let mut total_samples = 0usize;

    // Sort videos by effective timestamp descending (newest first)
    let mut sorted_videos: Vec<&ChannelVideo> = videos.iter().collect();
    sorted_videos.sort_by(|a, b| {
        let ts_a = get_effective_timestamp(a).unwrap_or(0);
        let ts_b = get_effective_timestamp(b).unwrap_or(0);
        ts_b.cmp(&ts_a)
    });

    // Lấy tối đa 30 video gần nhất để phản ánh đúng lịch đăng và tần suất hiện tại
    let analysis_sample: Vec<&ChannelVideo> = sorted_videos.into_iter().take(30).collect();

    for (idx, video) in analysis_sample.iter().enumerate() {
        let ts = match get_effective_timestamp(video) {
            Some(ts) => ts,
            None => continue,
        };

        if let Some(dt) = chrono::DateTime::from_timestamp(ts, 0) {
            let local_dt = dt.with_timezone(&chrono::Local);
            let day = local_dt.weekday().number_from_monday() as usize;

            // Trọng số ưu tiên video gần nhất: 5 video mới nhất weight 4, 7 video tiếp theo weight 2, còn lại weight 1
            let weight = if idx < 5 {
                4.0
            } else if idx < 12 {
                2.0
            } else {
                1.0
            };

            // Chỉ tính giờ đối với timestamp thực tế (không phải timestamp giả định từ upload_date)
            if let Some(raw_ts) = video.upload_timestamp {
                let is_dummy_midnight = (raw_ts % 86400) == 0;
                if !is_dummy_midnight {
                    if let Some(raw_dt) = chrono::DateTime::from_timestamp(raw_ts, 0) {
                        let hour = raw_dt.with_timezone(&chrono::Local).hour() as usize;
                        if hour < 24 {
                            hour_weights[hour] += weight;
                            exact_hour_samples += 1;
                        }
                    }
                }
            }

            if (1..=7).contains(&day) {
                day_weights[day] += weight;
                day_counts[day] += 1;
            }
            total_samples += 1;
        }
    }

    if total_samples == 0 {
        return None;
    }

    // 1. Tính tần suất đăng (Frequency) dựa trên khoảng cách trung vị (median interval) giữa các video gần nhất
    let recent_ts: Vec<i64> = analysis_sample
        .iter()
        .filter_map(|v| get_effective_timestamp(v))
        .take(15)
        .collect();

    let freq_str = if recent_ts.len() >= 2 {
        let mut intervals = Vec::new();
        for i in 0..recent_ts.len() - 1 {
            let diff = (recent_ts[i] - recent_ts[i + 1]).abs();
            // Bỏ qua các khoảng nghỉ bất thường (> 60 ngày)
            if diff < 60 * 86400 {
                intervals.push(diff);
            }
        }

        let span_days = (recent_ts[0] - recent_ts[recent_ts.len() - 1]).abs() as f64 / 86400.0;
        let rate_per_day = recent_ts.len() as f64 / span_days.max(1.0);

        if !intervals.is_empty() {
            intervals.sort();
            let median_secs = intervals[intervals.len() / 2];
            let median_days = median_secs as f64 / 86400.0;

            if rate_per_day >= 1.7 || median_days <= 0.6 {
                let vpd = rate_per_day.round().max(2.0);
                format!("~{:.0} video/ngày", vpd)
            } else if rate_per_day >= 0.7 || median_days <= 1.3 {
                "Hàng ngày (~1 video/ngày)".to_string()
            } else if rate_per_day * 7.0 >= 3.5 || median_days <= 2.2 {
                "~4-5 video/tuần".to_string()
            } else if rate_per_day * 7.0 >= 1.8 || median_days <= 3.8 {
                "~2-3 video/tuần".to_string()
            } else if rate_per_day * 7.0 >= 0.7 || median_days <= 8.0 {
                "~1 video/tuần".to_string()
            } else if rate_per_day * 30.0 >= 1.5 || median_days <= 18.0 {
                "~2 video/tháng".to_string()
            } else {
                "~1 video/tháng".to_string()
            }
        } else if rate_per_day >= 0.7 {
            "Hàng ngày (~1 video/ngày)".to_string()
        } else {
            let vpw = (rate_per_day * 7.0).round().max(1.0);
            format!("~{:.0} video/tuần", vpw)
        }
    } else {
        String::new()
    };

    // 2. Tìm 3-hour sliding window có trọng số video cao nhất
    let mut time_range: Option<String> = None;

    if exact_hour_samples > 0 {
        let mut max_score = 0.0f64;
        let mut best_start_hour = 0usize;

        for start in 0..24 {
            let score = hour_weights[start]
                + hour_weights[(start + 1) % 24]
                + hour_weights[(start + 2) % 24];
            if score > max_score {
                max_score = score;
                best_start_hour = start;
            }
        }

        if max_score > 0.0 {
            let mid_hour = (best_start_hour + 1) % 24;
            let session_str = if (5..11).contains(&mid_hour) {
                "Sáng"
            } else if (11..14).contains(&mid_hour) {
                "Trưa"
            } else if (14..18).contains(&mid_hour) {
                "Chiều"
            } else if (18..22).contains(&mid_hour) {
                "Tối"
            } else if best_start_hour == 21 || best_start_hour == 22 {
                "Tối - Đêm"
            } else {
                "Đêm"
            };

            time_range = Some(format!(
                "{} ({:02}:00 - {:02}:00)",
                session_str,
                best_start_hour,
                (best_start_hour + 3) % 24
            ));
        }
    }

    // 3. Sắp xếp thứ trong tuần theo trọng số video
    let mut days_with_weights: Vec<(u8, f64, usize)> = (1..=7)
        .map(|d| (d as u8, day_weights[d as usize], day_counts[d as usize]))
        .filter(|(_, _, count)| *count > 0)
        .collect();

    days_with_weights.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });
    let top_days: Vec<u8> = days_with_weights.iter().take(3).map(|(d, _, _)| *d).collect();

    let day_name = |d: u8| -> &'static str {
        match d {
            1 => "Thứ 2",
            2 => "Thứ 3",
            3 => "Thứ 4",
            4 => "Thứ 5",
            5 => "Thứ 6",
            6 => "Thứ 7",
            7 => "Chủ nhật",
            _ => "",
        }
    };

    let days_str = if top_days.is_empty() {
        "N/A".to_string()
    } else {
        let mut sorted_top = top_days.clone();
        sorted_top.sort();
        sorted_top
            .iter()
            .map(|&d| day_name(d))
            .collect::<Vec<_>>()
            .join(", ")
    };

    // Ghép định dạng hiển thị thông minh: Tần suất • Khung giờ (Thứ)
    let formatted = match (&time_range, freq_str.is_empty()) {
        (Some(tr), false) => {
            if freq_str.contains("Hàng ngày") {
                format!("{} • {}", freq_str, tr)
            } else {
                format!("{} • {} ({})", freq_str, tr, days_str)
            }
        }
        (Some(tr), true) => format!("{} ({})", days_str, tr),
        (None, false) => format!("{} ({})", freq_str, days_str),
        (None, true) => days_str,
    };

    Some(PostingScheduleAnalysis {
        time_range,
        top_days,
        formatted,
        sample_size: total_samples,
    })
}

/// Get statistics for a specific channel
pub fn get_channel_stats_db(channel_id: &str) -> Result<ChannelStats, String> {
    let conn = get_db()?;

    let total_videos: Option<i64> = conn
        .query_row(
            "SELECT total_videos FROM followed_channels WHERE id = ?1",
            params![channel_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Channel not found: {}", e))?;

    let total_scanned: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE channel_id = ?1",
            params![channel_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_downloaded: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE channel_id = ?1 AND status = 'downloaded'",
            params![channel_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Fetch videos for posting schedule analysis (up to 500 recent videos)
    let mut stmt = conn
        .prepare(
            "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, upload_timestamp, video_type, status, created_at, view_count,
                    risk_status, risk_reason, is_bkt_test, bkt_youtube_id, bkt_check_status, bkt_restriction, reup_pipeline_level
             FROM channel_videos WHERE channel_id = ?1
             ORDER BY upload_timestamp DESC, upload_date DESC, created_at DESC LIMIT 500",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let videos: Vec<ChannelVideo> = stmt
        .query_map(params![channel_id], |row| {
            Ok(ChannelVideo {
                id: row.get(0)?,
                channel_id: row.get(1)?,
                video_id: row.get(2)?,
                title: row.get(3)?,
                url: row.get(4)?,
                thumbnail: row.get(5)?,
                duration: row.get(6)?,
                upload_date: row.get(7)?,
                upload_timestamp: row.get(8)?,
                video_type: row.get(9)?,
                status: row.get(10)?,
                created_at: row.get(11)?,
                view_count: row.get(12)?,
                risk_status: row.get(13)?,
                risk_reason: row.get(14)?,
                is_bkt_test: row.get::<_, Option<i64>>(15)?.map(|v| v != 0),
                bkt_youtube_id: row.get(16)?,
                bkt_check_status: row.get(17)?,
                bkt_restriction: row.get(18)?,
                reup_pipeline_level: row.get(19)?,
            })
        })
        .map_err(|e| format!("Failed to query videos for stats: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let posting_schedule = analyze_posting_schedule(&videos);

    Ok(ChannelStats {
        channel_id: channel_id.to_string(),
        total_videos,
        total_scanned,
        total_downloaded,
        posting_schedule,
    })
}

/// Get statistics for all followed channels
pub fn get_all_channels_stats_db() -> Result<Vec<ChannelStats>, String> {
    let channels = get_followed_channels_db()?;
    let mut stats = Vec::with_capacity(channels.len());
    for channel in channels {
        if let Ok(stat) = get_channel_stats_db(&channel.id) {
            stats.push(stat);
        }
    }
    Ok(stats)
}

/// Toggle auto-download for a channel
pub fn toggle_channel_auto_download_db(channel_id: &str, enabled: bool) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET auto_download = ?1 WHERE id = ?2",
        params![enabled as i64, channel_id],
    )
    .map_err(|e| format!("Failed to toggle channel auto download: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{db_test_guard, get_db, DB_CONNECTION};
    use std::sync::Mutex;

    fn ensure_test_channel_tables() {
        if DB_CONNECTION.get().is_none() {
            let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
            let _ = DB_CONNECTION.set(Mutex::new(conn));
        }

        let conn = get_db().expect("get db");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS followed_channels (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                thumbnail TEXT,
                platform TEXT NOT NULL DEFAULT 'youtube',
                last_checked_at TEXT,
                last_video_id TEXT,
                check_interval INTEGER NOT NULL DEFAULT 15,
                auto_download INTEGER NOT NULL DEFAULT 0,
                download_quality TEXT NOT NULL DEFAULT 'best',
                download_format TEXT NOT NULL DEFAULT 'mp4',
                created_at TEXT NOT NULL,
                filter_min_duration INTEGER,
                filter_max_duration INTEGER,
                filter_include_keywords TEXT,
                filter_exclude_keywords TEXT,
                filter_max_videos INTEGER,
                download_threads INTEGER NOT NULL DEFAULT 1,
                download_video_codec TEXT NOT NULL DEFAULT 'h264',
                download_audio_bitrate TEXT NOT NULL DEFAULT '192',
                download_preferred_fps TEXT NOT NULL DEFAULT 'original',
                youtube_content_type TEXT NOT NULL DEFAULT 'videos',
                total_videos INTEGER,
                youtube_channel_id TEXT,
                reup_mod_enabled INTEGER DEFAULT 0,
                reup_mod_speed REAL DEFAULT 1.03,
                reup_mod_pitch REAL DEFAULT 1.02,
                reup_mod_flip INTEGER DEFAULT 0,
                reup_mod_crop REAL DEFAULT 0.015,
                custom_filename_template TEXT,
                risk_status TEXT DEFAULT 'green',
                risk_reason TEXT,
                bkt_test_mode INTEGER DEFAULT 0,
                bkt_profile_id TEXT,
                target_profile_id TEXT
            );
            CREATE TABLE IF NOT EXISTS channel_videos (
                id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                thumbnail TEXT,
                duration REAL,
                upload_date TEXT,
                upload_timestamp INTEGER,
                video_type TEXT DEFAULT 'video',
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL,
                view_count INTEGER,
                risk_status TEXT DEFAULT 'green',
                risk_reason TEXT,
                is_bkt_test INTEGER DEFAULT 0,
                bkt_youtube_id TEXT,
                bkt_check_status TEXT,
                bkt_restriction TEXT,
                reup_pipeline_level INTEGER DEFAULT 1
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_videos_unique
                ON channel_videos(channel_id, video_id);
            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                thumbnail TEXT,
                filepath TEXT NOT NULL,
                filesize INTEGER,
                duration INTEGER,
                quality TEXT,
                format TEXT,
                source TEXT,
                downloaded_at INTEGER NOT NULL,
                summary TEXT,
                time_range TEXT
            );
            DELETE FROM history;
            DELETE FROM channel_videos;
            DELETE FROM followed_channels;",
        )
        .expect("create channel videos table");
        conn.execute(
            "ALTER TABLE followed_channels ADD COLUMN target_profile_id TEXT",
            [],
        )
        .ok();
    }

    fn insert_channel_video(channel_id: &str, video_id: &str, status: &str, created_at: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO channel_videos
                (id, channel_id, video_id, title, url, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                channel_id,
                video_id,
                format!("Video {video_id}"),
                format!("https://youtube.com/watch?v={video_id}"),
                status,
                created_at,
            ],
        )
        .expect("insert channel video");
    }

    fn make_temp_download_file() -> String {
        let dir =
            std::env::temp_dir().join(format!("youwee-channel-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("download.mp4");
        std::fs::write(&path, b"download").expect("write temp download");
        path.to_string_lossy().to_string()
    }

    fn insert_history_row(url: &str, filepath: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, downloaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                url,
                "Downloaded video",
                filepath,
                0_i64,
            ],
        )
        .expect("insert history row");
    }

    #[test]
    fn get_channel_videos_by_video_ids_returns_requested_old_records() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        for index in 0..200 {
            insert_channel_video(
                "channel-1",
                &format!("video-{index}"),
                if index % 2 == 0 { "downloaded" } else { "new" },
                &format!("2026-06-17T00:{index:03}:00Z"),
            );
        }

        let videos = get_channel_videos_by_video_ids_db(
            "channel-1".to_string(),
            vec![
                "video-0".to_string(),
                "video-42".to_string(),
                "video-199".to_string(),
            ],
        )
        .expect("get videos by ids");

        let statuses: std::collections::HashMap<_, _> = videos
            .into_iter()
            .map(|video| (video.video_id, video.status))
            .collect();

        assert_eq!(
            statuses.get("video-0").map(String::as_str),
            Some("downloaded")
        );
        assert_eq!(
            statuses.get("video-42").map(String::as_str),
            Some("downloaded")
        );
        assert_eq!(statuses.get("video-199").map(String::as_str), Some("new"));
    }

    #[test]
    fn get_channel_videos_by_video_ids_marks_existing_history_file_as_downloaded() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        insert_channel_video("channel-1", "abc123", "new", "2026-06-17T00:00:00Z");
        let filepath = make_temp_download_file();
        insert_history_row("https://www.youtube.com/watch?v=abc123", &filepath);

        let videos =
            get_channel_videos_by_video_ids_db("channel-1".to_string(), vec!["abc123".to_string()])
                .expect("get videos by ids");

        assert_eq!(
            videos.first().map(|video| video.status.as_str()),
            Some("downloaded")
        );
    }

    #[test]
    fn follow_channel_db_returns_existing_id_for_duplicate_url() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        let first_id = follow_channel_db(
            "https://www.youtube.com/@demo".to_string(),
            "Demo".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
        )
        .expect("follow channel first time");

        let second_id = follow_channel_db(
            "https://www.youtube.com/@demo".to_string(),
            "Demo again".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
        )
        .expect("follow channel second time");

        let count: i64 = get_db()
            .expect("get db")
            .query_row(
                "SELECT COUNT(*) FROM followed_channels WHERE url = ?1",
                params!["https://www.youtube.com/@demo"],
                |row| row.get(0),
            )
            .expect("count followed channels");

        assert_eq!(second_id, first_id);
        assert_eq!(count, 1);
    }

    #[test]
    fn analyze_posting_schedule_detects_distribution() {
        let sample_videos = vec![
            ChannelVideo {
                id: "1".to_string(),
                channel_id: "ch1".to_string(),
                video_id: "v1".to_string(),
                title: "V1".to_string(),
                url: "url1".to_string(),
                thumbnail: None,
                duration: Some(120.0),
                upload_date: Some("20240101".to_string()),
                upload_timestamp: Some(1704110400), // 2024-01-01 12:00:00 UTC (Monday)
                video_type: Some("video".to_string()),
                status: "new".to_string(),
                created_at: "2024-01-01T12:00:00Z".to_string(),
                view_count: None,
                risk_status: None,
                risk_reason: None,
                is_bkt_test: None,
                bkt_youtube_id: None,
                bkt_check_status: None,
                bkt_restriction: None,
                reup_pipeline_level: None,
            },
            ChannelVideo {
                id: "2".to_string(),
                channel_id: "ch1".to_string(),
                video_id: "v2".to_string(),
                title: "V2".to_string(),
                url: "url2".to_string(),
                thumbnail: None,
                duration: Some(120.0),
                upload_date: Some("20240108".to_string()),
                upload_timestamp: Some(1704715200), // 2024-01-08 12:00:00 UTC (Monday)
                video_type: Some("video".to_string()),
                status: "new".to_string(),
                created_at: "2024-01-08T12:00:00Z".to_string(),
                view_count: None,
                risk_status: None,
                risk_reason: None,
                is_bkt_test: None,
                bkt_youtube_id: None,
                bkt_check_status: None,
                bkt_restriction: None,
                reup_pipeline_level: None,
            },
        ];

        let analysis = analyze_posting_schedule(&sample_videos);
        assert!(analysis.is_some());
        let a = analysis.unwrap();
        assert_eq!(a.sample_size, 2);
        assert_eq!(a.top_days, vec![1]); // Monday = 1
        assert!(a.time_range.is_some());
    }

    #[test]
    fn channel_stats_and_toggle_auto_download() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        let channel_id = follow_channel_db(
            "https://www.youtube.com/@statstest".to_string(),
            "Stats Test".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
        )
        .expect("follow channel");

        update_channel_total_videos_db(&channel_id, 42).expect("update total videos");

        let stats = get_channel_stats_db(&channel_id).expect("get channel stats");
        assert_eq!(stats.total_videos, Some(42));
        assert_eq!(stats.total_scanned, 0);
        assert_eq!(stats.total_downloaded, 0);

        toggle_channel_auto_download_db(&channel_id, true).expect("toggle auto download");
        let channel = get_followed_channel_db(channel_id).expect("get channel");
        assert!(channel.auto_download);
    }

    #[test]
    fn nested_channel_risk_updates_do_not_deadlock() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        let channel_id = follow_channel_db(
            "https://www.youtube.com/@risktest".to_string(),
            "Risk Test".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
        )
        .expect("follow channel");
        toggle_channel_auto_download_db(&channel_id, true).expect("enable auto download");

        insert_channel_video(&channel_id, "vid_clean", "downloaded", "2026-11-12T08:00:00Z");
        insert_channel_video(&channel_id, "vid_red_1", "downloaded", "2026-11-12T08:10:00Z");
        insert_channel_video(&channel_id, "vid_red_2", "downloaded", "2026-11-12T08:20:00Z");

        // 1. Direct green update via update_channel_video_bkt_status_db -> recalculate_channel_risk_by_video_with_conn
        update_channel_video_bkt_status_db("vid_clean", "green_clean", Some("Clean"), Some("yt_1"))
            .expect("update clean bkt status without deadlock");
        let risk = recalculate_channel_risk_by_video_db("vid_clean")
            .expect("recalculate by video without deadlock");
        assert_eq!(risk.as_deref(), Some("green"));

        // 2. One red video via empty channel_id fallback -> yellow
        update_channel_video_risk_db("", "vid_red_1", "red", Some("Claim 1"), true)
            .expect("update first red risk without channel_id deadlock");
        let ch = get_followed_channel_db(channel_id.clone()).expect("get channel yellow");
        assert_eq!(ch.risk_status.as_deref(), Some("yellow"));
        assert!(ch.auto_download);

        // 3. Two consecutive red videos via explicit channel_id -> red & auto_download disabled
        update_channel_video_bkt_status_db("vid_red_2", "red_matched", Some("Claim 2"), Some("yt_2"))
            .expect("update second red bkt status without deadlock");
        let ch_red = get_followed_channel_db(channel_id).expect("get channel red");
        assert_eq!(ch_red.risk_status.as_deref(), Some("red"));
        assert!(!ch_red.auto_download);
        assert!(ch_red.risk_reason.is_some());
    }
}
