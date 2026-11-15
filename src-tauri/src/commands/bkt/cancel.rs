use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::database;
use crate::types::BktTestJob;

use super::*;

pub fn can_cancel_bkt_status(status: &str) -> bool {
    matches!(status, "queued" | "reuping" | "uploading" | "checking" | "pending")
}

pub fn should_refund_cancelled_quota(cancel_won: bool, youtube_video_id: Option<&str>) -> bool {
    cancel_won && youtube_video_id.is_none()
}

pub fn is_bkt_job_cancelled(job_id: &str) -> bool {
    if let Ok(set) = get_cancelled_bkt_jobs().read() {
        set.contains(job_id)
    } else {
        false
    }
}

pub fn mark_job_id_as_cancelled(job_id: &str) {
    if let Ok(mut set) = get_cancelled_bkt_jobs().write() {
        set.insert(job_id.to_string());
    }
}

pub fn unmark_job_id_as_cancelled(job_id: &str) {
    if let Ok(mut set) = get_cancelled_bkt_jobs().write() {
        set.remove(job_id);
    }
}

pub fn set_current_bkt_child_pid(pid: u32) {
    if let Ok(guard) = get_active_job_lock().lock() {
        if let Some(ref ctrl) = *guard {
            ctrl.child_pid.store(pid, Ordering::SeqCst);
        }
    }
}

pub fn set_current_bkt_reup_path(path: Option<String>) {
    if let Ok(guard) = get_active_job_lock().lock() {
        if let Some(ref ctrl) = *guard {
            if let Ok(mut rp) = ctrl.reup_path.write() {
                *rp = path;
            }
        }
    }
}

pub fn register_active_bkt_job(
    job_id: String,
    profile_id: String,
    video_path: String,
    reup_path: Option<String>,
    cancel_tx: oneshot::Sender<()>,
) -> (Arc<AtomicU32>, Arc<RwLock<Option<String>>>) {
    let child_pid = Arc::new(AtomicU32::new(0));
    let reup_lock = Arc::new(RwLock::new(reup_path));
    if let Ok(mut guard) = get_active_job_lock().lock() {
        *guard = Some(ActiveBktJobController {
            job_id,
            profile_id,
            video_path,
            reup_path: reup_lock.clone(),
            child_pid: child_pid.clone(),
            cancel_tx: Some(cancel_tx),
        });
    }
    (child_pid, reup_lock)
}

pub fn unregister_active_bkt_job(job_id: &str) {
    if let Ok(mut guard) = get_active_job_lock().lock() {
        if let Some(ref ctrl) = *guard {
            if ctrl.job_id == job_id {
                *guard = None;
            }
        }
    }
    unmark_job_id_as_cancelled(job_id);
}

pub fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    log::info!("[BKT CANCEL] Dừng tiến trình con PID: {pid}");
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        use crate::utils::CommandExt as _;
        let mut cmd = StdCommand::new("taskkill");
        cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
        cmd.hide_window();
        let _ = cmd.status();
    }
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        let mut cmd = StdCommand::new("kill");
        cmd.args(["-9", &pid.to_string()]);
        let _ = cmd.status();
    }
}

pub fn trigger_active_job_cancellation(target_job_id: &str) -> bool {
    let (matched, pid_to_kill) = {
        if let Ok(mut guard) = get_active_job_lock().lock() {
            if let Some(ref mut ctrl) = *guard {
                if ctrl.job_id == target_job_id {
                    if let Some(tx) = ctrl.cancel_tx.take() {
                        let _ = tx.send(());
                    }
                    let pid = ctrl.child_pid.load(Ordering::SeqCst);
                    (true, if pid > 0 { Some(pid) } else { None })
                } else {
                    (false, None)
                }
            } else {
                (false, None)
            }
        } else {
            (false, None)
        }
    };
    if let Some(pid) = pid_to_kill {
        kill_process_tree(pid);
    }
    matched
}

