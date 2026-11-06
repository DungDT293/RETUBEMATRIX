import { invoke } from '@tauri-apps/api/core';
import { openUrl as tauriOpenUrl } from '@tauri-apps/plugin-opener';

/**
 * Mở link ra trình duyệt mặc định của hệ điều hành (Google Chrome, Edge, Firefox...)
 * Tuyệt đối không mở tab nội bộ Webview bên trong ứng dụng.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const targetUrl = (url || '').trim();
  if (!targetUrl) return;

  try {
    // 1. Ưu tiên chạy lệnh Rust chuyên dụng (gọi ShellExecute / rundll32 FileProtocolHandler trực tiếp trên OS)
    await invoke('open_external_url', { url: targetUrl });
  } catch (_err) {
    try {
      // 2. Thử qua plugin opener của Tauri
      await tauriOpenUrl(targetUrl);
    } catch {
      // 3. Dự phòng cuối cùng
      window.open(targetUrl, '_blank');
    }
  }
}
