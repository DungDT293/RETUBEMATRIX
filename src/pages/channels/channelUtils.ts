import type {
  Format,
  PostingScheduleAnalysis,
  PreferredFps,
  Quality,
  VideoCodec,
  YoutubeChannelContentType,
} from '@/lib/types';

export const FFMPEG_REQUIRED_QUALITIES: Quality[] = ['best', '8k', '4k', '2k'];

export function loadInitialSettings(): {
  quality: Quality;
  format: Format;
  videoCodec: VideoCodec;
  preferredFps: PreferredFps;
  isAudioMode: boolean;
} {
  try {
    const saved = localStorage.getItem('youwee-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const quality: Quality = parsed.quality || 'best';
      const format: Format = parsed.format || 'mp4';
      const videoCodec: VideoCodec = parsed.videoCodec || 'auto';
      const preferredFps: PreferredFps = parsed.preferredFps === '30' ? '30' : 'original';
      const isAudioMode = quality === 'audio' || ['mp3', 'm4a', 'opus'].includes(format);

      const normalizedFormat = isAudioMode
        ? ['mp3', 'm4a', 'opus'].includes(format)
          ? format
          : 'mp3'
        : ['mp4', 'mkv', 'webm'].includes(format)
          ? format
          : 'mp4';
      const normalizedQuality = isAudioMode ? 'audio' : quality;

      return {
        quality: normalizedQuality,
        format: normalizedFormat,
        videoCodec,
        preferredFps,
        isAudioMode,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    quality: 'best',
    format: 'mp4',
    videoCodec: 'auto',
    preferredFps: 'original',
    isAudioMode: false,
  };
}

export function getYoutubeContentTypeFromUrl(url: string): YoutubeChannelContentType {
  try {
    const parsed = new URL(url);
    if (!isYoutubeChannelContentUrl(url)) return 'videos';
    const segments = parsed.pathname.split('/').filter(Boolean);
    const tab = segments.at(-1);
    if (tab === 'shorts') return 'shorts';
    if (tab === 'streams') return 'streams';
  } catch {
    // ignore invalid URLs while typing
  }
  return 'videos';
}

export function isYoutubeChannelContentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return false;

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const isContentTab =
      segments.length === 2 && ['videos', 'shorts', 'streams'].includes(segments[1]);
    const isNestedContentTab =
      segments.length === 3 && ['videos', 'shorts', 'streams'].includes(segments[2]);

    if (segments[0].startsWith('@') && segments[0].length > 1) {
      return segments.length === 1 || isContentTab;
    }
    if (['channel', 'c', 'user'].includes(segments[0]) && segments[1]) {
      return segments.length === 2 || isNestedContentTab;
    }
  } catch {
    // ignore invalid URLs while typing
  }
  return false;
}

