use base64::prelude::*;
use rusqlite::params;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::commands::profiles::create_runner_cmd;
use crate::database;
use crate::types::BktTestJob;
use crate::utils::CommandExt;

use super::*;

pub fn is_verified_youtube_id(value: &str) -> bool {
    value.len() == 11 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn verified_youtube_id(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|id| is_verified_youtube_id(id))
}

pub fn exact_bkt_result_for_video<'a>(results: &'a serde_json::Value, video_id: &str) -> Option<&'a serde_json::Value> {
    results.as_object()?.get(video_id)
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


pub fn mark_job_as_failed(app: &AppHandle, job: &mut BktTestJob, err_msg: String) {
    let _ = database::fail_bkt_test_job_and_refund_quota_db(
        &job.id,
        job.reup_path.as_deref(),
        job.youtube_video_id.as_deref(),
        &err_msg,
    );
    job.status = "failed".to_string();
    job.restriction = Some(err_msg.clone());
    job.error_message = Some(err_msg.clone());
    let _ = app.emit("bkt-test-job-updated", &job);
    crate::commands::profiles::clear_stats_cache();

    // Circuit Breaker: Reset consecutive green count & disable fast track on failure
    if let Some(ref c_id) = job.channel_id {
        let _ = database::record_channel_bkt_verdict_db(c_id, false);
    } else if let Some(ref ref_id) = job.source_ref_id {
        let found_cid = database::get_db().ok().and_then(|conn| {
            conn.query_row(
                "SELECT channel_id FROM channel_videos WHERE video_id = ?1 OR id = ?1",
                rusqlite::params![ref_id],
                |row| row.get::<_, String>(0),
            ).ok()
        });
        if let Some(c_id) = found_cid {
            let _ = database::record_channel_bkt_verdict_db(&c_id, false);
        }
    }

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


pub async fn run_single_bkt_job_pipeline(app: AppHandle, mut job: BktTestJob, profile_id: String) {
    if is_bkt_job_cancelled(&job.id) {
        log::info!("[BKT POOL] Job {} đã bị hủy trước khi bắt đầu pipeline. Dừng thực thi.", job.id);
        return;
    }

    let _ = app.emit("bkt-test-job-updated", &job);

    // Profile identity is an immutable dispatch/recheck snapshot. Never auto-heal it here.
    let effective_profile_id = profile_id.clone();

    let mut final_status = "pending".to_string();
    let mut final_restriction = "Đang chờ YouTube Studio phân tích Content ID...".to_string();
    let mut claim_type = "none".to_string();
    let mut recorded_yt_video_id: Option<String> = None;

    // Trusted Channel Fast-Track: Bỏ qua bước BKT để Tải -> Reup -> Đăng thẳng Kênh Đích cho kênh đối thủ có độ uy tín cao
    let mut is_fast_track = false;
    let mut resolved_channel_id: Option<String> = job.channel_id.clone();
    if resolved_channel_id.is_none() {
        if let Some(ref ref_id) = job.source_ref_id {
            if let Ok(conn) = database::get_db() {
                if let Ok(c_id) = conn.query_row(
                    "SELECT channel_id FROM channel_videos WHERE video_id = ?1 OR id = ?1",
                    rusqlite::params![ref_id],
                    |row| row.get::<_, String>(0),
                ) {
                    resolved_channel_id = Some(c_id);
                }
            }
        }
    }
    if job.channel_id.is_none() && resolved_channel_id.is_some() {
        job.channel_id = resolved_channel_id.clone();
    }

    if job.skip_bkt_test == Some(true) || job.test_channel_id == "fast_track_direct" {
        is_fast_track = true;
    } else if let Some(ref c_id) = resolved_channel_id {
        if let Ok(channel) = database::get_followed_channel_db(c_id.clone()) {
            if channel.is_trusted_clean.unwrap_or(false)
                || (channel.enable_fast_track.unwrap_or(false) && channel.consecutive_green_count.unwrap_or(0) >= 5)
            {
                is_fast_track = true;
            }
        }
    }

    // Chỉ job chưa có YouTube ID mới được coi là upload test hỏng và cần upload lại.
    // Có ID thì giữ checkpoint, dù lỗi xảy ra ở SD/Content ID sau upload.
    let needs_fresh_test_upload = job.youtube_video_id.is_none()
        && (job.status == "failed"
            || job.status == "cancelled"
            || job.status == "abandoned"
            || job.error_message.is_some()
            || job.restriction.as_ref().map(|r| {
                let lr = r.to_lowercase();
                lr.contains("abandoned") || lr.contains("bị bỏ dở") || lr.contains("bị hủy") || lr.contains("hủy xử lý")
            }).unwrap_or(false));

    let can_reuse_yt_id = job.youtube_video_id.is_some() && !needs_fresh_test_upload;

    let yt_video_id: Option<String> = if is_fast_track {
        log::info!("[BKT FAST-TRACK] Bỏ qua upload test Unlisted và vòng lặp Playwright Studio (Đăng thẳng Kênh Đích).");
        final_status = "green_clean".to_string();
        final_restriction = "Sạch Bản Quyền (Bỏ qua BKT - Đăng thẳng)".to_string();

        let ft_msg = "[Trực Tiếp] Bỏ qua BKT -> Đang xuất bản Kênh Đích...";
        let _ = database::update_bkt_test_job_status_db(
            &job.id,
            "green_clean",
            job.reup_path.as_deref(),
            None,
            Some(ft_msg),
            None,
        );
        job.status = "green_clean".to_string();
        job.restriction = Some(ft_msg.to_string());
        let _ = app.emit("bkt-test-job-updated", &job);

        None
    } else if can_reuse_yt_id {
        let existing_id = match job.youtube_video_id.as_ref() {
            Some(id) => id,
            None => {
                mark_job_as_failed(&app, &mut job, "Không tìm thấy YouTube Video ID để tái sử dụng".to_string());
                return;
            }
        };
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
            "poll_in_session": true,
            "max_poll_seconds": 7200,
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
                                if parsed_check.get("results").and_then(|r| r.as_object()).is_some() {
                                    let item = exact_bkt_result_for_video(parsed_check.get("results").unwrap_or(&serde_json::Value::Null), existing_id);
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
        let v_meta = std::fs::metadata(&job.video_path).ok();
        if v_meta.is_none() || v_meta.as_ref().map(|m| m.len() < 100_000).unwrap_or(true) {
            let err_msg = format!("Tệp video nguồn không tồn tại hoặc bị lỗi/rỗng (<100KB) trên máy tính: {}", job.video_path);
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
            "max_poll_seconds": 7200,
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
                    log::info!("[BKT Pipeline] Tác vụ {} bị hủy bởi người dùng. Đợi tiến trình con 3 giây để đóng sạch sẽ...", job.id);
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
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
                                    log::error!("[BKT Pipeline] Watchdog phát hiện tiến trình BKT im lặng quá 180s. Cho tiến trình con 3s đệm trước khi cưỡng chế dừng.");
                                    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
                                    let _ = child.kill().await;
                                    if pid > 0 {
                                        kill_process_tree(pid);
                                    }
                                    set_current_bkt_child_pid(0);
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
                    if let Some(vid) = verified_youtube_id(stream_vid) {
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
                                let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
                                let _ = child.kill().await;
                                if pid > 0 {
                                    kill_process_tree(pid);
                                }
                                set_current_bkt_child_pid(0);
                                crate::commands::profiles::clear_stats_cache();
                                final_status = "failed".to_string();
                                final_restriction = "Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio — đã dừng để tránh treo hàng đợi.".to_string();
                                break;
                            }
                            if !msg_changed && last_meaningful_upload_at.elapsed() >= std::time::Duration::from_secs(2400) {
                                let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
                                let _ = child.kill().await;
                                if pid > 0 {
                                    kill_process_tree(pid);
                                }
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

                        if parsed.get("results").and_then(|r| r.as_object()).is_some() {
                            let item = recorded_yt_video_id.as_deref().and_then(|vid| {
                                exact_bkt_result_for_video(parsed.get("results").unwrap_or(&serde_json::Value::Null), vid)
                            });

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
                if pid > 0 {
                    kill_process_tree(pid);
                }
                None
            }
        };
        set_current_bkt_child_pid(0);
        crate::commands::profiles::clear_stats_cache();

        // Nếu tiến trình kết thúc sớm mà chưa nhận JSON kết quả cuối (crash/đứt kết nối),
        // chuyển sang failed rõ ràng thay vì để kẹt ở uploading/checking/pending.
        let clean_exit_with_results = exit_status_opt.map(|s| s.success()).unwrap_or(false) && saw_final_result_json;
        let is_terminal = matches!(final_status.as_str(), "green_clean" | "red_matched" | "failed" | "published" | "publish_failed");
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

        // Circuit Breaker: Reset consecutive green count & disable fast track on copyright hit
        if let Some(ref c_id) = job.channel_id {
            let _ = database::record_channel_bkt_verdict_db(c_id, false);
        } else if let Some(ref ref_id) = job.source_ref_id {
            let found_cid = database::get_db().ok().and_then(|conn| {
                conn.query_row(
                    "SELECT channel_id FROM channel_videos WHERE video_id = ?1 OR id = ?1",
                    rusqlite::params![ref_id],
                    |row| row.get::<_, String>(0),
                ).ok()
            });
            if let Some(c_id) = found_cid {
                let _ = database::record_channel_bkt_verdict_db(&c_id, false);
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
        let reup_to_clean = if claim_type == "visual" {
            None
        } else {
            job.reup_path.as_deref()
        };
        let _ = cleanup_video_and_reup_files(
            &job.video_path,
            reup_to_clean,
            job.thumbnail_path.as_deref(),
        );
    } else if final_status == "green_clean" {
        if is_bkt_job_cancelled(&job.id) {
            return;
        }

        // Success: Increment consecutive green count for trusted fast-track
        if let Some(ref c_id) = job.channel_id {
            let _ = database::record_channel_bkt_verdict_db(c_id, true);
        } else if let Some(ref ref_id) = job.source_ref_id {
            let found_cid = database::get_db().ok().and_then(|conn| {
                conn.query_row(
                    "SELECT channel_id FROM channel_videos WHERE video_id = ?1 OR id = ?1",
                    rusqlite::params![ref_id],
                    |row| row.get::<_, String>(0),
                ).ok()
            });
            if let Some(c_id) = found_cid {
                let _ = database::record_channel_bkt_verdict_db(&c_id, true);
            }
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
        let alt_completed_video = parent_dir.join("[DA_EDIT]").join(format!("{video_stem}_reup_ready.mp4"));

        let (target_completed_str, already_rendered_on_disk) = if target_completed_video.is_file()
            && target_completed_video.metadata().map(|m| m.len() > 100_000).unwrap_or(false)
        {
            (target_completed_video.to_string_lossy().to_string(), true)
        } else if alt_completed_video.is_file()
            && alt_completed_video.metadata().map(|m| m.len() > 100_000).unwrap_or(false)
        {
            (alt_completed_video.to_string_lossy().to_string(), true)
        } else {
            (target_completed_video.to_string_lossy().to_string(), false)
        };

        let final_publish_path = if let Some(existing_path) = job.reup_path.clone().filter(|path| {
            let artifact = Path::new(path);
            artifact.is_file() && artifact.metadata().map(|m| m.len() > 100_000).unwrap_or(false)
        }) {
            log::info!("[BKT RESUME] Giữ artifact reup đã có từ job: {existing_path}");
            set_current_bkt_reup_path(Some(existing_path.clone()));
            let ready_msg = format!("Đã có sẵn video edit hoàn tất: [DA_EDIT]_{video_stem}. Chuẩn bị đăng lên Kênh Đích...");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "reuping",
                Some(&existing_path),
                recorded_yt_video_id.as_deref(),
                Some(&ready_msg),
                None,
            );
            job.status = "reuping".to_string();
            job.restriction = Some(ready_msg);
            let _ = app.emit("bkt-test-job-updated", &job);
            existing_path
        } else if already_rendered_on_disk {
            log::info!("[BKT FAST-ARTIFACT] Phát hiện video đã edit hoàn tất trên đĩa: {target_completed_str}. Bỏ qua render lại 100%!");
            job.reup_path = Some(target_completed_str.clone());
            set_current_bkt_reup_path(Some(target_completed_str.clone()));
            let ready_msg = format!("Đã có sẵn video trong [DA_EDIT]_{video_stem}! Bỏ qua render, chuẩn bị đăng lên Kênh Đích...");
            let _ = database::update_bkt_test_job_status_db(
                &job.id,
                "reuping",
                Some(&target_completed_str),
                recorded_yt_video_id.as_deref(),
                Some(&ready_msg),
                None,
            );
            job.status = "reuping".to_string();
            job.restriction = Some(ready_msg);
            let _ = app.emit("bkt-test-job-updated", &job);
            target_completed_str
        } else {
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

            match crate::services::run_reup_pipeline_adaptive(&app, &job.video_path, Some(&target_completed_str), None).await {
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
                            let fail_msg = format!(
                                "Reup thích ứng và Reup Lv.1 đều thất bại; không tạo artifact đăng: {e}; {e1}"
                            );
                            log::error!("{fail_msg}");
                            mark_job_as_failed(&app, &mut job, fail_msg);
                            return;
                        }
                    }
                }
            }
        };

        // Sao chép companion thumbnail vào thư mục [DA_EDIT]_{video_stem} nếu có, hoặc nhận diện thumbnail đã có sẵn
        if job.thumbnail_path.is_none() {
            let candidate_thumb = reup_folder.join(format!("{video_stem}_thumbnail.jpg"));
            if candidate_thumb.is_file() {
                job.thumbnail_path = Some(candidate_thumb.to_string_lossy().to_string());
                log::info!("[REUP FOLDER] Nhận diện thumbnail đã có sẵn trong thư mục [DA_EDIT]: {}", candidate_thumb.display());
            }
        } else if let Some(ref thumb_src_str) = job.thumbnail_path {
            let thumb_src = Path::new(thumb_src_str);
            if thumb_src.exists() && thumb_src.is_file() {
                let thumb_ext = thumb_src.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
                let dest_thumb = reup_folder.join(format!("{video_stem}_thumbnail.{thumb_ext}"));
                if dest_thumb != thumb_src {
                    if std::fs::copy(thumb_src, &dest_thumb).is_ok() {
                        job.thumbnail_path = Some(dest_thumb.to_string_lossy().to_string());
                        log::info!("[REUP FOLDER] Đã sao chép thumbnail hoàn chỉnh vào: {}", dest_thumb.display());
                    }
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

        // Auto Reup tuần tự: test sạch -> publish Kênh Đích -> mới nhả FIFO job kế tiếp.
        // Recheck luôn tắt auto_publish_main; publish thủ công vẫn đi qua command explicit này.
        let will_auto_publish = should_auto_publish_after_bkt_test(&job);
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

        if will_auto_publish {
            log::info!("[BKT AUTO-PUBLISH] Job {} sạch bản quyền + reup xong; bắt đầu đăng Kênh Đích trước job kế tiếp.", job.id);
            if let Err(err) = publish_bkt_job_to_main_cmd(app.clone(), job.id.clone()).await {
                log::error!("[BKT AUTO-PUBLISH] Job {} chưa đăng được; giữ FIFO barrier ở publish_failed: {err}", job.id);
                if let Ok(Some(mut failed_job)) = database::get_bkt_test_job_by_id_db(&job.id) {
                    if failed_job.status == "green_clean" {
                        let fail_msg = format!("Auto Reup chưa đăng được lên Kênh Đích: {err}");
                        let _ = database::update_bkt_test_job_status_db(
                            &job.id,
                            "publish_failed",
                            job.reup_path.as_deref(),
                            yt_video_id.as_deref(),
                            Some(&fail_msg),
                            Some(&fail_msg),
                        );
                        failed_job.status = "publish_failed".to_string();
                        failed_job.restriction = Some(fail_msg.clone());
                        failed_job.error_message = Some(fail_msg);
                        let _ = app.emit("bkt-test-job-updated", &failed_job);
                    }
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


#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;
    use crate::types::MultiBrowserProfile;

    fn mock_profile(id: &str, name: &str) -> MultiBrowserProfile {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "profile_name": name,
        }))
        .unwrap()
    }

    #[test]
    fn youtube_stream_id_requires_exact_verified_format() {
        assert!(is_verified_youtube_id("ABCDEFGHIJK"));
        assert!(is_verified_youtube_id("a_b-c123456"));
        assert!(!is_verified_youtube_id("short"));
        assert!(!is_verified_youtube_id("ABCDEFGHIJK!"));
        assert_eq!(verified_youtube_id(Some("ABCDEFGHIJK")), Some("ABCDEFGHIJK"));
        assert_eq!(verified_youtube_id(Some("short")), None);
    }

    #[test]
    fn auto_publish_barrier_requires_publish_success_before_next_job() {
        let mut job = BktTestJob {
            id: "job-barrier".to_string(),
            test_channel_id: "channel".to_string(),
            test_channel_name: None,
            video_source_type: "channel_video".to_string(),
            source_ref_id: Some("source-1".to_string()),
            video_title: "title".to_string(),
            video_path: "video.mp4".to_string(),
            reup_path: Some("reup.mp4".to_string()),
            youtube_video_id: Some("ABCDEFGHIJK".to_string()),
            status: "green_clean".to_string(),
            restriction: None,
            error_message: None,
            tested_date: "2026-11-13".to_string(),
            created_at: "2026-11-13".to_string(),
            updated_at: "2026-11-13".to_string(),
            main_target_profile_id: Some("target".to_string()),
            target_profile_id: Some("target".to_string()),
            test_profile_id: Some("test-profile".to_string()),
            channel_id: Some("channel-1".to_string()),
            auto_publish_main: Some(true),
            target_title: None,
            target_description: None,
            target_tags: None,
            thumbnail_path: None,
            skip_bkt_test: None,
        };

        assert!(should_auto_publish_after_bkt_test(&job));
        assert!(!is_auto_publish_barrier_resolved(&job));
        job.status = "publish_failed".to_string();
        assert!(!is_auto_publish_barrier_resolved(&job));
        job.status = "published".to_string();
        assert!(is_auto_publish_barrier_resolved(&job));
    }

    #[test]
    fn green_clean_is_terminal_until_explicit_publish_starts() {
        let mut job = BktTestJob {
            id: "job-wait".to_string(),
            test_channel_id: "channel".to_string(),
            test_channel_name: None,
            video_source_type: "local_file".to_string(),
            source_ref_id: None,
            video_title: "title".to_string(),
            video_path: "video.mp4".to_string(),
            reup_path: None,
            youtube_video_id: None,
            status: "green_clean".to_string(),
            restriction: None,
            error_message: None,
            tested_date: "2026-11-13".to_string(),
            created_at: "2026-11-13".to_string(),
            updated_at: "2026-11-13".to_string(),
            main_target_profile_id: Some("target".to_string()),
            target_profile_id: Some("target".to_string()),
            test_profile_id: Some("test-profile".to_string()),
            channel_id: None,
            auto_publish_main: Some(false),
            target_title: None,
            target_description: None,
            target_tags: None,
            thumbnail_path: None,
            skip_bkt_test: None,
        };

        assert!(!should_wait_for_auto_publish(&job));
        assert!(is_bkt_job_terminal_for_wait(&job));

        job.status = "published".to_string();
        assert!(!should_wait_for_auto_publish(&job));
        assert!(is_bkt_job_terminal_for_wait(&job));

        job.status = "publish_failed".to_string();
        assert!(!should_wait_for_auto_publish(&job));
        assert!(is_bkt_job_terminal_for_wait(&job));
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
    fn terminal_bkt_jobs_cannot_be_cancelled() {
        for status in ["green_clean", "red_matched", "published", "publish_failed"] {
            assert!(!can_cancel_bkt_status(status), "terminal status {status} must reject cancel");
        }
        for status in ["queued", "reuping", "uploading", "checking", "pending"] {
            assert!(can_cancel_bkt_status(status), "active status {status} must allow cancel");
        }
    }

    #[test]
    fn quota_refund_requires_winning_the_atomic_cancel() {
        assert!(should_refund_cancelled_quota(true, None));
        assert!(!should_refund_cancelled_quota(false, None));
        assert!(!should_refund_cancelled_quota(true, Some("ABCDEFGHIJK")));
    }

    #[tokio::test]
    async fn publish_artifact_gate_rejects_missing_file() {
        let missing_path = std::env::temp_dir().join(format!(
            "reupytb-bkt-missing-artifact-{}-{}.mp4",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ));
        let _ = std::fs::remove_file(&missing_path);
        let error = verify_video_ready_for_upload(&missing_path)
            .await
            .expect_err("missing publish artifact must be rejected");
        assert!(error.contains("không tồn tại"));
    }

    #[test]
    fn manual_publish_requires_clean_or_failed_publish_status() {
        assert!(can_publish_bkt_status("green_clean"));
        assert!(can_publish_bkt_status("publish_failed"));
        for status in ["queued", "pending", "failed", "published"] {
            assert!(!can_publish_bkt_status(status), "status {status} must not publish");
        }
    }

    #[test]
    fn catchup_skips_races_but_stops_real_publish_errors() {
        assert!(should_skip_catchup_publish_error("publishing", false));
        assert!(should_skip_catchup_publish_error("green_clean", true));
        assert!(should_skip_catchup_publish_error("published", false));
        assert!(!should_skip_catchup_publish_error("green_clean", false));
        assert!(!should_skip_catchup_publish_error("publish_failed", false));
    }


    #[test]
    fn result_matching_requires_recorded_youtube_id() {
        let results = serde_json::json!({
            "other-video": {"bkt_check_status": "red_matched"},
            "recorded-video": {"bkt_check_status": "green_clean"}
        });
        assert_eq!(
            exact_bkt_result_for_video(results.get("results").unwrap_or(&results), "recorded-video")
                .and_then(|v| v.get("bkt_check_status"))
                .and_then(|v| v.as_str()),
            Some("green_clean")
        );
        assert!(exact_bkt_result_for_video(&results, "missing-video").is_none());
    }

    #[test]
    fn publish_failure_has_distinct_terminal_status() {
        assert_eq!(publish_failure_status(), "publish_failed");
    }

    #[test]
    fn publish_failure_does_not_leave_channel_video_green_clean() {
        assert_eq!(channel_video_bkt_status_after_publish(false), "publish_failed");
        assert_eq!(channel_video_bkt_status_after_publish(true), "green_clean");
        assert_eq!(channel_video_risk_status_after_publish(false), "yellow");
        assert_eq!(channel_video_risk_status_after_publish(true), "green");
    }

    #[test]
    fn publish_failed_jobs_are_publish_continuations_not_rechecks() {
        assert!(can_recheck_bkt_status("failed"));
        assert!(!can_recheck_bkt_status("publish_failed"));
        assert!(!can_recheck_bkt_status("green_clean"));
        assert!(can_publish_bkt_status("publish_failed"));
    }

    #[test]
    fn auto_heal_rejects_ambiguous_profile_name_matches() {
        let profiles = vec![
            mock_profile("profile-a", "duplicate"),
            mock_profile("profile-b", "duplicate"),
        ];
        let result = resolve_profile_id_with_auto_heal("stale-id", "duplicate", &profiles);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("nhiều hồ sơ"));
    }

    #[test]
    fn worker_uses_persisted_profile_snapshot_without_runtime_auto_heal() {
        let source = include_str!("pipeline.rs");
        let worker = source
            .split_once("pub async fn run_single_bkt_job_pipeline")
            .or_else(|| source.split_once("async fn run_single_bkt_job_pipeline"))
            .and_then(|(_, rest)| rest.split_once("#[cfg(test)]"))
            .map(|(body, _)| body)
            .expect("worker source must be present");
        assert!(!worker.contains("resolve_profile_id_with_auto_heal"));
    }

    #[test]
    fn reup_pipeline_failure_never_copies_source_into_publish_artifact() {
        let source = include_str!("pipeline.rs")
            .rsplit_once("#[cfg(test)]")
            .map(|(production, _)| production)
            .expect("production source must be present");
        let source_copy = ["std::fs::copy(&job.video_path, &", "target_completed_video)"]
            .concat();
        assert!(!source.contains(&source_copy));
        assert!(source.contains("không tạo artifact đăng"));
    }

    #[test]
    fn pre_rendered_disk_artifact_bypasses_ffmpeg_render() {
        let source = include_str!("pipeline.rs")
            .rsplit_once("#[cfg(test)]")
            .map(|(production, _)| production)
            .expect("production source must be present");
        assert!(source.contains("already_rendered_on_disk"));
        assert!(source.contains("Bỏ qua render lại 100%!"));
    }

    #[test]
    fn test_startup_reconcile_sweep_in_memory() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE bkt_test_channels (
                id TEXT PRIMARY KEY,
                daily_quota INTEGER NOT NULL,
                daily_used INTEGER NOT NULL,
                last_reset_date TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bkt_test_channels (id, daily_quota, daily_used, last_reset_date, updated_at)
             VALUES ('ch-1', 10, 5, '2026-11-13', '2026-11-13T10:00:00')",
            [],
        )
        .unwrap();

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
                risk_status TEXT,
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
            assert_eq!(restr.as_deref(), Some("Tác vụ BKT bị gián đoạn khi ứng dụng khởi động lại"));
            assert_eq!(err.as_deref(), Some("Tác vụ BKT bị gián đoạn khi ứng dụng khởi động lại"));

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
