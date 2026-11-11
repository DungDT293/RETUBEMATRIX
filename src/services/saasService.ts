import { createClient } from '@supabase/supabase-js';
import type {
  Company,
  HwidResetStatus,
  License,
  LicenseStatus,
  LicenseTier,
  Proposal,
  ProposalStatus,
  ProposalType,
  UserProfile,
  UserRole,
} from '../types/auth';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://pgfvolnxtvnmvoxnwsza.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZnZvbG54dHZubXZveG53c3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDg0MDcsImV4cCI6MjEwOTc4NDQwN30.fk-THKxFxXQgNVf_U62FkaiO3xc8TmIDLpyUyJVEKT4';

export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL || 'https://retubematrix-gateway.dungdong333.workers.dev';

export function getSupabaseClient(accessToken?: string | null) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

// ----------------------------------------------------------------------------
// 1. OWNER MASTER SAAS SERVICES
// ----------------------------------------------------------------------------

export interface TenantWithLicense extends Company {
  licenses?: License[];
  userCount?: number;
  activeDeviceCount?: number;
}

export async function fetchAllTenants(accessToken: string): Promise<TenantWithLicense[]> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('companies')
    .select('*, licenses(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function issueNewLicense(
  accessToken: string,
  payload: {
    companyId: string;
    tier: LicenseTier;
    maxSeats: number;
    daysValid: number;
    features?: Record<string, unknown>;
  },
): Promise<{ success: boolean; license?: License; error?: string }> {
  const supabase = getSupabaseClient(accessToken);
  const keyRandom = Math.random().toString(36).substring(2, 6).toUpperCase();
  const keyRandom2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const keyRandom3 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const licenseKey = `RTM-${payload.tier.toUpperCase()}-${keyRandom}-${keyRandom2}-${keyRandom3}`;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + payload.daysValid);

  const { data: userRes } = await supabase.auth.getUser();
  const issuedBy = userRes.user?.id;
  if (!issuedBy) return { success: false, error: 'Chưa đăng nhập' };

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      company_id: payload.companyId,
      license_key: licenseKey,
      tier: payload.tier,
      status: 'active',
      issued_by: issuedBy,
      max_seats: payload.maxSeats,
      valid_from: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      features: payload.features || {
        max_browser_profiles: payload.tier === 'enterprise' ? 999 : 20,
        bkt_daily_quota: payload.tier === 'enterprise' ? 999 : 30,
        allow_cross_leader_collab: true,
      },
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, license: data };
}

export async function revokeLicense(
  accessToken: string,
  licenseId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient(accessToken);
  const { error } = await supabase
    .from('licenses')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', licenseId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ----------------------------------------------------------------------------
// 2. ADMIN COMPANY & HWID RESET SERVICES
// ----------------------------------------------------------------------------

export interface HwidResetRequestItem {
  id: string;
  userId: string;
  companyId: string;
  licenseId: string;
  currentHwidHash: string;
  newHwidHash: string;
  newDeviceInfo: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedAt: string;
  userProfiles?: { fullName: string; email: string; role: string };
}

export async function fetchHwidResetRequests(
  accessToken: string,
  companyId: string,
): Promise<HwidResetRequestItem[]> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('hwid_reset_requests')
    .select('*, user_profiles:user_id(full_name, email, role)')
    .eq('company_id', companyId)
    .order('requested_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    companyId: String(row.company_id || ''),
    licenseId: String(row.license_id || ''),
    currentHwidHash: String(row.current_hwid_hash || ''),
    newHwidHash: String(row.new_hwid_hash || ''),
    newDeviceInfo: (row.new_device_info as Record<string, unknown>) || {},
    reason: String(row.reason || ''),
    status: row.status as HwidResetStatus,
    adminNotes: row.admin_notes ? String(row.admin_notes) : undefined,
    requestedAt: String(row.requested_at || ''),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    userProfiles: row.user_profiles as
      | { fullName: string; email: string; role: UserRole }
      | undefined,
  }));
}

export async function reviewHwidResetRequest(
  accessToken: string,
  requestId: string,
  approved: boolean,
  notes?: string,
): Promise<{ success: boolean; message?: string }> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase.rpc('review_hwid_reset_request', {
    p_request_id: requestId,
    p_approved: approved,
    p_notes: notes || null,
  });

  if (error) return { success: false, message: error.message };
  return data;
}

export async function fetchCompanyStaff(
  accessToken: string,
  companyId: string,
): Promise<UserProfile[]> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*, teams(*)')
    .eq('company_id', companyId)
    .order('role', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    companyId: String(row.company_id || ''),
    role: row.role as UserRole,
    teamId: row.team_id ? String(row.team_id) : undefined,
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    teams: row.teams as UserProfile['teams'],
  }));
}

