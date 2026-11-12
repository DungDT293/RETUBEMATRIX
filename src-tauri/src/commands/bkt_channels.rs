use base64::prelude::*;
use chrono::Local;
use futures_util::FutureExt;
use rusqlite::params;
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Semaphore};

use crate::commands::profiles::create_runner_cmd;
use crate::database;
use crate::types::{
    BktBatchDispatchRequest, BktDispatchItemResult, BktDispatchResult, BktTestChannel,
    BktTestChannelInput, BktTestJob, MultiBrowserUploadParams,
};
use crate::utils::CommandExt;

struct BktWorkerTask {
    app: AppHandle,
    job: BktTestJob,
    profile_id: String,
}

#[allow(dead_code)]
struct ActiveBktJobController {
    job_id: String,
    profile_id: String,
    video_path: String,
    reup_path: Arc<RwLock<Option<String>>>,
    child_pid: Arc<AtomicU32>,
    cancel_tx: Option<oneshot::Sender<()>>,
}

static BKT_SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
static BKT_TASK_SENDER: OnceLock<mpsc::UnboundedSender<BktWorkerTask>> = OnceLock::new();
static CANCELLED_BKT_JOBS: OnceLock<Arc<RwLock<HashSet<String>>>> = OnceLock::new();
static CURRENT_ACTIVE_JOB: OnceLock<Mutex<Option<ActiveBktJobController>>> = OnceLock::new();

/// Lấy Semaphore giới hạn số lượng tác vụ BKT chạy đồng thời (mặc định 1 video tại 1 thời điểm)
pub fn get_bkt_semaphore() -> &'static Arc<Semaphore> {
    BKT_SEMAPHORE.get_or_init(|| Arc::new(Semaphore::new(1)))
}

fn get_cancelled_bkt_jobs() -> &'static Arc<RwLock<HashSet<String>>> {
    CANCELLED_BKT_JOBS.get_or_init(|| Arc::new(RwLock::new(HashSet::new())))
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

/// Đảm bảo tiêu đề YouTube luôn an toàn tuyệt đối dưới max_len ký tự (mặc định 95),
/// cắt lùi theo ranh giới từ vựng (Word-Boundary) để không bao giờ cắt đứt nửa từ hay để dấu câu thừa.
pub fn sanitize_youtube_title_safe(raw: &str, max_len: usize) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() <= max_len {
        return trimmed.to_string();
    }
    let candidate: String = trimmed.chars().take(max_len).collect();
    let min_boundary = (max_len * 4) / 10;
    if let Some(last_space_idx) = candidate.rfind(|c: char| c.is_whitespace() || c == ' ') {
        if last_space_idx >= min_boundary {
            let sliced = &candidate[..last_space_idx];
            return sliced
                .trim_end_matches(|c: char| c.is_ascii_punctuation() || c == '—' || c == '–' || c == '|' || c == '•')
                .trim()
                .to_string();
        }
    }
    candidate
        .trim_end_matches(|c: char| c.is_ascii_punctuation() || c == '—' || c == '–' || c == '|' || c == '•')
        .trim()
        .to_string()
}