pub async fn handle_running_job_cancelled(
    app: &AppHandle,
    job: &mut BktTestJob,
    profile_id: &str,
) {
    // 1. Kill tiến trình con nếu còn (nhả lock trước khi gọi taskkill)
    let pid_to_kill = get_active_job_lock()
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|ctrl| ctrl.child_pid.load(Ordering::SeqCst)))
        .filter(|&pid| pid > 0);
    if let Some(pid) = pid_to_kill {
        kill_process_tree(pid);
    }

    // 2. Dừng profile Chromium nếu đã mở (timeout tối đa 3 giây tránh treo luồng)
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        crate::commands::profiles::stop_multibrowser_profile(app.clone(), profile_id.to_string()),
    )
    .await;

    // 3. Xóa file reup tạm
    let active_reup = if let Ok(guard) = get_active_job_lock().lock() {
        guard.as_ref().and_then(|c| c.reup_path.read().ok().and_then(|r| r.clone()))
    } else {
        None
    };
    let r_to_clean = active_reup.or_else(|| job.reup_path.clone());
    if let Some(ref r_path) = r_to_clean {
        if r_path != &job.video_path {
            let p = Path::new(r_path);
            if p.exists() {
                let _ = std::fs::remove_file(p);
                log::info!("[BKT CANCEL] Đã xóa file reup tạm: {r_path}");
            }
        }
    }

    // 4. Đọc bản ghi DB mới nhất để tránh ghi đè youtube_video_id thành NULL hoặc hoàn trả quota 2 lần
    let latest_db = database::get_bkt_test_job_by_id_db(&job.id).ok().flatten();
    let effective_yt_id = latest_db
        .as_ref()
        .and_then(|j| j.youtube_video_id.clone())
        .or_else(|| job.youtube_video_id.clone());
    let effective_reup_path = latest_db
        .as_ref()
        .and_then(|j| j.reup_path.clone())
        .or_else(|| job.reup_path.clone());
    let already_cancelled_by_cmd = latest_db
        .as_ref()
        .map(|j| j.status == "failed" && j.error_message.as_deref() == Some("Đã hủy bởi người dùng"))
        .unwrap_or(false);
    let cancel_reason = "Đã hủy bởi người dùng";
    job.youtube_video_id = effective_yt_id.clone();
    job.reup_path = effective_reup_path;
    job.status = "failed".to_string();
    job.restriction = Some(cancel_reason.to_string());
    job.error_message = Some(cancel_reason.to_string());
    if !already_cancelled_by_cmd && effective_yt_id.is_none() {
        let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
    }
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "failed",
        job.reup_path.as_deref(),
        job.youtube_video_id.as_deref(),
        Some(cancel_reason),
        Some(cancel_reason),
    );
    let _ = app.emit("bkt-test-job-updated", &job);

    // 5. Cập nhật channel_videos nếu có
    if job.video_source_type == "channel_video" {
        if let Some(ref ref_id) = job.source_ref_id {
            if let Ok(conn) = database::get_db() {
                let _ = conn.execute(
                    "UPDATE channel_videos SET bkt_check_status = 'failed', bkt_restriction = ?1, risk_reason = ?1 WHERE video_id = ?2 OR id = ?2",
                    rusqlite::params![cancel_reason, ref_id],
                );
            }
        }
    }
}



#[tauri::command]
pub async fn cancel_bkt_job(app: AppHandle, job_id: String) -> Result<(), String> {
    log::info!("[BKT CANCEL] Nhận yêu cầu hủy tác vụ BKT: {job_id}");

    let current_job = database::get_bkt_test_job_by_id_db(&job_id)?
        .ok_or_else(|| format!("Không tìm thấy job BKT có ID: {job_id}"))?;
    if !can_cancel_bkt_status(&current_job.status) {
        return Err(format!("Không thể hủy job BKT ở trạng thái terminal: {}", current_job.status));
    }

    // 1. Đánh dấu job_id vào danh sách đã hủy (để nếu đang trong hàng đợi FIFO sẽ bị bỏ qua khi worker lấy ra)
    mark_job_id_as_cancelled(&job_id);

    let cancel_reason = "Đã hủy bởi người dùng";

    // 2. Atomically cancel + refund; terminal/raced jobs remain untouched.
    if !database::cancel_bkt_test_job_and_refund_quota_db(&job_id, cancel_reason)? {
        unmark_job_id_as_cancelled(&job_id);
        return Err("Tác vụ BKT đã hoàn tất hoặc không còn ở trạng thái có thể hủy".to_string());
    }
    // 3. Kích hoạt hủy tác vụ đang chạy nếu job_id trùng với job hiện tại
    let was_running = trigger_active_job_cancellation(&job_id);

    // 4. Lấy dữ liệu job để dọn dẹp file tạm và emit event cho UI
    if let Ok(Some(mut job)) = database::get_bkt_test_job_by_id_db(&job_id) {
        // Dọn dẹp file reup tạm nếu có
        if let Some(ref r_path) = job.reup_path {
            if r_path != &job.video_path {
                let p = Path::new(r_path);
                if p.exists() {
                    let _ = std::fs::remove_file(p);
                    log::info!("[BKT CANCEL] Đã xóa file reup tạm: {r_path}");
                }
            }
        }

        // Cập nhật channel_videos nếu job xuất phát từ video kênh
        if job.video_source_type == "channel_video" {
            if let Some(ref ref_id) = job.source_ref_id {
                if let Ok(conn) = database::get_db() {
                    let _ = conn.execute(
                        "UPDATE channel_videos SET bkt_check_status = 'failed', bkt_restriction = ?1, risk_reason = ?1 WHERE video_id = ?2 OR id = ?2",
                        rusqlite::params![cancel_reason, ref_id],
                    );
                }
            }
        }

        job.status = "failed".to_string();
        job.restriction = Some(cancel_reason.to_string());
        job.error_message = Some(cancel_reason.to_string());
        let _ = app.emit("bkt-test-job-updated", &job);
    }

    log::info!(
        "[BKT CANCEL] Đã hủy tác vụ BKT: {job_id} (Đang chạy: {was_running})."
    );
    Ok(())
}

