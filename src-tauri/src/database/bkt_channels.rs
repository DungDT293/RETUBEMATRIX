use chrono::Local;
use rusqlite::{params, OptionalExtension};

use crate::database::get_db;
use crate::types::{BktTestChannel, BktTestChannelInput, BktTestJob};

/// Đảm bảo tất cả các kênh test BKT đều được reset về 0/15 nếu sang ngày mới (YYYY-MM-DD)
pub fn reset_bkt_channel_quota_if_needed(conn: &rusqlite::Connection, today: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE bkt_test_channels
         SET daily_used = 0, last_reset_date = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE last_reset_date != ?1",
        params![today],
    )
    .map_err(|e| format!("Lỗi tự động reset quota kênh test BKT: {e}"))?;
    Ok(())
}

/// Lấy danh sách tất cả các kênh test bản quyền
pub fn get_bkt_test_channels_db() -> Result<Vec<BktTestChannel>, String> {
    let conn = get_db()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    reset_bkt_channel_quota_if_needed(&conn, &today)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, profile_id, youtube_channel_name, youtube_channel_id,
                    daily_quota, daily_used, last_reset_date, is_active, priority, note,
                    created_at, updated_at
             FROM bkt_test_channels
             ORDER BY priority DESC, created_at ASC",
        )
        .map_err(|e| format!("Lỗi truy vấn bkt_test_channels: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let daily_quota: i64 = row.get(5)?;
            let daily_used: i64 = row.get(6)?;
            let remaining_quota = (daily_quota - daily_used).max(0);
            let is_active_int: i64 = row.get(8)?;

            Ok(BktTestChannel {
                id: row.get(0)?,
                name: row.get(1)?,
                profile_id: row.get(2)?,
                youtube_channel_name: row.get(3)?,
                youtube_channel_id: row.get(4)?,
                daily_quota,
                daily_used,
                last_reset_date: row.get(7)?,
                is_active: is_active_int == 1,
                priority: row.get(9)?,
                note: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                remaining_quota,
            })
        })
        .map_err(|e| format!("Lỗi map dữ liệu bkt_test_channels: {e}"))?;

    let mut channels = Vec::new();
    for ch in rows {
        if let Ok(c) = ch {
            channels.push(c);
        }
    }
    Ok(channels)
}

/// Lấy thông tin một kênh test BKT theo ID
pub fn get_bkt_test_channel_by_id_db(id: &str) -> Result<Option<BktTestChannel>, String> {
    let conn = get_db()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    reset_bkt_channel_quota_if_needed(&conn, &today)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, profile_id, youtube_channel_name, youtube_channel_id,
                    daily_quota, daily_used, last_reset_date, is_active, priority, note,
                    created_at, updated_at
             FROM bkt_test_channels
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|e| format!("Lỗi chuẩn bị truy vấn: {e}"))?;

    let mut rows = stmt
        .query_map(params![id], |row| {
            let daily_quota: i64 = row.get(5)?;
            let daily_used: i64 = row.get(6)?;
            let remaining_quota = (daily_quota - daily_used).max(0);
            let is_active_int: i64 = row.get(8)?;

            Ok(BktTestChannel {
                id: row.get(0)?,
                name: row.get(1)?,
                profile_id: row.get(2)?,
                youtube_channel_name: row.get(3)?,
                youtube_channel_id: row.get(4)?,
                daily_quota,
                daily_used,
                last_reset_date: row.get(7)?,
                is_active: is_active_int == 1,
                priority: row.get(9)?,
                note: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                remaining_quota,
            })
        })
        .map_err(|e| format!("Lỗi query map: {e}"))?;

    if let Some(res) = rows.next() {
        return res.map(Some).map_err(|e| e.to_string());
    }
    Ok(None)
}

/// Tạo mới hoặc cập nhật thông tin Kênh Test Bản Quyền
///
/// NOTE: Hàm này KHÔNG gọi `get_bkt_test_channel_by_id_db` để tránh deadlock
/// (std::sync::Mutex không reentrant — gọi `get_db()` lần 2 trong cùng thread sẽ treo).
/// Thay vào đó, đọc lại bản ghi trực tiếp trên cùng connection.
pub fn save_bkt_test_channel_db(input: BktTestChannelInput) -> Result<BktTestChannel, String> {
    let conn = get_db()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_str = Local::now().to_rfc3339();

    let channel_id = match input.id.filter(|s| !s.trim().is_empty()) {
        Some(existing_id) => {
            // Update
            conn.execute(
                "UPDATE bkt_test_channels
                 SET name = ?1, profile_id = ?2, youtube_channel_name = ?3, youtube_channel_id = ?4,
                     daily_quota = ?5, is_active = ?6, priority = ?7, note = ?8, updated_at = ?9
                 WHERE id = ?10",
                params![
                    input.name.trim(),
                    input.profile_id.trim(),
                    input.youtube_channel_name.as_deref().map(str::trim),
                    input.youtube_channel_id.as_deref().map(str::trim),
                    input.daily_quota,
                    if input.is_active { 1 } else { 0 },
                    input.priority,
                    input.note.as_deref().map(str::trim),
                    now_str,
                    existing_id,
                ],
            )
            .map_err(|e| format!("Lỗi cập nhật bkt_test_channels: {e}"))?;
            existing_id
        }
        None => {
            // Create
            let new_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO bkt_test_channels (
                    id, name, profile_id, youtube_channel_name, youtube_channel_id,
                    daily_quota, daily_used, last_reset_date, is_active, priority, note,
                    created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, ?11)",
                params![
                    new_id,
                    input.name.trim(),
                    input.profile_id.trim(),
                    input.youtube_channel_name.as_deref().map(str::trim),
                    input.youtube_channel_id.as_deref().map(str::trim),
                    input.daily_quota,
                    today,
                    if input.is_active { 1 } else { 0 },
                    input.priority,
                    input.note.as_deref().map(str::trim),
                    now_str,
                ],
            )
            .map_err(|e| format!("Lỗi tạo mới bkt_test_channels: {e}"))?;
            new_id
        }
    };

    // Đọc lại bản ghi trực tiếp trên cùng connection (tránh deadlock do get_db() lần 2)
    reset_bkt_channel_quota_if_needed(&conn, &today)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, profile_id, youtube_channel_name, youtube_channel_id,
                    daily_quota, daily_used, last_reset_date, is_active, priority, note,
                    created_at, updated_at
             FROM bkt_test_channels
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|e| format!("Lỗi chuẩn bị truy vấn sau lưu: {e}"))?;

    let channel = stmt
        .query_row(params![channel_id], |row| {
            let daily_quota: i64 = row.get(5)?;
            let daily_used: i64 = row.get(6)?;
            let remaining_quota = (daily_quota - daily_used).max(0);
            let is_active_int: i64 = row.get(8)?;

            Ok(BktTestChannel {
                id: row.get(0)?,
                name: row.get(1)?,
                profile_id: row.get(2)?,
                youtube_channel_name: row.get(3)?,
                youtube_channel_id: row.get(4)?,
                daily_quota,
                daily_used,
                last_reset_date: row.get(7)?,
                is_active: is_active_int == 1,
                priority: row.get(9)?,
                note: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                remaining_quota,
            })
        })
        .map_err(|e| format!("Không tìm thấy kênh test vừa lưu trong cơ sở dữ liệu: {e}"))?;

    Ok(channel)
}