/// Cổng kiểm tra tính toàn vẹn của tệp video đã edit trước khi đưa sang Playwright upload
pub async fn verify_video_ready_for_upload(video_path: &Path) -> Result<(), String> {
    if !video_path.exists() {
        return Err(format!("Tệp video không tồn tại: {}", video_path.display()));
    }
    if !video_path.is_file() {
        return Err(format!("Đường dẫn không phải là tệp: {}", video_path.display()));
    }
    let metadata = std::fs::metadata(video_path)
        .map_err(|e| format!("Không thể đọc thông tin tệp video: {e}"))?;
    if metadata.len() < 100_000 {
        return Err(format!(
            "Tệp video bị hỏng hoặc kích thước quá nhỏ (chỉ {} bytes), không đủ điều kiện upload!",
            metadata.len()
        ));
    }
    // Thử mở tệp đọc thử để đảm bảo tiến trình FFmpeg / render đã flush và nhả khóa file hoàn toàn
    let mut file_ready = false;
    for attempt in 1..=5 {
        match std::fs::File::open(video_path) {
            Ok(_) => {
                file_ready = true;
                break;
            }
            Err(e) => {
                log::warn!(
                    "[INTEGRITY GATE] Tệp video đang bị khóa (lần thử {}/5): {e}. Chờ 300ms...",
                    attempt
                );
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
        }
    }
    if !file_ready {
        return Err(format!(
            "Tệp video {} vẫn đang bị tiến trình khác chiếm dụng, chưa sẵn sàng tải lên!",
            video_path.display()
        ));
    }
    Ok(())
}

fn get_active_job_lock() -> &'static Mutex<Option<ActiveBktJobController>> {
    CURRENT_ACTIVE_JOB.get_or_init(|| Mutex::new(None))
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

fn register_active_bkt_job(
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

fn unregister_active_bkt_job(job_id: &str) {
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

pub fn trigger_active_job_cancellation_any() -> bool {
    let (matched, pid_to_kill) = {
        if let Ok(mut guard) = get_active_job_lock().lock() {
            if let Some(ref mut ctrl) = *guard {
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
    };
    if let Some(pid) = pid_to_kill {
        kill_process_tree(pid);
    }
    matched
}

async fn handle_running_job_cancelled(
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
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "failed",
        effective_reup_path.as_deref(),
        effective_yt_id.as_deref(),
        Some(cancel_reason),
        Some(cancel_reason),
    );

    job.youtube_video_id = effective_yt_id.clone();
    job.reup_path = effective_reup_path;
    job.status = "failed".to_string();
    job.restriction = Some(cancel_reason.to_string());
    job.error_message = Some(cancel_reason.to_string());
    // Chỉ hoàn quota nếu cancel_bkt_job chưa hoàn và video chưa kịp upload lên YouTube
    if !already_cancelled_by_cmd && effective_yt_id.is_none() {
        let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
    }
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


/// Helper đánh dấu job thất bại, giải phóng file reup tạm và cập nhật đồng bộ cả restriction + error_message (chống rò rỉ restriction cũ)
pub fn mark_job_as_failed(app: &AppHandle, job: &mut BktTestJob, err_msg: String) {
    if let Some(ref r_path) = job.reup_path {
        if r_path != &job.video_path {
            let p = Path::new(r_path);
            if p.exists() {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    // Hoàn trả 1 quota cho kênh test nếu job thất bại trước khi kịp upload unlisted lên YouTube
    if job.youtube_video_id.is_none() {
        let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
    }
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "failed",
        job.reup_path.as_deref(),
        job.youtube_video_id.as_deref(),
        Some(&err_msg),
        Some(&err_msg),
    );
    job.status = "failed".to_string();
    job.restriction = Some(err_msg.clone());
    job.error_message = Some(err_msg.clone());
    let _ = app.emit("bkt-test-job-updated", &job);
    crate::commands::profiles::clear_stats_cache();

    if job.video_source_type == "channel_video" {
        if let Some(ref ref_id) = job.source_ref_id {
            if let Ok(conn) = database::get_db() {
                let _ = conn.execute(
                    "UPDATE channel_videos SET bkt_check_status = 'failed', bkt_restriction = ?1, risk_reason = ?1 WHERE video_id = ?2 OR id = ?2",
                    rusqlite::params![&err_msg, ref_id],
                );
            }
        }
    }
}

/// Pre-flight validation & Auto-Heal cho hồ sơ trình duyệt liên kết với kênh test
pub fn resolve_profile_id_with_auto_heal(
    raw_profile_id: &str,
    channel_name: &str,
    profiles: &[crate::types::MultiBrowserProfile],
) -> Result<(String, Option<String>), String> {
    let trimmed = raw_profile_id.trim();
    if let Some(p) = profiles.iter().find(|p| p.id == trimmed) {
        return Ok((p.id.clone(), None));
    }

    // Auto-heal 1: Đối chiếu theo profile_name == raw_profile_id
    // Auto-heal 2: Đối chiếu theo profile_name == channel_name (trường hợp user đặt tên kênh test trùng tên profile)
    let ch_trimmed = channel_name.trim();
    let healed = profiles.iter().find(|p| {
        p.profile_name.trim().eq_ignore_ascii_case(trimmed)
            || (!ch_trimmed.is_empty() && p.profile_name.trim().eq_ignore_ascii_case(ch_trimmed))
    });

    if let Some(h) = healed {
        Ok((h.id.clone(), Some(h.profile_name.clone())))
    } else {
        Err(format!(
            "Hồ sơ trình duyệt không tồn tại (Profile ID: '{}'). Vui lòng cấu hình lại trong Quản Lý Kênh Test.",
            trimmed
        ))
    }
}

fn get_bkt_task_sender(_app: &AppHandle) -> &'static mpsc::UnboundedSender<BktWorkerTask> {
    BKT_TASK_SENDER.get_or_init(|| {
        let (tx, mut rx) = mpsc::unbounded_channel::<BktWorkerTask>();

        tauri::async_runtime::spawn(async move {
            log::info!("[BKT WORKER] Khởi tạo BKT Concurrency Limiter & FIFO Worker Loop (Max 1 concurrent task)...");
            while let Some(task) = rx.recv().await {
                let job_id = task.job.id.clone();

                // 1. Kiểm tra nếu job đã bị hủy khi đang chờ trong FIFO queue
                if is_bkt_job_cancelled(&job_id) {
                    log::info!("[BKT WORKER] Job {} đã bị hủy khi đang chờ trong hàng đợi. Bỏ qua không chạy.", job_id);
                    unmark_job_id_as_cancelled(&job_id);
                    if let Some(ref r_path) = task.job.reup_path {
                        if r_path != &task.job.video_path {
                            let _ = std::fs::remove_file(Path::new(r_path));
                        }
                    }
                    continue;
                }

                // 2. Chờ lấy permit Semaphore
                let sem = get_bkt_semaphore();
                let permit = match sem.acquire().await {
                    Ok(p) => p,
                    Err(e) => {
                        log::error!("[BKT WORKER] Semaphore error: {e}");
                        break;
                    }
                };

                // 3. Kiểm tra lại cờ hủy sau khi nhận permit
                if is_bkt_job_cancelled(&job_id) {
                    log::info!("[BKT WORKER] Job {} đã bị hủy ngay trước khi bắt đầu. Giải phóng permit và bỏ qua.", job_id);
                    unmark_job_id_as_cancelled(&job_id);
                    drop(permit);
                    continue;
                }

                log::info!(
                    "[BKT WORKER] Bắt đầu thực thi job FIFO: {} (Video: '{}')",
                    job_id,
                    task.job.video_title
                );

                let job_title = task.job.video_title.clone();
                let cloned_app = task.app.clone();
                let mut job_clone = task.job.clone();
                let profile_id = task.profile_id.clone();

                let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
                let (_child_pid, _reup_lock) = register_active_bkt_job(
                    job_id.clone(),
                    profile_id.clone(),
                    task.job.video_path.clone(),
                    task.job.reup_path.clone(),
                    cancel_tx,
                );

                let pipeline_fut = run_single_bkt_job_pipeline(
                    task.app,
                    task.job,
                    task.profile_id,
                );

                tokio::select! {
                    _ = &mut cancel_rx => {
                        log::info!("[BKT WORKER] Job {} ('{}') nhận tín hiệu hủy trong khi đang chạy. Tiến hành dọn dẹp.", job_id, job_title);
                        handle_running_job_cancelled(&cloned_app, &mut job_clone, &profile_id).await;
                    }
                    res = std::panic::AssertUnwindSafe(pipeline_fut).catch_unwind() => {
                        if let Err(panic_err) = res {
                            let panic_msg = if let Some(s) = panic_err.downcast_ref::<&str>() {
                                s.to_string()
                            } else if let Some(s) = panic_err.downcast_ref::<String>() {
                                s.clone()
                            } else {
                                "Unknown panic in BKT pipeline".to_string()
                            };
                            log::error!(
                                "[BKT WORKER] Job {} ('{}') gặp lỗi nghiêm trọng (Panic): {}",
                                job_id,
                                job_title,
                                panic_msg
                            );
                            mark_job_as_failed(
                                &cloned_app,
                                &mut job_clone,
                                format!("Lỗi hệ thống nghiêm trọng (Internal Panic): {panic_msg}"),
                            );
                        }
                    }
                }

                unregister_active_bkt_job(&job_id);
                drop(permit);
                log::info!("[BKT WORKER] Đã hoàn tất xử lý job: {job_id}. Giải phóng semaphore permit.");
            }
            log::warn!("[BKT WORKER] Worker channel đã đóng.");
        });

        tx
    })
}

/// Đưa một tác vụ BKT vào hàng đợi FIFO an toàn
pub fn enqueue_bkt_job(app: &AppHandle, job: BktTestJob, profile_id: String) {
    let sender = get_bkt_task_sender(app);
    if let Err(e) = sender.send(BktWorkerTask {
        app: app.clone(),
        job,
        profile_id,
    }) {
        log::error!("[BKT WORKER] Không thể enqueue task vào worker channel: {e}");
    }
}

/// Xóa an toàn tệp video gốc, video sau reup, thumbnail và file mô tả companion để giải phóng ổ cứng
pub fn cleanup_video_and_reup_files(
    video_path: &str,
    reup_path: Option<&str>,
    thumbnail_path: Option<&str>,
) -> u64 {
    let mut freed_bytes: u64 = 0;

    let mut remove_safe = |p_str: &str| {
        let p = Path::new(p_str);
        if p.exists() && p.is_file() {
            if let Ok(meta) = p.metadata() {
                freed_bytes += meta.len();
            }
            if let Err(e) = std::fs::remove_file(p) {
                log::warn!("[CLEANUP] Chưa thể xóa file {p_str}: {e}");
            } else {
                log::info!("[CLEANUP] Đã xóa file giải phóng ổ đĩa: {p_str}");
            }
        }
    };

    remove_safe(video_path);

    if let Some(r_path) = reup_path {
        if r_path != video_path {
            remove_safe(r_path);
        }
    }

    if let Some(t_path) = thumbnail_path {
        remove_safe(t_path);
    }

    let p_vid = Path::new(video_path);
    let desc_candidate = p_vid.with_extension("description");
    if desc_candidate.exists() && desc_candidate.is_file() {
        remove_safe(&desc_candidate.to_string_lossy());
    }

    let info_candidate = p_vid.with_extension("info.json");
    if info_candidate.exists() && info_candidate.is_file() {
        remove_safe(&info_candidate.to_string_lossy());
    }

    // Direct companion candidates (e.g. video.mp4.info.json, video.mp4.description)
    let direct_info = format!("{video_path}.info.json");
    if Path::new(&direct_info).exists() {
        remove_safe(&direct_info);
    }
    let direct_desc = format!("{video_path}.description");
    if Path::new(&direct_desc).exists() {
        remove_safe(&direct_desc);
    }

    // Companion thumbnails by extension (.webp, .jpg, .jpeg, .png)
    for ext in &["webp", "jpg", "jpeg", "png"] {
        let thumb_candidate = p_vid.with_extension(ext);
        if thumb_candidate.exists() && thumb_candidate.is_file() {
            remove_safe(&thumb_candidate.to_string_lossy());
        }
        let direct_thumb = format!("{video_path}.{ext}");
        if Path::new(&direct_thumb).exists() {
            remove_safe(&direct_thumb);
        }
    }

    freed_bytes
}

#[tauri::command]
pub async fn cleanup_reup_artifacts_cmd(
    video_path: String,
    reup_path: Option<String>,
    thumbnail_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let freed_bytes = cleanup_video_and_reup_files(
        &video_path,
        reup_path.as_deref(),
        thumbnail_path.as_deref(),
    );
    let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);
    Ok(serde_json::json!({
        "success": true,
        "freedBytes": freed_bytes,
        "freedMb": (freed_mb * 100.0).round() / 100.0,
    }))
}

/// Lấy danh sách các Kênh Test Bản Quyền (tự động reset quota ngày mới)
#[tauri::command]
pub async fn get_bkt_test_channels() -> Result<Vec<BktTestChannel>, String> {
    database::get_bkt_test_channels_db()
}

/// Tạo mới hoặc cập nhật thông tin Kênh Test Bản Quyền (Tự động cấp phát Chromium Profile riêng biệt)
#[tauri::command]
pub async fn save_bkt_test_channel(
    app: AppHandle,
    mut input: BktTestChannelInput,
) -> Result<BktTestChannel, String> {
    if input.name.trim().is_empty() {
        return Err("Tên kênh test không được để trống".to_string());
    }
    if input.daily_quota <= 0 {
        return Err("Hạn ngạch video/ngày phải lớn hơn 0".to_string());
    }

    // Nếu chưa có profile_id (tạo mới từ modal chuẩn hóa), tự động sinh Profile Chromium riêng biệt cho kênh test
    if input.profile_id.trim().is_empty() {
        let base_name = format!("[BKT Test] {}", input.name.trim());
        let existing_profiles = crate::commands::profiles::get_all_raw_multibrowser_profiles(app.clone())
            .await
            .unwrap_or_default();
        let normalize_key = |s: &str| -> String {
            s.split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase()
        };
        let existing_keys: std::collections::HashSet<String> = existing_profiles
            .iter()
            .map(|p| normalize_key(&p.profile_name))
            .collect();
        let mut test_prof_name = base_name.clone();
        let mut suffix = 2usize;
        while existing_keys.contains(&normalize_key(&test_prof_name)) {
            test_prof_name = format!("{base_name} #{suffix}");
            suffix += 1;
        }
        let new_prof = crate::commands::profiles::save_multibrowser_profile(
            app.clone(),
            crate::types::MultiBrowserProfileInput {
                id: None,
                profile_name: test_prof_name,
                proxy: None,
                group: Some("Kênh Test BKT".to_string()),
                locale: None,
                youtube_preferred_channel: None,
                note: Some(format!("Profile Chromium riêng biệt phục vụ Kênh Test Bản Quyền '{}' (Độc lập 100% với Kênh Đích)", input.name.trim())),
                color: Some("#8b5cf6".to_string()),
            },
        ).await.map_err(|e| format!("Không thể tự động khởi tạo Hồ sơ Chromium cho Kênh Test: {e}"))?;
        input.profile_id = new_prof.id;
    }

    database::save_bkt_test_channel_db(input)
}

/// Xóa một Kênh Test Bản Quyền
#[tauri::command]
pub async fn delete_bkt_test_channel(channel_id: String) -> Result<(), String> {
    database::delete_bkt_test_channel_db(&channel_id)
}

/// Lấy danh sách lịch sử tác vụ test video
#[tauri::command]
pub async fn get_bkt_test_jobs(limit: Option<i64>) -> Result<Vec<BktTestJob>, String> {
    database::get_bkt_test_jobs_db(limit)
}

/// Điều phối phân bổ hàng loạt video sang các Kênh Test Bản Quyền (Load Balancing & Quota Check)
#[tauri::command]
pub async fn dispatch_batch_bkt_test(
    app: AppHandle,
    payload: BktBatchDispatchRequest,
) -> Result<BktDispatchResult, String> {
    if payload.items.is_empty() {
        return Err("Vui lòng chọn ít nhất 1 video để test bản quyền".to_string());
    }

    // 1. Kiểm tra tính hợp lệ của các file video
    for item in &payload.items {
        let p = Path::new(&item.video_path);
        if !p.exists() {
            return Err(format!(
                "Tệp video '{}' không tồn tại trên máy tính: {}",
                item.video_title, item.video_path
            ));
        }
    }

    // 2. Lấy danh sách kênh test
    let channels = database::get_bkt_test_channels_db()?;
    if channels.is_empty() {
        return Err(
            "Bạn chưa cấu hình Kênh Test Bản Quyền nào trong hệ thống. Vui lòng vào mục 'Reup & BKT Test' → Tab 'Quản Lý Kênh Test BKT' để thêm kênh test (gán với một Profile BrowserMulti đã đăng nhập YouTube Studio) trước khi kiểm tra bản quyền.".to_string(),
        );
    }
    let today = Local::now().format("%Y-%m-%d").to_string();

    let profiles = crate::commands::profiles::get_all_raw_multibrowser_profiles(app.clone())
        .await
        .unwrap_or_default();

    let mut allocation_plan: Vec<(usize, BktTestChannel)> = Vec::new();

    if let Some(target_id) = payload.target_test_channel_id.filter(|s| !s.trim().is_empty()) {
        let target_ch = channels
            .into_iter()
            .find(|c| c.id == target_id)
            .ok_or_else(|| format!("Không tìm thấy kênh test có ID: {target_id}"))?;

        if !target_ch.is_active {
            return Err(format!("Kênh test '{}' đang ở trạng thái Tạm dừng.", target_ch.name));
        }

        if let Err(prof_err) = resolve_profile_id_with_auto_heal(&target_ch.profile_id, &target_ch.name, &profiles) {
            return Err(format!("Kênh test '{}' không thể sử dụng: {prof_err}", target_ch.name));
        }

        let needed = payload.items.len() as i64;
        if target_ch.remaining_quota < needed {
            return Err(format!(
                "Kênh '{}' chỉ còn {} lượt test hôm nay, nhưng bạn đã chọn {} video (giới hạn {} video/ngày).",
                target_ch.name, target_ch.remaining_quota, needed, target_ch.daily_quota
            ));
        }

        for (idx, _) in payload.items.iter().enumerate() {
            allocation_plan.push((idx, target_ch.clone()));
        }
    } else {
        // Tự động phân bổ (Load Balancing) - Chỉ chọn kênh active, còn quota và hồ sơ profile thực sự tồn tại
        let mut active_channels: Vec<BktTestChannel> = channels
            .into_iter()
            .filter(|c| {
                c.is_active
                    && c.remaining_quota > 0
                    && resolve_profile_id_with_auto_heal(&c.profile_id, &c.name, &profiles).is_ok()
            })
            .collect();

        if active_channels.is_empty() {
            return Err(
                "Tất cả Kênh Test Bản Quyền đang hoạt động đều đã dùng hết hạn mức kiểm tra hôm nay hoặc thiếu Hồ Sơ Trình Duyệt hợp lệ. Vui lòng kiểm tra lại Quản Lý Kênh Test BKT.".to_string(),
            );
        }

        let total_available_quota: i64 = active_channels.iter().map(|c| c.remaining_quota).sum();
        let total_requested = payload.items.len() as i64;

        if total_requested > total_available_quota {
            return Err(format!(
                "Tổng số video bạn chọn ({total_requested}) vượt quá tổng lượt test khả dụng của tất cả các kênh ({total_available_quota} lượt). Vui lòng bỏ bớt {} video hoặc bổ sung thêm Kênh Test Bản Quyền.",
                total_requested - total_available_quota
            ));
        }

        // Sắp xếp kênh theo số slot còn lại giảm dần
        active_channels.sort_by(|a, b| b.remaining_quota.cmp(&a.remaining_quota));

        let mut channel_idx = 0;
        let mut channel_used_in_batch: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();

        for (item_idx, _) in payload.items.iter().enumerate() {
            let mut assigned = false;
            let start_ch = channel_idx;

            loop {
                let ch = &active_channels[channel_idx];
                let current_used = channel_used_in_batch.get(&ch.id).copied().unwrap_or(0);
                if current_used < ch.remaining_quota {
                    channel_used_in_batch.insert(ch.id.clone(), current_used + 1);
                    allocation_plan.push((item_idx, ch.clone()));
                    assigned = true;
                    // Xoay vòng kênh tiếp theo
                    channel_idx = (channel_idx + 1) % active_channels.len();
                    break;
                }

                channel_idx = (channel_idx + 1) % active_channels.len();
                if channel_idx == start_ch {
                    break;
                }
            }

            if !assigned {
                return Err("Lỗi thuật toán phân bổ hạn ngạch kênh test".to_string());
            }
        }
    }

    // 3. Thực thi tạo Job và cập nhật Quota trong DB
    let mut dispatch_results: Vec<BktDispatchItemResult> = Vec::new();
    let now_str = Local::now().to_rfc3339();
    for (item_idx, channel) in allocation_plan {
        let item = &payload.items[item_idx];
        let job_id = uuid::Uuid::new_v4().to_string();

        let job = BktTestJob {
            id: job_id.clone(),
            test_channel_id: channel.id.clone(),
            test_channel_name: Some(channel.name.clone()),
            video_source_type: item
                .video_source_type
                .clone()
                .unwrap_or_else(|| "local_file".to_string()),
            source_ref_id: item.source_ref_id.clone(),
            video_title: item.video_title.clone(),
            video_path: item.video_path.clone(),
            reup_path: None,
            youtube_video_id: None,
            status: "queued".to_string(),
            restriction: None,
            error_message: None,
            tested_date: today.clone(),
            created_at: now_str.clone(),
            updated_at: now_str.clone(),
            main_target_profile_id: item.main_target_profile_id.clone().or_else(|| item.target_profile_id.clone()),
            target_profile_id: item.target_profile_id.clone().or_else(|| item.main_target_profile_id.clone()),
            channel_id: item.channel_id.clone(),
            auto_publish_main: item.auto_publish_main,
            target_title: item.target_title.clone(),
            target_description: item.target_description.clone(),
            target_tags: item.target_tags.clone(),
            thumbnail_path: item.thumbnail_path.clone(),
        };

        if let Err(e) = database::create_bkt_test_job_db(&job) {
            dispatch_results.push(BktDispatchItemResult {
                video_title: item.video_title.clone(),
                assigned_channel_id: Some(channel.id.clone()),
                assigned_channel_name: Some(channel.name.clone()),
                job_id: None,
                success: false,
                error: Some(e),
            });
            continue;
        }

        // Tăng quota đã dùng của kênh test
        let _ = database::increment_bkt_channel_used_db(&channel.id, 1);

        dispatch_results.push(BktDispatchItemResult {
            video_title: item.video_title.clone(),
            assigned_channel_id: Some(channel.id.clone()),
            assigned_channel_name: Some(channel.name.clone()),
            job_id: Some(job_id.clone()),
            success: true,
            error: None,
        });

        // Bắn event queued để UI hiển thị trạng thái chờ xử lý ngay lập tức
        let _ = app.emit("bkt-test-job-updated", &job);

        // Đẩy vào hàng đợi FIFO tập trung có Semaphore Concurrency Limiter (tối đa 1 video render/upload tại 1 thời điểm)
        enqueue_bkt_job(&app, job, channel.profile_id.clone());
    }

    let total_dispatched = dispatch_results.iter().filter(|r| r.success).count();

    Ok(BktDispatchResult {
        success: total_dispatched > 0,
        total_requested: payload.items.len(),
        total_dispatched,
        results: dispatch_results,
        error: None,
    })
}

/// Quy trình thực thi nền cho một tác vụ Test Bản Quyền
async fn run_single_bkt_job_pipeline(app: AppHandle, mut job: BktTestJob, profile_id: String) {
    if is_bkt_job_cancelled(&job.id) {
        log::info!("[BKT POOL] Job {} đã bị hủy trước khi bắt đầu pipeline. Dừng thực thi.", job.id);
        return;
    }

    let _ = app.emit("bkt-test-job-updated", &job);

    // BƯỚC 0: Pre-flight Profile Validation & Auto-Heal (< 0.05s)
    let profiles = match crate::commands::profiles::get_all_raw_multibrowser_profiles(app.clone()).await {
        Ok(profs) => profs,
        Err(e) => {
            log::warn!("[BKT PRE-FLIGHT] Không thể lấy danh sách profiles để kiểm tra: {e}");
            vec![]
        }
    };

    let effective_profile_id = match resolve_profile_id_with_auto_heal(
        &profile_id,
        job.test_channel_name.as_deref().unwrap_or(""),
        &profiles,
    ) {
        Ok((eff_id, Some(healed_name))) => {
            log::info!(
                "[BKT AUTO-HEAL] Profile ID cũ '{}' được tự động sửa sang Profile ID mới '{}' (tên profile: '{}') cho kênh '{}'",
                profile_id,
                eff_id,
                healed_name,
                job.test_channel_name.as_deref().unwrap_or("")
            );
            if let Ok(conn) = database::get_db() {
                let now_str = Local::now().to_rfc3339();
                let _ = conn.execute(
                    "UPDATE bkt_test_channels SET profile_id = ?1, updated_at = ?2 WHERE id = ?3",
                    params![&eff_id, now_str, &job.test_channel_id],
                );
            }
            eff_id
        }
        Ok((eff_id, None)) => eff_id,
        Err(err_msg) => {
            // AUTO-FALLBACK: Nếu profile của kênh test hiện tại không khả dụng, thử tìm kênh test dự phòng còn slot
            let fallback_channel = database::get_bkt_test_channels_db()
                .ok()
                .and_then(|chs| {
                    chs.into_iter().find(|c| {
                        c.is_active
                            && c.id != job.test_channel_id
                            && c.remaining_quota > 0
                            && resolve_profile_id_with_auto_heal(&c.profile_id, &c.name, &profiles).is_ok()
                    })
                });

            if let Some(fb_ch) = fallback_channel {
                let (fb_eff_id, _) = resolve_profile_id_with_auto_heal(&fb_ch.profile_id, &fb_ch.name, &profiles)
                    .unwrap_or_else(|_| (fb_ch.profile_id.clone(), None));
                log::warn!(
                    "[BKT AUTO-FALLBACK] Profile '{}' của kênh '{}' không tồn tại. Tự động chuyển hướng job {} sang kênh dự phòng '{}' (Profile: '{}')",
                    profile_id,
                    job.test_channel_name.as_deref().unwrap_or(""),
                    job.id,
                    fb_ch.name,
                    fb_eff_id
                );
                let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
                let _ = database::increment_bkt_channel_used_db(&fb_ch.id, 1);
                job.test_channel_id = fb_ch.id.clone();
                job.test_channel_name = Some(fb_ch.name.clone());
                if let Ok(conn) = database::get_db() {
                    let now_str = Local::now().to_rfc3339();
                    let _ = conn.execute(
                        "UPDATE bkt_test_jobs SET test_channel_id = ?1, updated_at = ?2 WHERE id = ?3",
                        params![&fb_ch.id, now_str, &job.id],
                    );
                }
                let _ = app.emit("bkt-test-job-updated", &job);
                fb_eff_id
            } else {
                log::error!("[BKT PRE-FLIGHT] Thất bại ngay lập tức: {err_msg}");
                mark_job_as_failed(&app, &mut job, err_msg);
                return;
            }
        }
    };

    let mut final_status = "pending".to_string();
    let mut final_restriction = "Đang chờ YouTube Studio phân tích Content ID...".to_string();
    let mut claim_type = "none".to_string();
    let mut recorded_yt_video_id: Option<String> = None;

    let is_broken_or_failed = job.status == "failed"
        || job.status == "cancelled"
        || job.status == "abandoned"
        || job.error_message.is_some()
        || job.restriction.as_ref().map(|r| {
            let lr = r.to_lowercase();
            lr.contains("abandoned") || lr.contains("bị bỏ dở") || lr.contains("bị hủy") || lr.contains("hủy xử lý")
        }).unwrap_or(false);

    if is_broken_or_failed && job.youtube_video_id.is_some() {
        log::warn!(
            "[BKT POOL] Job {} có YouTube ID {:?} nhưng ở trạng thái lỗi cũ (status: {}, restriction: {:?}). Xóa ID hỏng cũ để upload mới hoàn toàn.",
            job.id, job.youtube_video_id, job.status, job.restriction
        );
        job.youtube_video_id = None;
        let _ = database::reset_bkt_test_job_for_retry_db(&job.id);
    }

    let can_reuse_yt_id = job.youtube_video_id.is_some() && !is_broken_or_failed;

    let yt_video_id = if can_reuse_yt_id {
        let existing_id = job.youtube_video_id.as_ref().unwrap();
        log::info!("[BKT POOL] Video đã có sẵn YouTube ID hợp lệ: {existing_id}. Mở phiên quét bản quyền YouTube Studio...");
        recorded_yt_video_id = Some(existing_id.clone());

        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "checking",
            job.reup_path.as_deref(),
            Some(existing_id),
            Some("Đang kiểm tra hạn chế Content ID trên YouTube Studio..."),
            None,
        );
        job.status = "checking".to_string();
        job.restriction = Some("Đang kiểm tra hạn chế Content ID trên YouTube Studio...".to_string());
        let _ = app.emit("bkt-test-job-updated", &job);

        let check_payload = serde_json::json!({
            "profile_id": effective_profile_id,
            "video_ids": vec![existing_id.clone()],
            "video_title": job.video_title,
            "max_poll_seconds": 1800,
        });
        let b64 = BASE64_STANDARD.encode(check_payload.to_string());
        let (mut check_cmd, runner_path) = create_runner_cmd(&app);
        if runner_path.exists() {
            check_cmd
                .arg(&runner_path)
                .arg("--action")
                .arg("check_copyright_status")
                .arg("--data-b64")
                .arg(&b64)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true);
            check_cmd.hide_window();

            match check_cmd.output().await {
                Ok(output) => {
                    let c_stdout = String::from_utf8_lossy(&output.stdout);
                    let mut parsed_any_error = false;
                    for line in c_stdout.lines().rev() {
                        let trimmed = line.trim();
                        if trimmed.starts_with('{') && trimmed.ends_with('}') {
                            if let Ok(parsed_check) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                if parsed_check.get("success").and_then(|v| v.as_bool()) == Some(false) {
                                    final_status = "failed".to_string();
                                    final_restriction = parsed_check
                                        .get("error")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or("Kiểm tra bản quyền trên Studio thất bại")
                                        .to_string();
                                    parsed_any_error = true;
                                    break;
                                }
                                if let Some(res_map) = parsed_check.get("results").and_then(|r| r.as_object()) {
                                    let item = res_map.get(existing_id).or_else(|| res_map.values().next());
                                    if let Some(info) = item {
                                        final_status = info.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending").to_string();
                                        final_restriction = info.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra").to_string();
                                        claim_type = info.get("claim_type").and_then(|s| s.as_str()).unwrap_or("none").to_string();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if !parsed_any_error && final_status == "pending" && !output.status.success() {
                        let stderr_str = String::from_utf8_lossy(&output.stderr);
                        let last_err = stderr_str.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("Lỗi không xác định");
                        final_status = "failed".to_string();
                        final_restriction = format!("Tiến trình kiểm tra Studio dừng bất thường ({}): {}", output.status, last_err.trim());
                    }
                }
                Err(e) => {
                    final_status = "failed".to_string();
                    final_restriction = format!("Không thể chạy check_copyright_status: {e}");
                }
            }
        }
        Some(existing_id.clone())
    } else {
        // Nếu là job thử lại từ lỗi cũ, reset triệt để ID để upload mới hoàn toàn
        job.youtube_video_id = None;

        // Kiểm tra file video nguồn trước khi upload test
        if !Path::new(&job.video_path).exists() {
            let err_msg = format!("Tệp video nguồn không tồn tại trên máy tính: {}", job.video_path);
            mark_job_as_failed(&app, &mut job, err_msg);
            return;
        }

        if is_bkt_job_cancelled(&job.id) {
            return;
        }

        // BƯỚC 1 & 2: QUY TRÌNH HỢP NHẤT TRÊN 1 PHIÊN CHROMIUM DUY NHẤT (UNIFIED BKT PIPELINE)
        // Tải video lên (Unlisted) -> Click Đóng popup card -> SPA sang Nội dung
        // -> Giám sát Realtime từ % upload đến Processing SD & Content ID
        // TUYỆT ĐỐI KHÔNG ĐÓNG CHROMIUM VÀ KHÔNG RELOAD TRANG GIỮA CHỪNG
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "uploading",
            None,
            None,
            Some("Đang tải video gốc (Unlisted) lên Kênh Test để kiểm tra bản quyền..."),
            None,
        );
        job.status = "uploading".to_string();
        job.restriction = Some("Đang tải video gốc (Unlisted) lên Kênh Test để kiểm tra bản quyền...".to_string());
        job.error_message = None;
        let _ = app.emit("bkt-test-job-updated", &job);

        let clean_video_title = {
            let raw = job.video_title.trim();
            if raw.chars().count() > 90 {
                raw.chars().take(90).collect::<String>()
            } else {
                raw.to_string()
            }
        };

        let unified_payload = serde_json::json!({
            "profile_id": effective_profile_id,
            "video_path": job.video_path,
            "title": clean_video_title,
            "description": "Test copyright Content ID verification (Unlisted mode).",
            "visibility": "unlisted",
            "max_poll_seconds": 1800,
        });

        let b64 = BASE64_STANDARD.encode(unified_payload.to_string());
        let (mut cmd, runner_path) = create_runner_cmd(&app);

        if !runner_path.exists() {
            let err_msg = "Không tìm thấy file mã nguồn browser_engine/runner.py".to_string();
            mark_job_as_failed(&app, &mut job, err_msg);
            return;
        }

        cmd.arg(&runner_path)
            .arg("--action")
            .arg("bkt_unified_pipeline")
            .arg("--data-b64")
            .arg(&b64)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        cmd.hide_window();

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Lỗi khởi chạy Python bkt_unified_pipeline: {e}");
                mark_job_as_failed(&app, &mut job, err_msg);
                return;
            }
        };

        let pid = child.id().unwrap_or(0);
        set_current_bkt_child_pid(pid);

        let stderr_tail = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        // Đọc stderr ngầm để tránh nghẽn pipe buffer trên Windows và lưu làm chẩn đoán khi crash sớm
        if let Some(stderr) = child.stderr.take() {
            let stderr_tail_clone = stderr_tail.clone();
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut reader = tokio::io::BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        log::warn!("[BKT Pipeline stderr] {trimmed}");
                        let mut buf = stderr_tail_clone.lock().await;
                        buf.push(trimmed.to_string());
                        if buf.len() > 25 {
                            buf.remove(0);
                        }
                    }
                }
            });
        }

        let mut has_entered_checking = false;
        let mut saw_final_result_json = false;
        let mut last_upload_progress_msg = String::new();
        let mut last_upload_progress_emit = std::time::Instant::now() - std::time::Duration::from_secs(10);
        let mut last_upload_pct_val: Option<i64> = None;
        let mut last_meaningful_upload_at = std::time::Instant::now();

        if let Some(stdout) = child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout).lines();
            let mut consecutive_silence_count = 0u32;
            loop {
                if is_bkt_job_cancelled(&job.id) {
                    let _ = child.kill().await;
                    set_current_bkt_child_pid(0);
                    crate::commands::profiles::clear_stats_cache();
                    return;
                }

                let line_res = tokio::time::timeout(
                    std::time::Duration::from_secs(45),
                    reader.next_line(),
                ).await;

                let line = match line_res {
                    Ok(Ok(Some(l))) => {
                        consecutive_silence_count = 0;
                        l
                    }
                    Ok(Ok(None)) => {
                        // EOF
                        break;
                    }
                    Ok(Err(err)) => {
                        log::warn!("[BKT Pipeline] Lỗi đọc stdout: {}", err);
                        break;
                    }
                    Err(_) => {
                        consecutive_silence_count += 1;
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                log::warn!("[BKT Pipeline] Tiến trình con đã kết thúc sớm với mã: {:?}", status);
                                break;
                            }
                            Ok(None) => {
                                if consecutive_silence_count >= 4 {
                                    log::error!("[BKT Pipeline] Watchdog phát hiện tiến trình BKT im lặng quá 180s. Cưỡng chế dừng.");
                                    let _ = child.kill().await;
                                    final_status = "failed".to_string();
                                    final_restriction = "Tiến trình kiểm tra BKT bị treo hoặc mất phản hồi quá 3 phút (Watchdog Timeout).".to_string();
                                    break;
                                }
                                continue;
                            }
                            Err(e) => {
                                log::warn!("[BKT Pipeline] Lỗi kiểm tra trạng thái child: {}", e);
                                break;
                            }
                        }
                    }
                };

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let ev_type = parsed.get("event").and_then(|v| v.as_str()).unwrap_or("");
                    let stream_vid = parsed
                        .get("youtube_video_id")
                        .or_else(|| parsed.get("video_id"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty() && !s.starts_with("__"));
                    if let Some(vid) = stream_vid {
                        if recorded_yt_video_id.as_deref() != Some(vid) {
                            recorded_yt_video_id = Some(vid.to_string());
                            job.youtube_video_id = Some(vid.to_string());
                        }
                    }

                    // Sự kiện phục hồi tự động khi Chromium bị đóng / crash
                    if ev_type == "auto_recovery" {
                        let msg = parsed.get("message").and_then(|v| v.as_str()).unwrap_or("Đang tự động mở lại trình duyệt...");
                        job.restriction = Some(msg.to_string());
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            "checking",
                            job.reup_path.as_deref(),
                            recorded_yt_video_id.as_deref(),
                            Some(msg),
                            None,
                        );
                        let _ = app.emit("bkt-test-job-updated", &job);
                    }

                    // 1. Sự kiện tiến trình upload stream (Ví dụ: "Đang tải lên YouTube Studio: 78% (Còn 20 giây)")
                    if ev_type == "upload_progress" && !has_entered_checking {
                        let msg = parsed.get("message").and_then(|v| v.as_str()).unwrap_or("Đang tải video lên YouTube Studio...");
                        let pct_opt = parsed.get("percent").and_then(|v| v.as_i64());
                        let pct_changed = pct_opt.is_some() && pct_opt != last_upload_pct_val;
                        let msg_changed = msg != last_upload_progress_msg;

                        if pct_changed || (msg_changed && pct_opt.unwrap_or(0) > 0) {
                            if pct_opt.is_some() {
                                last_upload_pct_val = pct_opt;
                            }
                            last_meaningful_upload_at = std::time::Instant::now();
                        } else {
                            let cur_pct = pct_opt.or(last_upload_pct_val).unwrap_or(0);
                            if cur_pct <= 0 && last_meaningful_upload_at.elapsed() >= std::time::Duration::from_secs(900) {
                                let _ = child.kill().await;
                                set_current_bkt_child_pid(0);
        crate::commands::profiles::clear_stats_cache();
                                final_status = "failed".to_string();
                                final_restriction = "Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio — đã dừng để tránh treo hàng đợi.".to_string();
                                break;
                            }
                            if !msg_changed && last_meaningful_upload_at.elapsed() >= std::time::Duration::from_secs(2400) {
                                let _ = child.kill().await;
                                set_current_bkt_child_pid(0);
        crate::commands::profiles::clear_stats_cache();
                                final_status = "failed".to_string();
                                final_restriction = format!("Tiến trình tải lên đứng yên quá 40 phút ({msg}) — đã dừng để tránh treo hàng đợi.");
                                break;
                            }
                        }

                        let should_emit = msg_changed
                            || last_upload_progress_emit.elapsed() >= std::time::Duration::from_secs(3);
                        if should_emit {
                            last_upload_progress_msg = msg.to_string();
                            last_upload_progress_emit = std::time::Instant::now();
                            let _ = database::update_bkt_test_job_status_db(
                                &job.id,
                                "uploading",
                                job.reup_path.as_deref(),
                                recorded_yt_video_id.as_deref(),
                                Some(msg),
                                None,
                            );
                            job.status = "uploading".to_string();
                            job.restriction = Some(msg.to_string());
                            let _ = app.emit("bkt-test-job-updated", &job);
                        }
                    }
                    // 2. Sự kiện hoàn tất upload 100% và bắt đầu kiểm tra Content ID
                    else if ev_type == "upload_success" {
                        has_entered_checking = true;
                        let msg = parsed.get("message").and_then(|v| v.as_str()).unwrap_or("Đã tải lên 100%. Đang chuyển sang theo dõi Content ID...");
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            "checking",
                            job.reup_path.as_deref(),
                            recorded_yt_video_id.as_deref(),
                            Some(msg),
                            None,
                        );
                        job.status = "checking".to_string();
                        job.restriction = Some(msg.to_string());
                        let _ = app.emit("bkt-test-job-updated", &job);
                    }
                    // 3. Sự kiện tiến trình kiểm tra Content ID (Ví dụ: "[SD] Đang xử lý... Còn 2 phút")
                    else if ev_type == "progress" {
                        has_entered_checking = true;
                        let restr = parsed.get("restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra");
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            "checking",
                            job.reup_path.as_deref(),
                            recorded_yt_video_id.as_deref(),
                            Some(restr),
                            None,
                        );
                        job.status = "checking".to_string();
                        job.restriction = Some(restr.to_string());
                        let _ = app.emit("bkt-test-job-updated", &job);
                    }
                    // 4. Lỗi từ runner
                    else if let Some(false) = parsed.get("success").and_then(|v| v.as_bool()) {
                        let err_msg = parsed
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Kiểm tra bản quyền thất bại")
                            .to_string();
                        final_status = "failed".to_string();
                        final_restriction = err_msg;
                        break;
                    }
                    // 5. Kết quả bóc tách bản quyền cuối cùng
                    else if parsed.get("results").is_some() || parsed.get("success").is_some() {
                        saw_final_result_json = true;

                        if let Some(res_map) = parsed.get("results").and_then(|r| r.as_object()) {
                            let item = recorded_yt_video_id
                                .as_ref()
                                .and_then(|vid| res_map.get(vid))
                                .or_else(|| res_map.values().next());

                            if let Some(info) = item {
                                let st = info.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending");
                                let restr = info.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra");
                                let c_type = info.get("claim_type").and_then(|s| s.as_str()).unwrap_or("none");

                                final_status = st.to_string();
                                final_restriction = restr.to_string();
                                claim_type = c_type.to_string();

                                let _ = database::update_bkt_test_job_status_db(
                                    &job.id,
                                    &final_status,
                                    job.reup_path.as_deref(),
                                    recorded_yt_video_id.as_deref(),
                                    Some(&final_restriction),
                                    None,
                                );
                                job.status = final_status.clone();
                                job.restriction = Some(final_restriction.clone());
                                let _ = app.emit("bkt-test-job-updated", &job);

                                if final_status == "green_clean" || final_status == "red_matched" {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Đợi child thoát nhanh trong 3s và kiểm tra mã thoát / stderr trước khi kill
        let wait_outcome = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
        let exit_status_opt = match wait_outcome {
            Ok(Ok(st)) => Some(st),
            _ => {
                let _ = child.kill().await;
                None
            }
        };
        set_current_bkt_child_pid(0);
        crate::commands::profiles::clear_stats_cache();

        // Nếu tiến trình kết thúc sớm mà chưa nhận JSON kết quả cuối (crash/đứt kết nối),
        // chuyển sang failed rõ ràng thay vì để kẹt ở uploading/checking/pending.
        let clean_exit_with_results = exit_status_opt.map(|s| s.success()).unwrap_or(false) && saw_final_result_json;
        let is_terminal = final_status == "green_clean" || final_status == "red_matched" || final_status == "failed";
        if !is_terminal && !clean_exit_with_results {
            let tail_lines = stderr_tail.lock().await;
            let last_err_line = tail_lines
                .iter()
                .rev()
                .find(|l| {
                    let low = l.to_lowercase();
                    !low.contains("deprecationwarning") && !low.contains("userwarning")
                })
                .cloned();
            final_status = "failed".to_string();
            final_restriction = match (exit_status_opt, last_err_line) {
                (Some(st), Some(err_txt)) => format!("Tiến trình BKT dừng đột ngột ({st}): {err_txt}"),
                (Some(st), None) => format!("Tiến trình BKT kết thúc sớm ({st}) trước khi nhận được kết quả từ YouTube Studio."),
                (None, Some(err_txt)) => format!("Tiến trình BKT bị ngắt giữa chừng: {err_txt}"),
                (None, None) => "Tiến trình kiểm tra BKT bị ngắt đột ngột trước khi trả về kết quả từ YouTube Studio.".to_string(),
            };
        }

        job.youtube_video_id = recorded_yt_video_id.clone();
        recorded_yt_video_id.clone()
    };

    let yt_video_id = yt_video_id;

    if final_status == "failed" {
        mark_job_as_failed(&app, &mut job, final_restriction);
        return;
    }

    // Xử lý phân nhánh hậu kiểm sau khi quét xong:
    if final_status == "red_matched" {
        // Dọn dẹp cache profile Kênh Test để không lưu video vi phạm trong bộ nhớ tạm
        let _ = crate::commands::profiles::clean_multibrowser_profile_cache_native(app.clone(), effective_profile_id.clone()).await;

        if claim_type == "visual" {
            let note = format!("{final_restriction} [Tự động kích hoạt Reup Pipeline Lv.2]");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                recorded_yt_video_id.as_deref(),
                Some(&note),
                None,
            );
            job.restriction = Some(note);
            let _ = app.emit("bkt-test-job-updated", &job);

            if let Some(ref r_path) = job.reup_path {
                let app_clone = app.clone();
                let target_path = r_path.clone();
                tokio::spawn(async move {
                    log::info!("[BKT POOL] Tự động kích hoạt Reup Pipeline Lv.2 cho video: {target_path}");
                    let _ = crate::services::run_reup_pipeline_v2(&app_clone, &target_path, None).await;
                });
            }
        } else if claim_type == "audio" {
            let note = format!("{final_restriction} [Đề xuất: Lách Pitch 48kHz, Ducking BGM hoặc thay bài hát]");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                recorded_yt_video_id.as_deref(),
                Some(&note),
                None,
            );
            job.restriction = Some(note);
            let _ = app.emit("bkt-test-job-updated", &job);

            // Xóa file reup tạm để không chiếm dụng ổ cứng khi dính bản quyền âm thanh
            if let Some(ref r_path) = job.reup_path {
                if r_path != &job.video_path {
                    let _ = std::fs::remove_file(Path::new(r_path));
                }
            }
        } else {
            let note = final_restriction.clone();
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                recorded_yt_video_id.as_deref(),
                Some(&note),
                None,
            );
            job.restriction = Some(note);
            let _ = app.emit("bkt-test-job-updated", &job);

            if let Some(ref r_path) = job.reup_path {
                if r_path != &job.video_path {
                    let _ = std::fs::remove_file(Path::new(r_path));
                }
            }
        }

        if job.video_source_type == "channel_video" {
            if let Some(ref ref_id) = job.source_ref_id {
                if let Ok(conn) = database::get_db() {
                    let _ = conn.execute(
                        "UPDATE channel_videos SET bkt_check_status = 'red_matched', risk_status = 'red', bkt_restriction = ?1, risk_reason = ?1 WHERE video_id = ?2 OR id = ?2",
                        params![&final_restriction, ref_id],
                    );
                }
                let _ = database::recalculate_channel_risk_by_video_db(ref_id);
            }
        }
        let _ = cleanup_video_and_reup_files(
            &job.video_path,
            job.reup_path.as_deref(),
            job.thumbnail_path.as_deref(),
        );
    } else if final_status == "green_clean" {
        if is_bkt_job_cancelled(&job.id) {
            return;
        }

        if job.video_source_type == "channel_video" {
            if let Some(ref ref_id) = job.source_ref_id {
                if let Ok(conn) = database::get_db() {
                    let _ = conn.execute(
                        "UPDATE channel_videos SET bkt_check_status = 'green_clean', risk_status = 'green', bkt_restriction = 'Sạch Bản Quyền (Không có khiếu nại Content ID)', risk_reason = 'Sạch Bản Quyền' WHERE video_id = ?1 OR id = ?1",
                        params![ref_id],
                    );
                }
                let _ = database::recalculate_channel_risk_by_video_db(ref_id);
            }
        }

        // BƯỚC REUP SAU TEST SẠCH: Video đạt chuẩn SẠCH BẢN QUYỀN -> Kích hoạt Reup Pipeline thích ứng làm sạch file
        let orig_video_path = Path::new(&job.video_path);
        let parent_dir = orig_video_path.parent().unwrap_or(Path::new("."));
        let video_stem = orig_video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("video");

        // Tạo thư mục riêng biệt [DA_EDIT]_{video_stem} ngay trong thư mục chứa video gốc
        let reup_folder = parent_dir.join(format!("[DA_EDIT]_{video_stem}"));
        if let Err(err_mkdir) = std::fs::create_dir_all(&reup_folder) {
            log::warn!("[REUP FOLDER] Không thể tạo thư mục {}: {err_mkdir}", reup_folder.display());
        }

        let target_completed_video = reup_folder.join(format!("{video_stem}_reup_ready.mp4"));
        let target_completed_str = target_completed_video.to_string_lossy().to_string();

        let reup_start_msg = format!("Sạch Bản Quyền! Đang render Reup thích ứng vào thư mục: [DA_EDIT]_{video_stem}...");
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "reuping",
            None,
            recorded_yt_video_id.as_deref(),
            Some(&reup_start_msg),
            None,
        );
        job.status = "reuping".to_string();
        job.restriction = Some(reup_start_msg);
        let _ = app.emit("bkt-test-job-updated", &job);

        let final_publish_path = match crate::services::run_reup_pipeline_adaptive(&app, &job.video_path, Some(&target_completed_str), None).await {
            Ok(res) => {
                let out = res.output_path;
                job.reup_path = Some(out.clone());
                set_current_bkt_reup_path(Some(out.clone()));
                out
            }
            Err(e) => {
                log::warn!("Reup thích ứng gặp cảnh báo: {e}. Thử fallback qua Reup Lv.1.");
                match crate::services::run_reup_pipeline_v1(&app, &job.video_path, Some(&target_completed_str)).await {
                    Ok(res1) => {
                        let out1 = res1.output_path;
                        job.reup_path = Some(out1.clone());
                        set_current_bkt_reup_path(Some(out1.clone()));
                        out1
                    }
                    Err(e1) => {
                        log::warn!("Reup Lv.1 fallback cũng gặp cảnh báo: {e1}. Sao chép file video gốc vào thư mục hoàn tất.");
                        let _ = std::fs::copy(&job.video_path, &target_completed_video);
                        job.reup_path = Some(target_completed_str.clone());
                        target_completed_str.clone()
                    }
                }
            }
        };

        // Sao chép companion thumbnail vào thư mục [DA_EDIT]_{video_stem} nếu có
        if let Some(ref thumb_src_str) = job.thumbnail_path {
            let thumb_src = Path::new(thumb_src_str);
            if thumb_src.exists() && thumb_src.is_file() {
                let thumb_ext = thumb_src.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
                let dest_thumb = reup_folder.join(format!("{video_stem}_thumbnail.{thumb_ext}"));
                if std::fs::copy(thumb_src, &dest_thumb).is_ok() {
                    job.thumbnail_path = Some(dest_thumb.to_string_lossy().to_string());
                    log::info!("[REUP FOLDER] Đã sao chép thumbnail hoàn chỉnh vào: {}", dest_thumb.display());
                }
            }
        }

        // Cổng kiểm tra tính toàn vẹn (Pre-Upload File Integrity Gate)
        let final_video_path_obj = Path::new(&final_publish_path);
        if let Err(integrity_err) = verify_video_ready_for_upload(final_video_path_obj).await {
            log::error!("[BKT AUTO-PILOT] File video không đạt chuẩn kiểm tra tính toàn vẹn: {integrity_err}");
            let fail_msg = format!("Sạch bản quyền, nhưng file edit không toàn vẹn trước khi đăng: {integrity_err}");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "failed",
                job.reup_path.as_deref(),
                recorded_yt_video_id.as_deref(),
                Some(&fail_msg),
                Some(&fail_msg),
            );
            job.status = "failed".to_string();
            job.restriction = Some(fail_msg.clone());
            job.error_message = Some(fail_msg);
            let _ = app.emit("bkt-test-job-updated", &job);
            return;
        }

        let reup_done_msg = format!("Sạch Bản Quyền! Đã Edit hoàn tất trong thư mục: [DA_EDIT]_{video_stem}");
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "reuping",
            job.reup_path.as_deref(),
            recorded_yt_video_id.as_deref(),
            Some(&reup_done_msg),
            None,
        );
        job.restriction = Some(reup_done_msg);
        let _ = app.emit("bkt-test-job-updated", &job);
        let _ = app.emit("reup-pipeline-completed", &job);

        if is_bkt_job_cancelled(&job.id) {
            return;
        }

        let effective_target_profile = job
            .target_profile_id
            .as_ref()
            .or(job.main_target_profile_id.as_ref())
            .cloned();
        let will_auto_publish = job.auto_publish_main.unwrap_or(false) && effective_target_profile.is_some();

        // Cập nhật trạng thái sau khi reup xong (nếu không tự động đăng sang Kênh Đích)
        if !will_auto_publish {
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                yt_video_id.as_deref(),
                Some(&final_restriction),
                None,
            );
            job.status = final_status.clone();
            job.restriction = Some(final_restriction.clone());
            let _ = app.emit("bkt-test-job-updated", &job);
        }

        if will_auto_publish {
            let target_profile = effective_target_profile.unwrap();
            log::info!(
                "[BKT AUTO-PILOT] Video đạt chuẩn SẠCH BẢN QUYỀN (green_clean) & đã đóng gói [DA_EDIT]_{video_stem}. Bắt đầu tự động đăng lên Kênh Đích (Profile: {})!",
                target_profile
            );
            let publish_wait_msg = format!("Đã Edit xong [DA_EDIT]_{video_stem}! Đang tự động đăng sang Kênh Đích...");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "reuping",
                job.reup_path.as_deref(),
                yt_video_id.as_deref(),
                Some(&publish_wait_msg),
                None,
            );
            job.status = "reuping".to_string();
            job.restriction = Some(publish_wait_msg);
            let _ = app.emit("bkt-test-job-updated", &job);

            let raw_pub_title = job.target_title.clone().unwrap_or_else(|| job.video_title.clone());
            let safe_pub_title = sanitize_youtube_title_safe(&raw_pub_title, 95);

            let upload_params = MultiBrowserUploadParams {
                profile_id: target_profile.clone(),
                video_path: final_publish_path.clone(),
                title: safe_pub_title,
                description: job.target_description.clone().unwrap_or_default(),
                thumbnail_path: job.thumbnail_path.clone(),
                visibility: Some("public".to_string()),
                tags: job.target_tags.clone(),
                schedule_date: None,
                schedule_time: None,
                pinned_comment: None,
                preferred_channel: None,
            };

            match crate::commands::profiles::upload_video_multibrowser(app.clone(), upload_params).await {
                Ok(upload_res) => {
                    if upload_res.success {
                        let success_msg = "Sạch Bản Quyền & Đã tự động xuất bản Công khai lên Kênh Đích thành công!".to_string();
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            &final_status,
                            job.reup_path.as_deref(),
                            yt_video_id.as_deref(),
                            Some(&success_msg),
                            None,
                        );
                        job.status = final_status.clone();
                        job.restriction = Some(success_msg);
                        let _ = app.emit("bkt-test-job-updated", &job);
                        let _ = app.emit("bkt-auto-published-main", &job);

                        // XÓA NGAY FILE VIDEO GỐC, FILE REUP VÀ THUMBNAIL ĐỂ TỐI ƯU DUNG LƯỢNG Ổ ĐĨA
                        let freed_bytes = cleanup_video_and_reup_files(
                            &job.video_path,
                            job.reup_path.as_deref(),
                            job.thumbnail_path.as_deref(),
                        );
                        let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);
                        log::info!(
                            "[BKT AUTO-PILOT] Xuất bản thành công: Đã xóa file video gốc/reup/thumbnail, giải phóng {:.2} MB dung lượng đĩa!",
                            freed_mb
                        );

                        // TỰ ĐỘNG DỌN DẸP CACHE PROFILE CHROMIUM (Kênh Đích & Kênh Test)
                        let _ = crate::commands::profiles::clean_multibrowser_profile_cache_native(
                            app.clone(),
                            target_profile.clone(),
                        )
                        .await;
                        let _ = crate::commands::profiles::clean_multibrowser_profile_cache_native(
                            app.clone(),
                            effective_profile_id.clone(),
                        )
                        .await;

                        if job.video_source_type == "channel_video" {
                            if let Some(ref ref_id) = job.source_ref_id {
                                if let Ok(conn) = database::get_db() {
                                    let _ = conn.execute(
                                        "UPDATE channel_videos SET bkt_check_status = 'green_clean', risk_status = 'green', bkt_restriction = 'Sạch Bản Quyền & Đã đăng lên Kênh Đích', risk_reason = 'Sạch Bản Quyền & Đã đăng lên Kênh Đích' WHERE video_id = ?1 OR id = ?1",
                                        params![ref_id],
                                    );
                                }
                                let _ = database::recalculate_channel_risk_by_video_db(ref_id);
                            }
                        }
                    } else {
                        let err_text = upload_res.error.unwrap_or_else(|| "Không rõ nguyên nhân".to_string());
                        log::error!("[BKT AUTO-PILOT] Tự động đăng kênh đích thất bại: {}", err_text);
                        let fail_msg = format!("Sạch bản quyền, nhưng lỗi khi đăng kênh đích: {err_text}");
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            &final_status,
                            job.reup_path.as_deref(),
                            yt_video_id.as_deref(),
                            Some(&fail_msg),
                            Some(&fail_msg),
                        );
                        job.status = final_status.clone();
                        job.restriction = Some(fail_msg.clone());
                        job.error_message = Some(fail_msg);
                        let _ = app.emit("bkt-test-job-updated", &job);
                    }
                }
                Err(err) => {
                    log::error!("[BKT AUTO-PILOT] Lỗi khi đăng kênh đích: {}", err);
                    let fail_msg = format!("Sạch bản quyền, nhưng lỗi khi đăng kênh đích: {err}");
                    let _ = database::update_bkt_test_job_status_db(
                        &job.id,
                        &final_status,
                        job.reup_path.as_deref(),
                        yt_video_id.as_deref(),
                        Some(&fail_msg),
                        Some(&fail_msg),
                    );
                    job.status = final_status.clone();
                    job.restriction = Some(fail_msg.clone());
                    job.error_message = Some(fail_msg);
                    let _ = app.emit("bkt-test-job-updated", &job);
                }
            }
        }
    } else {
        // Fallback: nếu final_status không phải green_clean hay red_matched (ví dụ sau smart polling vẫn pending hoặc studio lỗi)
        log::warn!("[BKT POOL] Job {} kết thúc với trạng thái không xác định hoặc timeout: {}", job.id, final_status);
        let fallback_err = if final_status == "pending" {
            "Hết thời gian chờ (Timeout): YouTube Studio chưa đưa ra kết luận Content ID hoặc quá trình xử lý bị bỏ dở (Processing abandoned).".to_string()
        } else {
            final_restriction
        };
        mark_job_as_failed(&app, &mut job, fallback_err);
    }
}

