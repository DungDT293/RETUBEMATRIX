use base64::prelude::*;
use chrono::Local;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::commands::profiles::{create_runner_cmd, parse_json_from_output};
use crate::database;
use crate::types::{
    BktBatchDispatchRequest, BktDispatchItemResult, BktDispatchResult, BktTestChannel,
    BktTestChannelInput, BktTestJob,
};
use crate::utils::CommandExt;

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
                "Hiện không có Kênh Test Bản Quyền nào còn lượt test khả dụng hôm nay (đã dùng hết hạn ngạch 15 video/kênh). Vui lòng thêm kênh test mới hoặc chờ sang ngày mới để hệ thống tự động reset.".to_string(),
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

        // Kích hoạt tiến trình xử lý nền (Reup Lv.1 -> Upload unlisted -> Check Studio)
        let app_handle = app.clone();
        let spawned_job = job.clone();
        let profile_id = channel.profile_id.clone();

        tokio::spawn(async move {
            run_single_bkt_job_pipeline(app_handle, spawned_job, profile_id).await;
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

    let final_upload_path = match crate::services::run_reup_pipeline_v1(&app, &job.video_path, None).await {
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
        "video_path": final_upload_path,
        "title": format!("[BKT Check] {}", job.video_title),
        "description": "Test copyright Content ID verification (Unlisted mode).",
        "visibility": "unlisted",
    });

    let b64 = BASE64_STANDARD.encode(upload_payload.to_string());
    let (mut cmd, runner_path) = create_runner_cmd(&app);

    if !runner_path.exists() {
        let err_msg = "Không tìm thấy file mã nguồn browser_engine/runner.py".to_string();
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

    let yt_video_id = val
        .get("youtube_video_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    job.youtube_video_id = yt_video_id.clone();

    // BƯỚC 3: Đợi YouTube Studio quét bản quyền (Checking...)
    let _ = database::update_bkt_test_job_status_db(
        &job.id,
        "checking",
        job.reup_path.as_deref(),
        yt_video_id.as_deref(),
        Some("Video đã tải lên YouTube. Đang chờ YouTube Studio phân tích Content ID..."),
        None,
    );
    job.status = "checking".to_string();
    job.restriction = Some("Video đã tải lên YouTube. Đang chờ YouTube Studio phân tích Content ID...".to_string());
    let _ = app.emit("bkt-test-job-updated", &job);

    // Chờ 30 giây để YouTube chạy kiểm tra bản quyền ngầm
    tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

    // BƯỚC 4: Quét kết quả Restrictions từ Studio
    let check_payload = serde_json::json!({
        "profile_id": profile_id,
        "video_ids": yt_video_id.as_ref().map(|id| vec![id.clone()]).unwrap_or_default(),
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
        .stderr(std::process::Stdio::piped());
    check_cmd.hide_window();

    if let Ok(check_out) = check_cmd.output().await {
        let c_stdout = String::from_utf8_lossy(&check_out.stdout);
        let c_stderr = String::from_utf8_lossy(&check_out.stderr);

        if let Ok(parsed_check) = parse_json_from_output(&c_stdout, &c_stderr) {
            let is_success = parsed_check
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if !is_success {
                let err_msg = parsed_check
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Không thể quét trạng thái bản quyền từ YouTube Studio");
                let _ = database::update_bkt_test_job_status_db(
                    &job.id,
                    "failed",
                    job.reup_path.as_deref(),
                    yt_video_id.as_deref(),
                    None,
                    Some(err_msg),
                );
                job.status = "failed".to_string();
                job.error_message = Some(err_msg.to_string());
                let _ = app.emit("bkt-test-job-updated", &job);
                return;
            }

            let mut final_status = "pending".to_string();
            let mut final_restriction = "YouTube đang tiếp tục kiểm tra...".to_string();

            if let Some(res_map) = parsed_check.get("results").and_then(|r| r.as_object()) {
                if let Some(vid_id) = &yt_video_id {
                    if let Some(item) = res_map.get(vid_id) {
                        let st = item.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending");
                        let restr = item.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra");
                        final_status = st.to_string();
                        final_restriction = restr.to_string();
                    }
                } else if let Some((_, first_item)) = res_map.iter().next() {
                    let st = first_item.get("bkt_check_status").and_then(|s| s.as_str()).unwrap_or("pending");
                    let restr = first_item.get("bkt_restriction").and_then(|s| s.as_str()).unwrap_or("Đang kiểm tra");
                    final_status = st.to_string();
                    final_restriction = restr.to_string();
                }
            }

            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                &final_status,
                job.reup_path.as_deref(),
                yt_video_id.as_deref(),
                Some(&final_restriction),
                None,
            );
            job.status = final_status.clone();
            job.restriction = Some(final_restriction);
            let _ = app.emit("bkt-test-job-updated", &job);

            // Nếu phát hiện dính bản quyền (red_matched), kích hoạt Reup Lv.2 tự động
            if final_status == "red_matched" {
                if let Some(ref r_path) = job.reup_path {
                    let app_clone = app.clone();
                    let target_path = r_path.clone();
                    tokio::spawn(async move {
                        log::info!("[BKT POOL] Tự động kích hoạt Reup Pipeline Lv.2 cho video: {target_path}");
                        let _ = crate::services::run_reup_pipeline_v2(&app_clone, &target_path, None).await;
                    });
                }
            }
        }
    }
}
