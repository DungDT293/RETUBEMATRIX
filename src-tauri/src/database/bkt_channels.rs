use chrono::Local;
use rusqlite::params;

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

/// Tạo một bản ghi tác vụ test video
pub fn create_bkt_test_job_db(job: &BktTestJob) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT INTO bkt_test_jobs (
            id, test_channel_id, video_source_type, source_ref_id,
            video_title, video_path, reup_path, youtube_video_id,
            status, restriction, error_message, tested_date, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
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
        ],
    )
    .map_err(|e| format!("Lỗi tạo bkt_test_job: {e}"))?;
    Ok(())
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
    conn.execute(
        "UPDATE bkt_test_jobs
         SET status = ?1,
             reup_path = COALESCE(?2, reup_path),
             youtube_video_id = COALESCE(?3, youtube_video_id),
             restriction = COALESCE(?4, restriction),
             error_message = ?5,
             updated_at = ?6
         WHERE id = ?7",
        params![
            status,
            reup_path,
            youtube_video_id,
            restriction,
            error_message,
            now_str,
            id,
        ],
    )
    .map_err(|e| format!("Lỗi cập nhật bkt_test_job: {e}"))?;
    Ok(())
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
                    j.created_at, j.updated_at
             FROM bkt_test_jobs j
             LEFT JOIN bkt_test_channels tc ON j.test_channel_id = tc.id
             ORDER BY j.created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("Lỗi truy vấn bkt_test_jobs: {e}"))?;

    let rows = stmt
        .query_map(params![lim], |row| {
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

