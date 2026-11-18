use chrono::Local;
use futures_util::FutureExt;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::database;
use crate::types::{
    BktBatchDispatchRequest, BktDispatchItemResult, BktDispatchResult, BktTestChannel,
    BktTestJob,
};

use super::*;

pub fn resolve_profile_id_with_auto_heal(
    raw_profile_id: &str,
    channel_name: &str,
    profiles: &[crate::types::MultiBrowserProfile],
) -> Result<(String, Option<String>), String> {
    let trimmed = raw_profile_id.trim();
    if let Some(p) = profiles.iter().find(|p| p.id == trimmed) {
        return Ok((p.id.clone(), None));
    }

    // Auto-heal chỉ an toàn khi tên ánh xạ tới đúng một profile.
    let ch_trimmed = channel_name.trim();
    let matches: Vec<&crate::types::MultiBrowserProfile> = profiles
        .iter()
        .filter(|p| {
            p.profile_name.trim().eq_ignore_ascii_case(trimmed)
                || (!ch_trimmed.is_empty()
                    && p.profile_name.trim().eq_ignore_ascii_case(ch_trimmed))
        })
        .collect();

    match matches.as_slice() {
        [h] => Ok((h.id.clone(), Some(h.profile_name.clone()))),
        [] => Err(format!(
            "Hồ sơ trình duyệt không tồn tại (Profile ID: '{}'). Vui lòng cấu hình lại trong Quản Lý Kênh Test.",
            trimmed
        )),
        _ => Err(format!(
            "Tên hồ sơ không duy nhất; tìm thấy nhiều hồ sơ phù hợp cho '{}'. Vui lòng chọn đúng Profile ID.",
            trimmed
        )),
    }
}

