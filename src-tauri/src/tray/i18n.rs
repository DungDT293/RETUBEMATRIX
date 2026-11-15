//! RETubeMatrix - Tray Localization Subsystem.
//!
//! Provides localized strings for system tray menu items across supported languages:
//! English (default), Vietnamese, Simplified Chinese, French, Japanese, and Spanish.

use std::sync::Mutex;

/// Current UI language for tray menu translations (default: "en")
static TRAY_LANG: Mutex<String> = Mutex::new(String::new());

/// Get the stored tray language code
pub fn get_tray_lang() -> String {
    TRAY_LANG.lock().map(|l| l.clone()).unwrap_or_default()
}

/// Set the stored tray language code
pub fn set_tray_lang(lang: String) {
    if let Ok(mut stored) = TRAY_LANG.lock() {
        *stored = lang;
    }
}

/// Translate a tray menu key based on the current language
pub fn tray_text(key: &str) -> &'static str {
    let lang = get_tray_lang();
    let lang = if lang.is_empty() || lang.starts_with("en") {
        "en"
    } else if lang.starts_with("vi") {
        "vi"
    } else if lang.starts_with("zh") {
        "zh-CN"
    } else if lang.starts_with("fr") {
        "fr"
    } else if lang.starts_with("ja") {
        "ja"
    } else if lang.starts_with("es") {
        "es"
    } else {
        "en"
    };

    match (lang, key) {
        // Vietnamese
        ("vi", "followed_channels") => "Kênh đang theo dõi",
        ("vi", "no_channels") => "Chưa theo dõi kênh nào",
        ("vi", "new_suffix") => "mới",
        ("vi", "download_queue") => "Hàng đợi tải xuống",
        ("vi", "downloading") => "Đang tải",
        ("vi", "pending") => "Chờ tải",
        ("vi", "completed") => "Hoàn tất",
        ("vi", "errors") => "Lỗi",
        ("vi", "idle") => "Rảnh",
        ("vi", "remote_download") => "Tải từ xa",
        ("vi", "running") => "Đang chạy",
        ("vi", "disabled") => "Đã tắt",
        ("vi", "check_all") => "Kiểm tra kênh theo dõi ngay",
        ("vi", "settings") => "Cài đặt",
        ("vi", "check_update") => "Kiểm tra cập nhật...",
        ("vi", "open") => "Mở RETubeMatrix",
        ("vi", "browser_extension") => "Browser Extension",
        ("vi", "quit") => "Thoát",
        // Chinese
        ("zh-CN", "followed_channels") => "已关注的频道",
        ("zh-CN", "no_channels") => "尚未关注任何频道",
        ("zh-CN", "new_suffix") => "个新视频",
        ("zh-CN", "download_queue") => "下载队列",
        ("zh-CN", "downloading") => "下载中",
        ("zh-CN", "pending") => "等待中",
        ("zh-CN", "completed") => "已完成",
        ("zh-CN", "errors") => "错误",
        ("zh-CN", "idle") => "空闲",
        ("zh-CN", "remote_download") => "远程下载",
        ("zh-CN", "running") => "运行中",
        ("zh-CN", "disabled") => "已禁用",
        ("zh-CN", "check_all") => "立即检查已关注频道",
        ("zh-CN", "settings") => "设置",
        ("zh-CN", "check_update") => "检查更新...",
        ("zh-CN", "open") => "打开 RETubeMatrix",
        ("zh-CN", "browser_extension") => "浏览器扩展",
        ("zh-CN", "quit") => "退出",
        // French
        ("fr", "followed_channels") => "Chaines suivies",
        ("fr", "no_channels") => "Aucune chaine suivie",
        ("fr", "new_suffix") => "nouvelles",
        ("fr", "download_queue") => "File de telechargement",
        ("fr", "downloading") => "Telechargement",
        ("fr", "pending") => "En attente",
        ("fr", "completed") => "Termines",
        ("fr", "errors") => "Erreurs",
        ("fr", "idle") => "Inactif",
        ("fr", "remote_download") => "Telechargement distant",
        ("fr", "running") => "En cours",
        ("fr", "disabled") => "Desactive",
        ("fr", "check_all") => "Verifier les chaines suivies maintenant",
        ("fr", "settings") => "Parametres",
        ("fr", "check_update") => "Verifier les mises a jour...",
        ("fr", "open") => "Ouvrir RETubeMatrix",
        ("fr", "browser_extension") => "Extension navigateur",
        ("fr", "quit") => "Quitter",
        // Japanese
        ("ja", "followed_channels") => "フォロー中のチャンネル",
        ("ja", "no_channels") => "フォロー中のチャンネルはありません",
        ("ja", "new_suffix") => "件の新着",
        ("ja", "download_queue") => "ダウンロードキュー",
        ("ja", "downloading") => "ダウンロード中",
        ("ja", "pending") => "待機中",
        ("ja", "completed") => "完了",
        ("ja", "errors") => "エラー",
        ("ja", "idle") => "待機中",
        ("ja", "remote_download") => "リモートダウンロード",
        ("ja", "running") => "実行中",
        ("ja", "disabled") => "無効",
        ("ja", "check_all") => "フォロー中チャンネルを今すぐチェック",
        ("ja", "settings") => "設定",
        ("ja", "check_update") => "更新をチェック...",
        ("ja", "open") => "RETubeMatrix を開く",
        ("ja", "browser_extension") => "ブラウザ拡張機能",
        ("ja", "quit") => "終了",
        // Spanish
        ("es", "followed_channels") => "Canales seguidos",
        ("es", "no_channels") => "No sigues ningún canal",
        ("es", "new_suffix") => "nuevos",
        ("es", "download_queue") => "Cola de descargas",
        ("es", "downloading") => "Descargando",
        ("es", "pending") => "Pendiente",
        ("es", "completed") => "Completado",
        ("es", "errors") => "Errores",
        ("es", "idle") => "Inactivo",
        ("es", "remote_download") => "Descarga remota",
        ("es", "running") => "Ejecutándose",
        ("es", "disabled") => "Deshabilitado",
        ("es", "check_all") => "Comprobar canales seguidos ahora",
        ("es", "settings") => "Ajustes",
        ("es", "check_update") => "Buscar actualizaciones...",
        ("es", "open") => "Abrir RETubeMatrix",
        ("es", "browser_extension") => "Extensión de navegador",
        ("es", "quit") => "Salir",
        // English (default)
        (_, "followed_channels") => "Followed Channels",
        (_, "no_channels") => "No channels followed",
        (_, "new_suffix") => "new",
        (_, "download_queue") => "Download Queue",
        (_, "downloading") => "Downloading",
        (_, "pending") => "Pending",
        (_, "completed") => "Completed",
        (_, "errors") => "Errors",
        (_, "idle") => "Idle",
        (_, "remote_download") => "Remote Download",
        (_, "running") => "Running",
        (_, "disabled") => "Disabled",
        (_, "check_all") => "Check Followed Channels Now",
        (_, "settings") => "Settings",
        (_, "check_update") => "Check for Updates...",
        (_, "open") => "Open RETubeMatrix",
        (_, "browser_extension") => "Browser Extension",
        (_, "quit") => "Quit",
        _ => "???",
    }
}