/// Xóa Kênh Test Bản Quyền
pub fn delete_bkt_test_channel_db(id: &str) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM bkt_test_channels WHERE id = ?1", params![id])
        .map_err(|e| format!("Lỗi xóa kênh test BKT: {e}"))?;
    Ok(())
}

/// Tăng số lượng video đã test hôm nay cho một kênh test. Trả về false nếu đã đạt quota.
pub fn increment_bkt_channel_used_db(id: &str, count: i64) -> Result<bool, String> {
    let conn = get_db()?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    reset_bkt_channel_quota_if_needed(&conn, &today)?;

    let rows_affected = conn.execute(
        "UPDATE bkt_test_channels
         SET daily_used = daily_used + ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND (daily_used + ?1) <= daily_quota",
        params![count, id],
    )
    .map_err(|e| format!("Lỗi cập nhật quota kênh test: {e}"))?;

    Ok(rows_affected > 0)
}

/// Reserve quota and create the job in one transaction.
pub fn reserve_bkt_channel_and_create_job_with_conn(
    conn: &rusqlite::Connection,
    job: &BktTestJob,
) -> Result<bool, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Lỗi bắt đầu giao dịch quota BKT: {e}"))?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    reset_bkt_channel_quota_if_needed(&tx, &today)?;

    // Nếu job đã có youtube_video_id hoặc là kênh fast-track direct, không cần trừ quota bkt_test_channels
    let is_fast_track_direct = job.test_channel_id == "fast_track_direct";
    if job.youtube_video_id.is_none() && !is_fast_track_direct {
        let reserved = tx
            .execute(
                "UPDATE bkt_test_channels
                 SET daily_used = daily_used + 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND daily_used < daily_quota",
                params![job.test_channel_id],
            )
            .map_err(|e| format!("Lỗi giữ quota kênh test BKT: {e}"))?;
        if reserved == 0 {
            return Ok(false);
        }
    }

    let target_profile = job
        .target_profile_id
        .as_deref()
        .or(job.main_target_profile_id.as_deref());
    tx.execute(
        "INSERT INTO bkt_test_jobs (
            id, test_channel_id, video_source_type, source_ref_id,
            video_title, video_path, reup_path, youtube_video_id,
            status, restriction, error_message, tested_date, created_at, updated_at,
            main_target_profile_id, auto_publish_main, target_title, target_description, target_tags, thumbnail_path,
            channel_id, target_profile_id, test_profile_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            job.id,
            job.test_channel_id,
            job.video_source_type,
            job.source_ref_id,
            job.video_title,
            job.video_path,
            job.reup_path,
            job.youtube_video_id,
            job.status,
            job.restriction,
            job.error_message,
            job.tested_date,
            job.created_at,
            target_profile,
            if job.auto_publish_main.unwrap_or(false) { 1 } else { 0 },
            job.target_title,
            job.target_description,
            job.target_tags,
            job.thumbnail_path,
            job.channel_id,
            target_profile,
            job.test_profile_id,
        ],
    )
    .map_err(|e| format!("Lỗi tạo bkt_test_job: {e}"))?;

    tx.commit()
        .map_err(|e| format!("Lỗi xác nhận giao dịch quota BKT: {e}"))?;
    Ok(true)
}

pub fn reserve_bkt_channel_and_create_job_db(job: &BktTestJob) -> Result<bool, String> {
    let conn = get_db()?;
    reserve_bkt_channel_and_create_job_with_conn(&conn, job)
}

pub fn cancel_bkt_test_job_if_active_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
    reason: &str,
) -> Result<bool, String> {
    let now_str = Local::now().to_rfc3339();
    let rows = conn
        .execute(
            "UPDATE bkt_test_jobs
             SET status = 'failed', restriction = ?1, error_message = ?1, updated_at = ?2
             WHERE id = ?3 AND status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            params![reason, now_str, id],
        )
        .map_err(|e| format!("Lỗi hủy bkt_test_job: {e}"))?;
    Ok(rows > 0)
}

pub fn cancel_bkt_test_job_if_active_db(id: &str, reason: &str) -> Result<bool, String> {
    let conn = get_db()?;
    cancel_bkt_test_job_if_active_with_conn(&conn, id, reason)
}

