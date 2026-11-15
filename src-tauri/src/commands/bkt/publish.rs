use rusqlite::params;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::database;
use crate::types::{BktCatchupResult, BktTestJob, MultiBrowserUploadParams};

use super::*;

pub fn can_publish_bkt_status(status: &str) -> bool {
    matches!(status, "green_clean" | "publish_failed")
}

pub fn should_skip_catchup_publish_error(status: &str, duplicate_source: bool) -> bool {
    duplicate_source || matches!(status, "publishing" | "published")
}

pub fn publish_failure_status() -> &'static str {
    "publish_failed"
}

pub fn should_auto_publish_after_bkt_test(job: &BktTestJob) -> bool {
    job.auto_publish_main == Some(true)
        && job
            .target_profile_id
            .as_ref()
            .or(job.main_target_profile_id.as_ref())
            .is_some()
}

pub fn is_auto_publish_barrier_resolved(job: &BktTestJob) -> bool {
    job.status == "published"
}

pub fn should_wait_for_auto_publish(job: &BktTestJob) -> bool {
    should_auto_publish_after_bkt_test(job)
        && matches!(job.status.as_str(), "green_clean" | "publishing")
        && !is_auto_publish_barrier_resolved(job)
}

pub async fn wait_for_auto_publish_barrier(job_id: &str) {
    loop {
        let Ok(Some(job)) = database::get_bkt_test_job_by_id_db(job_id) else {
            return;
        };
        if !should_wait_for_auto_publish(&job) {
            return;
        }
        log::info!("[BKT WORKER] Chờ publish hoàn tất trước khi lấy job kế tiếp: {job_id} ({})", job.status);
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

pub fn disable_auto_publish_for_recheck(job: &mut BktTestJob) {
    job.auto_publish_main = Some(false);
}

pub fn is_bkt_job_terminal_for_wait(job: &BktTestJob) -> bool {
    !should_wait_for_auto_publish(job)
        && matches!(
            job.status.as_str(),
            "green_clean" | "red_matched" | "failed" | "published" | "publish_failed"
        )
}

pub fn channel_video_bkt_status_after_publish(published: bool) -> &'static str {
    if published { "green_clean" } else { "publish_failed" }
}

pub fn channel_video_risk_status_after_publish(published: bool) -> &'static str {
    if published { "green" } else { "yellow" }
}

pub fn can_recheck_bkt_status(status: &str) -> bool {
    status == "failed"
}

pub fn update_channel_video_publish_result(ref_id: &str, published: bool, message: &str) {
    let status = channel_video_bkt_status_after_publish(published);
    let risk_status = channel_video_risk_status_after_publish(published);
    if let Ok(conn) = database::get_db() {
        let _ = conn.execute(
            "UPDATE channel_videos
             SET bkt_check_status = ?1, risk_status = ?2, bkt_restriction = ?3, risk_reason = ?3
             WHERE video_id = ?4 OR id = ?4",
            params![status, risk_status, message, ref_id],
        );
        let _ = database::recalculate_channel_risk_by_video_db(ref_id);
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

    if !can_publish_bkt_status(&job.status) {
        return Err(format!(
            "Chỉ được đăng video khi BKT sạch hoặc tiếp tục job đăng lỗi; trạng thái hiện tại: {}",
            job.status
        ));
    }

    let target_profile = job
        .target_profile_id
        .clone()
        .or_else(|| job.main_target_profile_id.clone())
        .ok_or_else(|| "Tác vụ này không có cấu hình Kênh Đích (target_profile_id)".to_string())?;

    let upload_video_path = job.reup_path.clone().ok_or_else(|| {
        "Job BKT không có artifact reup đã kiểm tra; từ chối đăng lại để tránh tải nhầm video nguồn".to_string()
    })?;
    verify_video_ready_for_upload(Path::new(&upload_video_path)).await.map_err(|err| {
        format!("Artifact reup không sẵn sàng để đăng; job vẫn giữ trạng thái hiện tại: {err}")
    })?;

    let claim_won = {
        let db = database::get_db()?;
        database::claim_bkt_job_for_publish_with_conn(&db, &job.id)?
    };
    if !claim_won {
        return Err("Job BKT đã được đăng hoặc đang được xử lý bởi tác vụ khác".to_string());
    }

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
        "publishing",
        job.reup_path.as_deref(),
        job.youtube_video_id.as_deref(),
        Some(&publish_wait_msg),
        None,
    );
    let mut updated_job = job.clone();
    updated_job.status = "publishing".to_string();
    updated_job.restriction = Some(publish_wait_msg);
    let _ = app.emit("bkt-test-job-updated", &updated_job);

    match crate::commands::profiles::upload_video_multibrowser(app.clone(), upload_params).await {
        Ok(upload_res) => {
            if upload_res.success {
                let success_msg = "Sạch Bản Quyền & Đã xuất bản Công khai lên Kênh Đích thành công!".to_string();
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "published",
                    job.reup_path.as_deref(),
                    job.youtube_video_id.as_deref(),
                    Some(&success_msg),
                    None,
                );
                updated_job.status = "published".to_string();
                updated_job.restriction = Some(success_msg.clone());
                if job.video_source_type == "channel_video" {
                    if let Some(ref ref_id) = job.source_ref_id {
                        update_channel_video_publish_result(ref_id, true, &success_msg);
                    }
                }
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
                    publish_failure_status(),
                    job.reup_path.as_deref(),
                    job.youtube_video_id.as_deref(),
                    Some(&fail_msg),
                    Some(&fail_msg),
                );
                updated_job.status = publish_failure_status().to_string();
                updated_job.restriction = Some(fail_msg.clone());
                updated_job.error_message = Some(fail_msg.clone());
                if job.video_source_type == "channel_video" {
                    if let Some(ref ref_id) = job.source_ref_id {
                        update_channel_video_publish_result(ref_id, false, &fail_msg);
                    }
                }
                let _ = app.emit("bkt-test-job-updated", &updated_job);
                Err(fail_msg)
            }
        }
        Err(err) => {
            let fail_msg = format!("Lỗi khi đăng lên Kênh Đích: {err}");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                publish_failure_status(),
                job.reup_path.as_deref(),
                job.youtube_video_id.as_deref(),
                Some(&fail_msg),
                Some(&fail_msg),
            );
            updated_job.status = publish_failure_status().to_string();
            updated_job.restriction = Some(fail_msg.clone());
            updated_job.error_message = Some(fail_msg.clone());
            if job.video_source_type == "channel_video" {
                if let Some(ref ref_id) = job.source_ref_id {
                    update_channel_video_publish_result(ref_id, false, &fail_msg);
                }
            }
            let _ = app.emit("bkt-test-job-updated", &updated_job);
            Err(fail_msg)
        }
    }
}

