/**
 * Utility chuẩn hóa hiển thị thời gian còn lại (ETA) cho toàn bộ ứng dụng.
 * Hỗ trợ cả số giây (từ FFmpeg, API) lẫn chuỗi định dạng (từ yt-dlp: HH:MM:SS, MM:SS).
 */

export function formatEta(eta: string | number | undefined | null): string {
  if (eta == null) return 'Đang tính toán...';

  // 1. Nếu là số giây (từ FFmpeg / IPC progress)
  if (typeof eta === 'number') {
    if (Number.isNaN(eta) || eta <= 0) return 'Sắp xong';
    if (eta < 60) {
      return `Còn ~${Math.ceil(eta)}s`;
    }
    if (eta < 3600) {
      const minutes = Math.floor(eta / 60);
      const seconds = Math.ceil(eta % 60);
      return seconds > 0 ? `Còn ~${minutes}p ${seconds}s` : `Còn ~${minutes}p`;
    }
    const hours = Math.floor(eta / 3600);
    const minutes = Math.floor((eta % 3600) / 60);
    return minutes > 0 ? `Còn ~${hours}h ${minutes}p` : `Còn ~${hours}h`;
  }

  // 2. Nếu là chuỗi
  const trimmed = eta.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed === 'unknown' || trimmed === '--:--') {
    return 'Đang tính toán...';
  }

  // Nếu chuỗi đã có tiền tố 'Còn ~'
  if (trimmed.startsWith('Còn ~') || trimmed.startsWith('Còn lại: ~')) {
    return trimmed;
  }

  // Trường hợp yt-dlp trả về dạng HH:MM:SS
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = Number(hmsMatch[1]);
    const minutes = Number(hmsMatch[2]);
    const seconds = Number(hmsMatch[3]);
    if (hours > 0) {
      return minutes > 0 ? `Còn ~${hours}h ${minutes}p` : `Còn ~${hours}h`;
    }
    if (minutes > 0) {
      return seconds > 0 ? `Còn ~${minutes}p ${seconds}s` : `Còn ~${minutes}p`;
    }
    return `Còn ~${seconds}s`;
  }

  // Trường hợp yt-dlp trả về dạng MM:SS
  const msMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (msMatch) {
    const minutes = Number(msMatch[1]);
    const seconds = Number(msMatch[2]);
    if (minutes > 0) {
      return seconds > 0 ? `Còn ~${minutes}p ${seconds}s` : `Còn ~${minutes}p`;
    }
    return `Còn ~${seconds}s`;
  }

  // Trường hợp kết thúc bằng 's' (ví dụ "45s")
  const secMatch = trimmed.match(/^(\d+)s$/i);
  if (secMatch) {
    const sec = Number(secMatch[1]);
    return formatEta(sec);
  }

  return `Còn ~${trimmed}`;
}