pub fn cancel_bkt_test_job_and_refund_quota_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
    reason: &str,
) -> Result<bool, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Lỗi bắt đầu giao dịch hủy BKT: {e}"))?;
    let channel_and_video: Option<(String, Option<String>)> = tx
        .query_row(
            "SELECT test_channel_id, youtube_video_id
             FROM bkt_test_jobs
             WHERE id = ?1 AND status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Lỗi đọc job BKT để hủy: {e}"))?;
    let Some((channel_id, youtube_video_id)) = channel_and_video else {
        return Ok(false);
    };
    tx.execute(
        "UPDATE bkt_test_jobs
         SET status = 'failed', restriction = ?1, error_message = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
        params![reason, id],
    )
    .map_err(|e| format!("Lỗi cập nhật trạng thái hủy BKT: {e}"))?;
    if youtube_video_id.is_none() {
        tx.execute(
            "UPDATE bkt_test_channels
             SET daily_used = MAX(0, daily_used - 1), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![channel_id],
        )
        .map_err(|e| format!("Lỗi hoàn quota khi hủy BKT: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("Lỗi xác nhận giao dịch hủy BKT: {e}"))?;
    Ok(true)
}

pub fn cancel_bkt_test_job_and_refund_quota_db(id: &str, reason: &str) -> Result<bool, String> {
    let conn = get_db()?;
    cancel_bkt_test_job_and_refund_quota_with_conn(&conn, id, reason)
}

pub fn fail_bkt_test_job_and_refund_quota_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
    reup_path: Option<&str>,
    youtube_video_id: Option<&str>,
    reason: &str,
) -> Result<bool, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Lỗi bắt đầu giao dịch fail BKT: {e}"))?;
    let channel_id: Option<String> = tx
        .query_row(
            "SELECT test_channel_id FROM bkt_test_jobs
             WHERE id = ?1 AND status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Lỗi đọc job BKT để fail: {e}"))?;
    let Some(channel_id) = channel_id else {
        return Ok(false);
    };
    let rows = tx
        .execute(
            "UPDATE bkt_test_jobs
             SET status = 'failed', reup_path = COALESCE(?1, reup_path),
                 youtube_video_id = COALESCE(?2, youtube_video_id),
                 restriction = ?3, error_message = ?3, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?4 AND status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            params![reup_path, youtube_video_id, reason, id],
        )
        .map_err(|e| format!("Lỗi cập nhật fail BKT: {e}"))?;
    if rows != 1 {
        return Ok(false);
    }
    if youtube_video_id.is_none() {
        tx.execute(
            "UPDATE bkt_test_channels
             SET daily_used = MAX(0, daily_used - 1), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![channel_id],
        )
        .map_err(|e| format!("Lỗi hoàn quota khi fail BKT: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("Lỗi xác nhận giao dịch fail BKT: {e}"))?;
    Ok(true)
}

pub fn fail_bkt_test_job_and_refund_quota_db(
    id: &str,
    reup_path: Option<&str>,
    youtube_video_id: Option<&str>,
    reason: &str,
) -> Result<bool, String> {
    let conn = get_db()?;
    fail_bkt_test_job_and_refund_quota_with_conn(&conn, id, reup_path, youtube_video_id, reason)
}

#[cfg(test)]
pub fn foreign_keys_enabled(conn: &rusqlite::Connection) -> bool {
    conn.query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
        .map(|value| value == 1)
        .unwrap_or(false)
}

/// Giảm/hoàn lại số lượng quota đã dùng khi job bị hủy hoặc thất bại trước khi upload
pub fn decrement_bkt_channel_used_db(id: &str, count: i64) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE bkt_test_channels
         SET daily_used = MAX(0, daily_used - ?1), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![count, id],
    )
    .map_err(|e| format!("Lỗi hoàn trả quota kênh test: {e}"))?;
    Ok(())
}

/// Đặt lại quota hôm nay về 0 (cho 1 kênh hoặc toàn bộ kênh test)
pub fn reset_bkt_channel_daily_quota_db(channel_id: Option<&str>) -> Result<(), String> {
    let conn = get_db()?;
    if let Some(id) = channel_id {
        conn.execute(
            "UPDATE bkt_test_channels SET daily_used = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Lỗi reset quota kênh test: {e}"))?;
    } else {
        conn.execute(
            "UPDATE bkt_test_channels SET daily_used = 0, updated_at = CURRENT_TIMESTAMP",
            [],
        )
        .map_err(|e| format!("Lỗi reset toàn bộ quota kênh test: {e}"))?;
    }
    Ok(())
}

/// Tạo một bản ghi tác vụ test video
pub fn create_bkt_test_job_db(job: &BktTestJob) -> Result<(), String> {
    let conn = get_db()?;
    let target_profile = job.target_profile_id.as_deref().or(job.main_target_profile_id.as_deref());
    conn.execute(
        "INSERT INTO bkt_test_jobs (
            id, test_channel_id, video_source_type, source_ref_id,
            video_title, video_path, reup_path, youtube_video_id,
            status, restriction, error_message, tested_date, created_at, updated_at,
            main_target_profile_id, auto_publish_main, target_title, target_description, target_tags, thumbnail_path,
            channel_id, target_profile_id, test_profile_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            job.id,
            job.test_channel_id,
            job.video_source_type,
            job.source_ref_id,
            job.video_title,
            job.video_path,
            job.reup_path,
            job.youtube_video_id,
            job.status,
            job.restriction,
            job.error_message,
            job.tested_date,
            job.created_at,
            target_profile,
            if job.auto_publish_main.unwrap_or(false) { 1 } else { 0 },
            job.target_title,
            job.target_description,
            job.target_tags,
            job.thumbnail_path,
            job.channel_id,
            target_profile,
            job.test_profile_id,
        ],
    )
    .map_err(|e| format!("Lỗi tạo bkt_test_job: {e}"))?;
    Ok(())
}

pub fn get_bkt_catchup_job_ids_with_conn(
    conn: &rusqlite::Connection,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id
             FROM bkt_test_jobs
             WHERE status IN ('green_clean', 'publish_failed')
               AND COALESCE(auto_publish_main, 0) = 0
               AND source_ref_id IS NOT NULL
               AND TRIM(source_ref_id) <> ''
               AND reup_path IS NOT NULL
               AND TRIM(reup_path) <> ''
               AND COALESCE(target_profile_id, main_target_profile_id) IS NOT NULL
               AND TRIM(COALESCE(target_profile_id, main_target_profile_id)) <> ''
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| format!("Lỗi truy vấn job BKT chờ catch-up: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Lỗi đọc job BKT chờ catch-up: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Lỗi map job BKT chờ catch-up: {e}"))
}

pub fn get_bkt_catchup_job_ids_db() -> Result<Vec<String>, String> {
    let conn = get_db()?;
    get_bkt_catchup_job_ids_with_conn(&conn)
}

