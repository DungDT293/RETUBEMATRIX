/**
 * src/services/workTelemetryService.ts
 * ============================================================================
 * RETubeMatrix Client Work Telemetry Service
 * Tự động đồng bộ ngầm (Fire-and-Forget) các thao tác công việc của nhân sự:
 *  1. Kênh đối thủ (Thêm/Sửa/Xóa/Scrape) -> /v1/telemetry/sync-competitor
 *  2. Kênh quản lý (Kênh đích / Kênh test BKT) -> /v1/telemetry/sync-managed-channel
 *  3. Báo cáo kết quả test bản quyền BKT (Xanh/Đỏ) -> /v1/telemetry/report-bkt-result
 *  4. Báo cáo xuất bản video lên Kênh Đích -> /v1/telemetry/report-upload
 * ============================================================================
 */

import { GATEWAY_URL } from './saasService';

const TELEMETRY_HMAC_SECRET =
  (import.meta as { env?: Record<string, string> }).env?.VITE_TELEMETRY_HMAC_SECRET ||
  'rtm_saas_hmac_secret_2026_enterprise_9988';

export interface CompetitorSyncPayload {
  user_id?: string;
  action?: 'upsert' | 'delete';
  channel_url: string;
  channel_title?: string;
  channel_name?: string;
  competitor_channel_id?: string;
  youtube_channel_id?: string;
  primary_keyword?: string;
  subscriber_count?: number;
  view_count?: number;
  total_views?: number;
  total_videos?: number;
  recent_5_videos?: Array<{
    video_id?: string;
    id?: string;
    title?: string;
    view_count?: number;
    upload_date?: string;
    url?: string;
  }>;
}

export interface ManagedChannelSyncPayload {
  user_id?: string;
  action?: 'upsert' | 'delete';
  channel_type: 'target' | 'test';
  channel_id: string;
  youtube_channel_id?: string;
  channel_title?: string;
  channel_name?: string;
  channel_url?: string;
  profile_id?: string;
  status?: 'active' | 'inactive';
  total_views?: number;
  estimated_revenue?: number;
}

export interface BktResultReportPayload {
  user_id?: string;
  competitor_channel_url?: string;
  competitor_channel_id?: string;
  status: 'green' | 'red' | 'completed';
  count?: number;
}

export interface UploadReportPayload {
  user_id?: string;
  channel_id: string;
  target_youtube_channel_id?: string;
  count?: number;
}

/**
 * Trích xuất token và userId từ local cache phiên đăng nhập
 */
function getStoredAuth(): { token: string | null; userId: string | null; hwidHash: string | null } {
  try {
    const rawSession = localStorage.getItem('rtm_auth_session');
    const adminToken = localStorage.getItem('rtm_admin_token');
    let userId: string | null = null;
    let token: string | null = adminToken || null;
    let hwidHash: string | null = null;

    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed.user?.id) userId = parsed.user.id;
      if (!token && parsed.accessToken) token = parsed.accessToken;
      if (parsed.hwidHash) hwidHash = parsed.hwidHash;
    }

    return { token, userId, hwidHash };
  } catch {
    return { token: null, userId: null, hwidHash: null };
  }
}

/**
 * Tạo chữ ký HMAC SHA-256 trên trình duyệt/WebView bằng Web Crypto API
 */
async function computeHmacSha256(message: string, secret: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    console.warn('[workTelemetryService] computeHmacSha256 error:', err);
    return '';
  }
}

/**
 * Gửi HTTP request ngầm (Fire-and-forget, timeout 8s, không chặn UI)
 */