/// Kích hoạt đăng thủ công hoặc tự động sang Kênh Đích cho một BKT job đã sạch bản quyền
#[tauri::command]
pub async fn publish_bkt_job_to_main_cmd(
    app: AppHandle,
    job_id: String,
) -> Result<String, String> {
    let job = database::get_bkt_test_job_by_id_db(&job_id)?
        .ok_or_else(|| format!("Không tìm thấy job BKT có ID: {job_id}"))?;

    let target_profile = job
        .target_profile_id
        .clone()
        .or_else(|| job.main_target_profile_id.clone())
        .ok_or_else(|| "Tác vụ này không có cấu hình Kênh Đích (target_profile_id)".to_string())?;

    let upload_video_path = job
        .reup_path
        .clone()
        .unwrap_or_else(|| job.video_path.clone());

    let raw_pub_title = job.target_title.clone().unwrap_or_else(|| job.video_title.clone());
    let safe_pub_title = sanitize_youtube_title_safe(&raw_pub_title, 95);

    let upload_params = MultiBrowserUploadParams {
        profile_id: target_profile.clone(),
        video_path: upload_video_path,
        title: safe_pub_title,
        description: job.target_description.clone().unwrap_or_default(),
        thumbnail_path: job.thumbnail_path.clone(),
        visibility: Some("public".to_string()),
        tags: job.target_tags.clone(),
        schedule_date: None,
        schedule_time: None,
        pinned_comment: None,
        preferred_channel: None,
    };

    let publish_wait_msg = "Bắt đầu đăng video công khai lên Kênh Đích...".to_string();
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "green_clean",
        job.reup_path.as_deref(),
        job.youtube_video_id.as_deref(),
        Some(&publish_wait_msg),
        None,
    );
    let mut updated_job = job.clone();
    updated_job.status = "green_clean".to_string();
    updated_job.restriction = Some(publish_wait_msg);
    let _ = app.emit("bkt-test-job-updated", &updated_job);

    match crate::commands::profiles::upload_video_multibrowser(app.clone(), upload_params).await {
        Ok(upload_res) => {
            if upload_res.success {
                let success_msg = "Sạch Bản Quyền & Đã xuất bản Công khai lên Kênh Đích thành công!".to_string();
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "green_clean",
                    job.reup_path.as_deref(),
                    job.youtube_video_id.as_deref(),
                    Some(&success_msg),
                    None,
                );
                updated_job.restriction = Some(success_msg.clone());
                let _ = app.emit("bkt-test-job-updated", &updated_job);
                let _ = app.emit("bkt-auto-published-main", &updated_job);

                // XÓA NGAY FILE VIDEO GỐC, REUP VÀ THUMBNAIL ĐỂ TỐI ƯU Ổ CỨNG
                let freed_bytes = cleanup_video_and_reup_files(
                    &job.video_path,
                    job.reup_path.as_deref(),
                    job.thumbnail_path.as_deref(),
                );
                let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);
                log::info!(
                    "[BKT MANUAL-PUBLISH] Xuất bản thành công: Đã xóa file video gốc/reup/thumbnail, giải phóng {:.2} MB dung lượng đĩa!",
                    freed_mb
                );

                // DỌN DẸP CACHE PROFILE CHROMIUM
                let _ = crate::commands::profiles::clean_multibrowser_profile_cache_native(
                    app.clone(),
                    target_profile.clone(),
                )
                .await;

                Ok(success_msg)
            } else {
                let err_text = upload_res.error.unwrap_or_else(|| "Không rõ nguyên nhân".to_string());
                let fail_msg = format!("Lỗi khi đăng lên Kênh Đích: {err_text}");
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "green_clean",
                    job.reup_path.as_deref(),
                    job.youtube_video_id.as_deref(),
                    Some(&fail_msg),
                    Some(&fail_msg),
                );
                updated_job.restriction = Some(fail_msg.clone());
                updated_job.error_message = Some(fail_msg.clone());
                let _ = app.emit("bkt-test-job-updated", &updated_job);
                Err(fail_msg)
            }
        }
        Err(err) => {
            let fail_msg = format!("Lỗi khi đăng lên Kênh Đích: {err}");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "green_clean",
                job.reup_path.as_deref(),
                job.youtube_video_id.as_deref(),
                Some(&fail_msg),
                Some(&fail_msg),
            );
            updated_job.restriction = Some(fail_msg.clone());
            updated_job.error_message = Some(fail_msg.clone());
            let _ = app.emit("bkt-test-job-updated", &updated_job);
            Err(fail_msg)
        }
    }
}

