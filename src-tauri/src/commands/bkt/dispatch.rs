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
        let test_profile_id = resolve_profile_id_with_auto_heal(&channel.profile_id, &channel.name, &profiles)
            .map(|(profile_id, _)| profile_id)
            .map_err(|err| format!("Kênh test '{}' không thể dùng profile đã lưu: {err}", channel.name))?;

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

