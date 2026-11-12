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
            channel_id, target_profile_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
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

/// Đặt lại một tác vụ BKT đã thất bại để chuẩn bị chạy lại từ đầu (xóa sạch youtube_video_id và reup_path)
pub fn reset_bkt_test_job_for_retry_db(id: &str) -> Result<(), String> {
    let conn = get_db()?;
    let now_str = Local::now().to_rfc3339();
    conn.execute(
        "UPDATE bkt_test_jobs
         SET status = 'queued',
             youtube_video_id = NULL,
             reup_path = NULL,
             restriction = 'Đang xếp hàng chờ tải lại và quét bản quyền...',
             error_message = NULL,
             updated_at = ?1
         WHERE id = ?2",
        params![now_str, id],
    )
    .map_err(|e| format!("Lỗi đặt lại bkt_test_job: {e}"))?;
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
                    j.created_at, j.updated_at,
                    COALESCE(j.target_profile_id, j.main_target_profile_id) AS main_target_profile_id,
                    j.auto_publish_main, j.target_title,
                    j.target_description, j.target_tags, j.thumbnail_path,
                    j.channel_id
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
                    j.channel_id
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
pub fn reconcile_bkt_jobs_on_startup_db(conn: &rusqlite::Connection) -> Result<usize, String> {
    log::info!("[BKT RECONCILE] Bắt đầu Startup Reconcile Sweep quét các tác vụ BKT chưa hoàn tất...");

    let mut stmt = conn
        .prepare(
            "SELECT id, video_path, reup_path, test_channel_id
             FROM bkt_test_jobs
             WHERE status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
        )
        .map_err(|e| format!("Lỗi truy vấn reconcile bkt_test_jobs: {e}"))?;

    let interrupted: Vec<(String, String, Option<String>, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| format!("Lỗi map reconcile bkt_test_jobs: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let count = interrupted.len();

    // Dọn dẹp tệp reup tạm thời của các job bị gián đoạn và hoàn trả quota cho kênh test
    for (_, video_path, reup_path, test_channel_id) in &interrupted {
        if let Some(ref r_path) = reup_path {
            if r_path != video_path {
                let p = std::path::Path::new(r_path);
                if p.exists() {
                    let _ = std::fs::remove_file(p);
                    log::info!("[BKT RECONCILE] Đã xóa tệp reup tạm bị gián đoạn: {r_path}");
                }
            }
        }
        // Hoàn trả quota an toàn cho kênh test
        let _ = conn.execute(
            "UPDATE bkt_test_channels SET daily_used = MAX(0, daily_used - 1) WHERE id = ?1",
            rusqlite::params![test_channel_id],
        );
    }

    if count > 0 {
        let now_str = chrono::Local::now().to_rfc3339();
        let rows = conn
            .execute(
                "UPDATE bkt_test_jobs
                 SET status = 'failed',
                     restriction = 'Đã dừng khi ứng dụng khởi động lại',
                     error_message = 'Đã dừng khi ứng dụng khởi động lại',
                     updated_at = ?1
                 WHERE status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
                rusqlite::params![now_str],
            )
            .map_err(|e| format!("Lỗi cập nhật reconcile bkt_test_jobs: {e}"))?;

        // Đồng bộ cập nhật cho channel_videos liên quan
        if let Err(e) = conn.execute(
            "UPDATE channel_videos
             SET bkt_check_status = 'failed',
                 bkt_restriction = 'Đã dừng khi ứng dụng khởi động lại',
                 risk_reason = 'Đã dừng khi ứng dụng khởi động lại'
             WHERE video_id IN (
                 SELECT source_ref_id FROM bkt_test_jobs
                 WHERE video_source_type = 'channel_video' AND error_message = 'Đã dừng khi ứng dụng khởi động lại'
             ) OR id IN (
                 SELECT source_ref_id FROM bkt_test_jobs
                 WHERE video_source_type = 'channel_video' AND error_message = 'Đã dừng khi ứng dụng khởi động lại'
             )",
            [],
        ) {
            log::warn!("[BKT RECONCILE] Không thể đồng bộ channel_videos: {e}");
        }

        log::info!("[BKT RECONCILE] Startup Reconcile Sweep hoàn tất: Đã chuyển {rows} job bị kẹt sang 'failed'.");
    } else {
        log::info!("[BKT RECONCILE] Không có job BKT nào bị kẹt từ phiên trước.");
    }

    Ok(count)
}