/// Kích hoạt quét lại bản quyền cho một BKT job (thử lại tác vụ bị lỗi)
#[tauri::command]
pub async fn recheck_bkt_job_cmd(
    app: AppHandle,
    job_id: String,
) -> Result<(), String> {
    let mut job = database::get_bkt_test_job_by_id_db(&job_id)?
        .ok_or_else(|| format!("Không tìm thấy job BKT có ID: {job_id}"))?;

    if matches!(job.status.as_str(), "queued" | "reuping" | "uploading" | "checking") {
        return Err("Tác vụ kiểm tra bản quyền này đang chạy trong hàng đợi. Vui lòng chờ hoàn tất hoặc hủy trước khi chạy lại.".to_string());
    }

    let channels = database::get_bkt_test_channels_db()?;
    let channel = channels
        .into_iter()
        .find(|c| c.id == job.test_channel_id)
        .ok_or_else(|| "Không tìm thấy kênh test tương ứng với tác vụ này".to_string())?;

    let profile_id = channel.profile_id;
    let queued_msg = "Đang xếp hàng chờ tải lại và quét bản quyền...".to_string();

    // Reset sạch sẽ trong SQLite (xóa youtube_video_id cũ để upload mới hoàn toàn, không bị kẹt)
    let _ = database::reset_bkt_test_job_for_retry_db(&job.id);

    job.status = "queued".to_string();
    job.youtube_video_id = None;
    job.reup_path = None;
    job.restriction = Some(queued_msg.clone());
    job.error_message = None;
    let _ = app.emit("bkt-test-job-updated", &job);

    // Đồng bộ lại trạng thái trong channel_videos nếu tác vụ này bắt nguồn từ kênh đối thủ
    if job.video_source_type == "channel_video" {
        if let Some(ref ref_id) = job.source_ref_id {
            if let Ok(conn) = database::get_db() {
                let _ = conn.execute(
                    "UPDATE channel_videos SET bkt_check_status = 'pending', risk_status = 'pending', risk_reason = 'Đang xếp hàng chờ tải lại và quét bản quyền...' WHERE video_id = ?1 OR id = ?1",
                    rusqlite::params![ref_id],
                );
            }
        }
    }

    enqueue_bkt_job(&app, job, profile_id);

    Ok(())
}

