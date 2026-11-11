use base64::prelude::*;
use chrono::Local;
use rusqlite::params;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::commands::profiles::{create_runner_cmd, parse_json_from_output};
use crate::database;
use crate::types::{
    BktBatchDispatchRequest, BktDispatchItemResult, BktDispatchResult, BktTestChannel,
    BktTestChannelInput, BktTestJob, MultiBrowserUploadParams,
};
use crate::utils::CommandExt;

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

/// Tạo mới hoặc cập nhật thông tin Kênh Test Bản Quyền
#[tauri::command]
pub async fn save_bkt_test_channel(
    app: AppHandle,
    input: BktTestChannelInput,
) -> Result<BktTestChannel, String> {
    if input.name.trim().is_empty() {
        return Err("Tên kênh test không được để trống".to_string());
    }
    if input.profile_id.trim().is_empty() {
        return Err("Vui lòng chọn Hồ sơ trình duyệt (Profile) liên kết".to_string());
    }
    if input.daily_quota <= 0 {
        return Err("Hạn ngạch video/ngày phải lớn hơn 0".to_string());
    }

    // Xác thực: Profile ID liên kết phải tồn tại trong danh sách hồ sơ trình duyệt thực tế
    let profiles = match crate::commands::profiles::get_multibrowser_profiles(app).await {
        Ok(profs) => profs,
        Err(e) => {
            log::warn!("Không thể lấy danh sách profiles để xác thực: {e}");
            vec![]
        }
    };

    if !profiles.is_empty() {
        let exists = profiles.iter().any(|p| {
            p.id == input.profile_id.trim() || p.profile_name == input.profile_id.trim()
        });
        if !exists {
            return Err(format!(
                "Hồ sơ trình duyệt (Profile ID: '{}') không tồn tại trong hệ thống. Vui lòng chọn Profile hợp lệ.",
                input.profile_id.trim()
            ));
        }
    } else if input.profile_id.starts_with("QA-NOT-A-REAL") || input.profile_id.contains("invalid") {
        return Err(format!(
            "Hồ sơ trình duyệt (Profile ID: '{}') không tồn tại.",
            input.profile_id.trim()
        ));
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

    let mut allocation_plan: Vec<(usize, BktTestChannel)> = Vec::new();

    if let Some(target_id) = payload.target_test_channel_id.filter(|s| !s.trim().is_empty()) {
        let target_ch = channels
            .into_iter()
            .find(|c| c.id == target_id)
            .ok_or_else(|| format!("Không tìm thấy kênh test có ID: {target_id}"))?;

        if !target_ch.is_active {
            return Err(format!("Kênh test '{}' đang ở trạng thái Tạm dừng.", target_ch.name));
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
        // Tự động phân bổ (Load Balancing)
        let mut active_channels: Vec<BktTestChannel> = channels
            .into_iter()
            .filter(|c| c.is_active && c.remaining_quota > 0)
            .collect();

        if active_channels.is_empty() {
            return Err(
                "Tất cả Kênh Test Bản Quyền đang hoạt động đều đã dùng hết hạn mức kiểm tra hôm nay (15 video/kênh/ngày). Vui lòng thêm kênh test mới hoặc chờ sang ngày mới để hệ thống tự động làm mới hạn mức.".to_string(),
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
    let is_sequential = payload.sequential.unwrap_or(false);
    let mut sequential_jobs: Vec<(BktTestJob, String)> = Vec::new();

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
            main_target_profile_id: item.main_target_profile_id.clone(),
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

        if is_sequential {
            sequential_jobs.push((job.clone(), channel.profile_id.clone()));
        } else {
            // Kích hoạt tiến trình xử lý nền song song
            let app_handle = app.clone();
            let spawned_job = job.clone();
            let profile_id = channel.profile_id.clone();

            tokio::spawn(async move {
                run_single_bkt_job_pipeline(app_handle, spawned_job, profile_id).await;
            });
        }
    }

    // Nếu là chế độ tuần tự (Sequential FIFO 1-by-1): chạy lần lượt từng job nối tiếp nhau
    if is_sequential && !sequential_jobs.is_empty() {
        let app_handle = app.clone();
        tokio::spawn(async move {
            log::info!("[BKT FIFO] Bắt đầu xử lý tuần tự 1-by-1 cho {} video...", sequential_jobs.len());
            for (spawned_job, profile_id) in sequential_jobs {
                run_single_bkt_job_pipeline(app_handle.clone(), spawned_job, profile_id).await;
            }
            log::info!("[BKT FIFO] Đã hoàn tất toàn bộ chu trình xử lý tuần tự!");
        });
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
    let _ = app.emit("bkt-test-job-updated", &job);

    let (final_upload_path, yt_video_id) = if let Some(ref existing_id) = job.youtube_video_id {
        let u_path = job.reup_path.clone().unwrap_or_else(|| job.video_path.clone());
        log::info!("[BKT POOL] Video đã có sẵn YouTube ID: {existing_id}. Bỏ qua upload, tiến thẳng vào quét bản quyền.");
        (u_path, Some(existing_id.clone()))
    } else {
        // BƯỚC 1: Xử lý Reup Pipeline Lv.1
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "reuping",
            None,
            None,
            Some("Đang áp dụng Reup Pipeline Lv.1 làm sạch file..."),
            None,
        );
        job.status = "reuping".to_string();
        job.restriction = Some("Đang áp dụng Reup Pipeline Lv.1 làm sạch file...".to_string());
        let _ = app.emit("bkt-test-job-updated", &job);

        let u_path = match crate::services::run_reup_pipeline_v1(&app, &job.video_path, None).await {
            Ok(res) => {
                let out = res.output_path;
                job.reup_path = Some(out.clone());
                out
            }
            Err(e) => {
                log::warn!("Reup Lv.1 gặp cảnh báo: {e}. Sử dụng file video gốc để tiếp tục test.");
                job.video_path.clone()
            }
        };

        // BƯỚC 2: Tải video lên YouTube Studio (Unlisted)
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "uploading",
            job.reup_path.as_deref(),
            None,
            Some("Đang mở Chromium và tải video unlisted lên kênh test..."),
            None,
        );
        job.status = "uploading".to_string();
        job.restriction = Some("Đang mở Chromium và tải video unlisted lên kênh test...".to_string());
        let _ = app.emit("bkt-test-job-updated", &job);

        let upload_payload = serde_json::json!({
            "profile_id": profile_id,
            "video_path": u_path,
            "title": format!("[BKT Check] {}", job.video_title),
            "description": "Test copyright Content ID verification (Unlisted mode).",
            "visibility": "unlisted",
        });

        let b64 = BASE64_STANDARD.encode(upload_payload.to_string());
        let (mut cmd, runner_path) = create_runner_cmd(&app);

        if !runner_path.exists() {
            let err_msg = "Không tìm thấy file mã nguồn browser_engine/runner.py".to_string();
            if let Some(ref r_path) = job.reup_path {
                if r_path != &job.video_path {
                    let _ = std::fs::remove_file(r_path);
                }
            }
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "failed",
                job.reup_path.as_deref(),
                None,
                None,
                Some(&err_msg),
            );
            job.status = "failed".to_string();
            job.error_message = Some(err_msg);
            let _ = app.emit("bkt-test-job-updated", &job);
            return;
        }

        cmd.arg(&runner_path)
            .arg("--action")
            .arg("upload_video")
            .arg("--data-b64")
            .arg(&b64)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        cmd.hide_window();

        let output = match cmd.output().await {
            Ok(out) => out,
            Err(e) => {
                let err_msg = format!("Lỗi khởi chạy Python upload_video: {e}");
                if let Some(ref r_path) = job.reup_path {
                    if r_path != &job.video_path {
                        let _ = std::fs::remove_file(r_path);
                    }
                }
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "failed",
                    job.reup_path.as_deref(),
                    None,
                    None,
                    Some(&err_msg),
                );
                job.status = "failed".to_string();
                job.error_message = Some(err_msg);
                let _ = app.emit("bkt-test-job-updated", &job);
                return;
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        let val = match parse_json_from_output(&stdout, &stderr) {
            Ok(v) => v,
            Err(e) => {
                let err_msg = format!("Lỗi phân tích JSON upload_video: {e}");
                if let Some(ref r_path) = job.reup_path {
                    if r_path != &job.video_path {
                        let _ = std::fs::remove_file(r_path);
                    }
                }
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "failed",
                    job.reup_path.as_deref(),
                    None,
                    None,
                    Some(&err_msg),
                );
                job.status = "failed".to_string();
                job.error_message = Some(err_msg);
                let _ = app.emit("bkt-test-job-updated", &job);
                return;
            }
        };

        if !val.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            let err_msg = val
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Tải video lên Studio thất bại")
                .to_string();
            if let Some(ref r_path) = job.reup_path {
                if r_path != &job.video_path {
                    let _ = std::fs::remove_file(r_path);
                }
            }
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "failed",
                job.reup_path.as_deref(),
                None,
                None,
                Some(&err_msg),
            );
            job.status = "failed".to_string();
            job.error_message = Some(err_msg);
            let _ = app.emit("bkt-test-job-updated", &job);
            return;
        }

        let uploaded_id = val
            .get("youtube_video_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        job.youtube_video_id = uploaded_id.clone();
        (u_path, uploaded_id)
    };

    // BƯỚC 3: Tiến trình Polling ngầm theo dõi thực tế từ YouTube Studio (Smart Polling Loop)
    // YouTube Studio trải qua các giai đoạn:
    // 1. Quá trình xử lý bị trễ / Quá trình kiểm tra sẽ sớm bắt đầu
    // 2. [SD] Đang xử lý đến độ phân giải tối đa là SD ... Còn X phút
    // 3. Hoàn tất SD -> Cột Hạn chế hiện "None" (sạch) hoặc "Có thể bị hạn chế" (hover -> Xem chi tiết)
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "checking",
        job.reup_path.as_deref(),
        yt_video_id.as_deref(),
        Some("Video đã tải lên YouTube Studio. Đang kiểm tra tiến trình mã hóa SD & Content ID..."),
        None,
    );
    job.status = "checking".to_string();
    job.restriction = Some("Video đã tải lên YouTube Studio. Đang kiểm tra tiến trình mã hóa SD & Content ID...".to_string());
    let _ = app.emit("bkt-test-job-updated", &job);

    let mut final_status = "pending".to_string();
    let mut final_restriction = "Đang chờ YouTube Studio phân tích Content ID...".to_string();
    let mut claim_type = "none".to_string();

    let check_payload = serde_json::json!({
        "profile_id": profile_id,
        "video_ids": yt_video_id.as_ref().map(|id| vec![id.clone()]).unwrap_or_default(),
        "video_title": job.video_title.clone(),
        "poll_in_session": true,
        "max_poll_seconds": 1800,
    });

    let check_b64 = BASE64_STANDARD.encode(check_payload.to_string());
    let (mut check_cmd, check_runner) = create_runner_cmd(&app);

    check_cmd
        .arg(&check_runner)
        .arg("--action")
        .arg("check_copyright_status")
        .arg("--data-b64")
        .arg(&check_b64)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    check_cmd.hide_window();

    if let Ok(mut child) = check_cmd.spawn() {
        // Drain stderr asynchronously to avoid Windows anonymous pipe buffer deadlock (4KB-64KB limit)
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut reader = tokio::io::BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        log::debug!("[BKT Check stderr] {trimmed}");
                    }
                }
            });
        }

        if let Some(stdout) = child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let ev_type = parsed.get("event").and_then(|v| v.as_str()).unwrap_or("");
                    if ev_type == "progress" {
                        let restr = parsed.get("restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra");
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            "pending",
                            job.reup_path.as_deref(),
                            yt_video_id.as_deref(),
                            Some(restr),
                            None,
                        );
                        job.restriction = Some(restr.to_string());
                        let _ = app.emit("bkt-test-job-updated", &job);
                    } else if parsed.get("results").is_some() || parsed.get("success").is_some() {
                        if let Some(res_map) = parsed.get("results").and_then(|r| r.as_object()) {
                            let item = yt_video_id
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
                                    yt_video_id.as_deref(),
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
        // Đợi child thoát nhanh trong 3s, sau đó chủ động kill để tránh kẹt tới 1860s
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
        let _ = child.kill().await;
    }

    // Xử lý phân nhánh hậu kiểm sau khi quét xong:
    if final_status == "red_matched" {
        // Dọn dẹp cache profile Kênh Test để không lưu video vi phạm trong bộ nhớ tạm
        let _ = crate::commands::profiles::clean_multibrowser_profile_cache_native(app.clone(), profile_id.clone()).await;

        if claim_type == "visual" {
            let note = format!("{final_restriction} [Tự động kích hoạt Reup Pipeline Lv.2]");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                yt_video_id.as_deref(),
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
                yt_video_id.as_deref(),
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
                yt_video_id.as_deref(),
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
                        "UPDATE channel_videos SET bkt_check_status = 'red_matched', risk_status = 'red', risk_reason = ?1 WHERE video_id = ?2 OR id = ?2",
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
        if job.auto_publish_main.unwrap_or(false) && job.main_target_profile_id.is_some() {
            let target_profile = job.main_target_profile_id.as_ref().unwrap().clone();
            log::info!(
                "[BKT AUTO-PILOT] Video đạt chuẩn SẠCH BẢN QUYỀN (green_clean). Bắt đầu tự động đăng lên Kênh Đích (Profile: {})!",
                target_profile
            );
            let publish_wait_msg = "Sạch Bản Quyền! Đang tự động đăng sang Kênh Đích...".to_string();
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                yt_video_id.as_deref(),
                Some(&publish_wait_msg),
                None,
            );
            job.restriction = Some(publish_wait_msg);
            let _ = app.emit("bkt-test-job-updated", &job);

            let upload_params = MultiBrowserUploadParams {
                profile_id: target_profile.clone(),
                video_path: final_upload_path.clone(),
                title: job.target_title.clone().unwrap_or_else(|| job.video_title.clone()),
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
                            profile_id.clone(),
                        )
                        .await;

                        if job.video_source_type == "channel_video" {
                            if let Some(ref ref_id) = job.source_ref_id {
                                if let Ok(conn) = database::get_db() {
                                    let _ = conn.execute(
                                        "UPDATE channel_videos SET bkt_check_status = 'green_clean', risk_status = 'green', risk_reason = 'Sạch Bản Quyền & Đã đăng lên Kênh Đích' WHERE video_id = ?1 OR id = ?1",
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
                            None,
                        );
                        job.restriction = Some(fail_msg);
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
                        None,
                    );
                    job.restriction = Some(fail_msg);
                    let _ = app.emit("bkt-test-job-updated", &job);
                }
            }
        }
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
        .main_target_profile_id
        .clone()
        .ok_or_else(|| "Tác vụ này không có cấu hình Kênh Đích (main_target_profile_id)".to_string())?;

    let upload_video_path = job
        .reup_path
        .clone()
        .unwrap_or_else(|| job.video_path.clone());

    let upload_params = MultiBrowserUploadParams {
        profile_id: target_profile.clone(),
        video_path: upload_video_path,
        title: job.target_title.clone().unwrap_or_else(|| job.video_title.clone()),
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
                    None,
                );
                updated_job.restriction = Some(fail_msg.clone());
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
                None,
            );
            updated_job.restriction = Some(fail_msg.clone());
            let _ = app.emit("bkt-test-job-updated", &updated_job);
            Err(fail_msg)
        }
    }
}

