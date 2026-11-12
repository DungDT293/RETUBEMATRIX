use crate::database::connection::get_db;
use crate::types::{DailyReportStats, DailyTimelineEvent};
use chrono::{Duration, Local, NaiveDate, TimeZone};
use rusqlite::params;

/// Lấy thống kê tổng hợp và timeline cho Báo Cáo Hoạt Động (Hôm nay / Hôm qua / 7 ngày / Ngày cụ thể)
pub fn get_daily_report_stats_db(date_filter: Option<String>) -> Result<DailyReportStats, String> {
    let conn = get_db()?;
    let now = Local::now();
    let today = now.date_naive();

    // 1. Phân giải date_filter thành [start_date, end_date] (YYYY-MM-DD)
    let (start_date_naive, end_date_naive, label_date) = match date_filter.as_deref().map(str::trim) {
        None | Some("") | Some("today") => (today, today, today.format("%Y-%m-%d").to_string()),
        Some("yesterday") => {
            let y = today - Duration::days(1);
            (y, y, y.format("%Y-%m-%d").to_string())
        }
        Some("7days") => {
            let s = today - Duration::days(6);
            (s, today, format!("{} - {}", s.format("%d/%m"), today.format("%d/%m/%Y")))
        }
        Some(custom) => {
            if let Ok(nd) = NaiveDate::parse_from_str(custom, "%Y-%m-%d") {
                (nd, nd, nd.format("%Y-%m-%d").to_string())
            } else {
                (today, today, today.format("%Y-%m-%d").to_string())
            }
        }
    };

    let start_date_str = start_date_naive.format("%Y-%m-%d").to_string();
    let end_date_str = end_date_naive.format("%Y-%m-%d").to_string();

    // 2. Tính range Unix timestamp (giây) cho bảng history theo giờ địa phương (Tránh bug lệch múi giờ)
    let start_ts = start_date_naive
        .and_hms_opt(0, 0, 0)
        .and_then(|naive| Local.from_local_datetime(&naive).single())
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| now.timestamp() - (now.timestamp() % 86400));

    let end_ts = end_date_naive
        .and_hms_opt(23, 59, 59)
        .and_then(|naive| Local.from_local_datetime(&naive).single())
        .map(|dt| dt.timestamp() + 1)
        .unwrap_or_else(|| start_ts + 86400);

    // 3. Tổng video cào/phát hiện trong khoảng ngày (channel_videos + outlier_videos)
    let total_discovered_today: i64 = conn
        .query_row(
            "SELECT (
                (SELECT count(*) FROM channel_videos WHERE substr(created_at, 1, 10) >= ?1 AND substr(created_at, 1, 10) <= ?2) +
                (SELECT count(*) FROM outlier_videos WHERE substr(created_at, 1, 10) >= ?1 AND substr(created_at, 1, 10) <= ?2)
             )",
            params![&start_date_str, &end_date_str],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 4. Tổng video tải về & dung lượng (Range scan trên idx_history_downloaded)
    let (total_downloaded_today, total_download_size_bytes): (i64, i64) = conn
        .query_row(
            "SELECT count(*), coalesce(sum(filesize), 0)
             FROM history
             WHERE downloaded_at >= ?1 AND downloaded_at < ?2",
            params![start_ts, end_ts],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0, 0));

    // 5. Thống kê công việc BKT & video đã đăng kênh chính
    let (
        total_bkt_tested_today,
        bkt_clean_count,
        bkt_claimed_count,
        bkt_pending_count,
        total_reup_today,
        total_published_main_today,
    ): (i64, i64, i64, i64, i64, i64) = conn
        .query_row(
            "SELECT count(*),
                    coalesce(sum(case when status = 'green_clean' then 1 else 0 end), 0),
                    coalesce(sum(case when status = 'red_matched' then 1 else 0 end), 0),
                    coalesce(sum(case when status in ('pending', 'checking', 'uploading', 'queued') then 1 else 0 end), 0),
                    coalesce(sum(case when status = 'reuping' OR status = 'reup_done' OR reup_path IS NOT NULL OR restriction LIKE '%Reup%' OR restriction LIKE '%reup%' then 1 else 0 end), 0),
                    coalesce(sum(case when (auto_publish_main = 1 AND (restriction LIKE '%Đã tự động xuất bản%' OR restriction LIKE '%Đã xuất bản%'))
                                           OR restriction LIKE '%Đã tự động xuất bản%'
                                           OR restriction LIKE '%Đã xuất bản Công khai%'
                                           OR restriction LIKE '%Đã đăng lên Kênh Đích%' then 1 else 0 end), 0)
             FROM bkt_test_jobs
             WHERE (tested_date >= ?1 AND tested_date <= ?2)
                OR (substr(created_at, 1, 10) >= ?1 AND substr(created_at, 1, 10) <= ?2)",
            params![&start_date_str, &end_date_str],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .unwrap_or((0, 0, 0, 0, 0, 0));

    // 6. Thống kê Quota test BKT (Hạn ngạch ngày của các kênh đang hoạt động)
    let (test_quota_total, test_quota_used): (i64, i64) = conn
        .query_row(
            "SELECT coalesce(sum(daily_quota), 0), coalesce(sum(daily_used), 0)
             FROM bkt_test_channels
             WHERE is_active = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0, 0));
    let test_quota_remaining = (test_quota_total - test_quota_used).max(0);

    // 7. Timeline Events (Hợp nhất từ BKT jobs, Download History và Scraped Videos)
    let mut timeline_events = Vec::new();

    // 7.1. BKT test jobs timeline
    let mut stmt_jobs = conn
        .prepare(
            "SELECT j.id, j.video_title, tc.name, j.status, j.restriction, j.created_at, j.updated_at
             FROM bkt_test_jobs j
             LEFT JOIN bkt_test_channels tc ON j.test_channel_id = tc.id
             WHERE (j.tested_date >= ?1 AND j.tested_date <= ?2)
                OR (substr(j.created_at, 1, 10) >= ?1 AND substr(j.created_at, 1, 10) <= ?2)
             ORDER BY j.updated_at DESC
             LIMIT 40",
        )
        .map_err(|e| format!("Lỗi prepare bkt_test_jobs timeline: {e}"))?;

    let job_rows = stmt_jobs
        .query_map(params![&start_date_str, &end_date_str], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let ch_name: Option<String> = row.get(2)?;
            let status: String = row.get(3)?;
            let restriction: Option<String> = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;

            let is_published = restriction
                .as_deref()
                .map(|r| r.contains("Đã tự động xuất bản") || r.contains("Đã xuất bản Công khai") || r.contains("Đã đăng lên Kênh Đích"))
                .unwrap_or(false);

            let is_reup = status == "reuping"
                || status == "reup_done"
                || (!is_published && restriction.as_deref().map(|r| r.contains("Reup") || r.contains("reup") || r.contains("làm sạch") || r.contains("Edit")).unwrap_or(false));

            let time = if updated_at.len() >= 16 {
                updated_at[11..16].to_string()
            } else if created_at.len() >= 16 {
                created_at[11..16].to_string()
            } else {
                "00:00".to_string()
            };

            let ev_type = if is_published {
                "auto_publish".to_string()
            } else if is_reup {
                "reup".to_string()
            } else {
                "bkt_test".to_string()
            };

            let final_status = if is_published {
                "published".to_string()
            } else {
                status
            };

            Ok(DailyTimelineEvent {
                id,
                event_type: ev_type,
                time,
                timestamp: updated_at,
                title,
                channel_name: ch_name,
                status: final_status,
                details: restriction,
            })
        })
        .map_err(|e| format!("Lỗi map timeline bkt_test_jobs: {e}"))?;

    for r in job_rows.flatten() {
        timeline_events.push(r);
    }

    // 7.2. Download history timeline
    let mut stmt_hist = conn
        .prepare(
            "SELECT id, title, downloaded_at, format, quality, source
             FROM history
             WHERE downloaded_at >= ?1 AND downloaded_at < ?2
             ORDER BY downloaded_at DESC
             LIMIT 40",
        )
        .map_err(|e| format!("Lỗi prepare history timeline: {e}"))?;

    let hist_rows = stmt_hist
        .query_map(params![start_ts, end_ts], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let ts: i64 = row.get(2)?;
            let fmt: Option<String> = row.get(3)?;
            let quality: Option<String> = row.get(4)?;
            let source: Option<String> = row.get(5)?;

            let dt = chrono::DateTime::from_timestamp(ts, 0)
                .map(|t| t.with_timezone(&Local))
                .unwrap_or_else(Local::now);

            let time = dt.format("%H:%M").to_string();
            let timestamp = dt.to_rfc3339();

            let mut detail_parts = Vec::new();
            if let Some(f) = fmt {
                detail_parts.push(f.to_uppercase());
            }
            if let Some(q) = quality {
                detail_parts.push(q);
            }
            let details = if detail_parts.is_empty() {
                None
            } else {
                Some(detail_parts.join(" • "))
            };

            Ok(DailyTimelineEvent {
                id,
                event_type: "download".to_string(),
                time,
                timestamp,
                title,
                channel_name: source,
                status: "downloaded".to_string(),
                details,
            })
        })
        .map_err(|e| format!("Lỗi map timeline history: {e}"))?;

    for r in hist_rows.flatten() {
        timeline_events.push(r);
    }

    // 7.3. Scraped channel videos timeline
    let mut stmt_discovered = conn
        .prepare(
            "SELECT cv.id, cv.title, cv.created_at, fc.name, cv.risk_status
             FROM channel_videos cv
             LEFT JOIN followed_channels fc ON cv.channel_id = fc.id
             WHERE substr(cv.created_at, 1, 10) >= ?1 AND substr(cv.created_at, 1, 10) <= ?2
             ORDER BY cv.created_at DESC
             LIMIT 30",
        )
        .map_err(|e| format!("Lỗi prepare channel_videos timeline: {e}"))?;

    let disc_rows = stmt_discovered
        .query_map(params![&start_date_str, &end_date_str], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let created_at: String = row.get(2)?;
            let channel_name: Option<String> = row.get(3)?;
            let risk_status: Option<String> = row.get(4)?;

            let time = if created_at.len() >= 16 {
                created_at[11..16].to_string()
            } else {
                "00:00".to_string()
            };

            let risk_text = match risk_status.as_deref() {
                Some("green") => "An toàn (Xanh)",
                Some("yellow") => "Lưu ý (Vàng)",
                Some("red") => "Rủi ro (Đỏ)",
                _ => "Chưa phân loại",
            };

            Ok(DailyTimelineEvent {
                id,
                event_type: "discovered".to_string(),
                time,
                timestamp: created_at,
                title,
                channel_name,
                status: "discovered".to_string(),
                details: Some(format!("Độ rủi ro: {risk_text}")),
            })
        })
        .map_err(|e| format!("Lỗi map timeline channel_videos: {e}"))?;

    for r in disc_rows.flatten() {
        timeline_events.push(r);
    }

    // 7.4. Sắp xếp timeline theo thứ tự thời gian giảm dần (mới nhất lên đầu)
    timeline_events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    timeline_events.truncate(50);

    Ok(DailyReportStats {
        target_date: label_date,
        total_discovered_today,
        total_downloaded_today,
        total_download_size_bytes,
        total_bkt_tested_today,
        bkt_clean_count,
        bkt_claimed_count,
        bkt_pending_count,
        total_reup_today,
        total_published_main_today,
        test_quota_total,
        test_quota_used,
        test_quota_remaining,
        timeline_events,
    })
}
