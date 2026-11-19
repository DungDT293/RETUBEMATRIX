use tauri::AppHandle;

use crate::database;
use crate::types::{BktTestChannel, BktTestChannelInput, BktTestJob};

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

/// Bật / tắt trạng thái kích hoạt của Kênh Test Bản Quyền
#[tauri::command]
pub async fn toggle_bkt_channel_active(channel_id: String, is_active: bool) -> Result<(), String> {
    database::toggle_bkt_channel_active_db(&channel_id, is_active)
}

/// Lấy danh sách lịch sử tác vụ test video
#[tauri::command]
pub async fn get_bkt_test_jobs(limit: Option<i64>) -> Result<Vec<BktTestJob>, String> {
    database::get_bkt_test_jobs_db(limit)
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


/// Đặt lại quota hôm nay về 0 (cho 1 kênh hoặc toàn bộ kênh test BKT)
#[tauri::command]
pub async fn reset_bkt_channel_daily_quota(channel_id: Option<String>) -> Result<(), String> {
    database::reset_bkt_channel_daily_quota_db(channel_id.as_deref())
}