pub fn has_bkt_publish_duplicate_source_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<bool, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT EXISTS(
                 SELECT 1
                 FROM bkt_test_jobs AS candidate
                 JOIN bkt_test_jobs AS existing
                   ON existing.id <> candidate.id
                  AND existing.source_ref_id IS NOT NULL
                  AND existing.source_ref_id = candidate.source_ref_id
                  AND existing.status = 'publishing'
                  AND existing.updated_at > datetime('now', '-15 minutes')
                 WHERE candidate.id = ?1
                   AND candidate.source_ref_id IS NOT NULL
             )",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Lỗi kiểm tra job BKT trùng nguồn: {e}"))?;
    Ok(exists == 1)
}

pub fn has_bkt_publish_duplicate_source_db(id: &str) -> Result<bool, String> {
    let conn = get_db()?;
    has_bkt_publish_duplicate_source_with_conn(&conn, id)
}

pub fn claim_bkt_job_for_publish_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<bool, String> {
    let changed = conn
        .execute(
            "UPDATE bkt_test_jobs AS candidate
             SET status = 'publishing', updated_at = CURRENT_TIMESTAMP
             WHERE candidate.id = ?1
               AND candidate.status IN ('green_clean', 'publish_failed')
               AND NOT EXISTS (
                   SELECT 1
                   FROM bkt_test_jobs AS existing
                   WHERE existing.id <> candidate.id
                     AND existing.source_ref_id IS NOT NULL
                     AND existing.source_ref_id = candidate.source_ref_id
                     AND existing.status = 'publishing'
                     AND existing.updated_at > datetime('now', '-15 minutes')
               )",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Lỗi claim publish BKT: {e}"))?;
    Ok(changed == 1)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BktCheckpoint {
    pub test_channel_id: String,
    pub youtube_video_id: String,
    pub reup_path: Option<String>,
    pub status: String,
}

/// Tìm kiếm checkpoint BKT đã upload của một video để tái sử dụng kênh test và video ID
pub fn get_existing_bkt_checkpoint_db(
    source_ref_id: Option<&str>,
    video_path: &str,
) -> Result<Option<BktCheckpoint>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT j.test_channel_id, j.youtube_video_id, j.reup_path, j.status
             FROM bkt_test_jobs j
             JOIN bkt_test_channels tc ON j.test_channel_id = tc.id
             WHERE ((?1 IS NOT NULL AND TRIM(?1) <> '' AND j.source_ref_id = ?1) OR j.video_path = ?2)
               AND j.youtube_video_id IS NOT NULL
               AND TRIM(j.youtube_video_id) <> ''
               AND j.status NOT IN ('published')
             ORDER BY j.created_at DESC
             LIMIT 1",
        )
        .map_err(|e| format!("Lỗi truy vấn checkpoint BKT: {e}"))?;

    let res = stmt
        .query_row(params![source_ref_id, video_path], |row| {
            Ok(BktCheckpoint {
                test_channel_id: row.get(0)?,
                youtube_video_id: row.get(1)?,
                reup_path: row.get(2)?,
                status: row.get(3)?,
            })
        })
        .optional()
        .map_err(|e| format!("Lỗi đọc checkpoint BKT: {e}"))?;

    Ok(res)
}

/// Cập nhật trạng thái tác vụ test video
pub fn update_bkt_test_job_status_db(
    id: &str,
    status: &str,
    reup_path: Option<&str>,
    youtube_video_id: Option<&str>,
    restriction: Option<&str>,
    error_message: Option<&str>,
) -> Result<(), String> {
    let conn = get_db()?;
    let now_str = Local::now().to_rfc3339();
    // Chống rò rỉ restriction: Nếu job thất bại, ghi đè restriction bằng error_message
    let eff_restriction = if status == "failed" {
        error_message.or(restriction)
    } else {
        restriction
    };
    conn.execute(
        "UPDATE bkt_test_jobs
         SET status = ?1,
             reup_path = COALESCE(?2, reup_path),
             youtube_video_id = COALESCE(?3, youtube_video_id),
             restriction = ?4,
             error_message = ?5,
             updated_at = ?6
         WHERE id = ?7",
        params![
            status,
            reup_path,
            youtube_video_id,
            eff_restriction,
            error_message,
            now_str,
            id,
        ],
    )
    .map_err(|e| format!("Lỗi cập nhật bkt_test_job: {e}"))?;
    Ok(())
}

/// Move one reserved quota slot between channels in one transaction.
pub fn transfer_bkt_channel_quota_with_conn(
    conn: &rusqlite::Connection,
    source_id: &str,
    target_id: &str,
) -> Result<bool, String> {
    if source_id == target_id {
        return Ok(false);
    }
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Lỗi bắt đầu giao dịch chuyển quota BKT: {e}"))?;
    let target_updated = tx
        .execute(
            "UPDATE bkt_test_channels
             SET daily_used = daily_used + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND daily_used < daily_quota",
            params![target_id],
        )
        .map_err(|e| format!("Lỗi giữ quota kênh dự phòng BKT: {e}"))?;
    if target_updated == 0 {
        return Ok(false);
    }
    let source_updated = tx
        .execute(
            "UPDATE bkt_test_channels
             SET daily_used = daily_used - 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND daily_used > 0",
            params![source_id],
        )
        .map_err(|e| format!("Lỗi giải phóng quota kênh BKT: {e}"))?;
    if source_updated == 0 {
        return Ok(false);
    }
    tx.commit()
        .map_err(|e| format!("Lỗi xác nhận giao dịch chuyển quota BKT: {e}"))?;
    Ok(true)
}

pub fn transfer_bkt_channel_quota_db(source_id: &str, target_id: &str) -> Result<bool, String> {
    let conn = get_db()?;
    transfer_bkt_channel_quota_with_conn(&conn, source_id, target_id)
}