pub fn get_bkt_task_sender(_app: &AppHandle) -> &'static mpsc::UnboundedSender<BktWorkerTask> {
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

                wait_for_auto_publish_barrier(&job_id).await;
                unregister_active_bkt_job(&job_id);
                drop(permit);
                log::info!("[BKT WORKER] Đã hoàn tất xử lý job: {job_id}. Giải phóng semaphore permit.");
            }
            log::warn!("[BKT WORKER] Worker channel đã đóng.");
        });

        tx
    })
}


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
    let mut channels = database::get_bkt_test_channels_db()?;
    if channels.is_empty() {
        let all_fast_track = payload.items.iter().all(|item| {
            if item.skip_bkt_test.unwrap_or(false) {
                return true;
            }
            if let Some(ref c_id) = item.channel_id {
                if let Ok(ch) = database::get_followed_channel_db(c_id.clone()) {
                    return ch.is_trusted_clean.unwrap_or(false)
                        || (ch.enable_fast_track.unwrap_or(false) && ch.consecutive_green_count.unwrap_or(0) >= 5);
                }
            }
            false
        });

        if all_fast_track {
            let fallback_profile = payload.items.first().and_then(|i| {
                i.main_target_profile_id.clone().or_else(|| i.target_profile_id.clone())
            }).unwrap_or_else(|| "default".to_string());

            channels.push(BktTestChannel {
                id: "fast_track_direct".to_string(),
                name: "Kênh Đích Trực Tiếp (Bỏ qua BKT)".to_string(),
                profile_id: fallback_profile,
                youtube_channel_name: None,
                youtube_channel_id: None,
                daily_quota: 9999,
                daily_used: 0,
                last_reset_date: Local::now().format("%Y-%m-%d").to_string(),
                is_active: true,
                priority: 0,
                note: None,
                created_at: Local::now().to_rfc3339(),
                updated_at: Local::now().to_rfc3339(),
                remaining_quota: 9999,
            });
        } else {
            return Err(
                "Bạn chưa cấu hình Kênh Test Bản Quyền nào trong hệ thống. Vui lòng vào mục 'Reup & BKT Test' → Tab 'Quản Lý Kênh Test BKT' để thêm kênh test (gán với một Profile BrowserMulti đã đăng nhập YouTube Studio) trước khi kiểm tra bản quyền.".to_string(),
            );
        }
    }
    let today = Local::now().format("%Y-%m-%d").to_string();

    let profiles = crate::commands::profiles::get_all_raw_multibrowser_profiles(app.clone())
        .await
        .unwrap_or_default();

    let mut allocation_plan: Vec<(usize, BktTestChannel)> = Vec::new();
    let mut checkpoint_map: std::collections::HashMap<usize, database::BktCheckpoint> =
        std::collections::HashMap::new();

    // Tra cứu Checkpoint: Nếu video đã upload lên một kênh test trước đó, cố định gán lại kênh test cũ
    let mut unallocated_indices = Vec::new();
    for (idx, item) in payload.items.iter().enumerate() {
        let is_fast = item.skip_bkt_test.unwrap_or(false)
            || payload.target_test_channel_id.as_deref() == Some("fast_track_direct")
            || item.channel_id.as_ref().map(|c_id| {
                if let Ok(ch) = database::get_followed_channel_db(c_id.clone()) {
                    ch.is_trusted_clean.unwrap_or(false)
                        || (ch.enable_fast_track.unwrap_or(false) && ch.consecutive_green_count.unwrap_or(0) >= 5)
                } else {
                    false
                }
            }).unwrap_or(false);

        if is_fast {
            let fallback_profile = item.main_target_profile_id.clone()
                .or_else(|| item.target_profile_id.clone())
                .unwrap_or_else(|| "default".to_string());
            let dummy_ch = BktTestChannel {
                id: "fast_track_direct".to_string(),
                name: "Kênh Đích Trực Tiếp (Bỏ qua BKT)".to_string(),
                profile_id: fallback_profile,
                youtube_channel_name: None,
                youtube_channel_id: None,
                daily_quota: 9999,
                daily_used: 0,
                last_reset_date: Local::now().format("%Y-%m-%d").to_string(),
                is_active: true,
                priority: 0,
                note: None,
                created_at: Local::now().to_rfc3339(),
                updated_at: Local::now().to_rfc3339(),
                remaining_quota: 9999,
            };
            allocation_plan.push((idx, dummy_ch));
            continue;
        }

        if let Ok(Some(cp)) =
            database::get_existing_bkt_checkpoint_db(item.source_ref_id.as_deref(), &item.video_path)
        {
            if let Some(ch) = channels.iter().find(|c| c.id == cp.test_channel_id && c.is_active) {
                log::info!(
                    "[BKT AFFINITY] Tái sử dụng kênh test '{}' và YouTube ID '{}' cho video: {}",
                    ch.name,
                    cp.youtube_video_id,
                    item.video_title
                );
                allocation_plan.push((idx, ch.clone()));
                checkpoint_map.insert(idx, cp);
                continue;
            }
        }
        unallocated_indices.push(idx);
    }

    if !unallocated_indices.is_empty() {
        if let Some(target_id) = payload.target_test_channel_id.filter(|s| !s.trim().is_empty()) {
            let target_ch = channels
                .iter()
                .find(|c| c.id == target_id)
                .ok_or_else(|| format!("Không tìm thấy kênh test có ID: {target_id}"))?;

            if !target_ch.is_active {
                return Err(format!("Kênh test '{}' đang ở trạng thái Tạm dừng.", target_ch.name));
            }

            if let Err(prof_err) = resolve_profile_id_with_auto_heal(&target_ch.profile_id, &target_ch.name, &profiles) {
                return Err(format!("Kênh test '{}' không thể sử dụng: {prof_err}", target_ch.name));
            }

            let needed = unallocated_indices.len() as i64;
            if target_ch.remaining_quota < needed {
                return Err(format!(
                    "Kênh '{}' chỉ còn {} lượt test hôm nay, nhưng bạn cần test mới {} video (giới hạn {} video/ngày).",
                    target_ch.name, target_ch.remaining_quota, needed, target_ch.daily_quota
                ));
            }

            for idx in unallocated_indices {
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
            let total_requested = unallocated_indices.len() as i64;

            if total_requested > total_available_quota {
                return Err(format!(
                    "Tổng số video cần test mới ({total_requested}) vượt quá tổng lượt test khả dụng của tất cả các kênh ({total_available_quota} lượt). Vui lòng bỏ bớt {} video hoặc bổ sung thêm Kênh Test Bản Quyền.",
                    total_requested - total_available_quota
                ));
            }

            // Sắp xếp kênh theo số slot còn lại giảm dần
            active_channels.sort_by(|a, b| b.remaining_quota.cmp(&a.remaining_quota));

            let mut channel_idx = 0;
            let mut channel_used_in_batch: std::collections::HashMap<String, i64> =
                std::collections::HashMap::new();

            for item_idx in unallocated_indices {
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
    }

    // 3. Thực thi tạo Job và cập nhật Quota trong DB
    let mut dispatch_results: Vec<BktDispatchItemResult> = Vec::new();
    let now_str = Local::now().to_rfc3339();
    for (item_idx, channel) in allocation_plan {
        let item = &payload.items[item_idx];

        // 0. Chặn tạo Job lặp lại nếu video đã xuất bản lên Kênh Đích
        let target_prof_opt = item.main_target_profile_id.as_deref().or(item.target_profile_id.as_deref());
        if let (Some(target_prof), Ok(conn)) = (target_prof_opt, database::get_db()) {
            let clean_title = item.video_title.trim();
            let title_prefix = if clean_title.chars().count() > 30 {
                clean_title.chars().take(30).collect::<String>()
            } else {
                clean_title.to_string()
            };
            let title_like = format!("{title_prefix}%");
            let already_published = conn.query_row(
                "SELECT 1 FROM bkt_test_jobs
                 WHERE (status = 'published' OR restriction LIKE '%Đã xuất bản%')
                   AND (main_target_profile_id = ?1 OR target_profile_id = ?1)
                   AND (video_title = ?2 OR target_title = ?2 OR video_title LIKE ?3 OR target_title LIKE ?3
                        OR (source_ref_id IS NOT NULL AND source_ref_id = ?4))
                 UNION ALL
                 SELECT 1 FROM channel_videos
                 WHERE (target_published = 1 OR bkt_check_status = 'published' OR bkt_restriction LIKE '%Đã xuất bản%')
                   AND (target_profile_id = ?1 OR target_profile_id IS NULL)
                   AND (title = ?2 OR original_title = ?2 OR title LIKE ?3 OR original_title LIKE ?3
                        OR (id = ?4 OR video_id = ?4))
                 LIMIT 1",
                rusqlite::params![target_prof, clean_title, title_like, item.source_ref_id],
                |_| Ok(true),
            ).unwrap_or(false);

            if already_published {
                log::info!("[BKT DISPATCH] Bỏ qua tạo job cho video '{}' vì đã xuất bản trên Profile '{}'", item.video_title, target_prof);
                dispatch_results.push(BktDispatchItemResult {
                    video_title: item.video_title.clone(),
                    assigned_channel_id: Some(channel.id.clone()),
                    assigned_channel_name: Some("Đã xuất bản trên Kênh Đích".to_string()),
                    job_id: None,
                    success: true,
                    error: None,
                });
                continue;
            }
        }

        let job_id = uuid::Uuid::new_v4().to_string();
        let test_profile_id = if channel.id == "fast_track_direct" {
            channel.profile_id.clone()
        } else {
            resolve_profile_id_with_auto_heal(&channel.profile_id, &channel.name, &profiles)
                .map(|(profile_id, _)| profile_id)
                .map_err(|err| format!("Kênh test '{}' không thể dùng profile đã lưu: {err}", channel.name))?
        };

        let (mut reup_path_val, yt_id_val) = if let Some(cp) = checkpoint_map.get(&item_idx) {
            (cp.reup_path.clone(), Some(cp.youtube_video_id.clone()))
        } else {
            (None, None)
        };

        let orig_video_path = Path::new(&item.video_path);
        let parent_dir = orig_video_path.parent().unwrap_or(Path::new("."));
        let video_stem = orig_video_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("video");
        let candidate_reup = parent_dir
            .join(format!("[DA_EDIT]_{video_stem}"))
            .join(format!("{video_stem}_reup_ready.mp4"));
        let alt_candidate_reup = parent_dir
            .join("[DA_EDIT]")
            .join(format!("{video_stem}_reup_ready.mp4"));

        if reup_path_val.is_none() {
            if candidate_reup.is_file() && candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
                log::info!("[BKT DISPATCH] Tự động nhận diện video đã edit sẵn trên đĩa: {}", candidate_reup.display());
                reup_path_val = Some(candidate_reup.to_string_lossy().to_string());
            } else if alt_candidate_reup.is_file() && alt_candidate_reup.metadata().map(|m| m.len() > 100_000).unwrap_or(false) {
                log::info!("[BKT DISPATCH] Tự động nhận diện video đã edit sẵn trên đĩa (alt): {}", alt_candidate_reup.display());
                reup_path_val = Some(alt_candidate_reup.to_string_lossy().to_string());
            }
        }

        let mut final_thumb = item.thumbnail_path.clone();
        if final_thumb.is_none() {
            let candidate_thumb = parent_dir
                .join(format!("[DA_EDIT]_{video_stem}"))
                .join(format!("{video_stem}_thumbnail.jpg"));
            if candidate_thumb.is_file() {
                final_thumb = Some(candidate_thumb.to_string_lossy().to_string());
            }
        }

        let job = BktTestJob {
            id: job_id.clone(),
            test_channel_id: channel.id.clone(),
            test_channel_name: Some(channel.name.clone()),
            test_profile_id: Some(test_profile_id.clone()),
            video_source_type: item
                .video_source_type
                .clone()
                .unwrap_or_else(|| "local_file".to_string()),
            source_ref_id: item.source_ref_id.clone(),
            video_title: item.video_title.clone(),
            video_path: item.video_path.clone(),
            reup_path: reup_path_val,
            youtube_video_id: yt_id_val,
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
            thumbnail_path: final_thumb,
            skip_bkt_test: item.skip_bkt_test,
        };

        match database::reserve_bkt_channel_and_create_job_db(&job) {
            Ok(true) => {}
            Ok(false) => {
                dispatch_results.push(BktDispatchItemResult {
                    video_title: item.video_title.clone(),
                    assigned_channel_id: Some(channel.id.clone()),
                    assigned_channel_name: Some(channel.name.clone()),
                    job_id: None,
                    success: false,
                    error: Some("Kênh test đã hết quota trước khi giữ chỗ".to_string()),
                });
                continue;
            }
            Err(e) => {
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
        }

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
        enqueue_bkt_job(&app, job, test_profile_id);
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