export async function updateCompanySettings(
  accessToken: string,
  companyId: string,
  settings: {
    maskRevenueFromStaff?: boolean;
    crossLeaderCollaboration?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient(accessToken);
  const { error } = await supabase
    .from('companies')
    .update({
      ...(settings.maskRevenueFromStaff !== undefined && {
        mask_revenue_from_staff: settings.maskRevenueFromStaff,
      }),
      ...(settings.crossLeaderCollaboration !== undefined && {
        cross_leader_collaboration: settings.crossLeaderCollaboration,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ----------------------------------------------------------------------------
// 3. LEADER TEAM & PROPOSAL SERVICES
// ----------------------------------------------------------------------------

export async function fetchProposals(accessToken: string, companyId: string): Promise<Proposal[]> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('proposals')
    .select('*, user_profiles:submitted_by(full_name, email)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ''),
    companyId: String(row.company_id || ''),
    teamId: row.team_id ? String(row.team_id) : undefined,
    submittedBy: String(row.submitted_by || ''),
    proposalType: row.proposal_type as ProposalType,
    targetValue: String(row.target_value || ''),
    targetName: row.target_name ? String(row.target_name) : undefined,
    nicheId: row.niche_id ? String(row.niche_id) : undefined,
    metadata: (row.metadata as Record<string, unknown>) || {},
    reason: String(row.reason || ''),
    status: row.status as ProposalStatus,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewNotes: row.review_notes ? String(row.review_notes) : undefined,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }));
}

export async function submitProposal(
  accessToken: string,
  payload: {
    proposalType: ProposalType;
    targetValue: string;
    targetName?: string;
    reason: string;
    nicheId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ success: boolean; proposal_id?: string; message?: string }> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase.rpc('submit_proposal', {
    p_proposal_type: payload.proposalType,
    p_target_value: payload.targetValue,
    p_target_name: payload.targetName || '',
    p_reason: payload.reason,
    p_niche_id: payload.nicheId || null,
    p_metadata: payload.metadata || {},
  });

  if (error) return { success: false, message: error.message };
  return data;
}

export async function fetchCrossLeaderKeywords(
  accessToken: string,
  companyId: string,
): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('keywords')
    .select('*, niches(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function createAdminUser(
  payload: {
    email: string;
    password: string;
    fullName: string;
    companyId: string;
    role: UserRole;
  },
  token?: string | null,
): Promise<{ success: boolean; user?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/users/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        full_name: payload.fullName,
        company_id: payload.companyId,
        role: payload.role,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: String(data.error || data.message || 'Lỗi khi cấp tài khoản mới'),
      };
    }
    return { success: true, user: data.user as Record<string, unknown> };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------------------------------
// 4. CLOUD GATEWAY ADMIN SYNC SERVICES
// ----------------------------------------------------------------------------

export async function issueCloudLicense(
  payload: {
    companyId: string;
    tier: LicenseTier;
    maxSeats: number;
    expiresInDays: number;
  },
  token?: string | null,
): Promise<{ success: boolean; license?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/licenses/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        company_id: payload.companyId,
        tier: payload.tier,
        max_seats: payload.maxSeats,
        expires_in_days: payload.expiresInDays,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: String(data.error || data.message || 'Lỗi cấp License trên Cloudflare Gateway'),
      };
    }
    return {
      success: true,
      license: (data.license || data) as Record<string, unknown>,
    };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function updateCloudCompanyStatus(
  companyId: string,
  isActive: boolean,
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/companies/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        company_id: companyId,
        is_active: isActive,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: String(
          data.error || data.message || 'Lỗi cập nhật trạng thái công ty trên Cloudflare Gateway',
        ),
      };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function performCloudLicenseAction(
  payload: {
    licenseId: string;
    action: 'add_seats' | 'extend' | LicenseStatus;
    seats?: number;
    days?: number;
  },
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/licenses/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        license_id: payload.licenseId,
        action: payload.action,
        ...(payload.seats !== undefined ? { seats: payload.seats } : {}),
        ...(payload.days !== undefined ? { days: payload.days } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: String(data.error || data.message || 'Lỗi thao tác license trên Cloudflare Gateway'),
      };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function unbindCloudDevice(
  bindingId: string,
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/devices/unbind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ binding_id: bindingId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: String(
          data.error || data.message || 'Lỗi hủy liên kết máy trạm trên Cloudflare Gateway',
        ),
      };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export async function reviewCloudDeviceReset(
  requestId: string,
  action: 'approve' | 'reject',
  token?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/admin/devices/review-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        request_id: requestId,
        action,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.success === false) {
      return {
        success: false,
        error: String(
          data.error || data.message || 'Lỗi duyệt yêu cầu đổi máy trạm trên Cloudflare Gateway',
        ),
      };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