/// Atomically reserve quota and reset a failed job for retry.
pub fn retry_bkt_test_job_with_quota_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<bool, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Lỗi bắt đầu giao dịch retry BKT: {e}"))?;
    let (channel_id, checkpointed_youtube_id): (String, Option<String>) = tx
        .query_row(
            "SELECT test_channel_id, youtube_video_id FROM bkt_test_jobs WHERE id = ?1 AND status = 'failed'",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Lỗi đọc bkt_test_job để retry: {e}"))?;

    // Có YouTube ID nghĩa là upload test đã hoàn tất; chỉ resume Content ID check, không tốn quota/upload lại.
    if checkpointed_youtube_id.is_some() {
        let now_str = Local::now().to_rfc3339();
        tx.execute(
            "UPDATE bkt_test_jobs
             SET status = 'queued',
                 restriction = 'Đang xếp hàng tiếp tục kiểm tra Content ID từ video test đã tải...',
                 error_message = NULL,
                 auto_publish_main = 0,
                 updated_at = ?1
             WHERE id = ?2 AND status = 'failed'",
            params![now_str, id],
        )
        .map_err(|e| format!("Lỗi resume bkt_test_job: {e}"))?;
        tx.commit()
            .map_err(|e| format!("Lỗi xác nhận giao dịch resume BKT: {e}"))?;
        return Ok(true);
    }

    let reserved = tx
        .execute(
            "UPDATE bkt_test_channels
             SET daily_used = daily_used + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND daily_used < daily_quota",
            params![channel_id],
        )
        .map_err(|e| format!("Lỗi giữ quota retry BKT: {e}"))?;
    if reserved == 0 {
        return Ok(false);
    }

    let now_str = Local::now().to_rfc3339();
    tx.execute(
        "UPDATE bkt_test_jobs
         SET status = 'queued',
             youtube_video_id = NULL,
             reup_path = NULL,
             restriction = 'Đang xếp hàng chờ tải lại và quét bản quyền...',
             error_message = NULL,
             auto_publish_main = 0,
             updated_at = ?1
         WHERE id = ?2 AND status = 'failed'",
        params![now_str, id],
    )
    .map_err(|e| format!("Lỗi đặt lại bkt_test_job: {e}"))?;
    tx.commit()
        .map_err(|e| format!("Lỗi xác nhận giao dịch retry BKT: {e}"))?;
    Ok(true)
}

/// Đặt lại một tác vụ BKT đã thất bại để chuẩn bị chạy lại từ đầu.
pub fn reset_bkt_test_job_for_retry_db(id: &str) -> Result<bool, String> {
    let conn = get_db()?;
    retry_bkt_test_job_with_quota_with_conn(&conn, id)
}

/// Lấy danh sách tác vụ test video gần nhất
pub fn get_bkt_test_jobs_db(limit: Option<i64>) -> Result<Vec<BktTestJob>, String> {
    let conn = get_db()?;
    let lim = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare(
            "SELECT j.id, j.test_channel_id, tc.name, j.video_source_type, j.source_ref_id,
                    j.video_title, j.video_path, j.reup_path, j.youtube_video_id,
                    j.status, j.restriction, j.error_message, j.tested_date,
                    j.created_at, j.updated_at,
                    COALESCE(j.target_profile_id, j.main_target_profile_id) AS main_target_profile_id,
                    j.auto_publish_main, j.target_title,
                    j.target_description, j.target_tags, j.thumbnail_path,
                    j.channel_id, j.test_profile_id
             FROM bkt_test_jobs j
             LEFT JOIN bkt_test_channels tc ON j.test_channel_id = tc.id
             ORDER BY j.created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("Lỗi truy vấn bkt_test_jobs: {e}"))?;

    let rows = stmt
        .query_map(params![lim], |row| {
            let auto_pub: Option<i64> = row.get(16)?;
            let target_prof: Option<String> = row.get(15)?;
            Ok(BktTestJob {
                id: row.get(0)?,
                test_channel_id: row.get(1)?,
                test_channel_name: row.get(2)?,
                video_source_type: row.get(3)?,
                source_ref_id: row.get(4)?,
                video_title: row.get(5)?,
                video_path: row.get(6)?,
                reup_path: row.get(7)?,
                youtube_video_id: row.get(8)?,
                status: row.get(9)?,
                restriction: row.get(10)?,
                error_message: row.get(11)?,
                tested_date: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                main_target_profile_id: target_prof.clone(),
                target_profile_id: target_prof,
                channel_id: row.get(21)?,
                auto_publish_main: auto_pub.map(|v| v == 1),
                target_title: row.get(17)?,
                target_description: row.get(18)?,
                target_tags: row.get(19)?,
                thumbnail_path: row.get(20)?,
                test_profile_id: row.get(22)?,
                skip_bkt_test: None,
            })
        })
        .map_err(|e| format!("Lỗi map dữ liệu bkt_test_jobs: {e}"))?;

    let mut jobs = Vec::new();
    for j in rows {
        if let Ok(job) = j {
            jobs.push(job);
        }
    }
    Ok(jobs)
}