/// Hủy bỏ một tác vụ BKT đang chạy hoặc đang trong hàng đợi FIFO
#[tauri::command]
pub async fn cancel_bkt_job(app: AppHandle, job_id: String) -> Result<(), String> {
    log::info!("[BKT CANCEL] Nhận yêu cầu hủy tác vụ BKT: {job_id}");

    // 1. Đánh dấu job_id vào danh sách đã hủy (để nếu đang trong hàng đợi FIFO sẽ bị bỏ qua khi worker lấy ra)
    mark_job_id_as_cancelled(&job_id);

    let cancel_reason = "Đã hủy bởi người dùng";

    // 2. Cập nhật SQLite 'failed' TRƯỚC khi bắn tín hiệu hủy tiến trình (tránh worker hoàn trả quota 2 lần)
    let _ = database::update_bkt_test_job_status_db(
        &job_id,
        "failed",
        None,
        None,
        Some(cancel_reason),
        Some(cancel_reason),
    );

    // 3. Kích hoạt hủy tác vụ đang chạy nếu job_id trùng với job hiện tại
    let was_running = trigger_active_job_cancellation(&job_id);

    // 4. Lấy dữ liệu job để dọn dẹp file tạm và emit event cho UI
    if let Ok(Some(mut job)) = database::get_bkt_test_job_by_id_db(&job_id) {
        // Hoàn trả 1 quota nếu job chưa kịp upload unlisted lên YouTube
        if job.youtube_video_id.is_none() {
            let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
        }

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

    let count = jobs_to_cancel.len();

    // 2. Đánh dấu tất cả ID vào danh sách đã hủy
    for (id, _, _, _, _) in &jobs_to_cancel {
        mark_job_id_as_cancelled(id);
    }

    let cancel_reason = "Đã hủy bởi người dùng";
    let now_str = Local::now().to_rfc3339();

    // 3-4. Cập nhật SQLite hàng loạt TRƯỚC khi hủy process đang chạy để worker không hoàn trả quota 2 lần, rồi nhả khóa ngay
    {
        let conn = database::get_db()?;
        conn.execute(
            "UPDATE bkt_test_jobs
             SET status = 'failed',
                 restriction = ?1,
                 error_message = ?1,
                 updated_at = ?2
             WHERE status IN ('queued', 'reuping', 'uploading', 'checking', 'pending')",
            rusqlite::params![cancel_reason, now_str],
        )
        .map_err(|e| format!("Lỗi cập nhật bkt_test_jobs: {e}"))?;

        conn.execute(
            "UPDATE channel_videos
             SET bkt_check_status = 'failed',
                 bkt_restriction = ?1,
                 risk_reason = ?1
             WHERE video_id IN (
                 SELECT source_ref_id FROM bkt_test_jobs
                 WHERE video_source_type = 'channel_video' AND error_message = ?1
             ) OR id IN (
                 SELECT source_ref_id FROM bkt_test_jobs
                 WHERE video_source_type = 'channel_video' AND error_message = ?1
             )",
            rusqlite::params![cancel_reason],
        )
        .ok();
    }

    // 5. Kích hoạt hủy tác vụ đang chạy (nếu có) — ngoài khóa DB_CONNECTION
    trigger_active_job_cancellation_any();

    // 6. Dọn dẹp file tạm và emit event cho UI
    for (id, _, _, video_path, reup_path) in jobs_to_cancel {
        if let Some(ref r_path) = reup_path {
            if r_path != &video_path {
                let p = Path::new(r_path);
                if p.exists() {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
        if let Ok(Some(job)) = database::get_bkt_test_job_by_id_db(&id) {
            // Hoàn trả 1 quota nếu job chưa kịp upload unlisted lên YouTube
            if job.youtube_video_id.is_none() {
                let _ = database::decrement_bkt_channel_used_db(&job.test_channel_id, 1);
            }
            let _ = app.emit("bkt-test-job-updated", &job);
        }
    }

    log::info!("[BKT CANCEL] Đã hủy thành công tất cả {count} tác vụ BKT.");
    Ok(count)
}


/// Lấy báo cáo thống kê hoạt động theo ngày (Daily Production Report)
#[tauri::command]
pub async fn get_daily_report_stats(
    date: Option<String>,
    date_filter: Option<String>,
) -> Result<crate::types::DailyReportStats, String> {
    let target = date_filter.or(date);
    tokio::task::spawn_blocking(move || crate::database::get_daily_report_stats_db(target))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

/// Chờ hoàn thành một tác vụ BKT (cho luồng thực thi tuần tự FIFO 1-by-1)
#[tauri::command]
pub async fn wait_bkt_job_completion(
    job_id: String,
    timeout_secs: Option<u64>,
) -> Result<crate::types::BktTestJob, String> {
    let max_duration = std::time::Duration::from_secs(timeout_secs.unwrap_or(3600));
    let start = std::time::Instant::now();

    loop {
        if let Ok(Some(job)) = database::get_bkt_test_job_by_id_db(&job_id) {
            let is_terminal = job.status == "green_clean" || job.status == "red_matched" || job.status == "failed";
            if is_terminal {
                // Nếu là green_clean và có bật auto_publish_main và có kênh đích, đợi đến khi đăng xong hoặc có kết quả đăng
                let has_target = job.target_profile_id.is_some() || job.main_target_profile_id.is_some();
                if job.status == "green_clean" && job.auto_publish_main.unwrap_or(false) && has_target {
                    if let Some(ref restr) = job.restriction {
                        if restr.contains("Đang tự động đăng sang Kênh Đích") {
                            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                            continue;
                        }
                    }
                }
                return Ok(job);
            }
        }
        if start.elapsed() > max_duration {
            return Err(format!("Hết thời gian chờ (Timeout) cho tác vụ BKT {job_id}"));
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

/// Đặt lại quota hôm nay về 0 (cho 1 kênh hoặc toàn bộ kênh test BKT)
#[tauri::command]
pub async fn reset_bkt_channel_daily_quota(channel_id: Option<String>) -> Result<(), String> {
    database::reset_bkt_channel_daily_quota_db(channel_id.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MultiBrowserProfile;

    fn mock_profile(id: &str, name: &str) -> MultiBrowserProfile {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "profile_name": name,
        }))
        .unwrap()
    }

    #[test]
    fn test_resolve_profile_id_exact_match() {
        let profiles = vec![
            mock_profile("prof-uuid-1", "Channel 1 Profile"),
            mock_profile("prof-uuid-2", "Channel 2 Profile"),
        ];

        let res = resolve_profile_id_with_auto_heal("prof-uuid-1", "Channel 1", &profiles);
        assert_eq!(res, Ok(("prof-uuid-1".to_string(), None)));
    }

    #[test]
    fn test_resolve_profile_id_auto_heal_by_profile_name() {
        let profiles = vec![
            mock_profile("new-uuid-test1", "test1"),
            mock_profile("new-uuid-test2", "test2"),
        ];

        // Trường hợp user nhập/cấu hình theo tên profile "test1" thay vì UUID
        let res = resolve_profile_id_with_auto_heal("test1", "Kênh Test A", &profiles);
        assert_eq!(res, Ok(("new-uuid-test1".to_string(), Some("test1".to_string()))));
    }

    #[test]
    fn test_resolve_profile_id_auto_heal_by_channel_name() {
        let profiles = vec![
            mock_profile("new-uuid-ch1", "BKT-Channel-VN"),
        ];

        // Trường hợp UUID cũ bị xóa, nhưng tên kênh test trùng với profile_name
        let res = resolve_profile_id_with_auto_heal("stale-uuid-999", "BKT-Channel-VN", &profiles);
        assert_eq!(res, Ok(("new-uuid-ch1".to_string(), Some("BKT-Channel-VN".to_string()))));
    }

    #[test]
    fn test_resolve_profile_id_not_found() {
        let profiles = vec![
            mock_profile("prof-1", "profile-one"),
        ];

        let res = resolve_profile_id_with_auto_heal("unknown-id", "Random Channel", &profiles);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("Hồ sơ trình duyệt không tồn tại"));
    }

    #[tokio::test]
    async fn test_bkt_semaphore_concurrency_limit() {
        let sem = get_bkt_semaphore();
        // Kiểm tra Semaphore cho phép tối đa 1 permit
        let p1 = sem.try_acquire();
        assert!(p1.is_ok(), "Permit đầu tiên phải acquire thành công");

        let p2 = sem.try_acquire();
        assert!(p2.is_err(), "Permit thứ hai phải bị từ chối vì giới hạn concurrency = 1");

        drop(p1);

        let p3 = sem.try_acquire();
        assert!(p3.is_ok(), "Sau khi drop permit 1, permit mới phải acquire thành công");
    }

    #[test]
    fn test_bkt_job_cancellation_tracking() {
        let test_id = "test-job-cancel-track-1";
        assert!(!is_bkt_job_cancelled(test_id));

        mark_job_id_as_cancelled(test_id);
        assert!(is_bkt_job_cancelled(test_id));

        unmark_job_id_as_cancelled(test_id);
        assert!(!is_bkt_job_cancelled(test_id));
    }

    #[tokio::test]
    async fn test_active_job_registration_and_cancel_trigger() {
        let test_id = "test-job-active-trigger-1";
        let (tx, mut rx) = oneshot::channel::<()>();

        let (pid_holder, reup_holder) = register_active_bkt_job(
            test_id.to_string(),
            "profile-test-uuid".to_string(),
            "original_video.mp4".to_string(),
            None,
            tx,
        );

        assert_eq!(pid_holder.load(Ordering::SeqCst), 0);
        set_current_bkt_child_pid(54321);
        assert_eq!(pid_holder.load(Ordering::SeqCst), 54321);

        set_current_bkt_reup_path(Some("reup_temp.mp4".to_string()));
        assert_eq!(
            reup_holder.read().unwrap().as_deref(),
            Some("reup_temp.mp4")
        );

        // Kích hoạt hủy job đang chạy
        let cancelled = trigger_active_job_cancellation(test_id);
        assert!(cancelled, "Phải kích hoạt hủy thành công cho active job");

        // Oneshot channel phải nhận được tín hiệu
        let recv_res = rx.try_recv();
        assert_eq!(recv_res, Ok(()), "Receiver phải nhận được tín hiệu hủy");

        unregister_active_bkt_job(test_id);
    }

    #[test]
    fn test_startup_reconcile_sweep_in_memory() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE bkt_test_jobs (
                id TEXT PRIMARY KEY,
                test_channel_id TEXT NOT NULL,
                video_source_type TEXT NOT NULL,
                source_ref_id TEXT,
                video_title TEXT NOT NULL,
                video_path TEXT NOT NULL,
                reup_path TEXT,
                youtube_video_id TEXT,
                status TEXT NOT NULL,
                restriction TEXT,
                error_message TEXT,
                tested_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE channel_videos (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                bkt_check_status TEXT,
                bkt_restriction TEXT,
                risk_reason TEXT
            )",
            [],
        )
        .unwrap();

        // Chèn các job ở các trạng thái khác nhau
        let statuses = vec![
            ("job-queued", "queued"),
            ("job-reuping", "reuping"),
            ("job-uploading", "uploading"),
            ("job-checking", "checking"),
            ("job-pending", "pending"),
            ("job-clean", "green_clean"),
            ("job-already-failed", "failed"),
        ];

        for (id, status) in statuses {
            conn.execute(
                "INSERT INTO bkt_test_jobs (
                    id, test_channel_id, video_source_type, source_ref_id,
                    video_title, video_path, reup_path, youtube_video_id,
                    status, restriction, error_message, tested_date, created_at, updated_at
                ) VALUES (?1, 'ch-1', 'channel_video', ?1, 'Test Title', 'v.mp4', NULL, NULL, ?2, NULL, NULL, '2026-11-11', '2026-11-11T10:00:00', '2026-11-11T10:00:00')",
                rusqlite::params![id, status],
            ).unwrap();

            conn.execute(
                "INSERT INTO channel_videos (id, video_id, bkt_check_status, risk_reason)
                 VALUES (?1, ?1, 'pending', NULL)",
                rusqlite::params![id],
            ).unwrap();
        }

        // Chạy Startup Reconcile Sweep
        let count = database::reconcile_bkt_jobs_on_startup_db(&conn).unwrap();
        assert_eq!(count, 5, "Phải quét đúng 5 job chưa hoàn tất (queued, reuping, uploading, checking, pending)");

        // Kiểm tra các job chưa hoàn tất đã chuyển sang failed với lý do chuẩn xác
        for id in &["job-queued", "job-reuping", "job-uploading", "job-checking", "job-pending"] {
            let (st, restr, err): (String, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT status, restriction, error_message FROM bkt_test_jobs WHERE id = ?1",
                    rusqlite::params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(st, "failed", "Job {id} phải được chuyển sang 'failed'");
            assert_eq!(restr.as_deref(), Some("Đã dừng khi ứng dụng khởi động lại"));
            assert_eq!(err.as_deref(), Some("Đã dừng khi ứng dụng khởi động lại"));

            let cv_status: String = conn
                .query_row(
                    "SELECT bkt_check_status FROM channel_videos WHERE id = ?1",
                    rusqlite::params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(cv_status, "failed", "channel_videos của {id} phải chuyển sang 'failed'");
        }

        // Kiểm tra job green_clean và failed trước đó không bị ảnh hưởng
        let (clean_st, _): (String, Option<String>) = conn
            .query_row(
                "SELECT status, restriction FROM bkt_test_jobs WHERE id = 'job-clean'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(clean_st, "green_clean");

        let (fail_st, _): (String, Option<String>) = conn
            .query_row(
                "SELECT status, restriction FROM bkt_test_jobs WHERE id = 'job-already-failed'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(fail_st, "failed");
    }
}
