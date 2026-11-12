//! Video Preflight Scan Service
//!
//! Phân tích sơ bộ video bằng FFmpeg sampling để phát hiện:
//! 1. Static Logo (Watermark/Logo tĩnh ở 4 góc màn hình dựa trên Temporal Standard Deviation)
//! 2. Subtitle (Phụ đề gắn chết dải đáy 15-20% dựa trên Horizontal Edge Projection Density)
//!
//! Tối ưu hiệu năng: trích xuất nhanh 10 frame grayscale qua pipe stdout, xử lý pixel đa luồng.

use crate::services::{configure_ffmpeg_background_cmd, get_ffmpeg_path};
use std::process::Stdio;
use tauri::AppHandle;
use tokio::process::Command;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PreflightReport {
    pub has_logo: bool,
    pub logo_corner: Option<String>,
    #[serde(default)]
    pub logo_position: Option<String>,
    pub has_subtitles: bool,
    pub subtitle_roi_ratio: Option<f32>,
    pub recommended_pipeline: String,
    pub scan_time_ms: u64,
    #[serde(default)]
    pub scan_duration_ms: u64,
}

const WIDTH: usize = 320;
const HEIGHT: usize = 180;
const FRAME_SIZE: usize = WIDTH * HEIGHT; // 57600 bytes

/// Quét sơ bộ video trước khi Reup để phát hiện Logo và Subtitle
pub async fn scan_video_preflight(app: &AppHandle, video_path: &str) -> Result<PreflightReport, String> {
    let start_time = std::time::Instant::now();

    let path = std::path::Path::new(video_path);
    if !path.exists() {
        return Err(format!("File video khong ton tai: {}", video_path));
    }

    let ffmpeg_path = get_ffmpeg_path(app)
        .await
        .ok_or_else(|| "Khong tim thay FFmpeg binary".to_string())?;

    // Trích xuất tối đa 10 frame (lấy mẫu từ 100 frame đầu) ở dạng rawvideo grayscale
    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-nostats",
        "-loglevel", "error",
        "-i", video_path,
        "-vf", "select='not(mod(n,10))',scale=320:180,format=gray",
        "-vframes", "10",
        "-f", "rawvideo",
        "-pix_fmt", "gray",
        "-",
    ]);
    configure_ffmpeg_background_cmd(&mut cmd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("FFmpeg preflight extraction that bai: {}", e))?;

    let raw_data = output.stdout;
    let num_frames = raw_data.len() / FRAME_SIZE;

    if num_frames < 2 {
        let scan_time_ms = start_time.elapsed().as_millis() as u64;
        return Ok(PreflightReport {
            has_logo: false,
            logo_corner: None,
            logo_position: None,
            has_subtitles: false,
            subtitle_roi_ratio: None,
            recommended_pipeline: "clean_stream".to_string(),
            scan_time_ms,
            scan_duration_ms: scan_time_ms,
        });
    }

    // Xử lý phân tích pixel trên background blocking thread để không khóa Tokio executor
    let (has_logo, logo_corner, has_subtitles, subtitle_roi_ratio) =
        tokio::task::spawn_blocking(move || analyze_frames(&raw_data, num_frames))
            .await
            .map_err(|e| format!("Loi khi phan tich frame tren background thread: {}", e))?;

    let recommended_pipeline = match (has_logo, has_subtitles) {
        (true, true) => "adaptive_logo_subtitle".to_string(),
        (true, false) => "adaptive_logo".to_string(),
        (false, true) => "adaptive_subtitle".to_string(),
        (false, false) => "clean_stream".to_string(),
    };

    let scan_time_ms = start_time.elapsed().as_millis() as u64;

    log::info!(
        "[PREFLIGHT] Scan hoan tat trong {}ms: logo={:?} ({:?}), sub={:?} (ratio={:?}), pipeline={}",
        scan_time_ms,
        has_logo,
        logo_corner,
        has_subtitles,
        subtitle_roi_ratio,
        recommended_pipeline
    );

    Ok(PreflightReport {
        has_logo,
        logo_corner: logo_corner.clone(),
        logo_position: logo_corner,
        has_subtitles,
        subtitle_roi_ratio,
        recommended_pipeline,
        scan_time_ms,
        scan_duration_ms: scan_time_ms,
    })
}