/// Đăng tuần tự các job xanh cũ do người dùng chủ động yêu cầu.

/// Đăng tuần tự các job xanh cũ do người dùng chủ động yêu cầu.
/// Không retest, không đổi auto_publish_main, dừng ngay khi publish lỗi.
#[tauri::command]
pub async fn publish_bkt_catchup_cmd(app: AppHandle) -> Result<BktCatchupResult, String> {
    let candidate_ids = database::get_bkt_catchup_job_ids_db()?;
    let mut result = BktCatchupResult {
        total_candidates: candidate_ids.len(),
        published: 0,
        skipped: 0,
        stopped_job_id: None,
        error: None,
    };

    for job_id in candidate_ids {
        let permit = get_bkt_semaphore()
            .acquire()
            .await
            .map_err(|e| format!("Không thể giữ FIFO BKT cho catch-up: {e}"))?;

        let publish_result = publish_bkt_job_to_main_cmd(app.clone(), job_id.clone()).await;
        drop(permit);

        match publish_result {
            Ok(_) => {
                result.published += 1;
                log::info!("[BKT CATCH-UP] Đã đăng thành công job cũ: {job_id}");
            }
            Err(err) => {
                let current_status = database::get_bkt_test_job_by_id_db(&job_id)
                    .ok()
                    .flatten()
                    .map(|job| job.status);
                let duplicate_source = database::has_bkt_publish_duplicate_source_db(&job_id)
                    .unwrap_or(false);
                if should_skip_catchup_publish_error(
                    current_status.as_deref().unwrap_or_default(),
                    duplicate_source,
                ) {
                    result.skipped += 1;
                    log::warn!("[BKT CATCH-UP] Bỏ qua job {job_id}: đã có tác vụ publish khác; không đăng lại.");
                } else {
                    result.stopped_job_id = Some(job_id.clone());
                    result.error = Some(err.clone());
                    log::error!("[BKT CATCH-UP] Dừng FIFO tại job {job_id}: {err}");
                    break;
                }
            }
        }
    }

    Ok(result)
}


#[tauri::command]
pub async fn recheck_bkt_job_cmd(
    app: AppHandle,
    job_id: String,
) -> Result<(), String> {
    let mut job = database::get_bkt_test_job_by_id_db(&job_id)?
        .ok_or_else(|| format!("Không tìm thấy job BKT có ID: {job_id}"))?;

    if !can_recheck_bkt_status(&job.status) {
        return Err(format!(
            "Chỉ được chạy lại job BKT ở trạng thái failed, hiện tại: {}",
            job.status
        ));
    }

    let profile_id = job.test_profile_id.clone().ok_or_else(|| {
        "Job BKT cũ không có snapshot profile test gốc; từ chối chạy lại để tránh dùng nhầm profile hiện tại".to_string()
    })?;
    let queued_msg = "Đang xếp hàng chờ tải lại và quét bản quyền...".to_string();
    disable_auto_publish_for_recheck(&mut job);

    // Reserve quota + reset atomically; never queue a retry without a slot.
    let reserved = database::reset_bkt_test_job_for_retry_db(&job.id)?;
    if !reserved {
        return Err("Không còn quota hôm nay cho kênh test này".to_string());
    }

    job.status = "queued".to_string();
    // Giữ checkpoint sau restart: đã có YouTube ID thì worker tiếp tục Content ID check;
    // đã có artifact reup thì không render lại.
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
            if is_bkt_job_terminal_for_wait(&job) {
                return Ok(job);
            }
        }
        if start.elapsed() > max_duration {
            return Err(format!("Hết thời gian chờ (Timeout) cho tác vụ BKT {job_id}"));
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}
