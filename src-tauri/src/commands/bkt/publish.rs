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

pub fn update_channel_video_publish_result(
    ref_id: &str,
    published: bool,
    message: &str,
    published_yt_id: Option<&str>,
    target_profile_id: Option<&str>,
) {
    let status = channel_video_bkt_status_after_publish(published);
    let risk_status = channel_video_risk_status_after_publish(published);
    if let Ok(conn) = database::get_db() {
        if published {
            let _ = conn.execute(
                "UPDATE channel_videos
                 SET bkt_check_status = ?1, risk_status = ?2, bkt_restriction = ?3, risk_reason = ?3,
                     target_published = 1,
                     target_video_id = COALESCE(?5, target_video_id),
                     target_profile_id = COALESCE(?6, target_profile_id),
                     target_published_at = CURRENT_TIMESTAMP
                 WHERE video_id = ?4 OR id = ?4",
                params![status, risk_status, message, ref_id, published_yt_id, target_profile_id],
            );
        } else {
            let _ = conn.execute(
                "UPDATE channel_videos
                 SET bkt_check_status = ?1, risk_status = ?2, bkt_restriction = ?3, risk_reason = ?3
                 WHERE video_id = ?4 OR id = ?4",
                params![status, risk_status, message, ref_id],
            );
        }
    }
    let _ = database::recalculate_channel_risk_by_video_db(ref_id);
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

    // 0. KIEM TRA CHONG DANG TRUNG LAP (DATABASE GUARD):
    if let Ok(conn) = database::get_db() {
        let clean_target_title = job.target_title.as_deref().unwrap_or(&job.video_title).trim();
        let title_prefix = if clean_target_title.chars().count() > 30 {
            clean_target_title.chars().take(30).collect::<String>()
        } else {
            clean_target_title.to_string()
        };
        let title_like_pattern = format!("{title_prefix}%");

        let existing_published: Option<(String, Option<String>)> = conn.query_row(
            "SELECT id, youtube_video_id FROM bkt_test_jobs 
             WHERE (status = 'published' OR restriction LIKE '%Đã xuất bản%')
               AND (target_profile_id = ?1 OR main_target_profile_id = ?1)
               AND (video_title = ?2 OR target_title = ?2 
                    OR video_title LIKE ?5 OR target_title LIKE ?5
                    OR (source_ref_id IS NOT NULL AND source_ref_id = ?3))
               AND id != ?4
             LIMIT 1",
            rusqlite::params![target_profile, clean_target_title, job.source_ref_id, job.id, title_like_pattern],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).ok();

        let existing_channel_vid: Option<Option<String>> = if existing_published.is_none() {
            conn.query_row(
                "SELECT target_video_id FROM channel_videos
                 WHERE (target_published = 1 OR bkt_check_status = 'published' OR bkt_restriction LIKE '%Đã xuất bản%')
                   AND (target_profile_id = ?1 OR target_profile_id IS NULL)
                   AND ((?2 IS NOT NULL AND (id = ?2 OR video_id = ?2))
                        OR title = ?3 OR original_title = ?3
                        OR title LIKE ?4 OR original_title LIKE ?4)
                 LIMIT 1",
                rusqlite::params![target_profile, job.source_ref_id, clean_target_title, title_like_pattern],
                |r| r.get(0),
            ).ok()
        } else {
            None
        };

        let is_already_published = existing_published.is_some() || existing_channel_vid.is_some();
        if is_already_published {
            let yt_id = existing_published
                .and_then(|(_, id)| id)
                .or_else(|| existing_channel_vid.flatten())
                .unwrap_or_else(|| "published_confirmed".to_string());
            let yt_url = if yt_id.len() == 11 && !yt_id.contains(' ') {
                format!("https://youtu.be/{yt_id}")
            } else {
                "https://studio.youtube.com/ (Đã xuất bản trên kênh)".to_string()
            };
            let success_msg = format!("Video đã được xuất bản lên Kênh Đích từ trước ({yt_url}). Đã đồng bộ trạng thái, không đăng trùng!");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "published",
                job.reup_path.as_deref(),
                Some(&yt_id),
                Some(&success_msg),
                None,
            );
            if job.video_source_type == "channel_video" {
                if let Some(ref ref_id) = job.source_ref_id {
                    update_channel_video_publish_result(ref_id, true, &success_msg, Some(&yt_id), Some(&target_profile));
                }
            }
            let mut updated_job = job.clone();
            updated_job.status = "published".to_string();
            updated_job.youtube_video_id = Some(yt_id);
            updated_job.restriction = Some(success_msg.clone());
            let _ = app.emit("bkt-test-job-updated", &updated_job);
            log::info!("[BKT ANTI-DUPLICATE] {}", success_msg);
            return Ok(success_msg);
        }
    }

    let upload_video_path = if let Some(ref path) = job.reup_path {
        let p = Path::new(path);
        if p.is_file() && p.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
            path.clone()
        } else {
            let orig_video_path = Path::new(&job.video_path);
            let parent_dir = orig_video_path.parent().unwrap_or(Path::new("."));
            let video_stem = orig_video_path.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
            let candidate_reup = parent_dir
                .join(format!("[DA_EDIT]_{video_stem}"))
                .join(format!("{video_stem}_reup_ready.mp4"));
            let alt_candidate_reup = parent_dir
                .join("[DA_EDIT]")
                .join(format!("{video_stem}_reup_ready.mp4"));
            if candidate_reup.is_file() && candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
                let candidate_str = candidate_reup.to_string_lossy().to_string();
                log::info!("[BKT PUBLISH] Phục hồi reup_path từ tệp có sẵn trên đĩa: {candidate_str}");
                candidate_str
            } else if alt_candidate_reup.is_file() && alt_candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
                let candidate_str = alt_candidate_reup.to_string_lossy().to_string();
                log::info!("[BKT PUBLISH] Phục hồi reup_path từ tệp alt trên đĩa: {candidate_str}");
                candidate_str
            } else {
                return Err("Job BKT không có artifact reup đã kiểm tra; từ chối đăng lại để tránh tải nhầm video nguồn".to_string());
            }
        }
    } else {
        let orig_video_path = Path::new(&job.video_path);
        let parent_dir = orig_video_path.parent().unwrap_or(Path::new("."));
        let video_stem = orig_video_path.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
        let candidate_reup = parent_dir
            .join(format!("[DA_EDIT]_{video_stem}"))
            .join(format!("{video_stem}_reup_ready.mp4"));
        let alt_candidate_reup = parent_dir
            .join("[DA_EDIT]")
            .join(format!("{video_stem}_reup_ready.mp4"));
        if candidate_reup.is_file() && candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
            let candidate_str = candidate_reup.to_string_lossy().to_string();
            log::info!("[BKT PUBLISH] Tự động gán reup_path từ tệp có sẵn trên đĩa: {candidate_str}");
            candidate_str
        } else if alt_candidate_reup.is_file() && alt_candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
            let candidate_str = alt_candidate_reup.to_string_lossy().to_string();
            log::info!("[BKT PUBLISH] Tự động gán reup_path từ tệp alt trên đĩa: {candidate_str}");
            candidate_str
        } else {
            return Err("Job BKT không có artifact reup đã kiểm tra; từ chối đăng lại để tránh tải nhầm video nguồn".to_string());
        }
    };
    verify_video_ready_for_upload(Path::new(&upload_video_path)).await.map_err(|err| {
        format!("Artifact reup không sẵn sàng để đăng; job vẫn giữ trạng thái hiện tại: {err}")
    })?;

    let mut final_thumb = job.thumbnail_path.clone();
    if final_thumb.is_none() {
        let orig_video_path = Path::new(&job.video_path);
        let parent_dir = orig_video_path.parent().unwrap_or(Path::new("."));
        let video_stem = orig_video_path.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
        let candidate_thumb = parent_dir
            .join(format!("[DA_EDIT]_{video_stem}"))
            .join(format!("{video_stem}_thumbnail.jpg"));
        if candidate_thumb.is_file() {
            final_thumb = Some(candidate_thumb.to_string_lossy().to_string());
        }
    }

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
        thumbnail_path: final_thumb,
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

    let mut upload_res = crate::commands::profiles::upload_video_multibrowser(app.clone(), upload_params.clone()).await;

    // Tự động giải phóng nếu gặp tiến trình Chromium mồ côi (PID lock) và thử lại 1 lần
    if let Ok(ref res) = upload_res {
        if !res.success {
            let err = res.error.as_deref().unwrap_or("");
            if err.contains("không tự động dừng tiến trình đang sống") || err.contains("Hồ sơ đang mở trong Chromium") {
                log::warn!(
                    "[BKT PUBLISH] Phát hiện PID Chromium cũ chưa thoát cho hồ sơ '{}'. Tự động giải phóng và thử lại...",
                    target_profile
                );
                let _ = crate::commands::profiles::stop_multibrowser_profile(app.clone(), target_profile.clone()).await;
                tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
                upload_res = crate::commands::profiles::upload_video_multibrowser(app.clone(), upload_params).await;
            }
        }
    }

    match upload_res {
        Ok(upload_res) => {
            if upload_res.success {
                let published_yt_id = upload_res
                    .youtube_video_id
                    .clone()
                    .or_else(|| {
                        upload_res.video_url.as_deref().and_then(|url| {
                            url.split('/')
                                .last()
                                .and_then(|seg| seg.split('?').next())
                                .filter(|id| pipeline::is_verified_youtube_id(id))
                                .map(ToString::to_string)
                        })
                    })
                    .or_else(|| job.youtube_video_id.clone());

                let success_msg = "Sạch Bản Quyền & Đã xuất bản Công khai lên Kênh Đích thành công!".to_string();
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "published",
                    job.reup_path.as_deref(),
                    published_yt_id.as_deref(),
                    Some(&success_msg),
                    None,
                );
                updated_job.status = "published".to_string();
                updated_job.youtube_video_id = published_yt_id.clone();
                updated_job.restriction = Some(success_msg.clone());
                if job.video_source_type == "channel_video" {
                    if let Some(ref ref_id) = job.source_ref_id {
                        update_channel_video_publish_result(
                            ref_id,
                            true,
                            &success_msg,
                            published_yt_id.as_deref(),
                            Some(&target_profile),
                        );
                    }
                }
                let _ = app.emit("bkt-test-job-updated", &updated_job);
                let _ = app.emit("bkt-auto-published-main", &updated_job);

                // BẢO TỒN ARTIFACT ĐÃ EDIT: Giữ lại file reup_ready.mp4 và thumbnail trong thư mục [DA_EDIT]
                // để người dùng có thể mở nhanh từ Thẻ Kênh và hỗ trợ resume upload nếu YouTube Studio cần.
                log::info!(
                    "[BKT MANUAL-PUBLISH] Xuất bản thành công: Bảo toàn video edit tại {:?}",
                    job.reup_path
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
                        update_channel_video_publish_result(ref_id, false, &fail_msg, None, Some(&target_profile));
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
                    update_channel_video_publish_result(ref_id, false, &fail_msg, None, Some(&target_profile));
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
                    "UPDATE channel_videos SET bkt_check_status = 'pending', risk_status = 'pending', bkt_restriction = 'Đang xếp hàng chờ tải lại và quét bản quyền...', risk_reason = 'Đang xếp hàng chờ tải lại và quét bản quyền...' WHERE video_id = ?1 OR id = ?1",
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
    let max_duration = std::time::Duration::from_secs(timeout_secs.unwrap_or(7200));
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