pub fn get_bkt_test_job_by_id_db(job_id: &str) -> Result<Option<BktTestJob>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT j.id, j.test_channel_id, tc.name, j.video_source_type, j.source_ref_id,
                    j.video_title, j.video_path, j.reup_path, j.youtube_video_id,
                    j.status, j.restriction, j.error_message, j.tested_date,
                    j.created_at, j.updated_at,
                    COALESCE(j.target_profile_id, j.main_target_profile_id) AS main_target_profile_id,
                    j.auto_publish_main, j.target_title,
                    j.target_description, j.target_tags, j.thumbnail_path,
                    j.channel_id, j.test_profile_id
             FROM bkt_test_jobs j
             LEFT JOIN bkt_test_channels tc ON j.test_channel_id = tc.id
             WHERE j.id = ?1",
        )
        .map_err(|e| format!("Lỗi truy vấn bkt_test_job theo id: {e}"))?;

    let mut rows = stmt
        .query_map(params![job_id], |row| {
            let auto_pub: Option<i64> = row.get(16)?;
            let target_prof: Option<String> = row.get(15)?;
            Ok(BktTestJob {
                id: row.get(0)?,
                test_channel_id: row.get(1)?,
                test_channel_name: row.get(2)?,
                video_source_type: row.get(3)?,
                source_ref_id: row.get(4)?,
                video_title: row.get(5)?,
                video_path: row.get(6)?,
                reup_path: row.get(7)?,
                youtube_video_id: row.get(8)?,
                status: row.get(9)?,
                restriction: row.get(10)?,
                error_message: row.get(11)?,
                tested_date: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                main_target_profile_id: target_prof.clone(),
                target_profile_id: target_prof,
                channel_id: row.get(21)?,
                auto_publish_main: auto_pub.map(|v| v == 1),
                target_title: row.get(17)?,
                target_description: row.get(18)?,
                target_tags: row.get(19)?,
                thumbnail_path: row.get(20)?,
                test_profile_id: row.get(22)?,
                skip_bkt_test: None,
            })
        })
        .map_err(|e| format!("Lỗi map dữ liệu: {e}"))?;

    if let Some(res) = rows.next() {
        res.map(Some).map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

/// Startup Reconcile Sweep: Quét tất cả job chưa hoàn tất ('queued', 'reuping', 'uploading', 'checking', 'pending')
/// khi khởi động ứng dụng và chuyển sang 'failed' với lý do "Đã dừng khi ứng dụng khởi động lại".
/// Đồng thời dọn dẹp các tệp reup tạm thời để tránh lãng phí dung lượng ổ đĩa.
#[cfg(test)]
mod integrity_tests {
    use super::*;

    fn sample_job() -> BktTestJob {
        BktTestJob {
            id: "job-integrity".to_string(),
            test_channel_id: "channel-integrity".to_string(),
            test_channel_name: Some("Integrity".to_string()),
            video_source_type: "local_file".to_string(),
            source_ref_id: None,
            video_title: "Integrity test".to_string(),
            video_path: "video.mp4".to_string(),
            reup_path: None,
            youtube_video_id: None,
            status: "queued".to_string(),
            restriction: None,
            error_message: None,
            tested_date: "2026-11-13".to_string(),
            created_at: "2026-11-13T00:00:00Z".to_string(),
            updated_at: "2026-11-13T00:00:00Z".to_string(),
            main_target_profile_id: None,
            target_profile_id: None,
            channel_id: None,
            auto_publish_main: Some(false),
            target_title: None,
            target_description: None,
            target_tags: None,
            thumbnail_path: None,
            test_profile_id: Some("profile-integrity".to_string()),
            skip_bkt_test: None,
        }
    }

    fn create_schema(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "CREATE TABLE bkt_test_channels (
                id TEXT PRIMARY KEY, daily_quota INTEGER NOT NULL, daily_used INTEGER NOT NULL,
                last_reset_date TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE bkt_test_jobs (
                id TEXT PRIMARY KEY, test_channel_id TEXT NOT NULL, video_source_type TEXT NOT NULL,
                source_ref_id TEXT, video_title TEXT NOT NULL, video_path TEXT NOT NULL,
                reup_path TEXT, youtube_video_id TEXT, status TEXT NOT NULL, restriction TEXT,
                error_message TEXT, tested_date TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, main_target_profile_id TEXT, auto_publish_main INTEGER,
                target_title TEXT, target_description TEXT, target_tags TEXT, thumbnail_path TEXT,
                channel_id TEXT, target_profile_id TEXT, test_profile_id TEXT
            );",
        )
        .unwrap();
    }

    #[test]
    fn cancel_refund_and_status_transition_are_atomic() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 10, 2, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        ).unwrap();
        let job = sample_job();
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES (?1, ?2, 'local_file', ?3, ?4, 'pending', ?5, ?6, ?6)",
            rusqlite::params![job.id, job.test_channel_id, job.video_title, job.video_path, job.tested_date, job.created_at],
        ).unwrap();

        conn.execute_batch(
            "CREATE TRIGGER fail_quota_refund
             BEFORE UPDATE ON bkt_test_channels
             BEGIN SELECT RAISE(ABORT, 'injected refund failure'); END;",
        ).unwrap();
        assert!(cancel_bkt_test_job_and_refund_quota_with_conn(&conn, &job.id, "cancel").is_err());
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = ?1", rusqlite::params![job.id], |row| row.get::<_, String>(0)).unwrap(),
            "pending"
        );
    }

    #[test]
    fn reconcile_refunds_only_jobs_without_youtube_id() {
        assert!(should_refund_reconciled_quota(None));
        assert!(!should_refund_reconciled_quota(Some("ABCDEFGHIJK")));
    }

    #[test]
    fn reconcile_readback_refunds_only_unuploaded_job_quota() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 10, 2, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();
        for (id, youtube_video_id) in [("job-without-upload", None), ("job-after-upload", Some("ABCDEFGHIJK"))] {
            conn.execute(
                "INSERT INTO bkt_test_jobs (
                    id, test_channel_id, video_source_type, video_title, video_path,
                    reup_path, youtube_video_id, status, tested_date, created_at, updated_at
                 ) VALUES (?1, 'channel-integrity', 'local_file', 'title', 'video.mp4',
                           'reup-ready.mp4', ?2, 'pending', '2026-11-13', '2026-11-13', '2026-11-13')",
                rusqlite::params![id, youtube_video_id],
            )
            .unwrap();
        }

        assert_eq!(reconcile_bkt_jobs_on_startup_db(&conn).unwrap(), 2);
        let daily_used: i64 = conn
            .query_row(
                "SELECT daily_used FROM bkt_test_channels WHERE id = 'channel-integrity'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(daily_used, 1);
        assert_eq!(conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = 'job-without-upload'", [], |row| row.get::<_, String>(0)).unwrap(), "failed");
        assert_eq!(conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = 'job-after-upload'", [], |row| row.get::<_, String>(0)).unwrap(), "failed");
        assert_eq!(conn.query_row("SELECT youtube_video_id FROM bkt_test_jobs WHERE id = 'job-after-upload'", [], |row| row.get::<_, Option<String>> (0)).unwrap(), Some("ABCDEFGHIJK".to_string()));
        assert_eq!(conn.query_row("SELECT reup_path FROM bkt_test_jobs WHERE id = 'job-after-upload'", [], |row| row.get::<_, Option<String>>(0)).unwrap(), Some("reup-ready.mp4".to_string()));
    }

    #[test]
    fn reconcile_marks_interrupted_publish_retryable_without_deleting_artifact() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                reup_path, youtube_video_id, status, tested_date, created_at, updated_at
             ) VALUES ('job-publishing', 'channel-integrity', 'local_file', 'title', 'video.mp4',
                       'reup-ready.mp4', 'ABCDEFGHIJK', 'publishing', '2026-11-13', '2026-11-13', '2026-11-13')",
            [],
        )
        .unwrap();

        assert_eq!(reconcile_bkt_jobs_on_startup_db(&conn).unwrap(), 1);
        assert_eq!(conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = 'job-publishing'", [], |row| row.get::<_, String>(0)).unwrap(), "publish_failed");
        assert_eq!(conn.query_row("SELECT reup_path FROM bkt_test_jobs WHERE id = 'job-publishing'", [], |row| row.get::<_, Option<String>>(0)).unwrap(), Some("reup-ready.mp4".to_string()));
        assert_eq!(conn.query_row("SELECT youtube_video_id FROM bkt_test_jobs WHERE id = 'job-publishing'", [], |row| row.get::<_, Option<String>>(0)).unwrap(), Some("ABCDEFGHIJK".to_string()));
    }

    #[test]
    fn publish_claim_is_single_flight() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        let job = sample_job();
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES (?1, ?2, 'local_file', ?3, ?4, 'green_clean', ?5, ?6, ?6)",
            rusqlite::params![job.id, job.test_channel_id, job.video_title, job.video_path, job.tested_date, job.created_at],
        )
        .unwrap();

        assert!(claim_bkt_job_for_publish_with_conn(&conn, &job.id).unwrap());
        assert!(!claim_bkt_job_for_publish_with_conn(&conn, &job.id).unwrap());
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = ?1", rusqlite::params![job.id], |row| row.get::<_, String>(0)).unwrap(),
            "publishing"
        );
    }

    #[test]
    fn catchup_candidates_are_clean_ordered_and_publish_ready_only() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        let rows = [
            ("job-late", "green_clean", "reup-late.mp4", "profile-1", 0),
            ("job-early", "publish_failed", "reup-early.mp4", "profile-1", 0),
            ("job-published", "published", "reup-published.mp4", "profile-1", 0),
            ("job-auto", "green_clean", "reup-auto.mp4", "profile-1", 1),
            ("job-no-artifact", "green_clean", "", "profile-1", 0),
            ("job-no-target", "green_clean", "reup-no-target.mp4", "", 0),
        ];
        for (id, status, reup_path, target_profile, auto_publish) in rows {
            conn.execute(
                "INSERT INTO bkt_test_jobs (
                    id, test_channel_id, video_source_type, source_ref_id, video_title, video_path,
                    reup_path, status, tested_date, created_at, updated_at,
                    main_target_profile_id, target_profile_id, auto_publish_main
                 ) VALUES (?1, 'channel-integrity', 'channel_video', ?1, ?1, 'video.mp4',
                           NULLIF(?2, ''), ?3, '2026-11-13',
                           CASE ?1 WHEN 'job-early' THEN '2026-11-13T00:00:01' ELSE '2026-11-13T00:00:02' END,
                           '2026-11-13T00:00:02', NULLIF(?4, ''), NULLIF(?4, ''), ?5)",
                rusqlite::params![id, reup_path, status, target_profile, auto_publish],
            )
            .unwrap();
        }
        assert_eq!(
            get_bkt_catchup_job_ids_with_conn(&conn).unwrap(),
            vec!["job-early".to_string(), "job-late".to_string()]
        );
    }

    #[test]
    fn publish_claim_rejects_duplicate_source_actively_publishing() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, source_ref_id,
                video_title, video_path, status, tested_date, created_at, updated_at
             ) VALUES ('job-publishing', 'channel-integrity', 'channel_video', 'source-1',
                       'title', 'video.mp4', 'publishing', '2026-11-13', datetime('now'), datetime('now')),
                      ('job-duplicate', 'channel-integrity', 'channel_video', 'source-1',
                       'title', 'video-2.mp4', 'green_clean', '2026-11-13', datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();

        assert!(!claim_bkt_job_for_publish_with_conn(&conn, "job-duplicate").unwrap());
        assert_eq!(
            conn.query_row(
                "SELECT status FROM bkt_test_jobs WHERE id = 'job-duplicate'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            "green_clean"
        );
    }

    #[test]
    fn terminal_job_cancel_update_is_ignored_without_quota_side_effect() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 2, 1, ?1, '2026-11-13T00:00:00Z')",
            rusqlite::params![today],
        )
        .unwrap();
        let job = sample_job();
        assert!(reserve_bkt_channel_and_create_job_with_conn(&conn, &job).unwrap());
        conn.execute(
            "UPDATE bkt_test_jobs SET status = 'published' WHERE id = 'job-integrity'",
            [],
        )
        .unwrap();

        assert!(!cancel_bkt_test_job_if_active_with_conn(&conn, "job-integrity", "cancel").unwrap());
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = 'job-integrity'", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "published"
        );
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'channel-integrity'", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn quota_reservation_rejects_without_inserting_job() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 1, 1, ?1, '2026-11-13T00:00:00Z')",
            rusqlite::params![today],
        )
        .unwrap();

        let reserved = reserve_bkt_channel_and_create_job_with_conn(&conn, &sample_job()).unwrap();

        assert!(!reserved);
        assert_eq!(
            conn.query_row(
                "SELECT daily_used FROM bkt_test_channels WHERE id = 'channel-integrity'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM bkt_test_jobs", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn retry_reserves_quota_before_requeueing_failed_job() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 1, 0, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();
        let mut job = sample_job();
        job.status = "failed".to_string();
        job.youtube_video_id = None;
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES (?1, ?2, 'local_file', ?3, ?4, 'failed', ?5, ?6, ?6)",
            rusqlite::params![job.id, job.test_channel_id, job.video_title, job.video_path, job.tested_date, job.created_at],
        )
        .unwrap();

        assert!(retry_bkt_test_job_with_quota_with_conn(&conn, &job.id).unwrap());
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'channel-integrity'", [], |row| row.get::<_, i64>(0)).unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = ?1", rusqlite::params![job.id], |row| row.get::<_, String>(0)).unwrap(),
            "queued"
        );
    }

    #[test]
    fn fallback_quota_transfer_is_atomic_when_target_is_full() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES
                ('source', 2, 1, '2026-11-13', '2026-11-13T00:00:00Z'),
                ('target', 1, 1, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();

        assert!(!transfer_bkt_channel_quota_with_conn(&conn, "source", "target").unwrap());
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'source'", [], |row| row.get::<_, i64>(0)).unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'target'", [], |row| row.get::<_, i64>(0)).unwrap(),
            1
        );
    }

    #[test]
    fn fallback_quota_transfer_moves_one_slot_atomically() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES
                ('source', 2, 1, '2026-11-13', '2026-11-13T00:00:00Z'),
                ('target', 2, 0, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();

        assert!(transfer_bkt_channel_quota_with_conn(&conn, "source", "target").unwrap());
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'source'", [], |row| row.get::<_, i64>(0)).unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'target'", [], |row| row.get::<_, i64>(0)).unwrap(),
            1
        );
    }

    #[test]
    fn retry_does_not_requeue_terminal_job() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 3, 0, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();
        let job = sample_job();
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES (?1, ?2, 'local_file', ?3, ?4, 'published', ?5, ?6, ?6)",
            rusqlite::params![job.id, job.test_channel_id, job.video_title, job.video_path, job.tested_date, job.created_at],
        )
        .unwrap();

        assert!(retry_bkt_test_job_with_quota_with_conn(&conn, &job.id).is_err());
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = ?1", rusqlite::params![job.id], |row| row.get::<_, String>(0)).unwrap(),
            "published"
        );
        assert_eq!(
            conn.query_row("SELECT daily_used FROM bkt_test_channels WHERE id = 'channel-integrity'", [], |row| row.get::<_, i64>(0)).unwrap(),
            0
        );
    }

    #[test]
    fn retry_does_not_requeue_when_quota_is_exhausted() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('channel-integrity', 1, 1, '2026-11-13', '2026-11-13T00:00:00Z')",
            [],
        )
        .unwrap();
        let job = sample_job();
        conn.execute(
            "INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES (?1, ?2, 'local_file', ?3, ?4, 'failed', ?5, ?6, ?6)",
            rusqlite::params![job.id, job.test_channel_id, job.video_title, job.video_path, job.tested_date, job.created_at],
        )
        .unwrap();

        assert!(!retry_bkt_test_job_with_quota_with_conn(&conn, &job.id).unwrap());
        assert_eq!(
            conn.query_row("SELECT status FROM bkt_test_jobs WHERE id = ?1", rusqlite::params![job.id], |row| row.get::<_, String>(0)).unwrap(),
            "failed"
        );
    }

}