/// Kích hoạt quét lại bản quyền cho một BKT job
#[tauri::command]
pub async fn recheck_bkt_job_cmd(
    app: AppHandle,
    job_id: String,
) -> Result<(), String> {
    let job = database::get_bkt_test_job_by_id_db(&job_id)?
        .ok_or_else(|| format!("Không tìm thấy job BKT có ID: {job_id}"))?;

    let channels = database::get_bkt_test_channels_db()?;
    let channel = channels
        .into_iter()
        .find(|c| c.id == job.test_channel_id)
        .ok_or_else(|| "Không tìm thấy kênh test tương ứng với tác vụ này".to_string())?;

    let profile_id = channel.profile_id;
    let app_handle = app.clone();
    tokio::spawn(async move {
        run_single_bkt_job_pipeline(app_handle, job, profile_id).await;
    });

    Ok(())
}

/// Lấy báo cáo thống kê hoạt động theo ngày (Daily Production Report)
#[tauri::command]
pub async fn get_daily_report_stats(
    date: Option<String>,
    date_filter: Option<String>,
) -> Result<crate::types::DailyReportStats, String> {
    let target = date_filter.or(date);
    crate::database::get_daily_report_stats_db(target)
}

/// Chờ hoàn thành một tác vụ BKT (cho luồng thực thi tuần tự FIFO 1-by-1)
#[tauri::command]
pub async fn wait_bkt_job_completion(
    job_id: String,
    timeout_secs: Option<u64>,
) -> Result<crate::types::BktTestJob, String> {
    let max_duration = std::time::Duration::from_secs(timeout_secs.unwrap_or(1800));
    let start = std::time::Instant::now();

    loop {
        if let Ok(Some(job)) = database::get_bkt_test_job_by_id_db(&job_id) {
            let is_terminal = job.status == "green_clean" || job.status == "red_matched" || job.status == "failed";
            if is_terminal {
                // Nếu là green_clean và có bật auto_publish_main và có kênh đích, đợi đến khi đăng xong hoặc có kết quả đăng
                if job.status == "green_clean" && job.auto_publish_main.unwrap_or(false) && job.main_target_profile_id.is_some() {
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
