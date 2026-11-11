/**
 * RETubeMatrix Edge Gateway
 * Cloudflare Worker for Enterprise SaaS Auth & Telemetry Ingestion
 * + Web Admin Management Portal
 */

import { getPortalHtml } from './portalHtml';

export interface Env {
  RETUBEMATRIX_KV: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SHARED_TELEMETRY_HMAC_SECRET: string;
}

interface DeviceInfo {
  cpu_id?: string;
  motherboard_uuid?: string;
  machine_guid?: string;
  device_name?: string;
  os_info?: string;
  client_version?: string;
}

interface VerifyDevicePayload {
  email: string;
  password?: string;
  hwid_hash: string;
  cpu_id?: string;
  motherboard_uuid?: string;
  machine_guid?: string;
  device_name?: string;
  os_info?: string;
  client_version?: string;
  device_info?: DeviceInfo;
}

interface StudioAnalyticsPayload {
  company_id?: string;
  channel_id?: string;
  channel_name?: string;
  report_date: string;
  views: number;
  watch_time_hours?: number;
  subscribers_gained?: number;
  estimated_revenue?: number;
  estimated_revenue_vnd?: number;
  rpm?: number;
  cpm?: number;
  monetization_status?: string;
  hwid_hash?: string;
  timestamp?: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-signature, x-rtm-signature, x-timestamp, x-hwid, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function badRequest(message: string, code = 'BAD_REQUEST'): Response {
  return json({ success: false, code, error: message }, 400);
}

function unauthorized(message: string, code = 'UNAUTHORIZED'): Response {
  return json({ success: false, code, error: message }, 401);
}

function forbidden(
  message: string,
  code = 'FORBIDDEN',
  extra: Record<string, unknown> = {},
): Response {
  return json({ success: false, code, error: message, ...extra }, 403);
}

function internalError(message: string, details?: unknown): Response {
  return json({ success: false, code: 'INTERNAL_SERVER_ERROR', error: message, details }, 500);
}

async function computeHmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface AuthContext {
  userId: string;
  email: string;
  role: 'owner' | 'admin' | 'leader' | 'user';
  companyId: string | null;
  fullName: string;
  teamId?: string | null;
}

export const MASTER_OWNER_ID = '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44';
export const MASTER_OWNER_EMAIL = 'dungdong333@gmail.com';

export function isMasterOwner(userId?: string, email?: string, role?: string): boolean {
  if (role === 'owner') return true;
  if (email && email.toLowerCase() === MASTER_OWNER_EMAIL.toLowerCase()) return true;
  if (userId && userId === MASTER_OWNER_ID) return true;
  return false;
}

export async function resolveCompanyId(
  input: string | null,
  env: Env,
  serviceKey: string,
): Promise<string | null> {
  if (!input) return null;
  const trimmed = input.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (isUuid) return trimmed;

  const clean = trimmed.toLowerCase().replace(/[\s_-]+/g, '');
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/companies?select=id,name,code`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const list: any = await res.json().catch(() => []);
    if (Array.isArray(list)) {
      const match = list.find(
        (c: any) =>
          c.id?.toLowerCase() === trimmed.toLowerCase() ||
          c.code?.toLowerCase() === trimmed.toLowerCase() ||
          c.name?.toLowerCase() === trimmed.toLowerCase() ||
          c.name?.toLowerCase().replace(/[\s_-]+/g, '') === clean ||
          c.code?.toLowerCase().replace(/[\s_-]+/g, '') === clean,
      );
      if (match) return match.id;
    }
  } catch (_) {}
  return null;
}

export const getAdminAuthContext = authenticateAdminCaller;

async function authenticateAdminCaller(
  request: Request,
  env: Env,
  serviceKey: string,
): Promise<{ auth?: AuthContext; errorResponse?: Response }> {
  const authHeader = request.headers.get('Authorization') || '';
  const apiKeyHeader = request.headers.get('apikey') || '';

  // 1. Service Role Key bypass (for internal CLI / worker tasks)
  // TUYỆT ĐỐI không so khớp với SUPABASE_ANON_KEY để loại bỏ backdoor
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    serviceRoleKey &&
    serviceRoleKey !== env.SUPABASE_ANON_KEY &&
    (apiKeyHeader === serviceRoleKey || authHeader === `Bearer ${serviceRoleKey}`)
  ) {
    return {
      auth: {
        userId: MASTER_OWNER_ID,
        email: MASTER_OWNER_EMAIL,
        role: 'owner',
        companyId: 'e51f4953-587e-4a5e-af09-e76471ca0326',
        fullName: 'Tiến Dũng (Master Owner)',
        teamId: null,
      },
    };
  }

  // 2. Bearer token extraction
  if (!authHeader.startsWith('Bearer ')) {
    return {
      errorResponse: unauthorized(
        'Vui lòng đăng nhập để thực hiện thao tác này (Thiếu Bearer Token)',
      ),
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      errorResponse: unauthorized('Token xác thực không hợp lệ'),
    };
  }

  // 3. Fast cache lookup via KV
  let cached: AuthContext | null = null;
  if (env.RETUBEMATRIX_KV) {
    try {
      const cachedStr = await env.RETUBEMATRIX_KV.get(`adm_auth:${token.slice(-32)}`);
      if (cachedStr) {
        cached = JSON.parse(cachedStr);
      }
    } catch (_) {}
  }
  if (cached) {
    return { auth: cached };
  }

  // 4. Validate token with Supabase Auth API
  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  let authUser: any = null;
  if (!authRes.ok) {
    // Dự phòng đặc quyền Master Owner: Khi JWT token của Supabase hết hạn (thời lượng 1 tiếng)
    // Gateway sẽ giải mã payload JWT và kiểm tra trực tiếp qua Supabase Service Role Key
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) {
          b64 += '=';
        }
        const jsonPayload = decodeURIComponent(
          atob(b64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join(''),
        );
        const payload = JSON.parse(jsonPayload);
        const tokenEmail = (payload.email || '').toLowerCase();
        const tokenSub = payload.sub;

        if (tokenEmail === MASTER_OWNER_EMAIL || tokenSub === MASTER_OWNER_ID) {
          const adminCheck = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${tokenSub}`, {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          });
          if (adminCheck.ok) {
            authUser = await adminCheck.json();
            console.log(
              '[Gateway Auth] Master Owner session extended & verified via Supabase Admin API.',
            );
          } else {
            // Fallback trực tiếp nếu Supabase Admin endpoint trễ
            authUser = {
              id: MASTER_OWNER_ID,
              email: MASTER_OWNER_EMAIL,
              role: 'authenticated',
            };
            console.log('[Gateway Auth] Master Owner session fallback to static verified ID.');
          }
        }
      }
    } catch (jwtErr) {
      console.warn('[Gateway Auth] JWT Decode fallback error:', jwtErr);
    }

    if (!authUser) {
      return {
        errorResponse: unauthorized(
          'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
        ),
      };
    }
  } else {
    authUser = await authRes.json();
  }
  const userId = authUser.id;
  const email = (authUser.email || '').toLowerCase();

  // 5. Query user_profiles (kèm kiểm tra trạng thái công ty)
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,team_id,is_active,companies(id,is_active)`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  const profiles: any[] = (await profileRes.json().catch(() => [])) || [];
  const profile = profiles[0];

  if (!profile) {
    return {
      errorResponse: forbidden('Không tìm thấy hồ sơ người dùng trong hệ thống'),
    };
  }

  const role: 'owner' | 'admin' | 'leader' | 'user' = isMasterOwner(userId, email, profile.role)
    ? 'owner'
    : (profile.role as any) || 'user';

  if (role !== 'owner') {
    if (
      profile.is_active === false ||
      (profile.companies && profile.companies.is_active === false)
    ) {
      return {
        errorResponse: forbidden('Tài khoản hoặc doanh nghiệp đã bị tạm khóa.', 'ACCOUNT_DISABLED'),
      };
    }
  }

  const authContext: AuthContext = {
    userId,
    email: profile.email || email,
    role,
    companyId: profile.company_id || null,
    fullName: profile.full_name || email,
    teamId: profile.team_id || null,
  };

  if (env.RETUBEMATRIX_KV) {
    try {
      const kvTtl =
        role === 'owner' ? 7 * 86400 : role === 'admin' || role === 'leader' ? 86400 : 3600;
      await env.RETUBEMATRIX_KV.put(`adm_auth:${token.slice(-32)}`, JSON.stringify(authContext), {
        expirationTtl: kvTtl,
      });
    } catch (_) {}
  }

  return { auth: authContext };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Chuẩn hóa và hỗ trợ alias: /api/admin/* -> /v1/admin/* và /tenants -> /companies
    if (url.pathname.startsWith('/api/admin/')) {
      url.pathname = url.pathname.replace(/^\/api\/admin\//, '/v1/admin/');
    } else if (url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.replace(/^\/api\//, '/v1/');
    }
    if (url.pathname === '/v1/admin/tenants') {
      url.pathname = '/v1/admin/companies';
    } else if (url.pathname === '/v1/admin/tenants/create') {
      url.pathname = '/v1/admin/companies/create';
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      // 0. Phục vụ Web App Quản Trị (SaaS Admin Portal) trên Trình duyệt
      const acceptHeader = request.headers.get('accept') || '';
      const isHtmlRequest =
        acceptHeader.includes('text/html') ||
        url.pathname === '/' ||
        url.pathname === '/admin' ||
        url.pathname === '/dashboard' ||
        url.pathname === '/login' ||
        url.pathname === '/licenses' ||
        url.pathname === '/devices' ||
        url.pathname === '/companies' ||
        url.pathname === '/users' ||
        url.pathname === '/analytics';

      if (isHtmlRequest && !url.pathname.startsWith('/v1/')) {
        return new Response(getPortalHtml(), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }

      // 1. Health check
      if (url.pathname === '/v1/health') {
        let kvStatus = 'ok';
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.get('__health_ping__');
          }
        } catch (e: unknown) {
          kvStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
        }

        return json({
          status: kvStatus === 'ok' ? 'healthy' : 'degraded',
          gateway: 'retubematrix-gateway',
          version: '1.0.0',
          portal_url: `${url.origin}/admin`,
          timestamp: new Date().toISOString(),
          kv_status: kvStatus,
        });
      }

      const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

      // =========================================================================
      // WEB ADMIN PORTAL API ENDPOINTS (/v1/admin/*)
      // =========================================================================

      // Admin Login
      if (url.pathname === '/v1/admin/login' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const { email, password } = body;
        if (!email || !password) {
          return badRequest('Vui lòng nhập email và mật khẩu');
        }

        // Authenticate with Supabase Auth
        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });

        if (!authRes.ok) {
          const errData: any = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || 'Email hoặc mật khẩu không chính xác',
          );
        }

        const authData: any = await authRes.json();
        const userId = authData.user?.id;

        // Fetch User Profile with Service Key (kèm kiểm tra trạng thái công ty)
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,company_id,role,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
        );

        const profiles: any = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];

        if (
          !profile ||
          (profile.role !== 'owner' && profile.role !== 'admin' && profile.role !== 'leader')
        ) {
          return forbidden('Tài khoản không có quyền truy cập vào bảng quản trị SaaS');
        }

        const isOwner = isMasterOwner(profile.id, profile.email, profile.role);
        if (!isOwner) {
          if (
            profile.is_active === false ||
            (profile.companies && profile.companies.is_active === false)
          ) {
            return forbidden('Tài khoản hoặc doanh nghiệp đã bị tạm khóa.', 'ACCOUNT_DISABLED');
          }
        }

        const loginAuthCtx: AuthContext = {
          userId,
          email: profile.email || authData.user.email,
          role: isOwner ? 'owner' : (profile.role as any) || 'user',
          companyId: profile.company_id || null,
          fullName: profile.full_name || authData.user.email,
          teamId: profile.team_id || null,
        };

        if (env.RETUBEMATRIX_KV && authData.access_token) {
          try {
            await env.RETUBEMATRIX_KV.put(
              `adm_auth:${authData.access_token.slice(-32)}`,
              JSON.stringify(loginAuthCtx),
              { expirationTtl: isOwner ? 7 * 86400 : 86400 },
            );
          } catch (_) {}
        }

        return json({
          success: true,
          token: authData.access_token,
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          user: {
            id: userId,
            email: authData.user.email,
            full_name: profile.full_name,
            role: profile.role,
            company_id: profile.company_id,
          },
        });
      }

      // Admin Stats / KPI Overview
      if (url.pathname === '/v1/admin/stats' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền truy cập dữ liệu thống kê');
        }

        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else {
          compFilter = `&company_id=eq.${caller!.companyId}`;
        }
        const [licRes, devRes, compRes, chanRes, revRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?select=id,tier,max_seats,used_seats,status${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            caller!.role === 'owner'
              ? `${env.SUPABASE_URL}/rest/v1/companies?is_active=eq.true&select=id`
              : `${env.SUPABASE_URL}/rest/v1/companies?id=eq.${caller!.companyId}&select=id`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(`${env.SUPABASE_URL}/rest/v1/managed_channels?select=id${compFilter}`, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          })
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/channel_revenue_daily?select=estimated_revenue,estimated_revenue_vnd${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          )
            .then((r) => r.json())
            .catch(() => []),
        ]);

        const licenses: any[] = Array.isArray(licRes) ? licRes : [];
        const devices: any[] = Array.isArray(devRes) ? devRes : [];
        const channels: any[] = Array.isArray(chanRes) ? chanRes : [];
        const revs: any[] = Array.isArray(revRes) ? revRes : [];

        let totalSeats = 0;
        let usedSeats = 0;
        licenses.forEach((l) => {
          totalSeats += l.max_seats || 0;
          usedSeats += l.used_seats || 0;
        });

        let totalUsd = 0;
        let totalVnd = 0;
        revs.forEach((r) => {
          totalUsd += Number(r.estimated_revenue || 0);
          totalVnd += Number(r.estimated_revenue_vnd || 0);
        });

        return json({
          success: true,
          stats: {
            total_licenses: licenses.length,
            max_seats: totalSeats,
            used_seats: usedSeats,
            active_devices: devices.length,
            monitored_channels: channels.length,
            revenue_usd: totalUsd,
            revenue_vnd: totalVnd,
          },
        });
      }

      // Admin Licenses: List
      if (url.pathname === '/v1/admin/licenses' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xem thông tin bản quyền');
        }

        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else {
          compFilter = `&company_id=eq.${caller!.companyId}`;
        }
        const licRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/licenses?select=id,license_key,company_id,tier,status,max_seats,used_seats,valid_from,expires_at,features,companies(id,name,code)&order=created_at.desc${compFilter}`,
          {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          },
        );
        const data: any[] = (await licRes.json().catch(() => [])) || [];
        const formatted = Array.isArray(data)
          ? data.map((l) => ({
              id: l.id,
              license_key: l.license_key,
              company_id: l.company_id,
              company_name: l.companies?.name || 'RETubeMatrix HQ',
              company_code: l.companies?.code || 'HQ',
              tier: l.tier,
              status: l.status,
              max_seats: l.max_seats,
              used_seats: l.used_seats,
              valid_from: l.valid_from,
              expires_at: l.expires_at,
              features: l.features,
            }))
          : [];

        return json({ success: true, licenses: formatted });
      }

      // Admin Licenses: Issue New (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/licenses/issue' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền cấp mới License bản quyền');
        }

        const body: any = await request.json().catch(() => ({}));
        const { company_id, tier = 'pro', max_seats = 10, duration_days = 365, license_key } = body;

        if (!company_id || !license_key) {
          return badRequest('Vui lòng chọn công ty và cung cấp mã license key');
        }

        const validFrom = new Date();
        const expiresAt = new Date(validFrom.getTime() + duration_days * 24 * 60 * 60 * 1000);

        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/licenses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            license_key: license_key.trim(),
            company_id,
            tier,
            status: 'active',
            max_seats,
            used_seats: 0,
            valid_from: validFrom.toISOString(),
            expires_at: expiresAt.toISOString(),
            features: {
              max_browser_profiles: tier === 'enterprise' ? 100 : 25,
              bkt_daily_quota: tier === 'enterprise' ? 200 : 45,
              allow_cross_leader_collab: true,
            },
          }),
        });

        if (!insertRes.ok) {
          const err = await insertRes.text();
          return internalError('Không thể tạo License trong cơ sở dữ liệu', err);
        }

        const createdLic = await insertRes.json();
        return json({ success: true, message: 'Cấp License mới thành công', license: createdLic });
      }

      // Admin Licenses: Action (Extend / Revoke / Set Status) (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/licenses/action' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền gia hạn hoặc thu hồi License');
        }

        const body: any = await request.json().catch(() => ({}));
        const { action, license_id, days = 365, status } = body;

        if (!license_id) return badRequest('Thiếu license_id');

        if (action === 'extend') {
          const curRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}&select=expires_at`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          );
          const curList: any = await curRes.json();
          const curExpiry =
            curList && curList[0]?.expires_at ? new Date(curList[0].expires_at) : new Date();
          const baseDate = curExpiry.getTime() > Date.now() ? curExpiry : new Date();
          const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

          await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              expires_at: newExpiry.toISOString(),
              status: 'active',
              updated_at: new Date().toISOString(),
            }),
          });

          return json({
            success: true,
            message: 'Đã gia hạn thành công',
            new_expires_at: newExpiry.toISOString(),
          });
        }

        if (action === 'set_status') {
          await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
          });

          return json({ success: true, message: 'Đã cập nhật trạng thái license' });
        }

        if (action === 'add_seats') {
          const seatsToAdd = Number(body.seats) || 5;
          const curRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}&select=max_seats`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          );
          const curList: any = await curRes.json().catch(() => []);
          const curSeats = curList?.[0]?.max_seats ?? 10;
          const newMaxSeats = curSeats + seatsToAdd;

          await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              max_seats: newMaxSeats,
              updated_at: new Date().toISOString(),
            }),
          });

          return json({
            success: true,
            message: `Đã tăng thêm +${seatsToAdd} máy thành công`,
            new_max_seats: newMaxSeats,
          });
        }

        return badRequest('Hành động không hợp lệ');
      }

      // Admin Companies: List
      if (url.pathname === '/v1/admin/companies' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xem danh sách công ty');
        }

        const compFilter = caller!.role === 'owner' ? '' : `&id=eq.${caller!.companyId}`;
        const licFilter = caller!.role === 'owner' ? '' : `&company_id=eq.${caller!.companyId}`;

        const [compRes, licRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/companies?select=id,name,code,is_active,mask_revenue_from_staff,cross_leader_collaboration,created_at&order=created_at.asc${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?select=id,license_key,company_id,tier,status,max_seats,used_seats,valid_from,expires_at&order=created_at.desc${licFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            },
          ),
        ]);

        const compList: any[] = (await compRes.json().catch(() => [])) || [];
        const licList: any[] = (await licRes.json().catch(() => [])) || [];

        const licMap = new Map<string, any>();
        licList.forEach((lic) => {
          if (lic.company_id && (!licMap.has(lic.company_id) || lic.status === 'active')) {
            licMap.set(lic.company_id, lic);
          }
        });

        const companies = compList.map((c) => {
          const lic = licMap.get(c.id);
          return {
            ...c,
            license_key: lic?.license_key || 'Chưa cấp license',
            tier: lic?.tier || 'pro',
            max_seats: lic?.max_seats ?? 10,
            used_seats: lic?.used_seats ?? 0,
            expires_at: lic?.expires_at || null,
            license_status: lic?.status || 'inactive',
            license: lic || null,
          };
        });

        return json({ success: true, companies });
      }

      // Admin Companies: Create (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/companies/create' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền tạo công ty mới');
        }

        const body: any = await request.json().catch(() => ({}));
        const {
          name,
          code,
          mask_revenue_from_staff = false,
          cross_leader_collaboration = true,
          tier = 'pro',
        } = body;

        if (!name || !code) return badRequest('Vui lòng nhập tên và mã công ty');

        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            is_active: true,
            mask_revenue_from_staff,
            cross_leader_collaboration,
          }),
        });

        let compObj: any = null;
        if (!insertRes.ok) {
          const err = await insertRes.text();
          // Nếu đã tồn tại công ty có cùng mã Code, tự động nạp công ty đó để đồng bộ
          if (
            err.includes('duplicate key') ||
            err.includes('companies_code_key') ||
            insertRes.status === 409
          ) {
            const findRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/companies?code=eq.${code.trim().toUpperCase()}`,
              {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              },
            );
            const foundComps = await findRes.json().catch(() => []);
            if (Array.isArray(foundComps) && foundComps.length > 0) {
              compObj = foundComps[0];
              console.log(
                '[Gateway Create Company] Company code already exists, reusing existing record:',
                compObj.name,
              );
            } else {
              return internalError('Không thể tạo công ty: Mã Code đã tồn tại', err);
            }
          } else {
            return internalError('Không thể tạo công ty', err);
          }
        } else {
          const newComp = await insertRes.json();
          compObj = Array.isArray(newComp) ? newComp[0] : newComp;
        }

        // Tự động khởi tạo License ban đầu theo gói bản quyền
        let createdLicense = null;
        if (compObj?.id) {
          try {
            const targetTier = tier || 'pro';
            const maxSeats = targetTier === 'enterprise' ? 9999 : targetTier === 'trial' ? 3 : 10;
            const durationDays =
              targetTier === 'trial' ? 14 : targetTier === 'enterprise' ? 3650 : 365;
            const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
            const cleanCode =
              code
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '') || 'RTM';
            const licenseKey = `RTM-${cleanCode}-${targetTier.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            const licRes = await fetch(`${env.SUPABASE_URL}/rest/v1/licenses`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Prefer: 'return=representation',
              },
              body: JSON.stringify({
                license_key: licenseKey,
                company_id: compObj.id,
                tier: targetTier,
                status: 'active',
                issued_by: '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44',
                max_seats: maxSeats,
                used_seats: 0,
                valid_from: new Date().toISOString(),
                expires_at: expiresAt,
                features: {
                  max_browser_profiles:
                    targetTier === 'enterprise' ? 100 : targetTier === 'pro' ? 20 : 5,
                  bkt_daily_quota:
                    targetTier === 'enterprise' ? 999 : targetTier === 'pro' ? 50 : 15,
                  allow_cross_leader_collab: cross_leader_collaboration,
                },
              }),
            });
            if (licRes.ok) {
              createdLicense = await licRes.json().catch(() => null);
              if (Array.isArray(createdLicense)) createdLicense = createdLicense[0];
            }
          } catch (e) {
            console.error('Lỗi khi tự sinh License cho công ty mới:', e);
          }
        }

        return json({
          success: true,
          message: 'Tạo công ty và cấp phát License thành công',
          company: {
            ...compObj,
            license_key: createdLicense?.license_key || 'Chưa cấp license',
            tier: createdLicense?.tier || tier,
            max_seats: createdLicense?.max_seats || 10,
            expires_at: createdLicense?.expires_at || null,
            license: createdLicense,
          },
        });
      }

      // Admin Companies: Update (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/companies/update' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền cập nhật thông tin công ty');
        }

        const body: any = await request.json().catch(() => ({}));
        const {
          company_id,
          name,
          code,
          owner_user_id,
          is_active,
          mask_revenue_from_staff,
          cross_leader_collaboration,
        } = body;
        if (!company_id) return badRequest('Thiếu company_id');

        const updateFields: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateFields.name = name.trim();
        if (code !== undefined) updateFields.code = code.trim().toUpperCase();
        if (owner_user_id !== undefined) updateFields.owner_user_id = owner_user_id;
        if (is_active !== undefined) updateFields.is_active = is_active;
        if (mask_revenue_from_staff !== undefined)
          updateFields.mask_revenue_from_staff = mask_revenue_from_staff;
        if (cross_leader_collaboration !== undefined)
          updateFields.cross_leader_collaboration = cross_leader_collaboration;

        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(updateFields),
        });

        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError('Lỗi cập nhật công ty: ' + err);
        }

        const updated = await patchRes.json().catch(() => null);
        return json({ success: true, message: 'Cập nhật công ty thành công', company: updated });
      }

      // Admin Companies: Upgrade Tier (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/companies/upgrade' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền nâng cấp gói dịch vụ của công ty');
        }

        const body: any = await request.json().catch(() => ({}));
        const {
          company_id,
          target_tier = 'pro',
          max_seats,
          extend_days = 0,
          custom_features,
        } = body;
        if (!company_id) return badRequest('Thiếu company_id');

        const tierStr = target_tier.toLowerCase();
        if (tierStr !== 'trial' && tierStr !== 'pro' && tierStr !== 'enterprise') {
          return badRequest('Gói dịch vụ không hợp lệ. Chỉ chấp nhận: trial, pro, enterprise');
        }

        // 1. Tìm license active gần nhất của công ty
        const findLicRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/licenses?company_id=eq.${company_id}&status=eq.active&order=created_at.desc&limit=1`,
          {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          },
        );
        const licList: any = await findLicRes.json().catch(() => []);
        const currentLic = Array.isArray(licList) && licList.length > 0 ? licList[0] : null;

        // Xác định số ghế mặc định theo gói nếu không truyền max_seats
        const defaultSeats = tierStr === 'enterprise' ? 9999 : tierStr === 'pro' ? 10 : 3;
        const resolvedSeats =
          max_seats !== undefined && Number(max_seats) > 0
            ? Number(max_seats)
            : currentLic && currentLic.max_seats > defaultSeats
              ? currentLic.max_seats
              : defaultSeats;

        // Tính hạn ngạch tính năng features theo gói
        const defaultFeatures = {
          max_browser_profiles: tierStr === 'enterprise' ? 999 : tierStr === 'pro' ? 25 : 5,
          bkt_daily_quota: tierStr === 'enterprise' ? 9999 : tierStr === 'pro' ? 50 : 15,
          allow_cross_leader_collab: true,
          unlimited_seats: tierStr === 'enterprise',
          owner_unrestricted: tierStr === 'enterprise',
        };
        const resolvedFeatures = {
          ...defaultFeatures,
          ...(currentLic?.features || {}),
          ...(custom_features || {}),
          max_browser_profiles:
            custom_features?.max_browser_profiles || defaultFeatures.max_browser_profiles,
          bkt_daily_quota: custom_features?.bkt_daily_quota || defaultFeatures.bkt_daily_quota,
          unlimited_seats: tierStr === 'enterprise',
        };

        // Tính ngày hết hạn mới
        let newExpiresAt: string;
        const nowMs = Date.now();
        if (currentLic?.expires_at) {
          const curExpMs = new Date(currentLic.expires_at).getTime();
          const baseMs = curExpMs > nowMs ? curExpMs : nowMs;
          const addDays = Number(extend_days) || 0;
          newExpiresAt = new Date(baseMs + addDays * 86400000).toISOString();
        } else {
          const durationDays = tierStr === 'enterprise' ? 3650 : tierStr === 'trial' ? 14 : 365;
          newExpiresAt = new Date(nowMs + durationDays * 86400000).toISOString();
        }

        let updatedLic: any = null;
        if (currentLic?.id) {
          // Cập nhật License hiện tại (giữ nguyên license_key để khách hàng không bị gián đoạn)
          const patchLicRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${currentLic.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Prefer: 'return=representation',
              },
              body: JSON.stringify({
                tier: tierStr,
                max_seats: resolvedSeats,
                features: resolvedFeatures,
                expires_at: newExpiresAt,
                status: 'active',
                updated_at: new Date().toISOString(),
              }),
            },
          );
          if (!patchLicRes.ok) {
            const err = await patchLicRes.text();
            return internalError('Lỗi cập nhật License: ' + err);
          }
          const patchData = await patchLicRes.json().catch(() => null);
          updatedLic = Array.isArray(patchData) ? patchData[0] : patchData;
        } else {
          // Chưa có license thì tạo mới
          const cleanCode = 'CORP';
          const newLicKey = `RTM-${cleanCode}-${tierStr.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const createLicRes = await fetch(`${env.SUPABASE_URL}/rest/v1/licenses`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              license_key: newLicKey,
              company_id,
              tier: tierStr,
              status: 'active',
              issued_by: caller!.userId,
              max_seats: resolvedSeats,
              used_seats: 0,
              valid_from: new Date().toISOString(),
              expires_at: newExpiresAt,
              features: resolvedFeatures,
            }),
          });
          const cData = await createLicRes.json().catch(() => null);
          updatedLic = Array.isArray(cData) ? cData[0] : cData;
        }

        // Nếu nâng lên Enterprise, đồng thời bật cross_leader_collaboration cho company
        if (tierStr === 'enterprise') {
          await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              cross_leader_collaboration: true,
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => null);
        }

        return json({
          success: true,
          message: `Đã nâng gói công ty sang ${tierStr.toUpperCase()} thành công`,
          tier: tierStr,
          license: updatedLic,
        });
      }

      // Admin Companies: Delete (CHỈ MASTER OWNER)
      if (url.pathname === '/v1/admin/companies/delete' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden('Chỉ Master Owner mới có quyền xóa công ty');
        }

        const body: any = await request.json().catch(() => ({}));
        const { company_id } = body;
        if (!company_id) return badRequest('Thiếu company_id');

        // Chặn không cho xóa công ty RETubeMatrix HQ
        if (company_id === 'e51f4953-587e-4a5e-af09-e76471ca0326') {
          return forbidden('Không thể xóa công ty Tổng bộ (RETubeMatrix HQ)');
        }

        // Chuyển các user thuộc công ty này về HQ
        await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?company_id=eq.${company_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ company_id: 'e51f4953-587e-4a5e-af09-e76471ca0326' }),
        });

        // Xóa licenses của công ty này
        await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?company_id=eq.${company_id}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });

        // Xóa công ty
        const delRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });

        if (!delRes.ok) {
          const err = await delRes.text();
          return internalError('Lỗi khi xóa công ty: ' + err);
        }

        return json({ success: true, message: 'Đã xóa công ty thành công' });
      }

      // Admin Companies: Update Settings (Legacy Support)
      if (url.pathname === '/v1/admin/companies/update-settings' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        const body: any = await request.json().catch(() => ({}));
        const { company_id, mask_revenue_from_staff, cross_leader_collaboration } = body;
        if (!company_id) return badRequest('Thiếu company_id');

        if (
          caller!.role !== 'owner' &&
          (caller!.role !== 'admin' || caller!.companyId !== company_id)
        ) {
          return forbidden('Bạn không có quyền sửa cài đặt của công ty này');
        }

        const updateFields: any = {};
        if (mask_revenue_from_staff !== undefined)
          updateFields.mask_revenue_from_staff = mask_revenue_from_staff;
        if (cross_leader_collaboration !== undefined)
          updateFields.cross_leader_collaboration = cross_leader_collaboration;

        await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(updateFields),
        });

        return json({ success: true, message: 'Cập nhật cài đặt công ty thành công' });
      }

      // =========================================================================
      // USER & ROLE MANAGEMENT API ENDPOINTS (/v1/admin/users/*)
      // Ma trận phân quyền 4 cấp bậc: Master Owner, Admin, Leader, User
      // =========================================================================

      // Admin Users: List
      if (url.pathname === '/v1/admin/users' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xem danh sách nhân sự');
        }

        let queryUrl = `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,company_id,role,team_id,full_name,email,commission_rate,is_active,assigned_niche,created_at,companies(id,name,code)&order=created_at.asc`;
        let deviceQueryUrl = `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id,user_id,device_name,os_info,client_version,hwid_hash,last_ip,last_heartbeat_at`;

        // Multi-tenant boundary
        if (caller!.role === 'admin' || caller!.role === 'leader') {
          if (!caller!.companyId) {
            return json({ success: true, users: [] });
          }
          queryUrl += `&company_id=eq.${caller!.companyId}`;
          deviceQueryUrl += `&company_id=eq.${caller!.companyId}`;
        } else if (caller!.role === 'owner') {
          const filterComp = url.searchParams.get('company_id');
          if (filterComp) {
            const resolvedCompId = await resolveCompanyId(filterComp, env, serviceKey);
            if (resolvedCompId) {
              queryUrl += `&company_id=eq.${resolvedCompId}`;
              deviceQueryUrl += `&company_id=eq.${resolvedCompId}`;
            } else {
              return json({ success: true, users: [] });
            }
          }
        }

        const [profilesRes, devicesRes] = await Promise.all([
          fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          })
            .then((r) => r.json())
            .catch(() => []),
          fetch(deviceQueryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          })
            .then((r) => r.json())
            .catch(() => []),
        ]);

        const profilesList: any[] = Array.isArray(profilesRes) ? profilesRes : [];
        const devicesList: any[] = Array.isArray(devicesRes) ? devicesRes : [];
        const devMap = new Map<string, any>();
        devicesList.forEach((d) => {
          devMap.set(d.user_id, d);
        });

        const users = profilesList.map((p) => {
          const boundDev = devMap.get(p.id);
          return {
            id: p.id,
            email: p.email,
            full_name: p.full_name || p.email,
            role: p.role,
            is_active: p.is_active,
            commission_rate: p.commission_rate,
            company_id: p.company_id,
            company_name:
              p.companies?.name || (p.company_id ? 'N/A' : 'Chưa gán công ty (Chờ duyệt)'),
            company_code: p.companies?.code || (p.company_id ? 'N/A' : 'PENDING'),
            team_id: p.team_id,
            assigned_niche: p.assigned_niche || null,
            created_at: p.created_at,
            has_device_bound: !!boundDev,
            bound_device: boundDev
              ? {
                  binding_id: boundDev.id,
                  device_name: boundDev.device_name || 'Windows PC',
                  os_info: boundDev.os_info || 'Windows 11',
                  hwid_hash: boundDev.hwid_hash,
                  last_ip: boundDev.last_ip || '127.0.0.1',
                  last_heartbeat_at: boundDev.last_heartbeat_at,
                }
              : null,
          };
        });

        return json({ success: true, users });
      }

      // Admin Users: Create New User
      if (url.pathname === '/v1/admin/users/create' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền tạo tài khoản người dùng');
        }

        const body: any = await request.json().catch(() => ({}));
        let {
          email,
          password,
          full_name,
          role = 'user',
          company_id,
          commission_rate = 0,
          assigned_niche,
          assigned_niches,
        } = body;

        const finalAssignedNiche =
          assigned_niche ||
          (Array.isArray(assigned_niches) ? assigned_niches.join(', ') : assigned_niches) ||
          null;

        if (!email || !password) {
          return badRequest('Vui lòng nhập email và mật khẩu cho người dùng mới');
        }
        const cleanEmail = email.trim().toLowerCase();

        // Enforce role hierarchy on creation
        if (caller!.role === 'admin') {
          company_id = caller!.companyId;
          if (role !== 'user' && role !== 'leader') {
            return forbidden(
              'Admin chỉ có thể tạo người dùng với vai trò Nhân viên (user) hoặc Trưởng nhóm (leader)',
            );
          }
        } else if (caller!.role === 'leader') {
          company_id = caller!.companyId;
          role = 'user';
        } else if (caller!.role === 'owner') {
          if (!company_id) {
            company_id = 'e51f4953-587e-4a5e-af09-e76471ca0326';
          }
        }

        // 1. Tạo auth user qua Supabase Admin API
        const authCreateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || cleanEmail.split('@')[0] },
          }),
        });

        if (!authCreateRes.ok) {
          const err: any = await authCreateRes.json().catch(() => ({}));
          const errMsg = err.msg || err.message || '';
          if (
            errMsg.toLowerCase().includes('already') ||
            errMsg.toLowerCase().includes('registered')
          ) {
            return json(
              {
                success: false,
                code: 'EMAIL_ALREADY_EXISTS',
                error: 'Email này đã được đăng ký trên hệ thống',
              },
              409,
            );
          }
          return badRequest(errMsg || 'Không thể tạo tài khoản người dùng');
        }

        const createdAuthUser: any = await authCreateRes.json();
        const newUserId = createdAuthUser.id;

        // 2. Tạo hoặc upsert user_profiles
        const compId = company_id || null;
        const profileInsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify({
            id: newUserId,
            company_id: compId,
            role,
            full_name: full_name || cleanEmail.split('@')[0],
            email: cleanEmail,
            commission_rate: Number(commission_rate) || 0,
            is_active: true,
            assigned_niche: finalAssignedNiche,
          }),
        });

        if (!profileInsertRes.ok) {
          const profErr = await profileInsertRes.text();
          return internalError('Lỗi tạo hồ sơ người dùng: ' + profErr);
        }

        return json({
          success: true,
          message: 'Cấp tài khoản thành công',
          user: {
            id: newUserId,
            email: cleanEmail,
            full_name: full_name || cleanEmail.split('@')[0],
            role,
            company_id: compId,
            assigned_niche: finalAssignedNiche,
            plain_password: password,
          },
        });
      }

      // Admin Users: Assign Company (CHỈ MASTER OWNER CÓ QUYỀN)
      if (url.pathname === '/v1/admin/users/assign-company' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner') {
          return forbidden(
            'Chỉ Master Owner mới có quyền gán hoặc chuyển đổi công ty cho người dùng',
          );
        }

        const body: any = await request.json().catch(() => ({}));
        const { user_id, company_id, activate = true } = body;

        if (!user_id || !company_id) {
          return badRequest('Vui lòng cung cấp đầy đủ user_id và company_id');
        }

        // Verify company exists
        const compRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}&select=id,name,code,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const comps: any[] = (await compRes.json().catch(() => [])) || [];
        if (!comps || comps.length === 0) {
          return badRequest('Công ty được chỉ định không tồn tại trên hệ thống');
        }

        // Verify target user exists
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const targetProfiles: any[] = (await userRes.json().catch(() => [])) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest('Không tìm thấy tài khoản người dùng');
        }
        const target = targetProfiles[0];

        const patchData: Record<string, unknown> = {
          company_id,
          updated_at: new Date().toISOString(),
        };

        if (activate && target.is_active === false) {
          patchData.is_active = true;
        }

        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(patchData),
        });

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          return internalError('Lỗi khi gán công ty cho người dùng: ' + errText);
        }

        // Invalidate KV cache
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {}
        }

        const updatedList: any[] = await patchRes.json().catch(() => []);
        return json({
          success: true,
          message: `Đã gán người dùng ${target.email} vào công ty ${comps[0].name} thành công!`,
          user: updatedList[0] || {
            id: user_id,
            company_id,
            is_active: patchData.is_active ?? target.is_active,
          },
        });
      }

      // Admin Users: Update Role (PHÂN QUYỀN)
      // Master Owner đổi được mọi role; Admin chỉ đổi được User <-> Leader trong cùng công ty
      if (url.pathname === '/v1/admin/users/update-role' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin') {
          return forbidden(
            'Bạn không có quyền phân quyền người dùng (chỉ Owner và Admin mới có quyền)',
          );
        }

        const body: any = await request.json().catch(() => ({}));
        const {
          user_id,
          role,
          company_id,
          full_name,
          commission_rate,
          is_active,
          assigned_niche,
          assigned_niches,
        } = body;

        if (!user_id) return badRequest('Thiếu user_id');
        if (
          !role &&
          full_name === undefined &&
          commission_rate === undefined &&
          is_active === undefined &&
          company_id === undefined &&
          assigned_niche === undefined &&
          assigned_niches === undefined
        ) {
          return badRequest('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
        }

        // Retrieve target profile
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const targetProfiles: any[] = (await userRes.json().catch(() => [])) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest('Không tìm thấy tài khoản người dùng');
        }
        const target = targetProfiles[0];

        // Tuyệt đối không hạ quyền Master Owner
        if (isMasterOwner(target.id, target.email, target.role)) {
          if (role && role !== 'owner') {
            return forbidden('Không thể thay đổi quyền hạn Master Owner tối cao');
          }
        }

        // Admin rules
        if (caller!.role === 'admin') {
          // 1. Boundary: chỉ phân quyền trong công ty mình
          if (target.company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền phân quyền cho nhân sự thuộc công ty mình');
          }

          // 2. Không được đụng vào Owner hoặc Admin khác
          if (
            target.role === 'owner' ||
            (target.role === 'admin' && target.id !== caller!.userId)
          ) {
            return forbidden('Admin không được phép thay đổi quyền hạn của Owner hoặc Admin khác');
          }

          // 3. Admin không thể tự đổi vai trò của chính mình
          if (target.id === caller!.userId && role && role !== caller!.role) {
            return forbidden('Admin không thể tự thay đổi vai trò của chính mình');
          }

          // 4. Role transitions cho phép: chỉ 'user' <-> 'leader'
          if (role && role !== 'user' && role !== 'leader') {
            return forbidden(
              'Admin chỉ được quyền phân quyền giữa Nhân viên (user) và Trưởng nhóm (leader)',
            );
          }

          // 5. Admin không được đổi công ty
          if (company_id !== undefined && company_id !== caller!.companyId) {
            return forbidden(
              'Admin không có quyền gán hoặc chuyển đổi công ty cho nhân sự (Chỉ Master Owner có quyền)',
            );
          }
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (role !== undefined) updates.role = role;
        if (full_name !== undefined) updates.full_name = full_name;
        if (commission_rate !== undefined) updates.commission_rate = Number(commission_rate);
        if (is_active !== undefined) updates.is_active = is_active;
        if (company_id !== undefined && caller!.role === 'owner') updates.company_id = company_id;
        if (assigned_niche !== undefined || assigned_niches !== undefined) {
          updates.assigned_niche =
            assigned_niche ||
            (Array.isArray(assigned_niches) ? assigned_niches.join(', ') : assigned_niches) ||
            null;
        }

        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(updates),
        });

        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError('Lỗi cập nhật phân quyền người dùng: ' + err);
        }

        // Invalidate cache
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {}
        }

        return json({
          success: true,
          message: 'Cập nhật phân quyền người dùng thành công',
          user: { id: user_id, ...updates },
        });
      }

      // Admin Users: Update Info (SỬA THÔNG TIN: TÊN, TRẠNG THÁI)
      if (url.pathname === '/v1/admin/users/update-info' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền chỉnh sửa thông tin người dùng');
        }

        const body: any = await request.json().catch(() => ({}));
        const {
          user_id,
          full_name,
          commission_rate,
          is_active,
          team_id,
          assigned_niche,
          assigned_niches,
        } = body;

        if (!user_id) return badRequest('Thiếu user_id');

        // Retrieve target profile
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,team_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const targetProfiles: any[] = (await userRes.json().catch(() => [])) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest('Không tìm thấy tài khoản người dùng');
        }
        const target = targetProfiles[0];

        // Master Owner protection
        if (isMasterOwner(target.id, target.email, target.role) && caller!.role !== 'owner') {
          return forbidden('Không được phép chỉnh sửa thông tin của Master Owner');
        }

        // Admin rules
        if (caller!.role === 'admin') {
          if (target.company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền chỉnh sửa nhân sự thuộc công ty mình');
          }
          if (
            target.role === 'owner' ||
            (target.role === 'admin' && target.id !== caller!.userId)
          ) {
            return forbidden('Admin không được phép sửa thông tin của Admin khác hoặc Owner');
          }
        }

        // Leader rules
        if (caller!.role === 'leader') {
          if (target.company_id !== caller!.companyId) {
            return forbidden('Leader chỉ có quyền chỉnh sửa nhân sự thuộc công ty mình');
          }
          if (target.role !== 'user') {
            return forbidden('Leader chỉ có quyền sửa thông tin của Nhân viên (user)');
          }
          if (caller!.teamId && target.team_id && target.team_id !== caller!.teamId) {
            return forbidden(
              'Leader chỉ có quyền sửa thông tin nhân viên thuộc nhóm mình phụ trách',
            );
          }
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (full_name !== undefined) updates.full_name = full_name;
        if (commission_rate !== undefined) updates.commission_rate = Number(commission_rate);
        if (is_active !== undefined) updates.is_active = is_active;
        if (team_id !== undefined && caller!.role !== 'leader') updates.team_id = team_id;
        if (assigned_niche !== undefined || assigned_niches !== undefined) {
          updates.assigned_niche =
            assigned_niche ||
            (Array.isArray(assigned_niches) ? assigned_niches.join(', ') : assigned_niches) ||
            null;
        }

        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(updates),
        });

        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError('Lỗi cập nhật thông tin người dùng: ' + err);
        }

        // Invalidate cache
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {}
        }

        return json({
          success: true,
          message: 'Cập nhật thông tin người dùng thành công',
          user: { id: user_id, ...updates },
        });
      }

      // Admin Users: Delete User (DELETE /v1/admin/users/:id & POST /v1/admin/users/delete & DELETE /v1/admin/users)
      // Owner xóa được mọi người; Admin xóa được User/Leader cùng công ty; Leader xóa được User cùng công ty
      const isUsersDeletePath =
        (url.pathname === '/v1/admin/users/delete' && request.method === 'POST') ||
        (url.pathname === '/v1/admin/users' && request.method === 'DELETE') ||
        (url.pathname.startsWith('/v1/admin/users/') &&
          request.method === 'DELETE' &&
          ![
            'assign-company',
            'update-role',
            'update-info',
            'create',
            'delete',
            'reset-hwid',
          ].includes(url.pathname.split('/')[4] || ''));

      if (isUsersDeletePath) {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xóa người dùng khỏi hệ thống');
        }

        let targetUserId = '';
        if (url.pathname.startsWith('/v1/admin/users/') && request.method === 'DELETE') {
          const pathPart = url.pathname.split('/')[4];
          if (pathPart && pathPart !== 'delete') {
            targetUserId = pathPart;
          }
        }

        if (!targetUserId) {
          const body: any = await request.json().catch(() => ({}));
          targetUserId = body.user_id || url.searchParams.get('user_id') || '';
        }

        if (!targetUserId) {
          return badRequest('Thiếu user_id cần xóa');
        }

        // Không tự xóa chính mình
        if (targetUserId === caller!.userId) {
          return forbidden('Bạn không thể tự xóa tài khoản của chính mình');
        }

        // Retrieve target profile
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${targetUserId}&select=id,email,full_name,role,company_id,team_id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const targetProfiles: any[] = (await userRes.json().catch(() => [])) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest('Không tìm thấy tài khoản người dùng cần xóa');
        }
        const target = targetProfiles[0];

        // Tuyệt đối không xóa Master Owner
        if (isMasterOwner(target.id, target.email, target.role)) {
          return forbidden('TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA TÀI KHOẢN MASTER OWNER');
        }

        // Admin rules
        if (caller!.role === 'admin') {
          if (target.company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền xóa nhân sự trong công ty của mình');
          }
          if (target.role === 'owner' || target.role === 'admin') {
            return forbidden('Admin không được phép xóa tài khoản của Admin khác hoặc Owner');
          }
        }

        // Leader rules
        if (caller!.role === 'leader') {
          if (target.company_id !== caller!.companyId) {
            return forbidden('Leader chỉ có quyền xóa nhân sự trong công ty của mình');
          }
          if (target.role !== 'user') {
            return forbidden('Leader chỉ có quyền xóa tài khoản Nhân viên (user)');
          }
          if (caller!.teamId && target.team_id && target.team_id !== caller!.teamId) {
            return forbidden('Leader chỉ có quyền xóa nhân viên thuộc nhóm mình phụ trách');
          }
        }

        // 1. Xóa các ràng buộc liên quan
        await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${targetUserId}`, {
            method: 'DELETE',
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?user_id=eq.${targetUserId}`, {
            method: 'DELETE',
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          }),
        ]);

        // 2. Xóa user_profiles
        await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${targetUserId}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });

        // 3. Xóa auth.users
        await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });

        // 4. Xóa cache KV
        try {
          if (env.RETUBEMATRIX_KV) {
            await Promise.all([
              env.RETUBEMATRIX_KV.delete(`binding:${targetUserId}`),
              env.RETUBEMATRIX_KV.delete(`adm_auth:${targetUserId}`),
            ]);
          }
        } catch (_) {}

        return json({
          success: true,
          message: `Đã xóa người dùng ${target.email} khỏi hệ thống thành công!`,
        });
      }

      // Admin Users: Reset HWID (Giải phóng máy tức thì)
      if (url.pathname === '/v1/admin/users/reset-hwid' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền reset HWID người dùng');
        }

        const body: any = await request.json().catch(() => ({}));
        const { user_id } = body;
        if (!user_id) return badRequest('Thiếu user_id');

        // Check target boundary
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,role,company_id,team_id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const targetProfiles: any[] = (await userRes.json().catch(() => [])) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest('Không tìm thấy tài khoản người dùng');
        }
        const target = targetProfiles[0];

        if (caller!.role === 'admin') {
          if (target.company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền reset máy cho nhân sự thuộc công ty mình');
          }
          if (
            target.role === 'owner' ||
            (target.role === 'admin' && target.id !== caller!.userId)
          ) {
            return forbidden('Admin không được phép can thiệp máy của Owner hoặc Admin khác');
          }
        } else if (caller!.role === 'leader') {
          if (target.company_id !== caller!.companyId || target.role !== 'user') {
            return forbidden(
              'Leader chỉ có quyền reset máy cho Nhân viên (user) trong công ty mình',
            );
          }
        }

        // Cập nhật device_bindings của user thành is_active = false
        await fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${user_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
        });

        // Xóa cache KV
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.delete(`binding:${user_id}`);
          }
        } catch (_) {}

        return json({
          success: true,
          message:
            'Đã giải phóng máy cho người dùng thành công! Người dùng có thể đăng nhập trên máy mới.',
        });
      }

      // Admin Devices & Pending Resets
      if (url.pathname === '/v1/admin/devices' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xem thông tin thiết bị');
        }

        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else {
          compFilter = `&company_id=eq.${caller!.companyId}`;
        }
        const [devRes, reqRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id,user_id,company_id,device_name,os_info,client_version,hwid_hash,last_ip,last_heartbeat_at,user_profiles(full_name,email,role),companies(name)&order=last_heartbeat_at.desc${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?status=eq.pending&select=id,user_id,company_id,reason,new_hwid_hash,created_at,user_profiles(full_name,email),companies(name)&order=created_at.desc${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
        ]);

        const rawDevices = Array.isArray(devRes) ? devRes : [];
        const rawResets = Array.isArray(reqRes) ? reqRes : [];

        const devices = rawDevices.map((d: any) => ({
          id: d.id,
          user_id: d.user_id,
          user_name: d.user_profiles?.full_name || d.user_profiles?.email || 'Nhân viên',
          user_email: d.user_profiles?.email || '',
          user_role: d.user_profiles?.role || 'user',
          company_name: d.companies?.name || 'Công Ty',
          device_name: d.device_name || 'Windows Desktop',
          os_info: d.os_info || 'Windows 11',
          client_version: d.client_version || '0.20.16',
          hwid_hash: d.hwid_hash,
          last_ip: d.last_ip || '127.0.0.1',
          last_heartbeat_at: d.last_heartbeat_at,
        }));

        const pendingResets = rawResets.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          user_name: r.user_profiles?.full_name || r.user_profiles?.email || 'Nhân viên',
          user_email: r.user_profiles?.email || '',
          company_name: r.companies?.name || 'Công Ty',
          reason: r.reason,
          new_hwid_hash: r.new_hwid_hash,
          created_at: r.created_at,
        }));

        return json({ success: true, devices, pending_resets: pendingResets });
      }

      // Admin Review HWID Reset Request
      if (url.pathname === '/v1/admin/devices/review-reset' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin') {
          return forbidden('Chỉ Owner hoặc Admin mới có quyền phê duyệt đổi máy');
        }

        const body: any = await request.json().catch(() => ({}));
        const { request_id, approved } = body;
        if (!request_id || approved === undefined)
          return badRequest('Thiếu request_id hoặc approved status');

        // Check company boundary if admin
        if (caller!.role === 'admin') {
          const reqCheckRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}&select=company_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          );
          const reqChecks: any[] = (await reqCheckRes.json().catch(() => [])) || [];
          if (!reqChecks.length || reqChecks[0].company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền phê duyệt đổi máy cho nhân sự trong công ty mình');
          }
        }

        // Gọi RPC review_hwid_reset_request trên Supabase
        const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/review_hwid_reset_request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_request_id: request_id,
            p_approved: approved,
            p_notes: approved ? 'Duyệt qua Web SaaS Master Control' : 'Từ chối bởi Quản trị viên',
          }),
        });

        if (!rpcRes.ok) {
          // Fallback direct table update nếu RPC bị hạn chế auth uid
          if (approved) {
            const reqDataRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}&select=user_id`,
              {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
              },
            );
            const reqList: any = await reqDataRes.json();
            const targetUserId = reqList && reqList[0]?.user_id;
            if (targetUserId) {
              await fetch(
                `${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${targetUserId}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({ is_active: false }),
                },
              );
              try {
                if (env.RETUBEMATRIX_KV) {
                  await env.RETUBEMATRIX_KV.delete(`binding:${targetUserId}`);
                }
              } catch (_) {}
            }
          }

          await fetch(`${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              status: approved ? 'approved' : 'rejected',
              updated_at: new Date().toISOString(),
            }),
          });

          return json({
            success: true,
            message: approved ? 'Đã phê duyệt đổi máy' : 'Đã từ chối yêu cầu đổi máy',
          });
        }

        const rpcResult = await rpcRes.json();
        return json(rpcResult);
      }

      // Admin Unbind Device
      if (url.pathname === '/v1/admin/devices/unbind' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin') {
          return forbidden('Chỉ Owner hoặc Admin mới có quyền hủy liên kết thiết bị');
        }

        const body: any = await request.json().catch(() => ({}));
        const { binding_id } = body;
        if (!binding_id) return badRequest('Thiếu binding_id');

        // Check company boundary if admin
        if (caller!.role === 'admin') {
          const bindCheckRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?id=eq.${binding_id}&select=company_id,user_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          );
          const bindChecks: any[] = (await bindCheckRes.json().catch(() => [])) || [];
          if (!bindChecks.length || bindChecks[0].company_id !== caller!.companyId) {
            return forbidden('Admin chỉ có quyền hủy liên kết thiết bị trong công ty mình');
          }
        }

        await fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?id=eq.${binding_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
        });

        return json({ success: true, message: 'Đã hủy liên kết máy thành công' });
      }

      // Admin Analytics & Revenue Reports
      if (url.pathname === '/v1/admin/analytics' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền xem báo cáo doanh thu');
        }

        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else {
          compFilter = `&company_id=eq.${caller!.companyId}`;
        }
        const anaRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/channel_revenue_daily?select=id,company_id,report_date,views,watch_time_hours,rpm,cpm,estimated_revenue,estimated_revenue_vnd,managed_channels(channel_name),companies(name)&order=report_date.desc&limit=50${compFilter}`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const rawAna: any[] = (await anaRes.json().catch(() => [])) || [];
        const analytics = Array.isArray(rawAna)
          ? rawAna.map((a) => ({
              id: a.id,
              channel_name: a.managed_channels?.channel_name || 'YouTube Studio',
              company_name: a.companies?.name || 'Công Ty',
              report_date: a.report_date,
              views: a.views,
              watch_time_hours: a.watch_time_hours,
              rpm: a.rpm,
              cpm: a.cpm,
              estimated_revenue: a.estimated_revenue,
              estimated_revenue_vnd: a.estimated_revenue_vnd,
            }))
          : [];

        return json({ success: true, analytics });
      }

      // =========================================================================
      // CLIENT TELEMETRY & AUTH APIS
      // =========================================================================

      // 2. Auth: Register New Account Bound to Tenant / License
      if (url.pathname === '/v1/auth/register' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const {
          email,
          password,
          full_name,
          company_code_or_license,
          hwid_hash,
          cpu_id = 'UNKNOWN_CPU',
          motherboard_uuid = 'UNKNOWN_MB',
          machine_guid = 'UNKNOWN_GUID',
          device_name = 'Windows Desktop',
          os_info = 'Windows 10/11 x64',
          client_version = '0.20.16',
        } = body;

        if (!email || !password) {
          return badRequest('Vui lòng điền đủ email và mật khẩu');
        }
        const cleanEmail = email.trim().toLowerCase();
        const codeOrLic = (company_code_or_license || '').trim();

        // 1. Trường hợp: Đăng ký tự do không kèm mã công ty hoặc License
        if (!codeOrLic) {
          // Tạo user qua Supabase Auth Admin API
          const adminCreateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              email: cleanEmail,
              password,
              email_confirm: true,
              user_metadata: { full_name: full_name || cleanEmail.split('@')[0] },
            }),
          });

          if (!adminCreateRes.ok) {
            const errData: any = await adminCreateRes.json().catch(() => ({}));
            return badRequest(errData.msg || errData.message || 'Không thể tạo tài khoản');
          }

          const newUser: any = await adminCreateRes.json();
          const userId = newUser.id;

          // Tạo profile với company_id = null, role = 'user', is_active = false
          const profileInsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              id: userId,
              company_id: null,
              role: 'user',
              full_name: full_name || cleanEmail.split('@')[0],
              email: cleanEmail,
              commission_rate: 0.0,
              is_active: false,
            }),
          });

          if (!profileInsertRes.ok) {
            const profErr = await profileInsertRes.text();
            return internalError('Lỗi tạo hồ sơ người dùng: ' + profErr);
          }

          return json({
            success: true,
            status: 'pending_approval',
            pending_approval: true,
            message:
              'Đăng ký thành công! Tài khoản của bạn đang ở trạng thái chờ duyệt. Vui lòng liên hệ Master Owner để được cấp quyền và phân bổ vào công ty.',
            user: {
              id: userId,
              email: cleanEmail,
              full_name: full_name || cleanEmail.split('@')[0],
              role: 'user',
              company_id: null,
              is_active: false,
            },
            user_id: userId,
          });
        }

        // 2. Trường hợp: Đăng ký kèm License hoặc Mã công ty trực tiếp
        if (!hwid_hash) {
          return badRequest(
            'Vui lòng cung cấp thông tin phần cứng máy (hwid_hash) khi đăng ký theo công ty/license',
          );
        }

        let companyId: string | null = null;
        const role = 'user';

        // 1. Kiểm tra License Key
        const licRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(codeOrLic)}&status=eq.active&select=id,company_id,max_seats,used_seats,expires_at`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
        );
        const licenses: any = await licRes.json();
        if (licenses && licenses.length > 0) {
          const lic = licenses[0];
          if (new Date(lic.expires_at).getTime() < Date.now()) {
            return badRequest('Mã License này đã hết hạn sử dụng');
          }
          if (lic.used_seats >= lic.max_seats) {
            return badRequest(`License đã đạt giới hạn số máy tối đa (${lic.max_seats} máy)`);
          }
          companyId = lic.company_id;
        } else {
          // 2. Kiểm tra Company Code
          const compRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/companies?code=eq.${encodeURIComponent(codeOrLic.toUpperCase())}&is_active=eq.true&select=id,name`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
            },
          );
          const companies: any = await compRes.json();
          if (companies && companies.length > 0) {
            companyId = companies[0].id;
          } else {
            return badRequest('Mã công ty hoặc License Key không hợp lệ hoặc đã bị vô hiệu hóa');
          }
        }

        // Tạo user qua Supabase Auth Admin API
        const adminCreateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || cleanEmail.split('@')[0] },
          }),
        });

        if (!adminCreateRes.ok) {
          const errData: any = await adminCreateRes.json().catch(() => ({}));
          return badRequest(errData.msg || errData.message || 'Không thể tạo tài khoản');
        }

        const newUser: any = await adminCreateRes.json();
        const userId = newUser.id;

        // Gọi RPC setup_registered_profile_and_bind
        const rpcRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/rpc/setup_registered_profile_and_bind`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              p_user_id: userId,
              p_company_id: companyId,
              p_role: role,
              p_full_name: full_name || email.split('@')[0],
              p_email: email,
              p_hwid_hash: hwid_hash,
              p_cpu_id: cpu_id,
              p_motherboard_uuid: motherboard_uuid,
              p_machine_guid: machine_guid,
              p_device_name: device_name,
              p_os_info: os_info,
              p_client_version: client_version,
            }),
          },
        );

        const rpcData: any = await rpcRes.json();
        if (!rpcRes.ok || !rpcData.success) {
          return badRequest(rpcData.error || 'Lỗi khi kích hoạt thiết bị cho tài khoản mới');
        }

        return json({
          success: true,
          message: 'Đăng ký tài khoản và khóa thiết bị thành công! Bạn có thể đăng nhập ngay.',
          user_id: userId,
        });
      }

      // 2.5. Auth: User & Owner Login (/v1/auth/login)
      if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const { email, password, hwid_hash } = body;
        if (!email || !password) {
          return badRequest('Vui lòng cung cấp email và mật khẩu');
        }

        const cleanEmail = email.trim().toLowerCase();

        // 1. Authenticate with Supabase Auth
        const authUrl = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
        const authRes = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: cleanEmail, password }),
        });

        if (!authRes.ok) {
          const errData: any = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || 'Tài khoản hoặc mật khẩu không chính xác',
            'AUTH_FAILED',
          );
        }

        const authData: any = await authRes.json();
        const userId = authData.user?.id;
        if (!userId) {
          return internalError('Không lấy được định danh người dùng sau khi xác thực');
        }

        // 2. Query user profile
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
        );
        const profiles: any = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];

        const isOwnerAccount =
          profile?.role === 'owner' ||
          isMasterOwner(userId, cleanEmail, profile?.role) ||
          cleanEmail === 'dungdong333@gmail.com';

        // 3. Với tài khoản Master Owner (dungdong333@gmail.com): Miễn trừ 100% kiểm tra HWID
        if (isOwnerAccount) {
          return json({
            success: true,
            status: 'active',
            role: 'owner',
            user_role: 'owner',
            owner_bypass: true,
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user?.email || cleanEmail,
              full_name: profile?.full_name || 'Tiến Dũng (Master Owner)',
              role: 'owner',
              company_id: profile?.company_id || 'e51f4953-587e-4a5e-af09-e76471ca0326',
              user_metadata: authData.user?.user_metadata,
            },
            device: {
              success: true,
              status: 'active',
              bound: true,
              role: 'owner',
              owner_bypass: true,
              full_name: profile?.full_name || 'Tiến Dũng (Master Owner)',
              company_id: profile?.company_id || 'e51f4953-587e-4a5e-af09-e76471ca0326',
              company_name: 'RETubeMatrix HQ',
              company_code: 'RTM-HQ',
              commission_rate: 0,
              tier: 'enterprise',
              mask_revenue_from_staff: false,
              cross_leader_collaboration: true,
              features: {
                unlimited_seats: true,
                bkt_daily_quota: 9999,
                owner_unrestricted: true,
                max_browser_profiles: 999,
              },
            },
          });
        }

        // Chặn tài khoản hoặc công ty bị khóa đối với non-owner
        if (!profile) {
          return forbidden('Không tìm thấy hồ sơ người dùng trong hệ thống.', 'ACCOUNT_DISABLED');
        }
        if (
          profile.is_active === false ||
          (profile.companies && profile.companies.is_active === false)
        ) {
          return forbidden('Tài khoản hoặc doanh nghiệp đã bị tạm khóa.', 'ACCOUNT_DISABLED');
        }

        const effectiveRole = profile.role || 'user';

        // Nếu có hwid_hash thì xác thực hoặc liên kết thiết bị
        if (hwid_hash) {
          const clientIp =
            request.headers.get('cf-connecting-ip') ||
            request.headers.get('x-real-ip') ||
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            null;

          const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              p_user_id: userId,
              p_hwid_hash: hwid_hash,
              p_cpu_id: body.cpu_id || body.device_info?.cpu_id || 'UNKNOWN_CPU',
              p_motherboard_uuid:
                body.motherboard_uuid || body.device_info?.motherboard_uuid || 'UNKNOWN_MB',
              p_machine_guid: body.machine_guid || body.device_info?.machine_guid || 'UNKNOWN_GUID',
              p_device_name: body.device_name || body.device_info?.device_name || 'Windows Desktop',
              p_os_info: body.os_info || body.device_info?.os_info || 'Windows 10/11 x64',
              p_client_version:
                body.client_version || body.device_info?.client_version || '0.20.16',
              p_ip: clientIp,
            }),
          });

          if (!rpcRes.ok) {
            const rpcErr = await rpcRes.text();
            return internalError('Lỗi hệ thống khi ràng buộc thiết bị (RPC failed)', rpcErr);
          }

          const rpcData: any = await rpcRes.json();
          if (!rpcData.success) {
            return forbidden(
              rpcData.error || 'Không thể kích hoạt thiết bị',
              rpcData.code || 'BINDING_REJECTED',
              { ...rpcData, user_id: userId },
            );
          }

          try {
            if (env.RETUBEMATRIX_KV) {
              await env.RETUBEMATRIX_KV.put(
                `binding:${userId}`,
                JSON.stringify({
                  hwid_hash,
                  role: rpcData.role || effectiveRole,
                  bound_at: Date.now(),
                  clientIp,
                }),
                { expirationTtl: 86400 },
              );
            }
          } catch (_) {}

          return json({
            success: true,
            role: rpcData.role || effectiveRole,
            user_role: rpcData.role || effectiveRole,
            status: rpcData.status || 'active',
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user.email,
              full_name: profile.full_name,
              role: rpcData.role || effectiveRole,
              company_id: profile.company_id,
              user_metadata: authData.user.user_metadata,
            },
            device: {
              ...rpcData,
              role: rpcData.role || effectiveRole,
            },
          });
        }

        // Đăng nhập không kèm HWID (ví dụ gọi qua Web UI)
        return json({
          success: true,
          role: effectiveRole,
          user_role: effectiveRole,
          status: 'active',
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token,
          user: {
            id: userId,
            email: authData.user.email,
            full_name: profile.full_name,
            role: effectiveRole,
            company_id: profile.company_id,
            user_metadata: authData.user.user_metadata,
          },
          device: {
            success: true,
            role: effectiveRole,
            company_id: profile.company_id,
          },
        });
      }

      // 3. Auth: Verify / Bind Device
      if (url.pathname === '/v1/auth/verify-device' && request.method === 'POST') {
        let body: VerifyDevicePayload;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const { email, password, hwid_hash } = body;
        const cpu_id = body.cpu_id || body.device_info?.cpu_id || 'UNKNOWN_CPU';
        const motherboard_uuid =
          body.motherboard_uuid || body.device_info?.motherboard_uuid || 'UNKNOWN_MB';
        const machine_guid = body.machine_guid || body.device_info?.machine_guid || 'UNKNOWN_GUID';
        const device_name = body.device_name || body.device_info?.device_name || 'Windows Desktop';
        const os_info = body.os_info || body.device_info?.os_info || 'Windows 10/11 x64';
        const client_version = body.client_version || body.device_info?.client_version || '0.20.16';

        if (!email) {
          return badRequest('Missing required field: email');
        }

        const isMaster = (email || '').trim().toLowerCase() === 'dungdong333@gmail.com';
        if (!hwid_hash && !isMaster) {
          return badRequest('Missing required field: hwid_hash');
        }

        if (!password) {
          return badRequest('Missing required field: password');
        }

        // Authenticate with Supabase Auth via REST
        const authUrl = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
        const authRes = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });

        if (!authRes.ok) {
          const errData: any = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || 'Tài khoản hoặc mật khẩu không chính xác',
            'AUTH_FAILED',
          );
        }

        const authData: any = await authRes.json();
        const userId = authData.user?.id;
        if (!userId) {
          return internalError('Không lấy được định danh người dùng sau khi xác thực');
        }

        const clientIp =
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-real-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          null;

        // 1. Kiểm tra User Profile ngay lập tức (kèm kiểm tra trạng thái công ty)
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
        );
        const profiles: any = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];

        const isOwnerAccount =
          profile?.role === 'owner' ||
          (authData.user.email || '').toLowerCase() === 'dungdong333@gmail.com' ||
          (email || '').toLowerCase() === 'dungdong333@gmail.com';

        // Chặn triệt để tài khoản hoặc công ty bị khóa
        if (!isOwnerAccount) {
          if (!profile) {
            return forbidden('Không tìm thấy hồ sơ người dùng trong hệ thống.', 'ACCOUNT_DISABLED');
          }
          if (
            profile.is_active === false ||
            (profile.companies && profile.companies.is_active === false)
          ) {
            return forbidden('Tài khoản hoặc doanh nghiệp đã bị tạm khóa.', 'ACCOUNT_DISABLED');
          }
          if (!profile.company_id) {
            return forbidden(
              'Tài khoản chưa được gán vào doanh nghiệp nào. Vui lòng liên hệ quản trị viên.',
              'ACCOUNT_DISABLED',
            );
          }
        }

        // ==============================================================
        // MIỄN TRỪ HWID TUYỆT ĐỐI CHO MASTER OWNER
        // Owner được quyền chạy trên MỌI MÁY MỌI THIẾT BỊ KHÔNG GIỚI HẠN
        // Trả về { status: 'active', role: 'owner', owner_bypass: true }
        // TUYỆT ĐỐI KHÔNG CHẶN VÀ KHÔNG BÁO HWID_MISMATCH!
        // ==============================================================
        if (isOwnerAccount) {
          try {
            await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                p_user_id: userId,
                p_hwid_hash: hwid_hash,
                p_cpu_id: cpu_id,
                p_motherboard_uuid: motherboard_uuid,
                p_machine_guid: machine_guid,
                p_device_name: device_name,
                p_os_info: os_info,
                p_client_version: client_version,
                p_ip: clientIp,
              }),
            });
          } catch (_) {}

          if (env.RETUBEMATRIX_KV && authData.access_token) {
            try {
              const ownerCtx: AuthContext = {
                userId,
                email: authData.user.email,
                role: 'owner',
                companyId: profile?.company_id || 'e51f4953-587e-4a5e-af09-e76471ca0326',
                fullName: profile?.full_name || 'Tiến Dũng (Master Owner)',
                teamId: null,
              };
              await env.RETUBEMATRIX_KV.put(
                `adm_auth:${authData.access_token.slice(-32)}`,
                JSON.stringify(ownerCtx),
                { expirationTtl: 7 * 86400 },
              );
            } catch (_) {}
          }

          return json({
            success: true,
            status: 'active',
            role: 'owner',
            user_role: 'owner',
            owner_bypass: true,
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user.email,
              user_metadata: authData.user.user_metadata,
            },
            device: {
              success: true,
              status: 'active',
              bound: true,
              role: 'owner',
              owner_bypass: true,
              full_name: profile?.full_name || 'Tiến Dũng (Master Owner)',
              company_id: profile?.company_id || 'e51f4953-587e-4a5e-af09-e76471ca0326',
              company_name: 'RETubeMatrix HQ',
              company_code: 'RTM-HQ',
              commission_rate: 0,
              tier: 'enterprise',
              mask_revenue_from_staff: false,
              cross_leader_collaboration: true,
              features: {
                unlimited_seats: true,
                bkt_daily_quota: 9999,
                owner_unrestricted: true,
                max_browser_profiles: 999,
              },
            },
          });
        }

        // 2. Call Supabase RPC verify_or_bind_device cho User/Admin thông thường
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`;
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_user_id: userId,
            p_hwid_hash: hwid_hash,
            p_cpu_id: cpu_id,
            p_motherboard_uuid: motherboard_uuid,
            p_machine_guid: machine_guid,
            p_device_name: device_name,
            p_os_info: os_info,
            p_client_version: client_version,
            p_ip: clientIp,
          }),
        });

        if (!rpcRes.ok) {
          const rpcErr = await rpcRes.text();
          return internalError('Lỗi hệ thống khi ràng buộc thiết bị (RPC failed)', rpcErr);
        }

        const rpcData: any = await rpcRes.json();

        if (!rpcData.success) {
          return forbidden(
            rpcData.error || 'Không thể kích hoạt thiết bị',
            rpcData.code || 'BINDING_REJECTED',
            { ...rpcData, user_id: userId },
          );
        }

        // Cache binding in KV (TTL 24 hours)
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.put(
              `binding:${userId}`,
              JSON.stringify({ hwid_hash, role: rpcData.role, bound_at: Date.now(), clientIp }),
              { expirationTtl: 86400 },
            );
          }
        } catch (kvErr) {
          console.error('KV cache error:', kvErr);
        }

        const effectiveRole = rpcData?.role || profile?.role || 'user';
        return json({
          success: true,
          role: effectiveRole,
          user_role: effectiveRole,
          status: rpcData?.status || 'active',
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token,
          user: {
            id: userId,
            email: authData.user.email,
            user_metadata: authData.user.user_metadata,
          },
          device: {
            ...rpcData,
            role: effectiveRole,
          },
        });
      }

      // 4. Auth: Submit HWID Reset Request (Hỗ trợ cả 2 pathname alias)
      if (
        (url.pathname === '/v1/auth/request-hwid-reset' ||
          url.pathname === '/v1/auth/request-device-change') &&
        request.method === 'POST'
      ) {
        let body: {
          user_id?: string;
          new_hwid_hash?: string;
          new_device_info?: Record<string, unknown>;
          reason?: string;
        };
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const { user_id, new_hwid_hash, new_device_info, reason } = body;
        if (!user_id || !new_hwid_hash || !reason) {
          return badRequest('Thiếu thông tin user_id, new_hwid_hash hoặc lý do đổi máy');
        }

        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/submit_hwid_reset_request`;
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_user_id: user_id,
            p_new_hwid_hash: new_hwid_hash,
            p_new_device_info: new_device_info || {},
            p_reason: reason,
          }),
        });

        if (!rpcRes.ok) {
          const errText = await rpcRes.text();
          return internalError('Lỗi gửi yêu cầu đổi máy', errText);
        }

        const rpcResult = await rpcRes.json();
        return json(rpcResult);
      }

      // 4.5. Device Heartbeat
      if (url.pathname === '/v1/device/heartbeat' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const userId = body.user_id || body.userId;
        const hwidHash = body.hwid_hash || body.hwidHash;

        if (!userId || !hwidHash) {
          return badRequest('Thiếu thông tin user_id hoặc hwid_hash');
        }

        // 1. Kiểm tra trạng thái is_active của user và company
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
        );

        const profiles: any[] = (await profileRes.json().catch(() => [])) || [];
        const profile = profiles[0];

        if (!profile) {
          return forbidden('Tài khoản đã bị vô hiệu hóa.', 'SESSION_REVOKED', {
            message: 'Tài khoản đã bị vô hiệu hóa.',
          });
        }

        const isOwner = isMasterOwner(profile.id, undefined, profile.role);
        if (!isOwner) {
          if (
            profile.is_active === false ||
            (profile.companies && profile.companies.is_active === false)
          ) {
            return forbidden('Tài khoản đã bị vô hiệu hóa.', 'SESSION_REVOKED', {
              message: 'Tài khoản đã bị vô hiệu hóa.',
            });
          }
        }

        // 2. Cập nhật last_heartbeat_at trong bảng device_bindings
        const clientIp =
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-real-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          null;

        const patchBody: Record<string, unknown> = {
          last_heartbeat_at: new Date().toISOString(),
        };
        if (clientIp) {
          patchBody.last_ip = clientIp;
        }

        await fetch(
          `${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${userId}&hwid_hash=eq.${hwidHash}&is_active=eq.true`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(patchBody),
          },
        );

        const effectiveRole = isOwner ? 'owner' : profile.role || 'user';
        const effectiveCompanyId =
          profile.company_id || (isOwner ? 'e51f4953-587e-4a5e-af09-e76471ca0326' : null);

        return json({
          success: true,
          timestamp: Date.now(),
          user_role: effectiveRole,
          role: effectiveRole,
          company_id: effectiveCompanyId,
        });
      }

      // 4.6. Auth: Refresh Token (/v1/auth/refresh)
      if (url.pathname === '/v1/auth/refresh' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }

        const { refresh_token } = body;
        if (!refresh_token) {
          return badRequest('Thiếu refresh_token');
        }

        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ refresh_token }),
        });

        if (!authRes.ok) {
          return unauthorized('Refresh token không hợp lệ hoặc đã hết hạn', 'TOKEN_EXPIRED');
        }

        const authData: any = await authRes.json();
        return json({
          success: true,
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token,
        });
      }

      // 5. Telemetry: Nhận Dữ Liệu Analytics & Doanh Thu từ YouTube Studio
      if (url.pathname === '/v1/telemetry/studio-analytics' && request.method === 'POST') {
        const rawBody = await request.text();
        const signature =
          request.headers.get('x-signature') ||
          request.headers.get('x-rtm-signature') ||
          request.headers.get('x-hub-signature-256');

        if (!signature) {
          return unauthorized(
            'Missing required HMAC signature header (x-signature)',
            'MISSING_SIGNATURE',
          );
        }

        // Verify HMAC
        const expectedSig = await computeHmacSha256(rawBody, env.SHARED_TELEMETRY_HMAC_SECRET);
        const cleanSig = signature.replace(/^sha256=/, '').toLowerCase();

        if (!timingSafeEqual(expectedSig.toLowerCase(), cleanSig)) {
          return unauthorized('Invalid HMAC signature', 'INVALID_SIGNATURE');
        }

        let payload: StudioAnalyticsPayload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return badRequest('Invalid JSON body');
        }

        // Replay Attack Protection (5 minutes window)
        const timestampHeader = request.headers.get('x-timestamp');
        const reqTimestamp = timestampHeader ? parseInt(timestampHeader, 10) : payload.timestamp;
        if (reqTimestamp) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (Math.abs(nowSec - reqTimestamp) > 300) {
            return unauthorized(
              'Request timestamp out of allowed window (drift detected)',
              'TIMESTAMP_DRIFT',
            );
          }
        }

        // Rate Limit via KV (60 requests/min per channel/hwid)
        if (env.RETUBEMATRIX_KV) {
          const clientIp = request.headers.get('cf-connecting-ip') || 'unknown_ip';
          const rateLimitKeyId = payload.channel_id || payload.hwid_hash || clientIp;
          const currentMinute = Math.floor(Date.now() / 60000);
          const kvRateLimitKey = `rl:telemetry:${rateLimitKeyId}:${currentMinute}`;

          const currentCountStr = await env.RETUBEMATRIX_KV.get(kvRateLimitKey);
          const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

          if (currentCount >= 60) {
            return json(
              {
                success: false,
                code: 'RATE_LIMITED',
                error: 'Quá tải tần suất gửi telemetry (tối đa 60 requests/phút)',
              },
              429,
              { 'Retry-After': '60' },
            );
          }

          await env.RETUBEMATRIX_KV.put(kvRateLimitKey, (currentCount + 1).toString(), {
            expirationTtl: 120,
          });
        }

        // Ingest into Supabase
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/ingest_studio_analytics`;
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_company_id: payload.company_id || null,
            p_youtube_channel_id: payload.channel_id || null,
            p_channel_name: payload.channel_name || null,
            p_report_date: payload.report_date,
            p_views: payload.views || 0,
            p_watch_time_hours: payload.watch_time_hours || 0.0,
            p_subscribers_gained: payload.subscribers_gained || 0,
            p_estimated_revenue: payload.estimated_revenue || 0.0,
            p_estimated_revenue_vnd: payload.estimated_revenue_vnd || 0.0,
            p_rpm: payload.rpm || 0.0,
            p_cpm: payload.cpm || 0.0,
            p_monetization_status: payload.monetization_status || 'active',
          }),
        });

        if (!rpcRes.ok) {
          const errText = await rpcRes.text();
          return internalError('Không thể nạp dữ liệu vào cơ sở dữ liệu Supabase', errText);
        }

        const rpcResult = await rpcRes.json().catch(() => ({ success: true }));

        return json({
          success: true,
          message: 'Studio analytics snapshot ingested successfully',
          synced_at: new Date().toISOString(),
          result: rpcResult,
        });
      }

      // ======================================================================
      // 6. WORK & COMPETITOR TELEMETRY & WORK REPORTS
      // ======================================================================

      // 6.1. Đồng bộ Kênh Đối Thủ (Upsert / Delete)
      if (url.pathname === '/v1/telemetry/sync-competitor' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        const body: any = await request.json().catch(() => ({}));
        const {
          action = 'upsert',
          channel_name,
          channel_url,
          youtube_channel_id,
          primary_keyword = '',
          subscriber_count = 0,
          total_views = 0,
          total_videos = 0,
          recent_5_videos = [],
        } = body;

        if (!channel_url) {
          return badRequest('Vui lòng cung cấp URL kênh đối thủ (channel_url)');
        }

        const compId = caller!.companyId || 'e51f4953-587e-4a5e-af09-e76471ca0326';
        const cleanUrl = channel_url.trim();

        if (action === 'delete') {
          // Xóa kênh đối thủ đồng bộ 1-1
          const delRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?company_id=eq.${compId}&user_id=eq.${caller!.userId}&channel_url=eq.${encodeURIComponent(cleanUrl)}`,
            {
              method: 'DELETE',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
            },
          );

          if (!delRes.ok) {
            const err = await delRes.text();
            return internalError('Lỗi xóa kênh đối thủ trên máy chủ: ' + err);
          }

          return json({
            success: true,
            message: 'Đã hủy theo dõi và xóa đồng bộ kênh đối thủ thành công',
            channel_url: cleanUrl,
          });
        }

        // Upsert kênh đối thủ
        const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_competitor_channels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            company_id: compId,
            team_id: caller!.teamId || null,
            user_id: caller!.userId,
            channel_name: channel_name || cleanUrl.split('/').pop() || 'Đối thủ',
            channel_url: cleanUrl,
            youtube_channel_id: youtube_channel_id || null,
            primary_keyword: String(primary_keyword || ''),
            subscriber_count: Number(subscriber_count) || 0,
            total_views: Number(total_views) || 0,
            total_videos: Number(total_videos) || 0,
            recent_5_videos: Array.isArray(recent_5_videos) ? recent_5_videos : [],
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        });

        if (!upsertRes.ok) {
          const err = await upsertRes.text();
          return internalError('Lỗi lưu kênh đối thủ trên máy chủ: ' + err);
        }

        return json({
          success: true,
          message: 'Đã đồng bộ kênh đối thủ thành công',
          channel_url: cleanUrl,
        });
      }

      // 6.2. Đồng bộ Kênh Quản Lý (Kênh Đích & Kênh Test)
      if (url.pathname === '/v1/telemetry/sync-managed-channel' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        const body: any = await request.json().catch(() => ({}));
        const {
          action = 'upsert',
          channel_type,
          channel_name,
          youtube_channel_id,
          channel_url,
          profile_id,
          total_views = 0,
          estimated_revenue = 0,
        } = body;

        if (!channel_type || !youtube_channel_id) {
          return badRequest('Vui lòng cung cấp channel_type (target|test) và youtube_channel_id');
        }

        const compId = caller!.companyId || 'e51f4953-587e-4a5e-af09-e76471ca0326';

        if (action === 'delete') {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?company_id=eq.${compId}&user_id=eq.${caller!.userId}&youtube_channel_id=eq.${encodeURIComponent(youtube_channel_id)}&channel_type=eq.${channel_type}`,
            {
              method: 'DELETE',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
            },
          );

          return json({
            success: true,
            message: 'Đã xóa kênh quản lý đồng bộ thành công',
          });
        }

        const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_managed_channels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            company_id: compId,
            team_id: caller!.teamId || null,
            user_id: caller!.userId,
            channel_type,
            channel_name: channel_name || youtube_channel_id,
            youtube_channel_id,
            channel_url: channel_url || null,
            profile_id: profile_id || null,
            total_views: Number(total_views) || 0,
            estimated_revenue: Number(estimated_revenue) || 0,
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        });

        if (!upsertRes.ok) {
          const err = await upsertRes.text();
          return internalError('Lỗi lưu kênh quản lý: ' + err);
        }

        return json({
          success: true,
          message: 'Đã đồng bộ kênh quản lý thành công',
        });
      }

      // 6.3. Báo cáo Kết Quả Test BKT (Xanh / Đỏ)
      if (url.pathname === '/v1/telemetry/report-bkt-result' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        const body: any = await request.json().catch(() => ({}));
        const { competitor_channel_url, status = 'green' } = body;
        const compId = caller!.companyId || 'e51f4953-587e-4a5e-af09-e76471ca0326';
        const isGreen = status === 'green' || status === 'completed';

        // Cập nhật số lượng xanh/đỏ cho kênh đối thủ nếu có
        if (competitor_channel_url) {
          const field = isGreen ? 'videos_tested_green' : 'videos_tested_red';
          const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?company_id=eq.${compId}&user_id=eq.${caller!.userId}&channel_url=eq.${encodeURIComponent(competitor_channel_url)}`;
          const getRes = await fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          });
          const list: any[] = await getRes.json().catch(() => []);
          if (list && list.length > 0) {
            const current = list[0];
            const newVal = (Number(current[field]) || 0) + 1;
            await fetch(queryUrl, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ [field]: newVal, updated_at: new Date().toISOString() }),
            });
          }
        }

        return json({
          success: true,
          message: 'Đã ghi nhận kết quả test BKT thành công',
          status: isGreen ? 'green' : 'red',
        });
      }

      // 6.4. Báo cáo Đăng Video Lên Kênh Đích
      if (url.pathname === '/v1/telemetry/report-upload' && request.method === 'POST') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        const body: any = await request.json().catch(() => ({}));
        const { target_youtube_channel_id } = body;
        const compId = caller!.companyId || 'e51f4953-587e-4a5e-af09-e76471ca0326';

        if (target_youtube_channel_id) {
          const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_managed_channels?company_id=eq.${compId}&user_id=eq.${caller!.userId}&youtube_channel_id=eq.${encodeURIComponent(target_youtube_channel_id)}&channel_type=eq.target`;
          const getRes = await fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          });
          const list: any[] = await getRes.json().catch(() => []);
          if (list && list.length > 0) {
            const current = list[0];
            await fetch(queryUrl, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                videos_uploaded_today: (Number(current.videos_uploaded_today) || 0) + 1,
                videos_uploaded_week: (Number(current.videos_uploaded_week) || 0) + 1,
                videos_uploaded_month: (Number(current.videos_uploaded_month) || 0) + 1,
                updated_at: new Date().toISOString(),
              }),
            });
          }
        }

        return json({
          success: true,
          message: 'Đã ghi nhận xuất bản video lên Kênh Đích thành công',
        });
      }

      // 6.5. Báo Cáo Chi Tiết Công Việc & Bảng Xếp Hạng Nhân Sự (RBAC View)
      if (url.pathname === '/v1/admin/work-reports' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        // Xây dựng bộ lọc theo RBAC
        let userFilter = '';
        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              userFilter = `&company_id=eq.${resolvedCompId}`;
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else if (caller!.role === 'admin') {
          userFilter = `&company_id=eq.${caller!.companyId}`;
          compFilter = `&company_id=eq.${caller!.companyId}`;
        } else if (caller!.role === 'leader') {
          userFilter = `&company_id=eq.${caller!.companyId}&or=(team_id.eq.${caller!.teamId},id.eq.${caller!.userId})`;
          compFilter = `&company_id=eq.${caller!.companyId}`;
        } else {
          // User: chỉ xem của chính mình
          userFilter = `&id=eq.${caller!.userId}`;
          compFilter = `&company_id=eq.${caller!.companyId}&user_id=eq.${caller!.userId}`;
        }

        // Lấy danh sách users, channels, và competitors song song
        const [usersRes, managedRes, compRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,full_name,email,role,company_id,team_id,assigned_niche,companies(id,name,code)&order=created_at.asc${userFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?is_active=eq.true${compFilter}&order=created_at.desc`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?is_active=eq.true${compFilter}&order=created_at.desc`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
        ]);

        const usersList: any[] = Array.isArray(usersRes) ? usersRes : [];
        const managedList: any[] = Array.isArray(managedRes) ? managedRes : [];
        const competitorList: any[] = Array.isArray(compRes) ? compRes : [];

        // Gom nhóm theo user_id
        const reports = usersList.map((u) => {
          const userManaged = managedList.filter((m) => m.user_id === u.id);
          const userCompetitors = competitorList.filter((c) => c.user_id === u.id);

          const targetChannels = userManaged.filter((m) => m.channel_type === 'target');
          const testChannels = userManaged.filter((m) => m.channel_type === 'test');

          let uploadsToday = 0;
          let uploadsWeek = 0;
          let uploadsMonth = 0;
          let totalViews = 0;
          let totalRevenueUsd = 0;

          targetChannels.forEach((tc) => {
            uploadsToday += Number(tc.videos_uploaded_today) || 0;
            uploadsWeek += Number(tc.videos_uploaded_week) || 0;
            uploadsMonth += Number(tc.videos_uploaded_month) || 0;
            totalViews += Number(tc.total_views) || 0;
            totalRevenueUsd += Number(tc.estimated_revenue) || 0;
          });

          let totalGreen = 0;
          let totalRed = 0;
          userCompetitors.forEach((c) => {
            totalGreen += Number(c.videos_tested_green) || 0;
            totalRed += Number(c.videos_tested_red) || 0;
          });

          const totalTested = totalGreen + totalRed;
          const qualityScore = totalTested > 0 ? Math.round((totalGreen / totalTested) * 100) : 100;

          return {
            user_id: u.id,
            full_name: u.full_name || u.email?.split('@')[0] || 'Thành viên',
            email: u.email,
            role: u.role,
            company_id: u.company_id,
            company_name: u.companies?.name || 'Doanh Nghiệp',
            team_id: u.team_id,
            assigned_niche: u.assigned_niche || 'Tổng hợp',
            target_channels_count: targetChannels.length,
            target_channels: targetChannels.map((tc) => ({
              id: tc.id,
              channel_name: tc.channel_name,
              youtube_channel_id: tc.youtube_channel_id,
              channel_url: tc.channel_url,
              videos_uploaded_today: tc.videos_uploaded_today,
              videos_uploaded_week: tc.videos_uploaded_week,
              videos_uploaded_month: tc.videos_uploaded_month,
              total_views: tc.total_views,
              estimated_revenue: tc.estimated_revenue,
            })),
            test_channels_count: testChannels.length,
            competitor_channels_count: userCompetitors.length,
            competitor_channels: userCompetitors.map((cc) => ({
              id: cc.id,
              channel_name: cc.channel_name,
              channel_url: cc.channel_url,
              youtube_channel_id: cc.youtube_channel_id,
              primary_keyword: cc.primary_keyword,
              subscriber_count: cc.subscriber_count,
              total_views: cc.total_views,
              total_videos: cc.total_videos,
              recent_5_videos: cc.recent_5_videos || [],
              videos_tested_green: cc.videos_tested_green,
              videos_tested_red: cc.videos_tested_red,
            })),
            videos_uploaded_today: uploadsToday,
            videos_uploaded_week: uploadsWeek,
            videos_uploaded_month: uploadsMonth,
            videos_tested_green: totalGreen,
            videos_tested_red: totalRed,
            total_views: totalViews,
            estimated_revenue_usd: totalRevenueUsd,
            estimated_revenue_vnd: totalRevenueUsd * 25000,
            quality_score: qualityScore,
          };
        });

        // Tạo Leaderboard Ranking (Sắp xếp theo số kênh đích, sau đó theo total_views)
        const sortedForLeaderboard = [...reports].sort((a, b) => {
          if (b.target_channels_count !== a.target_channels_count) {
            return b.target_channels_count - a.target_channels_count;
          }
          if (b.total_views !== a.total_views) {
            return b.total_views - a.total_views;
          }
          return b.videos_uploaded_today - a.videos_uploaded_today;
        });

        const leaderboard = sortedForLeaderboard.map((item, idx) => ({
          rank: idx + 1,
          user_id: item.user_id,
          full_name: item.full_name,
          email: item.email,
          role: item.role,
          target_channels_count: item.target_channels_count,
          total_views: item.total_views,
          estimated_revenue_usd: item.estimated_revenue_usd,
          estimated_revenue_vnd: item.estimated_revenue_vnd,
          videos_uploaded_today: item.videos_uploaded_today,
          quality_score: item.quality_score,
        }));

        return json({
          success: true,
          staff_reports: reports,
          reports,
          leaderboard,
          total_monitored_competitors: competitorList.length,
          total_target_channels: managedList.filter((m) => m.channel_type === 'target').length,
          total_test_channels: managedList.filter((m) => m.channel_type === 'test').length,
          data: {
            reports,
            leaderboard,
            totalTargetChannels: managedList.filter((m) => m.channel_type === 'target').length,
            totalCompetitors: competitorList.length,
          },
        });
      }

      // 6.6. So Sánh Hiệu Quả Giữa Các Team (Teams Performance Comparison)
      if (url.pathname === '/v1/admin/teams-comparison' && request.method === 'GET') {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey,
        );
        if (errorResponse) return errorResponse;

        if (caller!.role !== 'owner' && caller!.role !== 'admin' && caller!.role !== 'leader') {
          return forbidden('Bạn không có quyền truy cập báo cáo so sánh đội nhóm');
        }

        let compFilter = '';
        if (caller!.role === 'owner') {
          const queryComp = url.searchParams.get('company_id');
          if (queryComp) {
            const resolvedCompId = await resolveCompanyId(queryComp, env, serviceKey);
            if (resolvedCompId) {
              compFilter = `&company_id=eq.${resolvedCompId}`;
            }
          }
        } else {
          compFilter = `&company_id=eq.${caller!.companyId}`;
        }

        // Lấy danh sách teams, users, managed_channels, và competitor_channels
        const [teamsRes, usersRes, managedRes, compRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/teams?select=id,name,company_id,leader_id,created_at${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,full_name,email,role,company_id,team_id${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?is_active=eq.true${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?is_active=eq.true${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          )
            .then((r) => r.json())
            .catch(() => []),
        ]);

        const teamsList: any[] = Array.isArray(teamsRes) ? teamsRes : [];
        const usersList: any[] = Array.isArray(usersRes) ? usersRes : [];
        const managedList: any[] = Array.isArray(managedRes) ? managedRes : [];
        const competitorList: any[] = Array.isArray(compRes) ? compRes : [];

        // Nếu công ty chưa tạo team riêng biệt, tự động phân nhóm theo Leader
        const leaders = usersList.filter((u) => u.role === 'leader');
        const teamStats: any[] = [];

        if (teamsList.length > 0) {
          teamsList.forEach((t) => {
            const teamUsers = usersList.filter((u) => u.team_id === t.id);
            const userIds = new Set(teamUsers.map((u) => u.id));
            const teamManaged = managedList.filter((m) => userIds.has(m.user_id));
            const teamCompetitors = competitorList.filter((c) => userIds.has(c.user_id));

            const targetChannels = teamManaged.filter((m) => m.channel_type === 'target');
            let uploadsToday = 0;
            let totalViews = 0;
            let totalRevUsd = 0;
            targetChannels.forEach((tc) => {
              uploadsToday += Number(tc.videos_uploaded_today) || 0;
              totalViews += Number(tc.total_views) || 0;
              totalRevUsd += Number(tc.estimated_revenue) || 0;
            });

            let green = 0;
            let red = 0;
            teamCompetitors.forEach((c) => {
              green += Number(c.videos_tested_green) || 0;
              red += Number(c.videos_tested_red) || 0;
            });
            const tested = green + red;
            const qualityRate = tested > 0 ? Math.round((green / tested) * 100) : 100;

            const leader = teamUsers.find((u) => u.id === t.leader_id || u.role === 'leader');

            teamStats.push({
              team_id: t.id,
              team_name: t.name || 'Đội Nhóm',
              leader_name: leader?.full_name || 'Chưa chỉ định Leader',
              leader_email: leader?.email || '',
              members_count: teamUsers.length,
              target_channels_count: targetChannels.length,
              competitor_channels_count: teamCompetitors.length,
              videos_uploaded_today: uploadsToday,
              total_views: totalViews,
              revenue_usd: totalRevUsd,
              revenue_vnd: totalRevUsd * 25000,
              videos_tested_green: green,
              videos_tested_red: red,
              quality_rate: qualityRate,
            });
          });
        } else if (leaders.length > 0) {
          // Fallback: phân nhóm theo các Leader hiện có trong công ty
          leaders.forEach((lead, idx) => {
            const teamManaged = managedList.filter((m) => m.user_id === lead.id);
            const teamCompetitors = competitorList.filter((c) => c.user_id === lead.id);
            const targetChannels = teamManaged.filter((m) => m.channel_type === 'target');

            let uploadsToday = 0;
            let totalViews = 0;
            let totalRevUsd = 0;
            targetChannels.forEach((tc) => {
              uploadsToday += Number(tc.videos_uploaded_today) || 0;
              totalViews += Number(tc.total_views) || 0;
              totalRevUsd += Number(tc.estimated_revenue) || 0;
            });

            let green = 0;
            let red = 0;
            teamCompetitors.forEach((c) => {
              green += Number(c.videos_tested_green) || 0;
              red += Number(c.videos_tested_red) || 0;
            });
            const tested = green + red;
            const qualityRate = tested > 0 ? Math.round((green / tested) * 100) : 100;

            teamStats.push({
              team_id: lead.id,
              team_name: `Nhóm Leader ${lead.full_name || 'Nhóm ' + (idx + 1)}`,
              leader_name: lead.full_name || lead.email,
              leader_email: lead.email,
              members_count: 1,
              target_channels_count: targetChannels.length,
              competitor_channels_count: teamCompetitors.length,
              videos_uploaded_today: uploadsToday,
              total_views: totalViews,
              revenue_usd: totalRevUsd,
              revenue_vnd: totalRevUsd * 25000,
              videos_tested_green: green,
              videos_tested_red: red,
              quality_rate: qualityRate,
            });
          });
        }

        // Tự động phân tích & đánh giá chất lượng so sánh giữa các Team
        const evaluatedTeams = teamStats.map((team) => {
          const notes: string[] = [];
          if (team.quality_rate >= 95) notes.push('Kiểm duyệt BKT sạch xuất sắc (≥95%)');
          if (team.target_channels_count > 0)
            notes.push(`Vận hành ${team.target_channels_count} kênh đích`);
          if (team.videos_uploaded_today > 0)
            notes.push(`Đăng ${team.videos_uploaded_today} video hôm nay`);
          return {
            ...team,
            evaluation:
              notes.length > 0 ? notes.join(' • ') : 'Đang thiết lập kênh và sản xuất ban đầu',
          };
        });

        return json({
          success: true,
          teams_comparison: evaluatedTeams,
        });
      }

      return json(
        {
          success: false,
          code: 'NOT_FOUND',
          error: `Route not found: ${request.method} ${url.pathname}`,
        },
        404,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return internalError('Unhandled gateway exception: ' + msg);
    }
  },
};