async function postTelemetryInternal(
  path: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { token, userId, hwidHash } = getStoredAuth();

  // Tự động bổ sung user_id nếu client chưa điền
  if (userId && !payload.user_id) {
    payload.user_id = userId;
  }

  const rawJson = JSON.stringify(payload);
  const signature = await computeHmacSha256(rawJson, TELEMETRY_HMAC_SECRET);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-timestamp': Date.now().toString(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(signature ? { 'x-rtm-signature': signature } : {}),
      ...(hwidHash ? { 'x-hwid': hwidHash } : {}),
    };

    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method: 'POST',
      headers,
      body: rawJson,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Telemetry] ${path} returned status ${res.status}:`, errText);
    }
  } catch (err: unknown) {
    // Không làm gián đoạn người dùng nếu Gateway mất mạng hoặc bị timeout
    if ((err as Error)?.name === 'AbortError') {
      console.warn(`[Telemetry] ${path} timed out (8s)`);
    } else {
      console.warn(`[Telemetry] ${path} fire-and-forget notice:`, (err as Error)?.message || err);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export const workTelemetryService = {
  /**
   * 1. Đồng bộ Kênh Đối Thủ (Thêm mới, Cập nhật thông số quét, Xóa)
   */
  syncCompetitorChannel(payload: CompetitorSyncPayload): void {
    const cleanUrl = payload.channel_url?.trim();
    if (!cleanUrl) return;

    const normalizedBody: Record<string, unknown> = {
      action: payload.action || 'upsert',
      channel_url: cleanUrl,
      channel_name: payload.channel_name || payload.channel_title || cleanUrl.split('/').pop(),
      channel_title: payload.channel_title || payload.channel_name || cleanUrl.split('/').pop(),
      youtube_channel_id: payload.youtube_channel_id || payload.competitor_channel_id || null,
      competitor_channel_id: payload.competitor_channel_id || payload.youtube_channel_id || null,
      primary_keyword: payload.primary_keyword || '',
      subscriber_count: payload.subscriber_count ?? 0,
      total_views: payload.total_views ?? payload.view_count ?? 0,
      view_count: payload.view_count ?? payload.total_views ?? 0,
      total_videos: payload.total_videos ?? 0,
      recent_5_videos: payload.recent_5_videos ?? [],
      ...(payload.user_id ? { user_id: payload.user_id } : {}),
    };

    // Fire-and-forget: Chạy ngầm không chặn UI
    void postTelemetryInternal('/v1/telemetry/sync-competitor', normalizedBody);
  },

  /**
   * 2. Đồng bộ Kênh Quản Lý (Kênh Đích 'target' hoặc Kênh Test BKT 'test')
   */
  syncManagedChannel(payload: ManagedChannelSyncPayload): void {
    if (!payload.channel_type || (!payload.channel_id && !payload.youtube_channel_id)) {
      return;
    }

    const channelId = payload.youtube_channel_id || payload.channel_id;
    const channelTitle = payload.channel_title || payload.channel_name || channelId;

    const normalizedBody: Record<string, unknown> = {
      action: payload.action || 'upsert',
      channel_type: payload.channel_type,
      youtube_channel_id: channelId,
      channel_id: channelId,
      channel_name: channelTitle,
      channel_title: channelTitle,
      channel_url: payload.channel_url || null,
      profile_id: payload.profile_id || payload.channel_id || null,
      status: payload.status || 'active',
      total_views: payload.total_views ?? 0,
      estimated_revenue: payload.estimated_revenue ?? 0,
      ...(payload.user_id ? { user_id: payload.user_id } : {}),
    };

    void postTelemetryInternal('/v1/telemetry/sync-managed-channel', normalizedBody);
  },

  /**
   * 3. Báo cáo Kết Quả Test BKT (Xanh: 'green' | Đỏ: 'red')
   */
  reportBktResult(payload: BktResultReportPayload): void {
    const normalizedBody: Record<string, unknown> = {
      competitor_channel_url: payload.competitor_channel_url || '',
      competitor_channel_id: payload.competitor_channel_id || '',
      status: payload.status === 'completed' || payload.status === 'green' ? 'green' : 'red',
      count: payload.count ?? 1,
      ...(payload.user_id ? { user_id: payload.user_id } : {}),
    };

    void postTelemetryInternal('/v1/telemetry/report-bkt-result', normalizedBody);
  },

  /**
   * 4. Báo cáo Xuất Bản Video Lên Kênh Đích Thành Công
   */
  reportUpload(payload: UploadReportPayload): void {
    const targetChannelId = payload.target_youtube_channel_id || payload.channel_id;
    if (!targetChannelId) return;

    const normalizedBody: Record<string, unknown> = {
      channel_id: targetChannelId,
      target_youtube_channel_id: targetChannelId,
      count: payload.count ?? 1,
      ...(payload.user_id ? { user_id: payload.user_id } : {}),
    };

    void postTelemetryInternal('/v1/telemetry/report-upload', normalizedBody);
  },
};
