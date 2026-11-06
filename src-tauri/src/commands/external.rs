use std::sync::Mutex;

// Pending deep links received before the frontend listener is ready.
static PENDING_EXTERNAL_LINKS: Mutex<Vec<String>> = Mutex::new(Vec::new());
const MAX_PENDING_EXTERNAL_LINKS: usize = 100;
const MAX_EXTERNAL_LINK_LENGTH: usize = 4096;

#[derive(Clone, serde::Serialize)]
pub struct ExternalOpenUrlEventPayload {
    pub urls: Vec<String>,
}

fn extract_external_link_from_arg(arg: &str) -> Option<String> {
    let trimmed = arg.trim().trim_matches('"').trim_matches('\'');
    if trimmed.starts_with("retubematrix://") || trimmed.starts_with("youwee://") {
        if is_valid_external_link(trimmed) {
            return Some(trimmed.to_string());
        }
        return None;
    }

    let start_pos = trimmed.find("retubematrix://").or_else(|| trimmed.find("youwee://"));
    start_pos.and_then(|start| {
        let candidate = trimmed[start..].trim_matches('"').to_string();
        if is_valid_external_link(&candidate) {
            Some(candidate)
        } else {
            None
        }
    })
}

fn is_valid_external_link(link: &str) -> bool {
    let trimmed = link.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_EXTERNAL_LINK_LENGTH {
        return false;
    }
    let is_valid_prefix = trimmed.starts_with("retubematrix://download")
        || trimmed.starts_with("youwee://download");
    if !is_valid_prefix {
        return false;
    }
    trimmed.contains("v=1") && trimmed.contains("url=")
}

pub fn extract_external_links_from_argv(argv: &[String]) -> Vec<String> {
    let mut links: Vec<String> = Vec::new();
    for arg in argv {
        if let Some(link) = extract_external_link_from_arg(arg) {
            if !links.iter().any(|existing| existing == &link) {
                links.push(link);
            }
        }
    }
    links
}

pub fn enqueue_external_links(urls: Vec<String>) {
    if urls.is_empty() {
        return;
    }
    if let Ok(mut pending) = PENDING_EXTERNAL_LINKS.lock() {
        for url in urls {
            if !is_valid_external_link(&url) {
                continue;
            }
            if !pending.iter().any(|existing| existing == &url) {
                pending.push(url);
                if pending.len() > MAX_PENDING_EXTERNAL_LINKS {
                    let overflow = pending.len() - MAX_PENDING_EXTERNAL_LINKS;
                    pending.drain(0..overflow);
                }
            }
        }
    }
}

pub fn take_pending_external_links() -> Vec<String> {
    if let Ok(mut pending) = PENDING_EXTERNAL_LINKS.lock() {
        return std::mem::take(&mut *pending);
    }
    Vec::new()
}

#[tauri::command]
pub fn consume_pending_external_links() -> Vec<String> {
    take_pending_external_links()
}

/// Mở link ra trình duyệt mặc định của hệ điều hành (Google Chrome, Edge, Firefox...)
/// Đảm bảo không mở tab Webview nội bộ trong ứng dụng.
#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL không được để trống".to_string());
    }

    use tauri_plugin_opener::OpenerExt;
    if app.opener().open_url(trimmed, None::<&str>).is_ok() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW = 0x08000000
        let status = std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .creation_flags(0x08000000)
            .status();

        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }

        let safe_url = trimmed.replace('^', "^^").replace('&', "^&");
        let _ = std::process::Command::new("cmd.exe")
            .args(["/c", "start", "", &safe_url])
            .creation_flags(0x08000000)
            .status();

        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(trimmed).status();
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(trimmed).status();
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_link_extraction_stays_string_based() {
        let argv = vec![
            "youwee".to_string(),
            "youwee://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo".to_string(),
        ];

        let links = extract_external_links_from_argv(&argv);

        assert_eq!(
            links,
            vec!["youwee://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo"]
        );
    }

    #[test]
    fn summary_deep_link_is_rejected() {
        let argv = vec![
            "RETubeMatrix".to_string(),
            "retubematrix://summary?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123"
                .to_string(),
        ];

        assert!(extract_external_links_from_argv(&argv).is_empty());
    }

    #[test]
    fn canonical_deep_link_scheme_is_accepted() {
        let argv = vec![
            "RETubeMatrix".to_string(),
            "retubematrix://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo".to_string(),
        ];

        let links = extract_external_links_from_argv(&argv);

        assert_eq!(
            links,
            vec!["retubematrix://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo"]
        );
    }

    #[test]
    fn pending_external_links_are_deduped_and_drained() {
        let _ = take_pending_external_links();
        let link = "youwee://download?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123"
            .to_string();

        enqueue_external_links(vec![link.clone(), link.clone()]);

        assert_eq!(take_pending_external_links(), vec![link]);
        assert!(take_pending_external_links().is_empty());
    }
}