/// Chạy quét sơ bộ video (Pre-flight scan) thích ứng trước khi Reup
pub async fn run_preflight_scan(app: &AppHandle, video_path: &str) -> Result<PreflightReport, String> {
    scan_video_preflight(app, video_path).await
}

/// Phân tích ma trận frame raw grayscale để phát hiện static logo và subtitle
fn analyze_frames(
    raw_data: &[u8],
    num_frames: usize,
) -> (bool, Option<String>, bool, Option<f32>) {
    let k = num_frames as f32;

    // --- PHẦN 1: Phát hiện Logo tĩnh trên 4 góc ROI (25% W x 20% H) ---
    // ROI: W = 320 * 0.25 = 80px, H = 180 * 0.20 = 36px
    let corner_w = 80usize;
    let corner_h = 36usize;
    let corner_pixels = (corner_w * corner_h) as f32;

    let corners = [
        ("top_left", 0usize, 0usize),
        ("top_right", WIDTH - corner_w, 0usize),
        ("bottom_left", 0usize, HEIGHT - corner_h),
        ("bottom_right", WIDTH - corner_w, HEIGHT - corner_h),
    ];

    let mut best_corner: Option<String> = None;
    let mut highest_logo_score = 0.0f32;

    for (corner_name, start_x, start_y) in corners {
        let mut static_pixel_count = 0usize;
        let mut sum_temporal_std = 0.0f32;
        let mut sum_mean = 0.0f32;
        let mut sum_mean_sq = 0.0f32;

        for dy in 0..corner_h {
            let y = start_y + dy;
            for dx in 0..corner_w {
                let x = start_x + dx;

                // Thu thập giá trị điểm ảnh qua các frame
                let mut sum_val = 0.0f32;
                let mut vals = [0.0f32; 10];
                for f in 0..num_frames {
                    let idx = f * FRAME_SIZE + y * WIDTH + x;
                    let val = raw_data[idx] as f32;
                    vals[f] = val;
                    sum_val += val;
                }

                let mean = sum_val / k;
                let mut var_acc = 0.0f32;
                for f in 0..num_frames {
                    let diff = vals[f] - mean;
                    var_acc += diff * diff;
                }
                let temp_std = (var_acc / k).sqrt();

                if temp_std < 8.0 {
                    static_pixel_count += 1;
                }
                sum_temporal_std += temp_std;
                sum_mean += mean;
                sum_mean_sq += mean * mean;
            }
        }

        let mean_temporal_std = sum_temporal_std / corner_pixels;
        let static_ratio = static_pixel_count as f32 / corner_pixels;
        let spatial_mean = sum_mean / corner_pixels;
        let spatial_var = (sum_mean_sq / corner_pixels) - (spatial_mean * spatial_mean);
        let spatial_std = spatial_var.max(0.0).sqrt();

        // Logo tĩnh:
        // - Không phải dải viền đen hoàn toàn (spatial_mean >= 15, spatial_std >= 10)
        // - Tỉ lệ điểm ảnh tĩnh vượt trội (static_ratio >= 0.35)
        if spatial_mean >= 15.0 && spatial_std >= 10.0 && static_ratio >= 0.35 {
            let score = (static_ratio * (1.0 + spatial_std / 50.0)) / (1.0 + mean_temporal_std / 5.0);
            if score > highest_logo_score {
                highest_logo_score = score;
                best_corner = Some(corner_name.to_string());
            }
        }
    }

    let has_logo = best_corner.is_some();

    // --- PHẦN 2: Phát hiện Subtitle dải đáy 15-20% bằng Horizontal Edge Projection ---
    // Dải đáy 20%: từ y = 144 đến 179 (36 dòng). Bỏ biên x: 10..310 (300 cột)
    let sub_start_y = 144usize;
    let sub_end_y = 179usize; // Dòng 179 là dòng cuối cùng của 180 dòng
    let sub_start_x = 10usize;
    let sub_end_x = 310usize;
    let test_cols = (sub_end_x - sub_start_x) as f32;

    let mut subtitle_detected_frames = 0usize;
    let mut min_sub_y = HEIGHT;
    let mut total_density_sum = 0.0f32;

    for f in 0..num_frames {
        let frame_offset = f * FRAME_SIZE;
        let mut frame_edge_pixels = 0usize;
        let mut max_row_edges = 0usize;
        let mut frame_first_text_y: Option<usize> = None;

        for y in sub_start_y..=sub_end_y {
            // Tránh tràn biên trên dưới cho gradient dọc
            if y == 0 || y >= HEIGHT - 1 {
                continue;
            }

            let mut row_edges = 0usize;
            for x in sub_start_x..sub_end_x {
                let top_idx = frame_offset + (y - 1) * WIDTH + x;
                let bot_idx = frame_offset + (y + 1) * WIDTH + x;
                let top_val = raw_data[top_idx] as i32;
                let bot_val = raw_data[bot_idx] as i32;
                let grad_y = (bot_val - top_val).abs();

                // Ngưỡng cạnh ngang tương phản cao đặc trưng của ký tự chữ
                if grad_y >= 35 {
                    row_edges += 1;
                }
            }

            if row_edges > max_row_edges {
                max_row_edges = row_edges;
            }

            // Nếu dòng có mật độ cạnh ngang vượt trội (>= 25 pixel / 300 cột ~ 8%)
            if row_edges >= 25 {
                if frame_first_text_y.is_none() {
                    frame_first_text_y = Some(y);
                }
            }

            frame_edge_pixels += row_edges;
        }

        let total_roi_pixels = (sub_end_y - sub_start_y) as f32 * test_cols;
        let density = frame_edge_pixels as f32 / total_roi_pixels;
        total_density_sum += density;

        // Một frame được tính là chứa subtitle nếu có dải cạnh ngang dày đặc
        if density >= 0.045 && max_row_edges >= 25 {
            subtitle_detected_frames += 1;
            if let Some(y_top) = frame_first_text_y {
                if y_top < min_sub_y {
                    min_sub_y = y_top;
                }
            }
        }
    }

    let avg_density = total_density_sum / k;
    let has_subtitles = subtitle_detected_frames >= 2
        || (num_frames <= 3 && subtitle_detected_frames >= 1)
        || (avg_density >= 0.04 && min_sub_y < HEIGHT);

    let subtitle_roi_ratio = if has_subtitles {
        if min_sub_y < HEIGHT {
            let ratio = ((HEIGHT - min_sub_y) as f32 / HEIGHT as f32).clamp(0.12, 0.25);
            Some(ratio)
        } else {
            Some(0.18f32)
        }
    } else {
        None
    };

    (has_logo, best_corner, has_subtitles, subtitle_roi_ratio)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flat_frames_no_logo_no_sub() {
        let raw = vec![128u8; FRAME_SIZE * 5];
        let (has_logo, corner, has_sub, sub_ratio) = analyze_frames(&raw, 5);
        assert!(!has_logo);
        assert!(corner.is_none());
        assert!(!has_sub);
        assert!(sub_ratio.is_none());
    }

    #[test]
    fn test_detect_static_logo_top_right() {
        let num_frames = 6;
        let mut raw = vec![0u8; FRAME_SIZE * num_frames];

        // Background di chuyển / thay đổi giữa các frame
        for f in 0..num_frames {
            for y in 0..HEIGHT {
                for x in 0..WIDTH {
                    let idx = f * FRAME_SIZE + y * WIDTH + x;
                    raw[idx] = ((f * 35 + x * 2 + y * 3) % 256) as u8;
                }
            }
        }

        // Tạo logo tĩnh ở góc top_right (x: 250..310, y: 5..30) không đổi qua các frame
        for f in 0..num_frames {
            for y in 5..30 {
                for x in 250..310 {
                    let idx = f * FRAME_SIZE + y * WIDTH + x;
                    raw[idx] = if (x + y) % 2 == 0 { 220 } else { 30 };
                }
            }
        }

        let (has_logo, corner, _, _) = analyze_frames(&raw, num_frames);
        assert!(has_logo);
        assert_eq!(corner.as_deref(), Some("top_right"));
    }

    #[test]
    fn test_detect_subtitles() {
        let num_frames = 5;
        let mut raw = vec![100u8; FRAME_SIZE * num_frames];

        // Tạo dải phụ đề tương phản cao ở đáy y: 155..165 trong 3 frame
        for f in 0..3 {
            for y in 155..165 {
                for x in 20..280 {
                    let idx = f * FRAME_SIZE + y * WIDTH + x;
                    // Kẻ sọc ngang tạo gradient dọc cực mạnh
                    raw[idx] = if y % 2 == 0 { 240 } else { 10 };
                }
            }
        }

        let (_, _, has_sub, sub_ratio) = analyze_frames(&raw, num_frames);
        assert!(has_sub);
        assert!(sub_ratio.is_some());
        let ratio = sub_ratio.unwrap();
        assert!(ratio >= 0.12 && ratio <= 0.25);
    }

    #[test]
    fn test_preflight_report_serde() {
        let report = PreflightReport {
            has_logo: true,
            logo_corner: Some("top_right".to_string()),
            logo_position: Some("top_right".to_string()),
            has_subtitles: true,
            subtitle_roi_ratio: Some(0.18),
            recommended_pipeline: "adaptive_logo_subtitle".to_string(),
            scan_time_ms: 120,
            scan_duration_ms: 120,
        };

        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("\"has_logo\":true"));
        assert!(json.contains("\"logo_corner\":\"top_right\""));
        assert!(json.contains("\"has_subtitles\":true"));

        let deserialized: PreflightReport = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.has_logo, report.has_logo);
        assert_eq!(deserialized.logo_corner, report.logo_corner);
        assert_eq!(deserialized.logo_position, report.logo_position);
        assert_eq!(deserialized.scan_time_ms, 120);
        assert_eq!(deserialized.scan_duration_ms, 120);
    }

    #[tokio::test]
    async fn test_real_sample_video_scan() {
        let sample_path = std::path::Path::new("../target/test_sample_real.mp4");
        if !sample_path.exists() {
            println!("test_sample_real.mp4 khong ton tai, bo qua test.");
            return;
        }

        let start = std::time::Instant::now();
        // Chạy trích xuất 10 frame bằng ffmpeg bundled
        let ffmpeg_bin = std::path::Path::new("bin/ffmpeg.exe");
        if !ffmpeg_bin.exists() {
            println!("ffmpeg.exe khong ton tai trong bin, bo qua.");
            return;
        }

        let output = tokio::process::Command::new(ffmpeg_bin)
            .args([
                "-v", "error",
                "-ss", "00:00:02",
                "-i", sample_path.to_str().unwrap(),
                "-vf", "select='not(mod(n\\,10))',scale=320:180,format=gray",
                "-vframes", "10",
                "-f", "rawvideo",
                "-pix_fmt", "gray",
                "pipe:1"
            ])
            .output()
            .await
            .expect("Chay ffmpeg trich xuat frames that bai");

        let elapsed_extract = start.elapsed().as_millis();
        let raw = output.stdout;
        let num_frames = raw.len() / FRAME_SIZE;
        println!("[REAL TEST] Trich xuat {} frames trong {}ms (bytes: {})", num_frames, elapsed_extract, raw.len());

        let t_analyze = std::time::Instant::now();
        let (has_logo, logo_corner, has_sub, sub_ratio) = analyze_frames(&raw, num_frames);
        let elapsed_analyze = t_analyze.elapsed().as_millis();

        let total_ms = start.elapsed().as_millis();
        println!(
            "[REAL TEST RESULT] Tong thoi gian: {}ms (FFmpeg: {}ms, Vision: {}ms) | Logo: {:?} ({:?}) | Subtitle: {:?} (ratio: {:?})",
            total_ms, elapsed_extract, elapsed_analyze, has_logo, logo_corner, has_sub, sub_ratio
        );
        assert!(num_frames >= 1);
    }
}