fn should_refund_reconciled_quota(youtube_video_id: Option<&str>) -> bool {
    youtube_video_id.is_none()
}

pub fn reconcile_bkt_jobs_on_startup_db(conn: &rusqlite::Connection) -> Result<usize, String> {
    log::info!("[BKT RECONCILE] Bắt đầu Startup Reconcile Sweep quét các tác vụ BKT chưa hoàn tất...");

    let interrupted: Vec<(String, String, Option<String>, String, Option<String>, String)> = conn
        .prepare(
            "SELECT id, video_path, reup_path, test_channel_id, youtube_video_id, status
             FROM bkt_test_jobs
             WHERE status IN ('queued', 'reuping', 'uploading', 'checking', 'pending', 'publishing')",
        )
        .map_err(|e| format!("Lỗi truy vấn reconcile bkt_test_jobs: {e}"))?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| format!("Lỗi map reconcile bkt_test_jobs: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let count = interrupted.len();
    let now_str = chrono::Local::now().to_rfc3339();

    for (id, _video_path, reup_path, test_channel_id, youtube_video_id, previous_status) in &interrupted {
        // Giữ nguyên checkpoint: artifact reup + YouTube ID dùng để tiếp tục, không retest/re-render.
        let (next_status, message) = if previous_status == "publishing" {
            ("publish_failed", "Đăng Kênh Đích bị gián đoạn khi ứng dụng khởi động lại")
        } else {
            ("failed", "Tác vụ BKT bị gián đoạn khi ứng dụng khởi động lại")
        };
        conn.execute(
            "UPDATE bkt_test_jobs
             SET status = ?1, restriction = ?2, error_message = ?2, updated_at = ?3
             WHERE id = ?4",
            rusqlite::params![next_status, message, now_str, id],
        )
        .map_err(|e| format!("Lỗi cập nhật reconcile job {id}: {e}"))?;

        // Chỉ hoàn quota nếu chưa tạo video test trên YouTube.
        if previous_status != "publishing" && should_refund_reconciled_quota(youtube_video_id.as_deref()) {
            conn.execute(
                "UPDATE bkt_test_channels
                 SET daily_used = MAX(0, daily_used - 1), updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1",
                rusqlite::params![test_channel_id],
            )
            .map_err(|e| format!("Lỗi hoàn quota reconcile job {id}: {e}"))?;
        }

        if let Some(reup) = reup_path {
            log::info!("[BKT RECONCILE] Giữ artifact checkpoint cho job {id}: {reup}");
        }

        // Đồng bộ nhãn kênh nguồn; chi tiết publish vẫn lấy từ BKT job.
        if let Ok(source_ref_id) = conn.query_row(
            "SELECT source_ref_id FROM bkt_test_jobs WHERE id = ?1 AND video_source_type = 'channel_video'",
            rusqlite::params![id],
            |row| row.get::<_, Option<String>>(0),
        ) {
            if let Some(source_ref_id) = source_ref_id {
                let _ = conn.execute(
                    "UPDATE channel_videos
                     SET bkt_check_status = ?1,
                         risk_status = CASE WHEN ?1 = 'publish_failed' THEN 'yellow' ELSE risk_status END,
                         bkt_restriction = ?2,
                         risk_reason = ?2
                     WHERE video_id = ?3 OR id = ?3",
                    rusqlite::params![next_status, message, source_ref_id],
                );
            }
        }
    }

    if count > 0 {
        log::info!("[BKT RECONCILE] Startup Reconcile Sweep hoàn tất: {count} job được chuyển sang trạng thái có thể tiếp tục.");
    } else {
        log::info!("[BKT RECONCILE] Không có job BKT nào bị kẹt từ phiên trước.");
    }

    Ok(count)
}