export function classifyVideoType(video: {
  video_type?: string;
  url?: string;
  duration?: number;
  title?: string;
}): 'video' | 'shorts' | 'stream' {
  if (video.video_type === 'short' || video.video_type === 'shorts') return 'shorts';
  if (
    video.video_type === 'stream' ||
    video.video_type === 'streams' ||
    video.video_type === 'live'
  ) {
    return 'stream';
  }
  if (video.video_type === 'video') return 'video';

  if (video.url && (video.url.includes('/shorts/') || video.url.includes('short=true'))) {
    return 'shorts';
  }
  if (video.duration && video.duration > 0 && video.duration <= 60) {
    return 'shorts';
  }
  if (video.duration && video.duration > 3 * 3600) {
    return 'stream';
  }
  const title = (video.title || '').toLowerCase();
  if (
    title.includes('livestream') ||
    title.includes('live stream') ||
    title.includes('trực tiếp') ||
    title.includes('🔴')
  ) {
    return 'stream';
  }
  return 'video';
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatUploadDate(dateStr?: string, uploadTimestamp?: number): string {
  if (uploadTimestamp && uploadTimestamp > 0) {
    const d = new Date(uploadTimestamp * 1000);
    const dateFormatted = d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const hasSpecificTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
    if (hasSpecificTime) {
      const timeFormatted = d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${timeFormatted} • ${dateFormatted}`;
    }
    return dateFormatted;
  }
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (clean.length === 8 && /^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return `${d}/${m}/${y}`;
  }
  return clean;
}

export function formatUploadDateTime(
  dateStr?: string,
  uploadTimestamp?: number,
  fallbackCreatedAt?: string,
): string {
  const formatted = formatUploadDate(dateStr, uploadTimestamp);
  if (formatted) return formatted;
  if (fallbackCreatedAt) {
    try {
      const d = new Date(fallbackCreatedAt);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function analyzePostingSchedule(
  videos: Array<{ upload_date?: string; upload_timestamp?: number }>,
  locale = 'vi',
): PostingScheduleAnalysis {
  if (!videos || videos.length === 0) {
    return {
      time_range: '18:00 - 21:00',
      top_days: [],
      formatted: locale.startsWith('vi') ? 'Chưa có dữ liệu' : 'No data',
      sample_size: 0,
    };
  }

  const dayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const hourCounts: Record<number, number> = {};
  for (let i = 0; i < 24; i++) hourCounts[i] = 0;

  let validDatesCount = 0;

  for (const v of videos) {
    let date: Date | null = null;
    if (v.upload_timestamp && v.upload_timestamp > 0) {
      date = new Date(v.upload_timestamp * 1000);
    } else if (v.upload_date) {
      const clean = v.upload_date.trim();
      if (clean.length === 8 && /^\d{8}$/.test(clean)) {
        const year = parseInt(clean.slice(0, 4), 10);
        const month = parseInt(clean.slice(4, 6), 10) - 1;
        const day = parseInt(clean.slice(6, 8), 10);
        date = new Date(year, month, day);
      } else {
        const parsed = new Date(clean);
        if (!Number.isNaN(parsed.getTime())) date = parsed;
      }
    }

    if (date && !Number.isNaN(date.getTime())) {
      validDatesCount++;
      const day = date.getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
      // Chỉ tính giờ đối với timestamp thực tế (không phải 00:00:00 UTC làm tròn)
      const isDummyMidnight = v.upload_timestamp && v.upload_timestamp % 86400 === 0;
      if (!isDummyMidnight && v.upload_timestamp) {
        const hour = date.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }
  }

  if (validDatesCount === 0) {
    return {
      time_range: '18:00 - 21:00',
      top_days: [],
      formatted: locale.startsWith('vi') ? 'Chưa có dữ liệu' : 'No data',
      sample_size: 0,
    };
  }

  const sortedDays = Object.entries(dayCounts)
    .filter(([_, count]) => count > 0)
    .sort(([_, a], [__, b]) => b - a)
    .map(([day]) => parseInt(day, 10));

  const topDays = sortedDays.slice(0, 3).sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));

  const windows = [
    { start: 6, end: 9, label: '06:00 - 09:00' },
    { start: 9, end: 12, label: '09:00 - 12:00' },
    { start: 12, end: 15, label: '12:00 - 15:00' },
    { start: 15, end: 18, label: '15:00 - 18:00' },
    { start: 18, end: 21, label: '18:00 - 21:00' },
    { start: 21, end: 24, label: '21:00 - 24:00' },
  ];

  let bestWindow = windows[4];
  let maxWindowPosts = -1;

  for (const win of windows) {
    let sum = 0;
    for (let h = win.start; h < win.end; h++) {
      sum += hourCounts[h] || 0;
    }
    if (sum > maxWindowPosts) {
      maxWindowPosts = sum;
      bestWindow = win;
    }
  }

  const dayNamesVi: Record<number, string> = {
    0: 'CN',
    1: 'Thứ 2',
    2: 'Thứ 3',
    3: 'Thứ 4',
    4: 'Thứ 5',
    5: 'Thứ 6',
    6: 'Thứ 7',
  };

  const dayNamesEn: Record<number, string> = {
    0: 'Sun',
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
  };

  const isVi = locale.startsWith('vi');
  const dayNames = isVi ? dayNamesVi : dayNamesEn;
  const daysFormatted = topDays.length > 0 ? topDays.map((d) => dayNames[d]).join(', ') : '';

  let formatted = '';
  if (daysFormatted) {
    formatted = `${bestWindow.label} (${daysFormatted})`;
  } else {
    formatted = bestWindow.label;
  }

  return {
    time_range: bestWindow.label,
    top_days: topDays,
    formatted,
    sample_size: validDatesCount,
  };
}

export function formatPostingScheduleVietnamese(scheduleStr?: string | null): string {
  if (!scheduleStr) return 'Chưa đủ dữ liệu phân tích';
  return scheduleStr
    .replace(/\bMon\b/g, 'Thứ 2')
    .replace(/\bTue\b/g, 'Thứ 3')
    .replace(/\bWed\b/g, 'Thứ 4')
    .replace(/\bThu\b/g, 'Thứ 5')
    .replace(/\bFri\b/g, 'Thứ 6')
    .replace(/\bSat\b/g, 'Thứ 7')
    .replace(/\bSun\b/g, 'Chủ nhật');
}