/// Hủy bỏ toàn bộ các tác vụ BKT đang chạy hoặc đang trong hàng đợi
#[tauri::command]
pub async fn cancel_all_bkt_jobs(app: AppHandle) -> Result<usize, String> {
    log::info!("[BKT CANCEL] Nhận yêu cầu hủy TẤT CẢ các tác vụ BKT...");

    // 1. Lấy danh sách tất cả các job chưa hoàn tất (giải phóng lock DB trước khi hủy process & gọi helper _db khác)
    let jobs_to_cancel: Vec<(String, String, Option<String>, String, Option<String>)> = {
        let conn = database::get_db()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, video_source_type, source_ref_id, video_path, reup_path
                 FROM bkt_test_jobs
                 WHERE status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            )
            .map_err(|e| format!("Lỗi truy vấn job BKT: {e}"))?;

        let rows: Vec<(String, String, Option<String>, String, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| format!("Lỗi map jobs: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    // 2. Đánh dấu tất cả ID vào danh sách đã hủy
    for (id, _, _, _, _) in &jobs_to_cancel {
        mark_job_id_as_cancelled(id);
    }

    let cancel_reason = "Đã hủy bởi người dùng";

    // 3-4. Hủy + hoàn quota atomically từng job; chỉ job active thắng race mới được chuyển trạng thái.
    let mut cancelled_ids = std::collections::HashSet::new();
    for (id, _, _, _, _) in &jobs_to_cancel {
        if database::cancel_bkt_test_job_and_refund_quota_db(id, cancel_reason)? {
            cancelled_ids.insert(id.clone());
        } else {
            unmark_job_id_as_cancelled(id);
        }
    }
    let count = cancelled_ids.len();
    {
        let conn = database::get_db()?;
        for (id, video_source_type, source_ref_id, _, _) in &jobs_to_cancel {
            if !cancelled_ids.contains(id) || video_source_type != "channel_video" {
                continue;
            }
            if let Some(ref_id) = source_ref_id {
                let _ = conn.execute(
                    "UPDATE channel_videos
                     SET bkt_check_status = 'failed', bkt_restriction = ?1, risk_reason = ?1
                     WHERE video_id = ?2 OR id = ?2",
                    rusqlite::params![cancel_reason, ref_id],
                );
            }
        }
    }

    // 5. Chỉ signal job mà lệnh này vừa cancel thắng race.
    for id in &cancelled_ids {
        trigger_active_job_cancellation(id);
    }
    // 6. Chỉ dọn dẹp/emit các job mà lệnh này thật sự thắng race hủy.
    for (id, _, _, video_path, reup_path) in jobs_to_cancel {
        if !cancelled_ids.contains(&id) {
            continue;
        }
        if let Some(ref r_path) = reup_path {
            if r_path != &video_path {
                let p = Path::new(r_path);
                if p.exists() {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
        if let Ok(Some(job)) = database::get_bkt_test_job_by_id_db(&id) {
            let _ = app.emit("bkt-test-job-updated", &job);
        }
        unmark_job_id_as_cancelled(&id);
    }

    log::info!("[BKT CANCEL] Đã hủy thành công tất cả {count} tác vụ BKT.");
    Ok(count)
}

