import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Lock,
  Medal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Tv,
  Unlock,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isOwnerEmail, useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getSupabaseClient } from '@/services/saasService';
import type { LicenseStatus, LicenseTier } from '@/types/auth';

// ============================================================================
// DATA MODELS
// ============================================================================

export interface TenantRecord {
  id: string;
  name: string;
  code: string;
  adminEmail: string;
  isActive: boolean;
  userCount: number;
  activeDeviceCount: number;
  licenseTier: LicenseTier;
  licenseStatus: LicenseStatus;
  licenseKey?: string;
  maxSeats: number;
  usedSeats: number;
  expiresAt: string;
  createdAt: string;
  assignedNiches: string[];
}

export interface MasterLicenseRecord {
  id: string;
  licenseKey: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  tier: LicenseTier;
  status: LicenseStatus;
  maxSeats: number;
  usedSeats: number;
  validFrom: string;
  expiresAt: string;
  features: {
    maxBrowserProfiles: number;
    bktDailyQuota: number;
    allowCrossLeaderCollab: boolean;
  };
}

export interface OnlineDeviceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  deviceName: string;
  osInfo: string;
  clientVersion: string;
  hwidHash: string;
  lastIp: string;
  lastHeartbeatAt: string;
  isActive: boolean;
  status: 'online' | 'idle' | 'offline';
}

export interface MemberRecord {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'leader' | 'user';
  companyId?: string | null;
  companyName?: string;
  companyCode?: string;
  isActive: boolean;
  assignedNiche: string;
  hasDeviceBound?: boolean;
  boundDevice?: {
    bindingId?: string;
    deviceName?: string;
    osInfo?: string;
    hwidHash?: string;
    lastIp?: string;
    lastHeartbeatAt?: string;
  } | null;
  createdAt: string;
}

interface RawCompanyApi {
  id: string;
  name: string;
  code: string;
  owner_email?: string;
  is_active?: boolean;
  user_count?: number;
  active_device_count?: number;
  tier?: string;
  license_key?: string;
  max_seats?: number;
  expires_at?: string;
  created_at?: string;
  assigned_niches?: string[];
  assignedNiches?: string[];
  licenses?: Array<{
    license_key?: string;
    tier?: string;
    status?: string;
    max_seats?: number;
    used_seats?: number;
    expires_at?: string;
  }>;
}

interface RawLicenseApi {
  id: string;
  license_key: string;
  company_id: string;
  company_name: string;
  company_code: string;
  tier?: string;
  status?: string;
  max_seats?: number;
  used_seats?: number;
  valid_from?: string;
  created_at?: string;
  expires_at?: string;
  features?: {
    max_browser_profiles?: number;
    bkt_daily_quota?: number;
    allow_cross_leader_collab?: boolean;
  };
}

interface RawDeviceApi {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  company_id?: string;
  company_name?: string;
  company_code?: string;
  device_name?: string;
  os_info?: string;
  client_version?: string;
  hwid_hash?: string;
  last_ip?: string;
  last_heartbeat_at?: string;
  updated_at?: string;
  is_active?: boolean;
  user_profiles?: {
    full_name?: string;
    email?: string;
    role?: string;
  };
  companies?: {
    id?: string;
    name?: string;
    code?: string;
  };
}

interface RawUserApi {
  id: string;
  email: string;
  full_name?: string;
  role?: MemberRecord['role'];
  company_id?: string | null;
  company_name?: string;
  company_code?: string;
  is_active?: boolean;
  assigned_niche?: string;
  assignedNiche?: string;
  has_device_bound?: boolean;
  bound_device?: MemberRecord['boundDevice'];
  created_at?: string;
  companies?: {
    id?: string;
    name?: string;
    code?: string;
  };
}

export interface PendingResetRecord {
  id: string;
  requestId?: string;
  userId?: string;
  userEmail: string;
  userName: string;
  companyId?: string;
  companyName: string;
  oldDeviceName: string;
  oldHwidHash: string;
  newDeviceName: string;
  newHwidHash: string;
  reason: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const DEFAULT_AVAILABLE_NICHES = [
  'Review Phim',
  'Nhạc',
  'ASMR',
  'Sự Thật / Bí Ẩn',
  'Động Vật / Thú Cưng',
  'AI Manga Recap',
  'Mẹo Vặt / Tech Gadgets',
  'Ẩm Thực / Nấu Ăn',
  'Tin Tức / Tài Chính',
  'Game / Esports',
];

export const STORAGE_KEY_TENANTS = 'rtm_saas_tenants_cache';
export const STORAGE_KEY_LICENSES = 'rtm_saas_licenses_cache';
export const STORAGE_KEY_MEMBERS = 'rtm_saas_members_cache';
export const STORAGE_KEY_PENDING_RESETS = 'rtm_saas_pending_resets_cache';

function loadCachedTenants(): TenantRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TENANTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache tenants:', e);
  }
  return [];
}

function loadCachedLicenses(): MasterLicenseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LICENSES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache licenses:', e);
  }
  return [];
}

function loadCachedPendingResets(): PendingResetRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_RESETS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache pending resets:', e);
  }
  return [];
}

function loadCachedMembers(): MemberRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEMBERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc cache members:', e);
  }
  return [];
}

export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL || 'https://retubematrix-gateway.dungdong333.workers.dev';

// Helper sinh mật khẩu ngẫu nhiên mạnh
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = 'RTM@';
  for (let i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

// Helper sinh license key chuẩn
function generateStandardLicenseKey(tier: LicenseTier): string {
  const year = new Date().getFullYear();
  const tierPrefix = tier === 'enterprise' ? 'ENT' : tier === 'pro' ? 'PRO' : 'TRL';
  const randPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const randPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const randPart3 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RTM-${tierPrefix}-${year}-${randPart1}-${randPart2}-${randPart3}`;
}

function sanitizeFullName(
  fullName?: string | null,
  email?: string | null,
  role?: string | null,
): string {
  const name = fullName?.trim();
  if (!name || name.includes('Dũng Đỗ') || name.includes('Dũng Đồng')) {
    if (role === 'owner' || isOwnerEmail(email)) {
      return 'Tiến Dũng (Master Owner)';
    }
    if (name) {
      return name.replace(/Dũng\s+(Đỗ|Đồng)/g, 'Tiến Dũng');
    }
  }
  return name || email || 'Thành viên';
}

interface TeamComparisonItem {
  team_id: string;
  team_name: string;
  leader_name: string;
  leader_email: string;
  members_count: number;
  target_channels_count: number;
  competitor_channels_count: number;
  videos_uploaded_today: number;
  total_views: number;
  revenue_usd: number;
  revenue_vnd: number;
  videos_tested_green: number;
  videos_tested_red: number;
  quality_rate: number;
  evaluation: string;
}

interface CompetitorRecentVideo {
  id?: string;
  video_id?: string;
  title: string;
  views?: number;
  view_count?: number;
  upload_date?: string;
  url?: string;
}

interface CompetitorChannelItem {
  id: string;
  channel_name: string;
  channel_url: string;
  primary_keyword: string;
  subscriber_count: number;
  total_views: number;
  recent_5_videos: CompetitorRecentVideo[];
  videos_tested_green: number;
  videos_tested_red: number;
}

interface StaffWorkReportItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string;
  company_name: string;
  team_id: string | null;
  assigned_niche: string;
  target_channels_count: number;
  test_channels_count: number;
  competitor_channels_count: number;
  competitor_channels: CompetitorChannelItem[];
  videos_uploaded_today: number;
  videos_uploaded_week: number;
  videos_uploaded_month: number;
  videos_tested_green: number;
  videos_tested_red: number;
  total_views: number;
  estimated_revenue_usd: number;
  estimated_revenue_vnd: number;
  quality_score: number;
}

interface LeaderboardRankItem {
  rank: number;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  target_channels_count: number;
  total_views: number;
  estimated_revenue_usd: number;
  estimated_revenue_vnd: number;
  videos_uploaded_today: number;
  quality_score: number;
}

export function SaasMasterHubPage() {
  const { user, accessToken, refreshSession } = useAuth();
  const currentRole = user?.role || 'owner';
  const currentCompanyId = user?.companyId;
  const isOwner = currentRole === 'owner' || isOwnerEmail(user?.email);
  const isAdmin = currentRole === 'admin';
  const isLeader = currentRole === 'leader';

  // Tabs state
  type MasterTab = 'tenants' | 'members' | 'licenses' | 'devices' | 'reports';
  const [activeTab, setActiveTab] = useState<MasterTab>('tenants');
  const [workReports, setWorkReports] = useState<StaffWorkReportItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRankItem[]>([]);
  const [teamsComparison, setTeamsComparison] = useState<TeamComparisonItem[]>([]);
  const [viewingVideosModal, setViewingVideosModal] = useState<{
    channelName: string;
    channelUrl: string;
    videos: CompetitorRecentVideo[];
  } | null>(null);

  // Data state (Local-First Persistence & đồng bộ Cloudflare Worker / Supabase Cloud)
  const [tenants, setTenants] = useState<TenantRecord[]>(() => loadCachedTenants());
  const [licenses, setLicenses] = useState<MasterLicenseRecord[]>(() => loadCachedLicenses());
  const [devices, setDevices] = useState<OnlineDeviceRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>(() => loadCachedMembers());
  const [pendingResets, setPendingResets] = useState<PendingResetRecord[]>(() =>
    loadCachedPendingResets(),
  );
  const [isReviewingResetId, setIsReviewingResetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Lưu trữ đồng thời vào State và localStorage an toàn
  const saveTenants = useCallback(
    (updater: TenantRecord[] | ((prev: TenantRecord[]) => TenantRecord[])) => {
      setTenants((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(STORAGE_KEY_TENANTS, JSON.stringify(next));
        } catch (e) {
          console.warn('Lỗi lưu cache tenants:', e);
        }
        return next;
      });
    },
    [],
  );

  const saveLicenses = useCallback(
    (updater: MasterLicenseRecord[] | ((prev: MasterLicenseRecord[]) => MasterLicenseRecord[])) => {
      setLicenses((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(STORAGE_KEY_LICENSES, JSON.stringify(next));
        } catch (e) {
          console.warn('Lỗi lưu cache licenses:', e);
        }
        return next;
      });
    },
    [],
  );

  const saveMembers = useCallback(
    (updater: MemberRecord[] | ((prev: MemberRecord[]) => MemberRecord[])) => {
      setMembers((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(next));
        } catch (e) {
          console.warn('Lỗi lưu cache members:', e);
        }
        return next;
      });
    },
    [],
  );

  const savePendingResets = useCallback(
    (updater: PendingResetRecord[] | ((prev: PendingResetRecord[]) => PendingResetRecord[])) => {
      setPendingResets((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(STORAGE_KEY_PENDING_RESETS, JSON.stringify(next));
        } catch (e) {
          console.warn('Lỗi lưu cache pending resets:', e);
        }
        return next;
      });
    },
    [],
  );

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | LicenseTier>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'leader' | 'user'>(
    'all',
  );
  const [companyFilter, setCompanyFilter] = useState<string>('all');

  // Modals state
  const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
  const [isEditTenantOpen, setIsEditTenantOpen] = useState(false);
  const [isIssueLicenseOpen, setIsIssueLicenseOpen] = useState(false);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isAddSeatsModalOpen, setIsAddSeatsModalOpen] = useState(false);
  const [isUnbindModalOpen, setIsUnbindModalOpen] = useState(false);
  const [isUpgradeTierModalOpen, setIsUpgradeTierModalOpen] = useState(false);
  const [upgradeTargetTenant, setUpgradeTargetTenant] = useState<TenantRecord | null>(null);
  const [upgradeTargetTier, setUpgradeTargetTier] = useState<LicenseTier>('enterprise');
  const [upgradeMaxSeats, setUpgradeMaxSeats] = useState<number>(9999);
  const [upgradeExtendDays, setUpgradeExtendDays] = useState<number>(365);
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);

  // Member Management Modals state
  const [isAssignCompanyModalOpen, setIsAssignCompanyModalOpen] = useState(false);
  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = useState(false);
  const [isCreateMemberModalOpen, setIsCreateMemberModalOpen] = useState(false);

  // Selected item for modals
  const [selectedTenant, setSelectedTenant] = useState<TenantRecord | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<MasterLicenseRecord | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<OnlineDeviceRecord | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Edit Tenant Form States
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantCode, setEditTenantCode] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editTenantNiches, setEditTenantNiches] = useState<string[]>([]);
  const [editTenantCustomNiche, setEditTenantCustomNiche] = useState('');

  // Member Modal Form States
  const [assignCompanyId, setAssignCompanyId] = useState<string>('');
  const [changeRoleValue, setChangeRoleValue] = useState<'admin' | 'leader' | 'user'>('user');
  const [editFullName, setEditFullName] = useState<string>('');
  const [editAssignedNiche, setEditAssignedNiche] = useState<string>('');
  const [editCustomNiche, setEditCustomNiche] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);

  // Create Member Modal Form State
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createCompanyId, setCreateCompanyId] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'leader' | 'user'>('user');
  const [createAssignedNiche, setCreateAssignedNiche] = useState<string>('');
  const [createCustomNiche, setCreateCustomNiche] = useState<string>('');
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [createdMemberSuccess, setCreatedMemberSuccess] = useState<{
    email: string;
    password: string;
    fullName: string;
    role: string;
    companyName: string;
  } | null>(null);

  // New Tenant Form State
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newTenantTier, setNewTenantTier] = useState<LicenseTier>('pro');
  const [newTenantSeats, setNewTenantSeats] = useState(10);
  const [newTenantDurationDays, setNewTenantDurationDays] = useState(365);
  const [newTenantNiches, setNewTenantNiches] = useState<string[]>(['Review Phim']);
  const [newTenantCustomNiche, setNewTenantCustomNiche] = useState('');

  // Issue License Form State
  const [issueCompanyId, setIssueCompanyId] = useState('');
  const [issueTier, setIssueTier] = useState<LicenseTier>('pro');
  const [issueSeats, setIssueSeats] = useState(10);
  const [issueDaysValid, setIssueDaysValid] = useState(365);
  const [previewGeneratedKey, setPreviewGeneratedKey] = useState(() =>
    generateStandardLicenseKey('pro'),
  );

  // Extend & Seats state
  const [extendDaysToAdd, setExtendDaysToAdd] = useState(365);
  const [seatsToAdd, setSeatsToAdd] = useState(5);

  // Hiển thị thông báo tạm thời
  const showFlashMessage = useCallback((msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => {
      setActionSuccessMsg(null);
    }, 4000);
  }, []);

  // Lấy access token tươi mới nhất và tự động refresh session nếu JWT đã hết hạn
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    let token = accessToken;
    if (!token) {
      try {
        const cached = localStorage.getItem('rtm_auth_session');
        if (cached) {
          const parsed = JSON.parse(cached);
          token = parsed.accessToken || parsed.token || null;
        }
      } catch (_) {}
    }
    if (!token) {
      token = localStorage.getItem('rtm_admin_token');
    }

    // Kiểm tra thời hạn JWT token (nếu exp còn dưới 60s hoặc đã hết hạn)
    if (token?.includes('.')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(b64));
          if (payload.exp && payload.exp * 1000 - Date.now() < 60000) {
            console.log(
              '[SaasMasterHub] Access token expired or expiring soon, triggering refreshSession...',
            );
            const ok = await refreshSession();
            if (ok) {
              const freshCached = localStorage.getItem('rtm_auth_session');
              if (freshCached) {
                const freshParsed = JSON.parse(freshCached);
                token = freshParsed.accessToken || freshParsed.token || token;
              }
            }
          }
        }
      } catch (_) {}
    }
    return token;
  }, [accessToken, refreshSession]);

  // Wrapper fetch tự động retry nếu gặp lỗi 401
  const fetchGatewayWithAutoRefresh = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      let token = await getFreshToken();
      const headers = new Headers(init.headers || {});
      if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      let res = await fetch(url, { ...init, headers });
      if (res.status === 401) {
        console.warn(
          '[SaasMasterHub] Gateway returned 401, attempting session refresh and retry...',
        );
        const ok = await refreshSession();
        if (ok) {
          token = await getFreshToken();
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          res = await fetch(url, { ...init, headers });
        }
      }
      return res;
    },
    [getFreshToken, refreshSession],
  );

  // 1. TẢI DỮ LIỆU TỪ CLOUDFLARE WORKER GATEWAY / SUPABASE REST
  const loadMasterData = useCallback(async () => {
    setIsLoading(true);
    let successFromCloud = false;

    // Lấy token hiệu dụng tươi mới từ Context hoặc Session Cache
    const effectiveToken = await getFreshToken();

    try {
      // Gọi song song các endpoints từ Cloudflare Gateway Worker với tự động refresh token
      const [compRes, licRes, devRes, usersRes, workReportsRes, teamsCompRes] = await Promise.all([
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/companies`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/licenses`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/devices`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/work-reports`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/teams-comparison`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (workReportsRes?.success && workReportsRes?.data) {
        if (Array.isArray(workReportsRes.data.reports)) {
          setWorkReports(workReportsRes.data.reports);
        }
        if (Array.isArray(workReportsRes.data.leaderboard)) {
          setLeaderboard(workReportsRes.data.leaderboard);
        }
      }

      if (teamsCompRes?.success && Array.isArray(teamsCompRes.teams)) {
        setTeamsComparison(teamsCompRes.teams);
      }

      if (compRes?.companies || licRes?.licenses || devRes?.devices || usersRes?.users) {
        successFromCloud = true;

        let mappedLic: MasterLicenseRecord[] = [];
        if (licRes?.licenses && Array.isArray(licRes.licenses)) {
          mappedLic = (licRes.licenses as RawLicenseApi[]).map((l) => ({
            id: l.id,
            licenseKey: l.license_key,
            companyId: l.company_id,
            companyName: l.company_name,
            companyCode: l.company_code,
            tier: (l.tier as LicenseTier) || 'pro',
            status: (l.status as LicenseStatus) || 'active',
            maxSeats: l.max_seats || 10,
            usedSeats: l.used_seats || 0,
            validFrom: l.valid_from || l.created_at || new Date().toISOString(),
            expiresAt: l.expires_at || new Date().toISOString(),
            features: {
              maxBrowserProfiles: l.features?.max_browser_profiles ?? 25,
              bktDailyQuota: l.features?.bkt_daily_quota ?? 50,
              allowCrossLeaderCollab: l.features?.allow_cross_leader_collab ?? true,
            },
          }));
          saveLicenses(mappedLic);
        }

        if (compRes?.companies && Array.isArray(compRes.companies)) {
          const mappedCompanies: TenantRecord[] = (compRes.companies as RawCompanyApi[]).map(
            (c) => {
              const compLic = mappedLic.find((l) => l.companyId === c.id);
              const rawNiches = c.assigned_niches || c.assignedNiches || [];
              return {
                id: c.id,
                name: c.name,
                code: c.code,
                adminEmail: c.owner_email || `admin@${c.code.toLowerCase()}.vn`,
                isActive: c.is_active ?? true,
                userCount: c.user_count || 1,
                activeDeviceCount: c.active_device_count || 0,
                licenseTier: compLic?.tier || (c.tier as LicenseTier) || 'pro',
                licenseStatus: compLic?.status || 'active',
                licenseKey: compLic?.licenseKey || c.licenses?.[0]?.license_key || undefined,
                maxSeats: compLic?.maxSeats || c.max_seats || 10,
                usedSeats: compLic?.usedSeats || c.active_device_count || 0,
                expiresAt:
                  compLic?.expiresAt ||
                  c.expires_at ||
                  new Date(Date.now() + 365 * 86400000).toISOString(),
                createdAt: c.created_at || new Date().toISOString(),
                assignedNiches: rawNiches.length > 0 ? rawNiches : ['Review Phim'],
              };
            },
          );
          saveTenants(mappedCompanies);
        }

        if (devRes?.devices && Array.isArray(devRes.devices)) {
          const nowMs = Date.now();
          const mappedDev: OnlineDeviceRecord[] = (devRes.devices as RawDeviceApi[]).map((d) => {
            const hbMs = new Date(d.last_heartbeat_at || Date.now()).getTime();
            const diffMin = (nowMs - hbMs) / (60 * 1000);
            const status: 'online' | 'idle' | 'offline' =
              diffMin <= 5 ? 'online' : diffMin <= 30 ? 'idle' : 'offline';

            return {
              id: d.id,
              userId: d.user_id || '',
              userName: d.user_name || 'Kỹ thuật viên',
              userEmail: d.user_email || 'user@company.vn',
              userRole: d.user_role || 'user',
              companyId: d.company_id || '',
              companyName: d.company_name || 'Doanh Nghiệp',
              companyCode: d.company_code || 'CORP',
              deviceName: d.device_name || 'PC-TERMINAL',
              osInfo: d.os_info || 'Windows 11',
              clientVersion: d.client_version || 'v1.4.2',
              hwidHash: d.hwid_hash || '000000000000000000000000',
              lastIp: d.last_ip || '127.0.0.1',
              lastHeartbeatAt: d.last_heartbeat_at || new Date().toISOString(),
              isActive: true,
              status,
            };
          });
          setDevices(mappedDev);
        }

        if (devRes?.pending_resets || devRes?.pendingResets) {
          const rawResets = (devRes.pending_resets || devRes.pendingResets) as Record<
            string,
            unknown
          >[];
          if (Array.isArray(rawResets)) {
            const mappedResets: PendingResetRecord[] = rawResets.map((r) => ({
              id: String(r.id || r.request_id || ''),
              requestId: String(r.request_id || r.id || ''),
              userId: String(r.user_id || ''),
              userEmail: String(
                r.user_email || r.email || (r.user_profiles as { email?: string })?.email || '',
              ),
              userName: sanitizeFullName(
                String(r.user_name || (r.user_profiles as { full_name?: string })?.full_name || ''),
                String(r.user_email || r.email || ''),
              ),
              companyId: String(r.company_id || ''),
              companyName: String(
                r.company_name || (r.companies as { name?: string })?.name || 'Doanh Nghiệp',
              ),
              oldDeviceName: String(r.old_device_name || r.current_device_name || 'Máy trạm cũ'),
              oldHwidHash: String(r.old_hwid_hash || r.current_hwid_hash || ''),
              newDeviceName: String(
                r.new_device_name ||
                  (r.new_device_info as { device_name?: string })?.device_name ||
                  'Máy trạm mới',
              ),
              newHwidHash: String(r.new_hwid_hash || ''),
              reason: String(r.reason || 'Đổi máy trạm / nâng cấp phần cứng'),
              requestedAt: String(r.requested_at || r.created_at || new Date().toISOString()),
              status: (r.status as 'pending' | 'approved' | 'rejected') || 'pending',
            }));
            savePendingResets(mappedResets.filter((r) => r.status === 'pending'));
          }
        }

        if (usersRes?.users && Array.isArray(usersRes.users)) {
          const mappedUsers: MemberRecord[] = (usersRes.users as RawUserApi[]).map((u) => ({
            id: u.id,
            email: u.email,
            fullName: sanitizeFullName(u.full_name, u.email, u.role),
            role: (u.role as MemberRecord['role']) || 'user',
            companyId: u.company_id || null,
            companyName: u.company_name || 'Chưa gán',
            companyCode: u.company_code || 'N/A',
            isActive: u.is_active ?? true,
            assignedNiche: u.assigned_niche || u.assignedNiche || '',
            hasDeviceBound: !!u.has_device_bound,
            boundDevice: u.bound_device || null,
            createdAt: u.created_at || new Date().toISOString(),
          }));
          saveMembers(mappedUsers);
        }
      } else if (effectiveToken) {
        // Fallback Supabase REST direct
        const supabase = getSupabaseClient(accessToken);
        const [compDataRes, devDataRes, usersDataRes, hwidResetRes] = await Promise.all([
          supabase
            .from('companies')
            .select('*, licenses(*)')
            .order('created_at', { ascending: false }),
          supabase
            .from('device_bindings')
            .select('*, companies(name, code), user_profiles:user_id(full_name, email, role)')
            .order('last_heartbeat_at', { ascending: false }),
          supabase
            .from('user_profiles')
            .select('*, companies(id, name, code)')
            .order('created_at', { ascending: false }),
          supabase
            .from('hwid_reset_requests')
            .select('*, user_profiles:user_id(full_name, email), companies(name)')
            .eq('status', 'pending')
            .order('requested_at', { ascending: false }),
        ]);

        if (hwidResetRes?.data && Array.isArray(hwidResetRes.data)) {
          const mappedResets: PendingResetRecord[] = (
            hwidResetRes.data as Record<string, unknown>[]
          ).map((r) => {
            const u = r.user_profiles as { full_name?: string; email?: string } | null;
            const c = r.companies as { name?: string } | null;
            const newInfo = (r.new_device_info as Record<string, unknown>) || {};
            return {
              id: String(r.id || ''),
              requestId: String(r.id || ''),
              userId: String(r.user_id || ''),
              userEmail: u?.email || 'user@company.vn',
              userName: sanitizeFullName(u?.full_name, u?.email),
              companyId: String(r.company_id || ''),
              companyName: c?.name || 'Doanh Nghiệp',
              oldDeviceName: 'Máy trạm cũ',
              oldHwidHash: String(r.current_hwid_hash || ''),
              newDeviceName: String(newInfo.device_name || newInfo.deviceName || 'Máy trạm mới'),
              newHwidHash: String(r.new_hwid_hash || ''),
              reason: String(r.reason || 'Đổi máy trạm'),
              requestedAt: String(r.requested_at || new Date().toISOString()),
              status: 'pending',
            };
          });
          savePendingResets(mappedResets);
        }

        if (compDataRes.data && Array.isArray(compDataRes.data) && compDataRes.data.length > 0) {
          successFromCloud = true;
          const mappedCompanies: TenantRecord[] = (
            compDataRes.data as unknown as RawCompanyApi[]
          ).map((c) => {
            const firstLic = c.licenses?.[0] || null;
            const rawNiches = c.assigned_niches || c.assignedNiches || [];
            return {
              id: c.id,
              name: c.name,
              code: c.code,
              adminEmail: `admin@${c.code.toLowerCase()}.vn`,
              isActive: c.is_active ?? true,
              userCount: c.licenses?.reduce((acc: number, l) => acc + (l.used_seats || 0), 0) || 1,
              activeDeviceCount:
                c.licenses?.reduce((acc: number, l) => acc + (l.used_seats || 0), 0) || 0,
              licenseTier: (firstLic?.tier as LicenseTier) || 'pro',
              licenseStatus: (firstLic?.status as LicenseStatus) || 'active',
              licenseKey:
                (firstLic as unknown as { license_key?: string })?.license_key || undefined,
              maxSeats: firstLic?.max_seats || 10,
              usedSeats: firstLic?.used_seats || 0,
              expiresAt:
                firstLic?.expires_at || new Date(Date.now() + 365 * 86400000).toISOString(),
              createdAt: c.created_at || new Date().toISOString(),
              assignedNiches: rawNiches.length > 0 ? rawNiches : ['Review Phim'],
            };
          });
          saveTenants((prevLocal) => {
            const cloudIds = new Set(mappedCompanies.map((c) => c.id));
            const localOnly = prevLocal.filter((t) => !cloudIds.has(t.id));
            return [...localOnly, ...mappedCompanies];
          });
        }

        if (devDataRes.data && Array.isArray(devDataRes.data)) {
          const nowMs = Date.now();
          const mappedDevices: OnlineDeviceRecord[] = (
            devDataRes.data as unknown as RawDeviceApi[]
          ).map((d) => {
            const hbMs = new Date(d.last_heartbeat_at || d.updated_at || Date.now()).getTime();
            const diffMin = (nowMs - hbMs) / (60 * 1000);
            const status: 'online' | 'idle' | 'offline' =
              diffMin <= 5 ? 'online' : diffMin <= 30 ? 'idle' : 'offline';

            return {
              id: d.id,
              userId: d.user_id || '',
              userName: d.user_profiles?.full_name || 'Kỹ thuật viên',
              userEmail: d.user_profiles?.email || 'user@company.vn',
              userRole: d.user_profiles?.role || 'user',
              companyId: d.companies?.id || '',
              companyName: d.companies?.name || 'Doanh Nghiệp',
              companyCode: d.companies?.code || 'CORP',
              deviceName: d.device_name || 'PC-TERMINAL',
              osInfo: d.os_info || 'Windows 11',
              clientVersion: d.client_version || 'v1.4.2',
              hwidHash: d.hwid_hash || '000000000000000000000000',
              lastIp: d.last_ip || '127.0.0.1',
              lastHeartbeatAt: d.last_heartbeat_at || new Date().toISOString(),
              isActive: d.is_active ?? true,
              status,
            };
          });
          setDevices(mappedDevices);
        }

        if (usersDataRes.data && Array.isArray(usersDataRes.data) && usersDataRes.data.length > 0) {
          const mappedUsers: MemberRecord[] = (usersDataRes.data as unknown as RawUserApi[]).map(
            (u) => ({
              id: u.id,
              email: u.email,
              fullName: sanitizeFullName(u.full_name, u.email, u.role),
              role: (u.role as MemberRecord['role']) || 'user',
              companyId: u.company_id || null,
              companyName: u.companies?.name || 'Chưa gán',
              companyCode: u.companies?.code || 'N/A',
              isActive: u.is_active ?? true,
              assignedNiche: u.assigned_niche || u.assignedNiche || '',
              hasDeviceBound: false,
              boundDevice: null,
              createdAt: u.created_at || new Date().toISOString(),
            }),
          );
          saveMembers((prevLocal) => {
            const cloudIds = new Set(mappedUsers.map((u) => u.id));
            const localOnly = prevLocal.filter((m) => !cloudIds.has(m.id));
            return [...localOnly, ...mappedUsers];
          });
        }
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu Master Hub:', err);
    }

    setIsCloudConnected(successFromCloud);
    setLastRefreshedAt(new Date());
    setIsLoading(false);
  }, [
    accessToken,
    saveLicenses,
    saveMembers,
    savePendingResets,
    saveTenants,
    getFreshToken,
    fetchGatewayWithAutoRefresh,
  ]);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  // Cập nhật key mẫu khi đổi tier trong modal cấp license
  useEffect(() => {
    setPreviewGeneratedKey(generateStandardLicenseKey(issueTier));
  }, [issueTier]);

  // 2. KHỐI TÍNH TOÁN KPI TOÀN SÀN
  const kpiStats = useMemo(() => {
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.isActive).length;

    const totalLicenses = licenses.length;
    const activeLicenses = licenses.filter((l) => l.status === 'active').length;

    const totalMaxSeats = licenses.reduce(
      (sum, l) => sum + (l.status === 'active' ? l.maxSeats : 0),
      0,
    );
    const totalUsedSeats = licenses.reduce(
      (sum, l) => sum + (l.status === 'active' ? l.usedSeats : 0),
      0,
    );

    const seatUtilizationRate =
      totalMaxSeats > 0 ? ((totalUsedSeats / totalMaxSeats) * 100).toFixed(1) : '0.0';

    const onlineDevicesCount = devices.filter((d) => d.status === 'online').length;
    const totalBoundDevices = devices.filter((d) => d.isActive).length;
    const totalMembers = members.length;
    const activeMembers = members.filter((m) => m.isActive).length;

    return {
      totalTenants,
      activeTenants,
      totalLicenses,
      activeLicenses,
      totalMaxSeats,
      totalUsedSeats,
      seatUtilizationRate,
      onlineDevicesCount,
      totalBoundDevices,
      totalMembers,
      activeMembers,
    };
  }, [tenants, licenses, devices, members]);

  // 3. THAO TÁC COPY KEY
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // 4. THAO TÁC TAB 1: THÊM CÔNG TY MỚI
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newTenantCode.trim() || !newAdminEmail.trim()) {
      alert('Vui lòng điền đầy đủ Tên công ty, Mã Code và Email Admin.');
      return;
    }

    const cleanCode = newTenantCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    const finalNiches = newTenantNiches.length > 0 ? newTenantNiches : ['Review Phim'];

    try {
      // 1. Gọi trực tiếp Cloudflare Gateway Worker với cơ chế tự động refresh token nếu hết hạn
      const createRes = await fetchGatewayWithAutoRefresh(
        `${GATEWAY_URL}/v1/admin/companies/create`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTenantName.trim(),
            code: cleanCode,
            admin_email: newAdminEmail.trim(),
            admin_name: newAdminEmail.trim().split('@')[0],
            tier: newTenantTier,
            max_seats: newTenantSeats,
            duration_days: newTenantDurationDays,
            assigned_niches: finalNiches,
          }),
        },
      );

      const createData = await createRes.json().catch(() => ({}));

      if (createRes.ok && createData.success) {
        const comp = createData.company;
        const pwd = createData.generated_password;

        setIsAddTenantOpen(false);
        setNewTenantName('');
        setNewTenantCode('');
        setNewAdminEmail('');
        setNewTenantNiches(['Review Phim']);
        setNewTenantCustomNiche('');

        showFlashMessage(
          `Đã tạo thành công Công ty "${comp?.name || newTenantName.trim()}" (Mã: ${cleanCode}) trên Supabase Cloud! Mật khẩu Admin: ${pwd || 'Đã tạo'}`,
        );

        // Đồng bộ dữ liệu mới nhất từ Cloudflare Gateway về App
        await loadMasterData();
        return;
      } else {
        const errMsg = createData.error || createData.message || 'Lỗi tạo công ty từ Gateway';
        console.warn('Lỗi Gateway create company:', errMsg);
        alert(`Không thể tạo công ty trên Cloud: ${errMsg}`);
      }
    } catch (netErr) {
      console.warn('Lỗi kết nối Gateway create company:', netErr);
      alert(
        `Lỗi kết nối tới Gateway: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
      );
    }
  };

  // Mở modal sửa công ty
  const handleOpenEditTenant = (tenant: TenantRecord) => {
    setSelectedTenant(tenant);
    setEditTenantName(tenant.name);
    setEditTenantCode(tenant.code);
    setEditAdminEmail(tenant.adminEmail);
    setEditTenantNiches(
      tenant.assignedNiches && tenant.assignedNiches.length > 0
        ? tenant.assignedNiches
        : ['Review Phim'],
    );
    setEditTenantCustomNiche('');
    setIsEditTenantOpen(true);
  };

  // Xác nhận sửa thông tin công ty
  const handleConfirmEditTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    if (!editTenantName.trim() || !editTenantCode.trim() || !editAdminEmail.trim()) {
      alert('Vui lòng điền đầy đủ Tên công ty, Mã Code và Email Admin.');
      return;
    }

    const cleanCode = editTenantCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    const finalNiches = editTenantNiches.length > 0 ? editTenantNiches : ['Review Phim'];

    try {
      const updateRes = await fetchGatewayWithAutoRefresh(
        `${GATEWAY_URL}/v1/admin/companies/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: selectedTenant.id,
            name: editTenantName.trim(),
            code: cleanCode,
            assigned_niches: finalNiches,
          }),
        },
      );

      if (updateRes.ok) {
        showFlashMessage(`Đã cập nhật thông tin công ty "${editTenantName.trim()}" trên Cloud`);
        setIsEditTenantOpen(false);
        await loadMasterData();
        return;
      }
    } catch (err) {
      console.warn('Lỗi gọi Gateway update company:', err);
    }

    saveTenants((prev) =>
      prev.map((t) =>
        t.id === selectedTenant.id
          ? {
              ...t,
              name: editTenantName.trim(),
              code: cleanCode,
              adminEmail: editAdminEmail.trim(),
              assignedNiches: finalNiches,
            }
          : t,
      ),
    );

    saveLicenses((prev) =>
      prev.map((l) =>
        l.companyId === selectedTenant.id
          ? {
              ...l,
              companyName: editTenantName.trim(),
              companyCode: cleanCode,
            }
          : l,
      ),
    );

    saveMembers((prev) =>
      prev.map((m) =>
        m.companyId === selectedTenant.id
          ? {
              ...m,
              companyName: editTenantName.trim(),
              companyCode: cleanCode,
            }
          : m,
      ),
    );

    setIsEditTenantOpen(false);
    showFlashMessage(`Đã cập nhật thông tin công ty "${editTenantName.trim()}"`);
  };

  void isEditTenantOpen;
  void handleConfirmEditTenant;

  // Khóa / Mở khóa công ty thật lên Cloud
  const handleToggleTenantLock = async (companyId: string) => {
    const targetTenant = tenants.find((c) => c.id === companyId);
    if (!targetTenant) return;
    const nextActive = !targetTenant.isActive;

    // 1. Gọi API Cloudflare Gateway
    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/companies/update`, {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, is_active: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Gateway update company status failed:', data);
      }
    } catch (err) {
      console.warn('Lỗi gọi Gateway update company, fallback offline:', err);
    }

    // 2. Fallback Supabase REST direct nếu có token
    if (accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        await supabase
          .from('companies')
          .update({ is_active: nextActive, updated_at: new Date().toISOString() })
          .eq('id', companyId);
      } catch (err) {
        console.warn('Lỗi Supabase update company:', err);
      }
    }

    // 3. Cập nhật state & cache local-first
    saveTenants((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, isActive: nextActive } : c)),
    );
    showFlashMessage(
      nextActive
        ? `Đã mở khóa công ty ${targetTenant.name}`
        : `Đã đình chỉ công ty ${targetTenant.name}`,
    );
  };

  // 4b. THAO TÁC NÂNG CẤP GÓI BẢN QUYỀN DOANH NGHIỆP
  const handleOpenUpgradeModal = (tenant: TenantRecord) => {
    setUpgradeTargetTenant(tenant);
    const nextTier: LicenseTier = tenant.licenseTier === 'trial' ? 'pro' : 'enterprise';
    setUpgradeTargetTier(nextTier);
    setUpgradeMaxSeats(nextTier === 'enterprise' ? 9999 : nextTier === 'pro' ? 10 : 3);
    setUpgradeExtendDays(nextTier === 'enterprise' ? 3650 : 365);
    setIsUpgradeTierModalOpen(true);
  };

  const handleConfirmUpgradeTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeTargetTenant) return;

    setIsSubmittingUpgrade(true);
    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/companies/upgrade`, {
        method: 'POST',
        body: JSON.stringify({
          company_id: upgradeTargetTenant.id,
          target_tier: upgradeTargetTier,
          max_seats: upgradeMaxSeats,
          extend_days: upgradeExtendDays,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showFlashMessage(
          `Đã nâng cấp thành công Công ty "${upgradeTargetTenant.name}" lên gói ${upgradeTargetTier.toUpperCase()} (${upgradeMaxSeats} máy)!`,
        );
        setIsUpgradeTierModalOpen(false);
        await loadMasterData();
      } else {
        alert(`Không thể nâng gói: ${data.error || data.message || 'Lỗi không xác định'}`);
      }
    } catch (err: unknown) {
      alert(`Lỗi kết nối nâng gói: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  // 5. THAO TÁC TAB 2: CẤP LICENSE MỚI THẬT LÊN CLOUD
  const handleIssueLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetComp = tenants.find((t) => t.id === issueCompanyId) || tenants[0];
    if (!targetComp) {
      alert('Chưa có công ty nào được chọn');
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + issueDaysValid);
    const issueCompanyIdVal = targetComp.id;
    const issueMaxSeats = issueSeats;
    const issueExpiresDays = issueDaysValid;

    let realLicenseKey = previewGeneratedKey;
    let realLicId = `lic-${Date.now().toString(36)}`;
    let realExpiresAt = expDate.toISOString();
    let isCloudIssued = false;

    // 1. Gọi Cloudflare Gateway để cấp License thật
    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/licenses/issue`, {
        method: 'POST',
        body: JSON.stringify({
          company_id: issueCompanyIdVal,
          tier: issueTier,
          max_seats: issueMaxSeats,
          expires_in_days: issueExpiresDays,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.success !== false) {
        const licObj = (data.license as Record<string, unknown>) || data;
        if (licObj.license_key || licObj.licenseKey || licObj.key) {
          realLicenseKey = String(licObj.license_key || licObj.licenseKey || licObj.key);
        }
        if (licObj.id) realLicId = String(licObj.id);
        if (licObj.expires_at) realExpiresAt = String(licObj.expires_at);
        isCloudIssued = true;
      } else {
        console.warn('Gateway issue license API response error:', data);
      }
    } catch (err) {
      console.warn('Lỗi gọi Gateway issue license, kích hoạt fallback offline:', err);
    }

    // 2. Fallback Supabase REST direct nếu Cloudflare Gateway chưa cấp và có kết nối
    if (!isCloudIssued && accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        const { data: userRes } = await supabase.auth.getUser();
        const issuedBy = userRes?.user?.id;
        const { data: insertedLic, error: licErr } = await supabase
          .from('licenses')
          .insert({
            id: realLicId,
            company_id: issueCompanyIdVal,
            license_key: realLicenseKey,
            tier: issueTier,
            status: 'active',
            issued_by: issuedBy,
            max_seats: issueMaxSeats,
            valid_from: new Date().toISOString(),
            expires_at: realExpiresAt,
          })
          .select()
          .single();

        if (!licErr && insertedLic) {
          if (insertedLic.id) realLicId = insertedLic.id;
          if (insertedLic.license_key) realLicenseKey = insertedLic.license_key;
          if (insertedLic.expires_at) realExpiresAt = insertedLic.expires_at;
        }
      } catch (err) {
        console.warn('Lỗi Supabase insert license:', err);
      }
    }

    // 3. Cập nhật State & Cache
    const newLic: MasterLicenseRecord = {
      id: realLicId,
      licenseKey: realLicenseKey,
      companyId: targetComp.id,
      companyName: targetComp.name,
      companyCode: targetComp.code,
      tier: issueTier,
      status: 'active',
      maxSeats: issueMaxSeats,
      usedSeats: 0,
      validFrom: new Date().toISOString(),
      expiresAt: realExpiresAt,
      features: {
        maxBrowserProfiles: issueTier === 'enterprise' ? 100 : issueTier === 'pro' ? 25 : 5,
        bktDailyQuota: issueTier === 'enterprise' ? 200 : issueTier === 'pro' ? 50 : 10,
        allowCrossLeaderCollab: true,
      },
    };

    saveLicenses((prev) => [newLic, ...prev]);
    saveTenants((prev) =>
      prev.map((t) =>
        t.id === targetComp.id
          ? {
              ...t,
              licenseKey: realLicenseKey,
              licenseTier: issueTier,
              licenseStatus: 'active',
              maxSeats: issueMaxSeats,
              expiresAt: realExpiresAt,
            }
          : t,
      ),
    );

    setIsIssueLicenseOpen(false);
    setPreviewGeneratedKey(generateStandardLicenseKey(issueTier));
    showFlashMessage(`Đã cấp thành công License mới: ${realLicenseKey} cho ${targetComp.name}`);
  };

  // Gia hạn License thật lên Cloud
  const handleExtendLicenseConfirm = async () => {
    if (!selectedLicense) return;
    const currentExp = new Date(selectedLicense.expiresAt);
    const validExp = Number.isNaN(currentExp.getTime()) ? new Date() : currentExp;
    validExp.setDate(validExp.getDate() + extendDaysToAdd);

    try {
      await fetch(`${GATEWAY_URL}/v1/admin/licenses/action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          license_id: selectedLicense.id,
          action: 'extend',
          days: extendDaysToAdd,
        }),
      });
    } catch (e) {
      console.warn('Lỗi gọi Gateway extend license:', e);
    }

    if (accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        await supabase
          .from('licenses')
          .update({
            expires_at: validExp.toISOString(),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedLicense.id);
      } catch (err) {
        console.warn('Lỗi Supabase extend license:', err);
      }
    }

    saveLicenses((prev) =>
      prev.map((l) =>
        l.id === selectedLicense.id
          ? { ...l, expiresAt: validExp.toISOString(), status: 'active' }
          : l,
      ),
    );
    setIsExtendModalOpen(false);
    showFlashMessage(
      `Đã gia hạn thêm ${extendDaysToAdd} ngày cho License ${selectedLicense.licenseKey}`,
    );
  };

  // Tăng Seats thật lên Cloud
  const handleAddSeatsConfirm = async () => {
    if (!selectedLicense) return;
    const newMaxSeats = selectedLicense.maxSeats + seatsToAdd;

    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/licenses/action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          license_id: selectedLicense.id,
          action: 'add_seats',
          seats: seatsToAdd,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Gateway add_seats action failed:', data);
      }
    } catch (err) {
      console.warn('Lỗi gọi Gateway add seats, fallback offline:', err);
    }

    if (accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        await supabase
          .from('licenses')
          .update({ max_seats: newMaxSeats, updated_at: new Date().toISOString() })
          .eq('id', selectedLicense.id);
      } catch (err) {
        console.warn('Lỗi Supabase update max_seats:', err);
      }
    }

    saveLicenses((prev) =>
      prev.map((l) => (l.id === selectedLicense.id ? { ...l, maxSeats: newMaxSeats } : l)),
    );
    saveTenants((prev) =>
      prev.map((t) => (t.id === selectedLicense.companyId ? { ...t, maxSeats: newMaxSeats } : t)),
    );
    setIsAddSeatsModalOpen(false);
    showFlashMessage(`Đã tăng thêm +${seatsToAdd} máy cho License ${selectedLicense.licenseKey}`);
  };

  // Đổi trạng thái License (Đình chỉ / Kích hoạt lại / Thu hồi) lên Cloud
  const handleChangeLicenseStatus = async (licenseId: string, nextStatus: LicenseStatus) => {
    try {
      await fetch(`${GATEWAY_URL}/v1/admin/licenses/action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          license_id: licenseId,
          action: nextStatus,
        }),
      });
    } catch (e) {
      console.warn('Lỗi gọi Gateway change license status:', e);
    }

    if (accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        await supabase
          .from('licenses')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', licenseId);
      } catch (err) {
        console.warn('Lỗi Supabase update license status:', err);
      }
    }

    saveLicenses((prev) =>
      prev.map((l) => (l.id === licenseId ? { ...l, status: nextStatus } : l)),
    );
    showFlashMessage(`Đã đổi trạng thái License sang: ${nextStatus.toUpperCase()}`);
  };

  // 6. THAO TÁC TAB 3: HỦY KHÓA MÁY TỪ XA THẬT LÊN CLOUD
  const handleUnbindDeviceConfirm = async () => {
    if (!selectedDevice) return;

    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/devices/unbind`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ binding_id: selectedDevice.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Gateway unbind device failed:', data);
      }
    } catch (err) {
      console.warn('Lỗi gọi Gateway unbind device, fallback offline:', err);
    }

    if (accessToken && isCloudConnected) {
      try {
        const supabase = getSupabaseClient(accessToken);
        await supabase
          .from('device_bindings')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', selectedDevice.id);
      } catch (err) {
        console.warn('Lỗi Supabase unbind device:', err);
      }
    }

    setDevices((prev) =>
      prev.map((d) =>
        d.id === selectedDevice.id ? { ...d, isActive: false, status: 'offline' } : d,
      ),
    );
    // Giảm số seats used của công ty đó
    saveLicenses((prev) =>
      prev.map((l) => {
        if (l.companyId === selectedDevice.companyId && l.usedSeats > 0) {
          return { ...l, usedSeats: l.usedSeats - 1 };
        }
        return l;
      }),
    );
    saveTenants((prev) =>
      prev.map((t) => {
        if (t.id === selectedDevice.companyId && t.activeDeviceCount > 0) {
          return {
            ...t,
            activeDeviceCount: t.activeDeviceCount - 1,
            usedSeats: Math.max(0, t.usedSeats - 1),
          };
        }
        return t;
      }),
    );
    setIsUnbindModalOpen(false);
    showFlashMessage(
      `Đã hủy ràng buộc HWID từ xa cho máy "${selectedDevice.deviceName}". Thiết bị này hiện có thể bind lại trên máy mới.`,
    );
  };

  // Duyệt yêu cầu đổi máy trạm HWID thật lên Cloud
  const handleReviewDeviceReset = async (requestId: string, action: 'approve' | 'reject') => {
    setIsReviewingResetId(requestId);
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/devices/review-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          request_id: requestId,
          action,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.success === false) {
        console.warn('Gateway review-reset API returned non-ok:', data);
      }

      // Supabase RPC direct fallback
      if (accessToken && isCloudConnected) {
        try {
          const supabase = getSupabaseClient(accessToken);
          await supabase.rpc('review_hwid_reset_request', {
            p_request_id: requestId,
            p_approved: action === 'approve',
            p_notes: action === 'approve' ? 'Chấp thuận đổi máy' : 'Từ chối đổi máy',
          });
        } catch (err) {
          console.warn('Lỗi Supabase review_hwid_reset_request:', err);
        }
      }

      savePendingResets((prev) =>
        prev.filter((r) => r.id !== requestId && r.requestId !== requestId),
      );
      showFlashMessage(
        action === 'approve'
          ? 'Đã chấp thuận yêu cầu đổi máy trạm thành công'
          : 'Đã từ chối yêu cầu đổi máy trạm',
      );
    } catch (err) {
      console.warn('Lỗi gọi Gateway review-reset:', err);
      alert('Không thể thực hiện duyệt yêu cầu đổi máy');
    } finally {
      setIsReviewingResetId(null);
    }
  };

  // Lọc Tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.adminEmail.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTier = tierFilter === 'all' || t.licenseTier === tierFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && t.isActive) ||
        (statusFilter === 'inactive' && !t.isActive);
      return matchSearch && matchTier && matchStatus;
    });
  }, [tenants, searchQuery, tierFilter, statusFilter]);

  // Lọc Licenses
  const filteredLicenses = useMemo(() => {
    return licenses.filter((l) => {
      const matchSearch =
        l.licenseKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.companyCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTier = tierFilter === 'all' || l.tier === tierFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && l.status === 'active') ||
        (statusFilter === 'inactive' && l.status !== 'active');
      return matchSearch && matchTier && matchStatus;
    });
  }, [licenses, searchQuery, tierFilter, statusFilter]);

  // Lọc Devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchSearch =
        d.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.hwidHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.lastIp.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [devices, searchQuery]);

  // Lọc danh sách thành viên theo phân quyền người đang đăng nhập
  const visibleMembers = useMemo(() => {
    let list = members;
    if (isAdmin) {
      // Admin: Thấy các thành viên trong công ty mình (ngoại trừ Master Owner)
      list = list.filter((m) => m.companyId === currentCompanyId && m.role !== 'owner');
    } else if (isLeader) {
      // Leader: Thấy các User trong công ty
      list = list.filter((m) => m.companyId === currentCompanyId && m.role === 'user');
    }
    // Owner: Thấy toàn bộ thành viên của mọi công ty + thành viên mới đăng ký chưa có công ty
    return list;
  }, [members, isAdmin, isLeader, currentCompanyId]);

  const filteredMembers = useMemo(() => {
    return visibleMembers.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.companyName || '').toLowerCase().includes(q) ||
        (m.companyCode || '').toLowerCase().includes(q) ||
        (m.boundDevice?.deviceName || '').toLowerCase().includes(q);

      const matchRole = roleFilter === 'all' || m.role === roleFilter;
      const matchCompany =
        companyFilter === 'all' ||
        (companyFilter === 'unassigned' && !m.companyId) ||
        m.companyId === companyFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && m.isActive) ||
        (statusFilter === 'inactive' && !m.isActive);

      return matchSearch && matchRole && matchCompany && matchStatus;
    });
  }, [visibleMembers, searchQuery, roleFilter, companyFilter, statusFilter]);

  // Handlers cấp tài khoản mới
  const handleOpenCreateMember = () => {
    setCreatedMemberSuccess(null);
    setCreateEmail('');
    setCreatePassword(generateRandomPassword());
    setShowCreatePassword(true);
    setCreateFullName('');
    setCreateCompanyId(isAdmin || isLeader ? currentCompanyId || '' : tenants[0]?.id || '');
    setCreateRole('user');
    setCreateAssignedNiche('');
    setCreateCustomNiche('');
    setIsCreateMemberModalOpen(true);
  };

  const handleOpenCreateMemberForCompany = (compId: string) => {
    setCreatedMemberSuccess(null);
    setCreateEmail('');
    setCreatePassword(generateRandomPassword());
    setShowCreatePassword(true);
    setCreateFullName('');
    setCreateCompanyId(compId);
    setCreateRole('user');
    setCreateAssignedNiche('');
    setCreateCustomNiche('');
    setIsCreateMemberModalOpen(true);
  };

  const handleConfirmCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail.trim() || !createPassword.trim()) {
      alert('Vui lòng nhập đầy đủ Email và Mật khẩu!');
      return;
    }

    setIsCreatingMember(true);
    try {
      const targetCompany = tenants.find((t) => t.id === createCompanyId);
      const finalNiche =
        createAssignedNiche === '__custom__'
          ? createCustomNiche.trim()
          : createAssignedNiche.trim();

      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/create`, {
        method: 'POST',
        body: JSON.stringify({
          email: createEmail.trim().toLowerCase(),
          password: createPassword.trim(),
          full_name: createFullName.trim() || createEmail.trim().split('@')[0],
          role: createRole,
          company_id: createCompanyId || null,
          assigned_niche: finalNiche,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
        user?: {
          id: string;
          email: string;
          full_name: string;
          role: 'admin' | 'leader' | 'user';
          company_id?: string | null;
        };
      };

      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || 'Lỗi khi tạo tài khoản');
      }

      const newMember: MemberRecord = {
        id: data.user?.id || `user_${Date.now()}`,
        email: createEmail.trim().toLowerCase(),
        fullName: createFullName.trim() || createEmail.trim().split('@')[0],
        role: createRole,
        companyId: createCompanyId || null,
        companyName: targetCompany?.name || 'Chưa gán',
        companyCode: targetCompany?.code || 'N/A',
        isActive: true,
        assignedNiche: finalNiche,
        hasDeviceBound: false,
        boundDevice: null,
        createdAt: new Date().toISOString(),
      };

      saveMembers((prev) => [newMember, ...prev]);

      if (createCompanyId) {
        saveTenants((prev) =>
          prev.map((t) => (t.id === createCompanyId ? { ...t, userCount: t.userCount + 1 } : t)),
        );
      }

      setCreatedMemberSuccess({
        email: createEmail.trim().toLowerCase(),
        password: createPassword.trim(),
        fullName: createFullName.trim() || createEmail.trim().split('@')[0],
        role: createRole.toUpperCase(),
        companyName: targetCompany?.name || 'Chưa gán',
      });

      showFlashMessage(`Đã cấp tài khoản thành công cho "${createEmail.trim()}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể cấp tài khoản');
    } finally {
      setIsCreatingMember(false);
    }
  };

  // Handlers mở modal thành viên
  const handleOpenAssignCompany = (m: MemberRecord) => {
    setSelectedMember(m);
    setAssignCompanyId(m.companyId || (tenants[0]?.id ?? ''));
    setIsAssignCompanyModalOpen(true);
  };

  const handleConfirmAssignCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    const targetCompId = assignCompanyId || null;
    const targetComp = tenants.find((t) => t.id === targetCompId);

    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/update-role`, {
        method: 'POST',
        body: JSON.stringify({ user_id: selectedMember.id, company_id: targetCompId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Lỗi gán công ty');
      }

      saveMembers((prev) =>
        prev.map((m) =>
          m.id === selectedMember.id
            ? {
                ...m,
                companyId: targetCompId,
                companyName: targetComp?.name || 'Chưa gán',
                companyCode: targetComp?.code || 'N/A',
              }
            : m,
        ),
      );
      showFlashMessage(
        `Đã gán thành viên "${selectedMember.fullName || selectedMember.email}" vào công ty ${targetComp?.name || 'Chưa gán'}`,
      );
      setIsAssignCompanyModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể gán công ty');
    }
  };

  const handleOpenChangeRole = (m: MemberRecord) => {
    setSelectedMember(m);
    const initialRole: 'admin' | 'leader' | 'user' =
      m.role === 'admin' ? 'admin' : m.role === 'leader' ? 'leader' : 'user';
    setChangeRoleValue(initialRole);
    setIsChangeRoleModalOpen(true);
  };

  const handleConfirmChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/update-role`, {
        method: 'POST',
        body: JSON.stringify({ user_id: selectedMember.id, role: changeRoleValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Lỗi cập nhật vai trò');
      }

      saveMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? { ...m, role: changeRoleValue } : m)),
      );
      showFlashMessage(
        `Đã cập nhật vai trò của "${selectedMember.fullName || selectedMember.email}" sang ${changeRoleValue.toUpperCase()}`,
      );
      setIsChangeRoleModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể cập nhật vai trò');
    }
  };

  const handleOpenEditMember = (m: MemberRecord) => {
    setSelectedMember(m);
    setEditFullName(m.fullName);
    setEditAssignedNiche(m.assignedNiche || '');
    setEditCustomNiche('');
    setEditIsActive(m.isActive);
    setIsEditMemberModalOpen(true);
  };

  const handleConfirmEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    const finalNiche =
      editAssignedNiche === '__custom__' ? editCustomNiche.trim() : editAssignedNiche.trim();

    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/update-role`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedMember.id,
          full_name: editFullName.trim(),
          is_active: editIsActive,
          assigned_niche: finalNiche,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Lỗi cập nhật thông tin');
      }

      saveMembers((prev) =>
        prev.map((m) =>
          m.id === selectedMember.id
            ? {
                ...m,
                fullName: editFullName.trim(),
                assignedNiche: finalNiche,
                isActive: editIsActive,
              }
            : m,
        ),
      );
      showFlashMessage(`Đã cập nhật thông tin thành viên "${editFullName.trim()}"`);
      setIsEditMemberModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể cập nhật thông tin');
    }
  };

  const handleDeleteMember = async (m: MemberRecord) => {
    if (
      m.role === 'owner' ||
      isOwnerEmail(m.email) ||
      m.id === '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44'
    ) {
      alert('Tuyệt đối không thể xóa tài khoản Master Owner tối cao');
      return;
    }

    if (
      !confirm(
        `Bạn có chắc chắn muốn xóa tài khoản "${m.fullName || m.email}" (${m.email}) khỏi hệ thống? Thao tác này không thể hoàn tác!`,
      )
    ) {
      return;
    }

    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/delete`, {
        method: 'POST',
        body: JSON.stringify({ user_id: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Lỗi xóa tài khoản');
      }

      saveMembers((prev) => prev.filter((item) => item.id !== m.id));
      showFlashMessage(`Đã xóa vĩnh viễn tài khoản "${m.email}" khỏi hệ thống`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể xóa tài khoản');
    }
  };

  const handleResetMemberHwid = async (m: MemberRecord) => {
    if (
      !confirm(
        `Giải phóng khóa máy (HWID) cho "${m.fullName || m.email}"? Người dùng sẽ có thể đăng nhập trên máy mới ngay lập tức.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetchGatewayWithAutoRefresh(`${GATEWAY_URL}/v1/admin/users/reset-hwid`, {
        method: 'POST',
        body: JSON.stringify({ user_id: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Lỗi giải phóng máy');
      }

      saveMembers((prev) =>
        prev.map((item) =>
          item.id === m.id ? { ...item, hasDeviceBound: false, boundDevice: null } : item,
        ),
      );
      showFlashMessage(`Đã giải phóng khóa máy thành công cho "${m.email}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Không thể giải phóng khóa máy');
    }
  };

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-950 via-[#0d091a] to-zinc-950 text-slate-100 p-6 space-y-6">
      {/* ==================================================================== */}
      {/* 1. HEADER CHỦ DỰ ÁN (MASTER OWNER)                                   */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-slate-900/60 border border-purple-500/25 shadow-2xl shadow-purple-950/30 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/40">
            <Crown className="w-8 h-8 text-amber-300 drop-shadow-md" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                SaaS Master Hub
              </h1>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-300" />
                Chủ Dự Án
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Trung tâm điều hành bản quyền, quản trị đa doanh nghiệp và giám sát thiết bị HWID thời
              gian thực
            </p>
          </div>
        </div>

        {/* Action Controls & Sync Status */}
        <div className="flex items-center flex-wrap gap-3">
          <div
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 border',
              isCloudConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30',
            )}
            title={
              isCloudConnected
                ? 'Đang đồng bộ trực tiếp với Supabase Cloud'
                : 'Chạy ở chế độ ngoại tuyến mô phỏng an toàn (Zero Crash)'
            }
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isCloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400',
              )}
            />
            {isCloudConnected ? 'Supabase Live REST' : 'Offline / Mock Guard'}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadMasterData}
            disabled={isLoading}
            title={`Cập nhật lúc: ${lastRefreshedAt.toLocaleTimeString('vi-VN')}`}
            className="border-purple-500/30 bg-purple-950/20 hover:bg-purple-900/40 text-purple-200 gap-2 h-9 rounded-xl"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Làm mới
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setIssueCompanyId(tenants[0]?.id || '');
              setIsIssueLicenseOpen(true);
            }}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/40 gap-2 h-9 rounded-xl"
          >
            <KeyRound className="w-4 h-4" />
            Cấp License Mới
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddTenantOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 gap-2 h-9 rounded-xl"
          >
            <Plus className="w-4 h-4" />+ Thêm Công Ty
          </Button>
        </div>
      </div>

      {/* Thông báo thao tác nhanh (Flash banner) */}
      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. KHỐI KPI TOÀN SÀN                                                */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Công ty (Tenants) */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 shadow-lg shadow-purple-950/10 backdrop-blur-md relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Tổng số Công Ty
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {kpiStats.activeTenants}
            </span>
            <span className="text-sm text-slate-400">/ {kpiStats.totalTenants} công ty</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{kpiStats.activeTenants} doanh nghiệp đang hoạt động</span>
          </div>
        </div>

        {/* KPI 2: License Active */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 shadow-lg shadow-purple-950/10 backdrop-blur-md relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Bản Quyền Đang Active
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {kpiStats.activeLicenses}
            </span>
            <span className="text-sm text-slate-400">/ {kpiStats.totalLicenses} key</span>
          </div>
          <div className="mt-2 text-xs text-indigo-300 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>100% mã hóa chuẩn SHA-256</span>
          </div>
        </div>

        {/* KPI 3: Máy Online & Khóa HWID */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 shadow-lg shadow-purple-950/10 backdrop-blur-md relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Máy Online / Khóa HWID
            </span>
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Laptop className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">
              {kpiStats.onlineDevicesCount}
            </span>
            <span className="text-sm text-slate-400">
              / {kpiStats.totalBoundDevices} thiết bị bind
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Đang phát heartbeat trực tiếp</span>
          </div>
        </div>

        {/* KPI 4: Tỷ lệ lấp đầy ghế (Seats Utilization) */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 shadow-lg shadow-purple-950/10 backdrop-blur-md relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Tỷ Lệ Ghế (Seats)
            </span>
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-300 tracking-tight">
              {kpiStats.seatUtilizationRate}%
            </span>
            <span className="text-sm text-slate-400">
              ({kpiStats.totalUsedSeats} / {kpiStats.totalMaxSeats} máy)
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Number(kpiStats.seatUtilizationRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. THANH TÌM KIẾM, BỘ LỌC VÀ CHUYỂN TABS                             */}
      {/* ==================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/40 border border-purple-500/15 backdrop-blur-md">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-purple-500/20 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('tenants')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'tenants'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <Building2 className="w-4 h-4" />
            1. Quản lý Công Ty
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-purple-900/60 text-purple-200">
              {tenants.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'members'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <Users className="w-4 h-4" />
            2. Quản Lý Nhân Sự & Phân Quyền
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-purple-900/60 text-purple-200">
              {visibleMembers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('licenses')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'licenses'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <KeyRound className="w-4 h-4" />
            3. License Center
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-purple-900/60 text-purple-200">
              {licenses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('devices')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'devices'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <Laptop className="w-4 h-4" />
            4. Giám sát Máy Online
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-emerald-900/60 text-emerald-300">
              {kpiStats.onlineDevicesCount}
            </span>
            {pendingResets.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {pendingResets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeTab === 'reports'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
            )}
          >
            <TrendingUp className="w-4 h-4" />
            5. Báo Cáo Hiệu Suất & Đội Ngũ
          </button>
        </div>

        {/* Search & Filter tools */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Tìm kiếm công ty, key, HWID, nhân sự..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-950/70 border-purple-500/20 text-sm h-9 rounded-xl focus-visible:ring-purple-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeTab === 'members' && (
            <>
              {/* Filter Company */}
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                aria-label="Lọc theo công ty"
                className="bg-slate-950/70 border border-purple-500/20 text-slate-300 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">Tất cả công ty</option>
                <option value="unassigned">Chưa gán công ty</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>

              {/* Filter Role */}
              <select
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as 'all' | 'owner' | 'admin' | 'leader' | 'user')
                }
                aria-label="Lọc theo vai trò"
                className="bg-slate-950/70 border border-purple-500/20 text-slate-300 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">Tất cả vai trò</option>
                <option value="owner">Owner (Master)</option>
                <option value="admin">Admin (Sếp)</option>
                <option value="leader">Leader (Trưởng nhóm)</option>
                <option value="user">User (Nhân viên)</option>
              </select>

              {/* Filter Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                aria-label="Lọc theo trạng thái"
                className="bg-slate-950/70 border border-purple-500/20 text-slate-300 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã khóa</option>
              </select>

              <Button
                size="sm"
                onClick={handleOpenCreateMember}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl h-9 text-xs gap-1.5 shadow-md shadow-emerald-950/40 ml-auto"
              >
                <UserPlus className="w-3.5 h-3.5" />+ Cấp Tài Khoản Mới
              </Button>
            </>
          )}

          {(activeTab === 'tenants' || activeTab === 'licenses') && (
            <>
              {/* Filter Tier */}
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as LicenseTier | 'all')}
                aria-label="Lọc theo gói License"
                className="bg-slate-950/70 border border-purple-500/20 text-slate-300 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">Tất cả gói</option>
                <option value="enterprise">Enterprise</option>
                <option value="pro">Pro</option>
                <option value="trial">Trial</option>
              </select>

              {/* Filter Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                aria-label="Lọc theo trạng thái"
                className="bg-slate-950/70 border border-purple-500/20 text-slate-300 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang Active</option>
                <option value="inactive">Đã khóa / Hết hạn</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. TAB 1: QUẢN LÝ CÔNG TY (TENANTS MANAGEMENT)                       */}
      {/* ==================================================================== */}
      {activeTab === 'tenants' && (
        <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-slate-950/30">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                Danh Sách Doanh Nghiệp (Tenants)
              </h2>
              <p className="text-xs text-slate-400">
                Quản lý các công ty con, mã định danh, gói giấy phép và quyền truy cập
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setIsAddTenantOpen(true)}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl h-8 text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm Công Ty Mới
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                <tr>
                  <th className="py-3 px-4">Doanh Nghiệp</th>
                  <th className="py-3 px-4">Mã Code</th>
                  <th className="py-3 px-4">Ngách Hoạt Động</th>
                  <th className="py-3 px-4">Gói License</th>
                  <th className="py-3 px-4 text-center">Số Nhân Sự</th>
                  <th className="py-3 px-4 text-center">Số Máy Dùng</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4">Ngày Tạo</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Không tìm thấy công ty nào phù hợp với điều kiện tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((tenant) => {
                    const matchingLic = licenses.find((l) => l.companyId === tenant.id);
                    const displayKey = tenant.licenseKey || matchingLic?.licenseKey;
                    const exp = new Date(matchingLic?.expiresAt || tenant.expiresAt);
                    const daysRemaining = Math.ceil(
                      (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                    );
                    const isExpiringSoon = daysRemaining <= 14 && daysRemaining > 0;
                    const isExpired = daysRemaining <= 0;

                    return (
                      <tr
                        key={tenant.id}
                        className="hover:bg-purple-950/15 transition-colors group"
                      >
                        {/* Tên công ty */}
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm">
                              {tenant.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                                {tenant.name}
                              </div>
                              <div className="text-xs text-slate-400">{tenant.adminEmail}</div>
                            </div>
                          </div>
                        </td>

                        {/* Mã code */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-purple-950/50 border border-purple-500/30 text-purple-300 font-semibold">
                            {tenant.code}
                          </span>
                        </td>

                        {/* Ngách hoạt động */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {tenant.assignedNiches && tenant.assignedNiches.length > 0 ? (
                              tenant.assignedNiches.map((niche) => (
                                <Badge
                                  key={niche}
                                  className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-[11px] font-medium px-2 py-0.5 rounded"
                                >
                                  {niche}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">
                                Chưa gán ngách
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Gói License & License Key */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge
                                className={cn(
                                  'text-[11px] font-semibold uppercase px-2 py-0.5',
                                  tenant.licenseTier === 'enterprise' &&
                                    'bg-amber-500/15 text-amber-300 border-amber-500/40',
                                  tenant.licenseTier === 'pro' &&
                                    'bg-purple-500/15 text-purple-300 border-purple-500/40',
                                  tenant.licenseTier === 'trial' &&
                                    'bg-slate-500/15 text-slate-300 border-slate-500/40',
                                )}
                              >
                                {tenant.licenseTier}
                              </Badge>
                              <span
                                className={cn(
                                  'text-[11px]',
                                  isExpired
                                    ? 'text-rose-400 font-semibold'
                                    : isExpiringSoon
                                      ? 'text-amber-400 font-medium'
                                      : 'text-slate-400',
                                )}
                              >
                                {isExpired ? 'Hết hạn' : `HSD: ${daysRemaining} ngày`}
                              </span>
                            </div>

                            {/* Mã License Key với nút copy 1-click */}
                            {displayKey ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-purple-200 select-all bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                                  {displayKey}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyKey(displayKey)}
                                  className="text-slate-400 hover:text-purple-300 transition-colors p-1"
                                  title="Sao chép License Key"
                                >
                                  {copiedKey === displayKey ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-amber-400/90 italic">
                                  Chưa cấp License Key
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Số nhân sự */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {tenant.userCount}
                          </span>
                        </td>

                        {/* Số máy dùng */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 border border-purple-500/20">
                            {tenant.usedSeats} / {tenant.maxSeats}
                          </span>
                        </td>

                        {/* Trạng thái */}
                        <td className="py-3.5 px-4 text-center">
                          {tenant.isActive ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs">
                              Đã khóa
                            </Badge>
                          )}
                        </td>

                        {/* Ngày tạo */}
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          {new Date(tenant.createdAt).toLocaleDateString('vi-VN')}
                        </td>

                        {/* Thao tác */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenUpgradeModal(tenant)}
                              className="h-8 px-2.5 text-xs text-amber-400 hover:text-white hover:bg-amber-950/60 rounded-lg gap-1 border border-amber-500/30"
                              title={`Nâng cấp gói bản quyền dịch vụ cho ${tenant.name}`}
                            >
                              <Crown className="w-3.5 h-3.5 text-amber-400" />
                              Nâng Gói
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditTenant(tenant)}
                              className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg gap-1 border border-slate-700/50"
                              title={`Sửa thông tin và ngách hoạt động của ${tenant.name}`}
                            >
                              Sửa
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenCreateMemberForCompany(tenant.id)}
                              className="h-8 px-2.5 text-xs text-emerald-400 hover:text-white hover:bg-emerald-950/60 rounded-lg gap-1 border border-emerald-500/30"
                              title={`Cấp tài khoản & mật khẩu nhân sự mới cho ${tenant.name}`}
                            >
                              <UserPlus className="w-3.5 h-3.5" />+ Cấp TK
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setIssueCompanyId(tenant.id);
                                setIssueTier(tenant.licenseTier);
                                setIsIssueLicenseOpen(true);
                              }}
                              className="h-8 px-2.5 text-xs text-purple-300 hover:text-white hover:bg-purple-900/40 rounded-lg gap-1"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              Cấp Key
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleTenantLock(tenant.id)}
                              className={cn(
                                'h-8 px-2.5 text-xs rounded-lg gap-1',
                                tenant.isActive
                                  ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
                                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40',
                              )}
                            >
                              {tenant.isActive ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  Khóa
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  Mở
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB: QUẢN LÝ NHÂN SỰ & PHÂN QUYỀN                                    */}
      {/* ==================================================================== */}
      {activeTab === 'members' && (
        <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl space-y-0">
          <div className="p-4 border-b border-purple-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/30">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Danh Sách Tài Khoản & Phân Quyền
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOwner
                  ? 'Master Owner: Toàn quyền đổi vai trò, gán doanh nghiệp, cấp slot và quản lý toàn bộ nhân sự.'
                  : isAdmin
                    ? 'Quản trị viên (Admin): Quản lý nhân sự trong công ty, phân quyền Leader / User.'
                    : 'Trưởng nhóm (Leader): Xem và quản lý nhân viên cấp User trực thuộc công ty.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Hiển thị <span className="font-semibold text-white">{filteredMembers.length}</span>{' '}
                / {visibleMembers.length} thành viên
              </span>
              <Button
                size="sm"
                onClick={handleOpenCreateMember}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl h-8 text-xs gap-1.5 shadow-md shadow-emerald-950/40"
              >
                <UserPlus className="w-3.5 h-3.5" />+ Cấp Tài Khoản Mới
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                <tr>
                  <th className="py-3 px-4">Thành Viên</th>
                  <th className="py-3 px-4">Công Ty</th>
                  <th className="py-3 px-4">Vai Trò</th>
                  <th className="py-3 px-4">Ngách Phụ Trách</th>
                  <th className="py-3 px-4">Thiết Bị (HWID)</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4">Ngày Tạo</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                      {isLoading
                        ? 'Đang tải danh sách nhân sự...'
                        : 'Không tìm thấy thành viên nào phù hợp với điều kiện tìm kiếm.'}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => {
                    const isUserMasterOwner =
                      m.role === 'owner' ||
                      isOwnerEmail(m.email) ||
                      m.id === '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44';
                    const canDelete =
                      !isUserMasterOwner &&
                      (isOwner ||
                        (isAdmin &&
                          (m.role === 'user' || m.role === 'leader') &&
                          m.id !== user?.id) ||
                        (isLeader && m.role === 'user'));

                    return (
                      <tr key={m.id} className="hover:bg-purple-950/15 transition-colors group">
                        {/* Họ tên & Email */}
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600/20 to-indigo-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm uppercase shrink-0">
                              {m.fullName.charAt(0) || m.email.charAt(0) || 'U'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                                {m.fullName || m.email}
                              </div>
                              <div className="text-xs text-slate-400 font-mono truncate">
                                {m.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Công ty */}
                        <td className="py-3.5 px-4">
                          {m.companyId ? (
                            <div>
                              <span className="font-medium text-white text-xs">
                                {m.companyName}
                              </span>
                              {m.companyCode && (
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  ({m.companyCode})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Chưa gán công ty
                            </span>
                          )}
                        </td>

                        {/* Vai Trò */}
                        <td className="py-3.5 px-4">
                          {m.role === 'owner' ? (
                            <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs gap-1 font-semibold">
                              <Crown className="w-3 h-3 text-amber-400" />
                              Master Owner
                            </Badge>
                          ) : m.role === 'admin' ? (
                            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-xs gap-1 font-semibold">
                              <Building2 className="w-3 h-3 text-blue-400" />
                              Admin (Sếp)
                            </Badge>
                          ) : m.role === 'leader' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs gap-1 font-semibold">
                              Leader
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
                              User (Nhân viên)
                            </Badge>
                          )}
                        </td>

                        {/* Ngách phụ trách */}
                        <td className="py-3.5 px-4">
                          {m.assignedNiche ? (
                            <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs font-medium px-2 py-0.5 rounded">
                              {m.assignedNiche}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Chưa gán ngách</span>
                          )}
                        </td>

                        {/* Thiết bị HWID */}
                        <td className="py-3.5 px-4">
                          {m.role === 'owner' ? (
                            <span className="text-xs text-purple-300 font-mono">
                              Bypass HWID (Mọi máy)
                            </span>
                          ) : m.hasDeviceBound && m.boundDevice ? (
                            <div className="text-xs">
                              <div className="font-medium text-white flex items-center gap-1">
                                <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                                {m.boundDevice.deviceName || 'Windows PC'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {m.boundDevice.lastIp || '127.0.0.1'} •{' '}
                                {m.boundDevice.osInfo || 'Win'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Chưa gắn máy</span>
                          )}
                        </td>

                        {/* Trạng thái */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                              m.isActive
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                m.isActive ? 'bg-emerald-400' : 'bg-rose-400',
                              )}
                            />
                            {m.isActive ? 'Hoạt động' : 'Đã khóa'}
                          </span>
                        </td>

                        {/* Ngày tạo */}
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                          {new Date(m.createdAt).toLocaleDateString('vi-VN')}
                        </td>

                        {/* Thao tác */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Owner: Nút Gán Vào Công Ty */}
                            {isOwner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenAssignCompany(m)}
                                className="h-8 px-2.5 text-xs text-blue-400 hover:text-white hover:bg-blue-950/50 rounded-lg border border-blue-500/20"
                                title="Gán thành viên vào công ty"
                              >
                                <Building2 className="w-3.5 h-3.5 mr-1" />
                                Gán Cty
                              </Button>
                            )}

                            {/* Owner hoặc Admin: Nút Phân Quyền */}
                            {(isOwner ||
                              (isAdmin && (m.role === 'user' || m.role === 'leader'))) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenChangeRole(m)}
                                className="h-8 px-2.5 text-xs text-purple-400 hover:text-white hover:bg-purple-950/50 rounded-lg border border-purple-500/20"
                                title="Đổi vai trò phân quyền"
                              >
                                <KeyRound className="w-3.5 h-3.5 mr-1" />
                                Phân Quyền
                              </Button>
                            )}

                            {/* Sửa: Owner, Admin, Leader */}
                            {(isOwner || isAdmin || (isLeader && m.role === 'user')) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditMember(m)}
                                className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/50"
                                title="Sửa thông tin thành viên"
                              >
                                Sửa
                              </Button>
                            )}

                            {/* Reset Máy: Owner hoặc Admin khi máy đã bind */}
                            {m.hasDeviceBound && (isOwner || isAdmin) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResetMemberHwid(m)}
                                className="h-8 px-2 text-xs text-amber-400 hover:text-white hover:bg-amber-950/50 rounded-lg border border-amber-500/20"
                                title="Giải phóng máy HWID"
                              >
                                Reset Máy
                              </Button>
                            )}

                            {/* Xóa: Owner (trừ owner), Admin (User/Leader), Leader (User) */}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteMember(m)}
                                className="h-8 px-2 text-xs text-rose-400 hover:text-white hover:bg-rose-950/50 rounded-lg border border-rose-500/20"
                                title="Xóa tài khoản"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. TAB 2: QUẢN LÝ BẢN QUYỀN (LICENSE CENTER - OWNER EXCLUSIVE)       */}
      {/* ==================================================================== */}
      {activeTab === 'licenses' && (
        <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-slate-950/30">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                License Center (Bản Quyền Độc Quyền Cho Chủ Dự Án)
              </h2>
              <p className="text-xs text-slate-400">
                Tạo key chuẩn RTM, quản lý ghế ngồi máy trạm, gia hạn hạn dùng và thu hồi bản quyền
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setIssueCompanyId(tenants[0]?.id || '');
                setIsIssueLicenseOpen(true);
              }}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl h-8 text-xs gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Cấp License Mới
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                <tr>
                  <th className="py-3 px-4">License Key</th>
                  <th className="py-3 px-4">Công Ty Sở Hữu</th>
                  <th className="py-3 px-4 text-center">Gói</th>
                  <th className="py-3 px-4">Số Ghế (Used / Max)</th>
                  <th className="py-3 px-4">Thời Hạn Dùng</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác Nhanh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {filteredLicenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Không tìm thấy License nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredLicenses.map((lic) => {
                    const exp = new Date(lic.expiresAt);
                    const daysRemaining = Math.ceil(
                      (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                    );
                    const isExpiringSoon = daysRemaining <= 14 && daysRemaining > 0;
                    const isExpired = daysRemaining <= 0;

                    return (
                      <tr key={lic.id} className="hover:bg-purple-950/15 transition-colors group">
                        {/* Key */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-purple-200 tracking-wide select-all bg-purple-950/60 px-2.5 py-1 rounded-md border border-purple-500/30">
                              {lic.licenseKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(lic.licenseKey)}
                              className="text-slate-400 hover:text-purple-300 transition-colors p-1"
                              title="Sao chép License Key"
                            >
                              {copiedKey === lic.licenseKey ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Công ty */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{lic.companyName}</div>
                          <span className="text-xs text-purple-400/80 font-mono">
                            {lic.companyCode}
                          </span>
                        </td>

                        {/* Gói */}
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            className={cn(
                              'text-xs font-semibold uppercase px-2.5 py-0.5',
                              lic.tier === 'enterprise' &&
                                'bg-amber-500/15 text-amber-300 border-amber-500/40',
                              lic.tier === 'pro' &&
                                'bg-purple-500/15 text-purple-300 border-purple-500/40',
                              lic.tier === 'trial' &&
                                'bg-slate-500/15 text-slate-300 border-slate-500/40',
                            )}
                          >
                            {lic.tier}
                          </Badge>
                        </td>

                        {/* Ghế ngồi */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                              <span>
                                {lic.usedSeats} / {lic.maxSeats} Máy
                              </span>
                              <span>
                                {lic.maxSeats > 0
                                  ? `${Math.round((lic.usedSeats / lic.maxSeats) * 100)}%`
                                  : '0%'}
                              </span>
                            </div>
                            <div className="w-28 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  lic.usedSeats >= lic.maxSeats ? 'bg-rose-500' : 'bg-purple-500',
                                )}
                                style={{
                                  width: `${Math.min(100, (lic.usedSeats / (lic.maxSeats || 1)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Hạn dùng */}
                        <td className="py-3.5 px-4 text-xs">
                          <div className="font-medium text-slate-200">
                            {exp.toLocaleDateString('vi-VN')}
                          </div>
                          <div
                            className={cn(
                              'text-[11px] font-semibold mt-0.5',
                              isExpired
                                ? 'text-rose-400'
                                : isExpiringSoon
                                  ? 'text-amber-400'
                                  : 'text-slate-400',
                            )}
                          >
                            {isExpired
                              ? 'Đã hết hạn'
                              : daysRemaining > 3650
                                ? 'Vĩnh viễn (Trọn đời)'
                                : `Còn ${daysRemaining} ngày`}
                          </div>
                        </td>

                        {/* Trạng thái */}
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            className={cn(
                              'text-xs px-2.5 py-0.5',
                              lic.status === 'active' &&
                                'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                              lic.status === 'suspended' &&
                                'bg-amber-500/15 text-amber-300 border-amber-500/30',
                              lic.status === 'revoked' &&
                                'bg-rose-500/15 text-rose-400 border-rose-500/30',
                              lic.status === 'expired' &&
                                'bg-slate-500/15 text-slate-400 border-slate-500/30',
                            )}
                          >
                            {lic.status.toUpperCase()}
                          </Badge>
                        </td>

                        {/* Thao tác nhanh */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Nút Nâng Gói */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const matched = tenants.find((t) => t.id === lic.companyId);
                                if (matched) {
                                  handleOpenUpgradeModal(matched);
                                } else {
                                  handleOpenUpgradeModal({
                                    id: lic.companyId,
                                    name: lic.companyName,
                                    code: lic.companyCode,
                                    adminEmail: '',
                                    isActive: lic.status === 'active',
                                    userCount: 0,
                                    activeDeviceCount: 0,
                                    licenseTier: lic.tier,
                                    licenseStatus: lic.status,
                                    maxSeats: lic.maxSeats,
                                    usedSeats: lic.usedSeats,
                                    expiresAt: lic.expiresAt,
                                    createdAt: lic.validFrom,
                                    assignedNiches: [],
                                  });
                                }
                              }}
                              className="h-8 px-2 text-xs text-amber-400 hover:text-white hover:bg-amber-950/50 rounded-lg gap-1 border border-amber-500/20"
                              title="Nâng cấp gói dịch vụ (Trial / Pro / Enterprise)"
                            >
                              <Crown className="w-3.5 h-3.5" />
                              Nâng Gói
                            </Button>

                            {/* Nút Gia hạn */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedLicense(lic);
                                setIsExtendModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-indigo-300 hover:text-white hover:bg-indigo-950/50 rounded-lg gap-1"
                              title="Gia hạn thời gian sử dụng"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              Gia hạn
                            </Button>

                            {/* Nút Tăng Seats */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedLicense(lic);
                                setIsAddSeatsModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-purple-300 hover:text-white hover:bg-purple-950/50 rounded-lg gap-1"
                              title="Tăng thêm số lượng máy"
                            >
                              <Plus className="w-3.5 h-3.5" />+ Seats
                            </Button>

                            {/* Nút Đình chỉ / Kích hoạt lại */}
                            {lic.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleChangeLicenseStatus(lic.id, 'suspended')}
                                className="h-8 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 rounded-lg"
                                title="Tạm đình chỉ license"
                              >
                                Đình chỉ
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleChangeLicenseStatus(lic.id, 'active')}
                                className="h-8 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-lg"
                                title="Kích hoạt lại license"
                              >
                                Mở lại
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. TAB 4: GIÁM SÁT MÁY ONLINE & DUYỆT ĐỔI MÁY TRẠM                    */}
      {/* ==================================================================== */}
      {activeTab === 'devices' && (
        <div className="space-y-6">
          {/* Widget / Bảng Duyệt Yêu Cầu Đổi Máy Trạm Chờ Duyệt */}
          <div className="rounded-2xl border border-amber-500/25 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-amber-500/20 flex items-center justify-between bg-amber-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Yêu Cầu Đổi Máy Chờ Duyệt
                    {pendingResets.length > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs">
                        {pendingResets.length} yêu cầu
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Phê duyệt hoặc từ chối cấp phép chuyển quyền HWID sang máy trạm mới cho nhân sự
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-amber-500/15">
                  <tr>
                    <th className="py-3 px-4">Nhân Sự & Email</th>
                    <th className="py-3 px-4">Doanh Nghiệp</th>
                    <th className="py-3 px-4">Máy Cũ (HWID Hiện Tại)</th>
                    <th className="py-3 px-4">Máy Mới (HWID Đề Xuất)</th>
                    <th className="py-3 px-4">Lý Do Đổi Máy</th>
                    <th className="py-3 px-4">Thời Gian Yêu Cầu</th>
                    <th className="py-3 px-4 text-right">Phê Duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {pendingResets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400/60" />
                          <span className="text-sm">
                            Hiện không có yêu cầu đổi máy trạm nào cần phê duyệt.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pendingResets.map((req) => {
                      const reqId = req.requestId || req.id;
                      const isProcessing = isReviewingResetId === reqId;
                      return (
                        <tr key={req.id} className="hover:bg-amber-950/15 transition-colors">
                          {/* Nhân sự */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{req.userName}</div>
                            <div className="text-xs text-slate-400">{req.userEmail}</div>
                          </td>

                          {/* Doanh nghiệp */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-purple-300">{req.companyName}</span>
                          </td>

                          {/* Máy cũ */}
                          <td className="py-3.5 px-4">
                            <div className="text-xs font-medium text-slate-300">
                              {req.oldDeviceName}
                            </div>
                            {req.oldHwidHash ? (
                              <code className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                                {req.oldHwidHash.substring(0, 10)}...
                                {req.oldHwidHash.substring(req.oldHwidHash.length - 6)}
                              </code>
                            ) : (
                              <span className="text-xs text-slate-500">Chưa có hash</span>
                            )}
                          </td>

                          {/* Máy mới */}
                          <td className="py-3.5 px-4">
                            <div className="text-xs font-semibold text-emerald-300">
                              {req.newDeviceName}
                            </div>
                            {req.newHwidHash ? (
                              <code className="text-[11px] font-mono text-emerald-400 bg-slate-950/80 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                {req.newHwidHash.substring(0, 10)}...
                                {req.newHwidHash.substring(req.newHwidHash.length - 6)}
                              </code>
                            ) : (
                              <span className="text-xs text-slate-500">Chưa có hash</span>
                            )}
                          </td>

                          {/* Lý do */}
                          <td className="py-3.5 px-4 text-xs text-slate-300 max-w-xs">
                            <p className="line-clamp-2" title={req.reason}>
                              {req.reason}
                            </p>
                          </td>

                          {/* Thời gian */}
                          <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(req.requestedAt).toLocaleString('vi-VN')}
                          </td>

                          {/* Thao tác */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleReviewDeviceReset(reqId, 'approve')}
                                className="h-8 px-2.5 text-xs text-emerald-300 hover:text-white bg-emerald-950/30 hover:bg-emerald-600 border-emerald-500/40 rounded-lg gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Chấp Thuận
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleReviewDeviceReset(reqId, 'reject')}
                                className="h-8 px-2.5 text-xs text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-600 border-rose-500/40 rounded-lg gap-1"
                              >
                                <X className="w-3.5 h-3.5" />
                                Từ Chối
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Giám Sát Máy Online & Quản Trị Khóa HWID */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-slate-950/30">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-emerald-400" />
                  Giám Sát Máy Online & Quản Trị Khóa HWID
                </h2>
                <p className="text-xs text-slate-400">
                  Theo dõi tình trạng kết nối thời gian thực, chữ ký phần cứng và cưỡng chế đổi máy
                  từ xa
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online: {devices.filter((d) => d.status === 'online').length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Idle: {devices.filter((d) => d.status === 'idle').length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  Offline: {devices.filter((d) => d.status === 'offline').length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Thiết Bị & OS</th>
                    <th className="py-3 px-4">Nhân Sự Sở Hữu</th>
                    <th className="py-3 px-4">Doanh Nghiệp</th>
                    <th className="py-3 px-4">Mã Khóa HWID (Hash)</th>
                    <th className="py-3 px-4">Địa Chỉ IP</th>
                    <th className="py-3 px-4">Bản App</th>
                    <th className="py-3 px-4">Heartbeat Gần Nhất</th>
                    <th className="py-3 px-4 text-right">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Không có thiết bị nào khớp với từ khóa tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-purple-950/15 transition-colors group">
                        {/* Tên máy */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                                dev.status === 'online' && 'bg-emerald-400 animate-pulse',
                                dev.status === 'idle' && 'bg-amber-400',
                                dev.status === 'offline' && 'bg-slate-500',
                              )}
                            />
                            <div>
                              <div className="font-semibold text-white">{dev.deviceName}</div>
                              <div className="text-xs text-slate-400">{dev.osInfo}</div>
                            </div>
                          </div>
                        </td>

                        {/* Nhân sự */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-200">{dev.userName}</div>
                          <div className="text-xs text-slate-400">{dev.userEmail}</div>
                        </td>

                        {/* Doanh nghiệp */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-purple-300">{dev.companyName}</span>
                        </td>

                        {/* HWID Hash */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono bg-slate-950 px-2 py-0.5 rounded border border-purple-500/20 text-purple-300">
                              {dev.hwidHash.substring(0, 10)}...
                              {dev.hwidHash.substring(dev.hwidHash.length - 6)}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(dev.hwidHash)}
                              className="text-slate-400 hover:text-white"
                              title="Sao chép toàn bộ mã HWID hash"
                            >
                              {copiedKey === dev.hwidHash ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* IP */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                          {dev.lastIp}
                        </td>

                        {/* Phiên bản app */}
                        <td className="py-3.5 px-4">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {dev.clientVersion}
                          </span>
                        </td>

                        {/* Heartbeat */}
                        <td className="py-3.5 px-4 text-xs">
                          <span
                            className={cn(
                              'font-medium',
                              dev.status === 'online' && 'text-emerald-400',
                              dev.status === 'idle' && 'text-amber-300',
                              dev.status === 'offline' && 'text-slate-400',
                            )}
                          >
                            {new Date(dev.lastHeartbeatAt).toLocaleTimeString('vi-VN')}
                          </span>
                        </td>

                        {/* Thao tác: Hủy khóa máy */}
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(dev);
                              setIsUnbindModalOpen(true);
                            }}
                            className="h-8 px-2.5 text-xs text-rose-400 hover:text-white hover:bg-rose-950/50 rounded-lg gap-1 border border-rose-500/20"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Hủy khóa máy
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6.5. TAB 5: BÁO CÁO VẬN HÀNH & HIỆU SUẤT ĐỘI NGŨ (WORK REPORTS)       */}
      {/* ==================================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* KHỐI 1: BẢNG SO SÁNH ĐỐI ĐẦU GIỮA CÁC TEAM LEADER TOÀN SÀN */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    So Sánh Đối Đầu Hiệu Suất Giữa Các Đội Nhóm (All Teams)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tự động đối chiếu chất lượng, doanh thu và tỷ lệ BKT sạch giữa các Team Leader
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Đội Nhóm (Team)</th>
                    <th className="py-3 px-4">Trưởng Nhóm (Leader)</th>
                    <th className="py-3 px-4 text-center">Thành Viên</th>
                    <th className="py-3 px-4 text-center">Kênh Đích</th>
                    <th className="py-3 px-4 text-center">Đăng Hôm Nay</th>
                    <th className="py-3 px-4">Tổng View</th>
                    <th className="py-3 px-4">Doanh Thu (VND)</th>
                    <th className="py-3 px-4 text-center">Tỷ Lệ BKT Sạch</th>
                    <th className="py-3 px-4 text-center">Đánh Giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {teamsComparison.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Chưa có dữ liệu hoạt động giữa các đội nhóm trên hệ thống.
                      </td>
                    </tr>
                  ) : (
                    teamsComparison.map((tm) => (
                      <tr key={tm.team_id} className="hover:bg-purple-950/15 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>{tm.team_name}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{tm.leader_name}</p>
                          <p className="text-xs text-slate-400">{tm.leader_email}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-300">
                          {tm.members_count}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {tm.target_channels_count}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                          {tm.videos_uploaded_today} video
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {tm.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {tm.revenue_vnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {tm.quality_rate}%
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            className={cn(
                              'text-xs px-2.5 py-0.5 rounded-lg border font-semibold',
                              tm.evaluation === 'Xuất sắc'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : tm.evaluation === 'Hiệu quả cao'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                            )}
                          >
                            {tm.evaluation}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* KHỐI 2: BẢNG XẾP HẠNG NHÂN SỰ XUẤT SẮC TOÀN HỆ THỐNG */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Bảng Xếp Hạng Nhân Sự Toàn Hệ Thống (Top Performers)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Nhân sự dẫn đầu về số kênh đích vận hành, lượt xem & doanh thu đóng góp
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Hạng</th>
                    <th className="py-3 px-4">Nhân Sự</th>
                    <th className="py-3 px-4">Vai Trò</th>
                    <th className="py-3 px-4 text-center">Kênh Đích Nắm Giữ</th>
                    <th className="py-3 px-4 text-center">Video Đăng Hôm Nay</th>
                    <th className="py-3 px-4">Tổng Lượt Xem</th>
                    <th className="py-3 px-4">Doanh Thu Ước Tính (VND)</th>
                    <th className="py-3 px-4 text-center">Điểm Chất Lượng BKT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Chưa có dữ liệu xếp hạng nhân sự.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((lb, idx) => (
                      <tr
                        key={lb.user_id}
                        className={cn(
                          'hover:bg-purple-950/15 transition-colors',
                          idx === 0 && 'bg-amber-500/5',
                        )}
                      >
                        <td className="py-3.5 px-4">
                          {idx === 0 ? (
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/40">
                              <Trophy className="w-3.5 h-3.5" />
                            </div>
                          ) : idx === 1 ? (
                            <div className="w-6 h-6 rounded-full bg-slate-300/20 text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-400/40">
                              <Medal className="w-3.5 h-3.5" />
                            </div>
                          ) : idx === 2 ? (
                            <div className="w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 flex items-center justify-center font-bold text-xs border border-amber-700/40">
                              <Award className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-400 pl-2">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{lb.full_name}</p>
                          <p className="text-xs text-slate-400">{lb.email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={cn(
                              'text-xs px-2 py-0.2 rounded border',
                              lb.role === 'leader'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700',
                            )}
                          >
                            {lb.role === 'leader' ? 'Trưởng nhóm' : 'Kỹ thuật viên'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {lb.target_channels_count} kênh
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                          {lb.videos_uploaded_today} video
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {lb.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {lb.estimated_revenue_vnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                            {lb.quality_score}% Sạch
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* KHỐI 3: CHI TIẾT TỪNG NHÂN SỰ TOÀN HỆ THỐNG */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Chi Tiết Kênh Quản Lý & Kênh Đối Thủ Từng Nhân Sự
                  </h2>
                  <p className="text-xs text-slate-400">
                    Theo dõi chi tiết số kênh đích, kênh test, kênh đối thủ đang cào của từng nhân
                    sự
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Nhân Sự</th>
                    <th className="py-3 px-4">Doanh Nghiệp</th>
                    <th className="py-3 px-4">Kênh Đích & Kênh Test</th>
                    <th className="py-3 px-4">Kênh Đối Thủ Đang Giám Sát</th>
                    <th className="py-3 px-4">Sản Lượng Video</th>
                    <th className="py-3 px-4">Test BKT (Xanh/Đỏ)</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {workReports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Chưa có báo cáo công việc từ nhân sự.
                      </td>
                    </tr>
                  ) : (
                    workReports.map((r) => (
                      <tr key={r.user_id} className="hover:bg-purple-950/15 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white">{r.full_name}</p>
                          <p className="text-xs text-slate-400">{r.email}</p>
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs px-1.5 py-0.2 mt-1">
                            {r.assigned_niche || 'Mặc định'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-300">{r.company_name}</td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-emerald-400">
                              {r.target_channels_count} Kênh Đích
                            </span>
                            <span className="text-xs text-slate-400 block">
                              {r.test_channels_count} Kênh Test BKT
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="font-bold text-sky-400">
                              {r.competitor_channels_count} Kênh Đối Thủ
                            </span>
                            {r.competitor_channels && r.competitor_channels.length > 0 && (
                              <div className="text-xs text-slate-400 line-clamp-1">
                                {r.competitor_channels.map((c) => c.channel_name).join(', ')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-400">
                              {r.videos_uploaded_today} video hôm nay
                            </span>
                            <span className="text-xs text-slate-400 block">
                              Tuần: {r.videos_uploaded_week} | Tháng: {r.videos_uploaded_month}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-emerald-400">
                              {r.videos_tested_green} Xanh
                            </span>
                            <span className="text-slate-500">/</span>
                            <span className="font-semibold text-rose-400">
                              {r.videos_tested_red} Đỏ
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {r.competitor_channels?.[0]?.recent_5_videos?.length ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setViewingVideosModal({
                                  channelName: r.competitor_channels[0].channel_name,
                                  channelUrl: r.competitor_channels[0].channel_url,
                                  videos: r.competitor_channels[0].recent_5_videos,
                                })
                              }
                              className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs h-7 rounded-lg"
                            >
                              <Video className="w-3 h-3 mr-1 text-sky-400" />
                              Xem Video
                            </Button>
                          ) : (
                            <span className="text-slate-500 text-xs">Không có video</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem 5 Video Gần Nhất (Owner) */}
      {viewingVideosModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-purple-500/20 flex items-center justify-between bg-purple-950/20">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-sky-400" />5 Video Mới Nhất & Tăng Trưởng
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kênh đối thủ: {viewingVideosModal.channelName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingVideosModal(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {viewingVideosModal.videos.map((vid, idx) => (
                <div
                  key={vid.video_id || vid.id || idx}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-slate-200 text-xs line-clamp-2">
                      #{idx + 1}. {vid.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>
                        Lượt xem: {(vid.view_count || vid.views || 0).toLocaleString('vi-VN')}
                      </span>
                      {vid.upload_date && <span>Ngày đăng: {vid.upload_date}</span>}
                    </div>
                  </div>
                  {vid.url && (
                    <a
                      href={vid.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 border border-sky-500/20 px-2 py-1 rounded-lg shrink-0"
                    >
                      <span>Mở Video</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-purple-500/20 bg-slate-900/80 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingVideosModal(null)}
                className="border-slate-700 bg-slate-800 text-slate-200 text-xs rounded-xl"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6.5. TAB 5: BÁO CÁO VẬN HÀNH & HIỆU SUẤT ĐỘI NGŨ (WORK REPORTS)       */}
      {/* ==================================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* KHỐI 1: BẢNG SO SÁNH ĐỐI ĐẦU GIỮA CÁC TEAM LEADER TOÀN SÀN */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    So Sánh Đối Đầu Hiệu Suất Giữa Các Đội Nhóm (All Teams)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tự động đối chiếu chất lượng, doanh thu và tỷ lệ BKT sạch giữa các Team Leader
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Đội Nhóm (Team)</th>
                    <th className="py-3 px-4">Trưởng Nhóm (Leader)</th>
                    <th className="py-3 px-4 text-center">Thành Viên</th>
                    <th className="py-3 px-4 text-center">Kênh Đích</th>
                    <th className="py-3 px-4 text-center">Đăng Hôm Nay</th>
                    <th className="py-3 px-4">Tổng View</th>
                    <th className="py-3 px-4">Doanh Thu (VND)</th>
                    <th className="py-3 px-4 text-center">Tỷ Lệ BKT Sạch</th>
                    <th className="py-3 px-4 text-center">Đánh Giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {teamsComparison.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Chưa có dữ liệu hoạt động giữa các đội nhóm trên hệ thống.
                      </td>
                    </tr>
                  ) : (
                    teamsComparison.map((tm) => (
                      <tr key={tm.team_id} className="hover:bg-purple-950/15 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>{tm.team_name}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{tm.leader_name}</p>
                          <p className="text-xs text-slate-400">{tm.leader_email}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-300">
                          {tm.members_count}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {tm.target_channels_count}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                          {tm.videos_uploaded_today} video
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {tm.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {tm.revenue_vnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {tm.quality_rate}%
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            className={cn(
                              'text-xs px-2.5 py-0.5 rounded-lg border font-semibold',
                              tm.evaluation === 'Xuất sắc'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : tm.evaluation === 'Hiệu quả cao'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                            )}
                          >
                            {tm.evaluation}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* KHỐI 2: BẢNG XẾP HẠNG NHÂN SỰ XUẤT SẮC TOÀN HỆ THỐNG */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Bảng Xếp Hạng Nhân Sự Toàn Hệ Thống (Top Performers)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Nhân sự dẫn đầu về số kênh đích vận hành, lượt xem & doanh thu đóng góp
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Hạng</th>
                    <th className="py-3 px-4">Nhân Sự</th>
                    <th className="py-3 px-4">Vai Trò</th>
                    <th className="py-3 px-4 text-center">Kênh Đích Nắm Giữ</th>
                    <th className="py-3 px-4 text-center">Video Đăng Hôm Nay</th>
                    <th className="py-3 px-4">Tổng Lượt Xem</th>
                    <th className="py-3 px-4">Doanh Thu Ước Tính (VND)</th>
                    <th className="py-3 px-4 text-center">Điểm Chất Lượng BKT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Chưa có dữ liệu xếp hạng nhân sự.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((lb, idx) => (
                      <tr
                        key={lb.user_id}
                        className={cn(
                          'hover:bg-purple-950/15 transition-colors',
                          idx === 0 && 'bg-amber-500/5',
                        )}
                      >
                        <td className="py-3.5 px-4">
                          {idx === 0 ? (
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/40">
                              <Trophy className="w-3.5 h-3.5" />
                            </div>
                          ) : idx === 1 ? (
                            <div className="w-6 h-6 rounded-full bg-slate-300/20 text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-400/40">
                              <Medal className="w-3.5 h-3.5" />
                            </div>
                          ) : idx === 2 ? (
                            <div className="w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 flex items-center justify-center font-bold text-xs border border-amber-700/40">
                              <Award className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-400 pl-2">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{lb.full_name}</p>
                          <p className="text-xs text-slate-400">{lb.email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={cn(
                              'text-xs px-2 py-0.2 rounded border',
                              lb.role === 'leader'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700',
                            )}
                          >
                            {lb.role === 'leader' ? 'Trưởng nhóm' : 'Kỹ thuật viên'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                          {lb.target_channels_count} kênh
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                          {lb.videos_uploaded_today} video
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {lb.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {lb.estimated_revenue_vnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                            {lb.quality_score}% Sạch
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* KHỐI 3: CHI TIẾT TỪNG NHÂN SỰ TOÀN HỆ THỐNG */}
          <div className="rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/15 flex items-center justify-between bg-purple-950/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Chi Tiết Kênh Quản Lý & Kênh Đối Thủ Từng Nhân Sự
                  </h2>
                  <p className="text-xs text-slate-400">
                    Theo dõi chi tiết số kênh đích, kênh test, kênh đối thủ đang cào của từng nhân
                    sự
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-purple-500/15">
                  <tr>
                    <th className="py-3 px-4">Nhân Sự</th>
                    <th className="py-3 px-4">Doanh Nghiệp</th>
                    <th className="py-3 px-4">Kênh Đích & Kênh Test</th>
                    <th className="py-3 px-4">Kênh Đối Thủ Đang Giám Sát</th>
                    <th className="py-3 px-4">Sản Lượng Video</th>
                    <th className="py-3 px-4">Test BKT (Xanh/Đỏ)</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {workReports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Chưa có báo cáo công việc từ nhân sự.
                      </td>
                    </tr>
                  ) : (
                    workReports.map((r) => (
                      <tr key={r.user_id} className="hover:bg-purple-950/15 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white">{r.full_name}</p>
                          <p className="text-xs text-slate-400">{r.email}</p>
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs px-1.5 py-0.2 mt-1">
                            {r.assigned_niche || 'Mặc định'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-300">{r.company_name}</td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-emerald-400">
                              {r.target_channels_count} Kênh Đích
                            </span>
                            <span className="text-xs text-slate-400 block">
                              {r.test_channels_count} Kênh Test BKT
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="font-bold text-sky-400">
                              {r.competitor_channels_count} Kênh Đối Thủ
                            </span>
                            {r.competitor_channels && r.competitor_channels.length > 0 && (
                              <div className="text-xs text-slate-400 line-clamp-1">
                                {r.competitor_channels.map((c) => c.channel_name).join(', ')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-400">
                              {r.videos_uploaded_today} video hôm nay
                            </span>
                            <span className="text-xs text-slate-400 block">
                              Tuần: {r.videos_uploaded_week} | Tháng: {r.videos_uploaded_month}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-emerald-400">
                              {r.videos_tested_green} Xanh
                            </span>
                            <span className="text-slate-500">/</span>
                            <span className="font-semibold text-rose-400">
                              {r.videos_tested_red} Đỏ
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {r.competitor_channels?.[0]?.recent_5_videos?.length ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setViewingVideosModal({
                                  channelName: r.competitor_channels[0].channel_name,
                                  channelUrl: r.competitor_channels[0].channel_url,
                                  videos: r.competitor_channels[0].recent_5_videos,
                                })
                              }
                              className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs h-7 rounded-lg"
                            >
                              <Video className="w-3 h-3 mr-1 text-sky-400" />
                              Xem Video
                            </Button>
                          ) : (
                            <span className="text-slate-500 text-xs">Không có video</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem 5 Video Gần Nhất (Owner) */}
      {viewingVideosModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-purple-500/20 flex items-center justify-between bg-purple-950/20">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-sky-400" />5 Video Mới Nhất & Tăng Trưởng
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kênh đối thủ: {viewingVideosModal.channelName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingVideosModal(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {viewingVideosModal.videos.map((vid, idx) => (
                <div
                  key={vid.video_id || vid.id || idx}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-slate-200 text-xs line-clamp-2">
                      #{idx + 1}. {vid.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>
                        Lượt xem: {(vid.view_count || vid.views || 0).toLocaleString('vi-VN')}
                      </span>
                      {vid.upload_date && <span>Ngày đăng: {vid.upload_date}</span>}
                    </div>
                  </div>
                  {vid.url && (
                    <a
                      href={vid.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 border border-sky-500/20 px-2 py-1 rounded-lg shrink-0"
                    >
                      <span>Mở Video</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-purple-500/20 bg-slate-900/80 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingVideosModal(null)}
                className="border-slate-700 bg-slate-800 text-slate-200 text-xs rounded-xl"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. MODAL: THÊM CÔNG TY MỚI                                           */}
      {/* ==================================================================== */}
      {isAddTenantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Thêm Công Ty Mới (Tenant)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTenantOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label
                  htmlFor="new-tenant-name"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Tên Công Ty / Doanh Nghiệp <span className="text-rose-400">*</span>
                </label>
                <Input
                  id="new-tenant-name"
                  type="text"
                  placeholder="Ví dụ: VinaMedia Studio"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  required
                  className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-tenant-code"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Mã Code Công Ty <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="new-tenant-code"
                    type="text"
                    placeholder="VINAMEDIA"
                    value={newTenantCode}
                    onChange={(e) =>
                      setNewTenantCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))
                    }
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm font-mono uppercase rounded-xl"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-admin-email"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Email Sếp / Admin Quản Trị <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="new-admin-email"
                    type="email"
                    placeholder="admin@vinamedia.vn"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="new-tenant-tier"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Gói License Khởi Tạo
                  </label>
                  <select
                    id="new-tenant-tier"
                    value={newTenantTier}
                    onChange={(e) => {
                      const t = e.target.value as LicenseTier;
                      setNewTenantTier(t);
                      setNewTenantSeats(t === 'enterprise' ? 50 : t === 'pro' ? 10 : 3);
                    }}
                    className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-9 px-3 focus:outline-none"
                  >
                    <option value="enterprise">Enterprise</option>
                    <option value="pro">Pro Studio</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-tenant-seats"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Số Ghế Máy Cấp
                  </label>
                  <Input
                    id="new-tenant-seats"
                    type="number"
                    min={1}
                    max={999}
                    value={newTenantSeats}
                    onChange={(e) => setNewTenantSeats(Number(e.target.value))}
                    className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-tenant-duration"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Thời Hạn
                  </label>
                  <select
                    id="new-tenant-duration"
                    value={newTenantDurationDays}
                    onChange={(e) => setNewTenantDurationDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-9 px-3 focus:outline-none"
                  >
                    <option value={30}>30 ngày</option>
                    <option value={90}>3 tháng</option>
                    <option value={365}>1 năm (365 ngày)</option>
                    <option value={3650}>Trọn đời (10 năm)</option>
                  </select>
                </div>
              </div>

              {/* Ngách Hoạt Động */}
              <div>
                <label
                  htmlFor="new-tenant-custom-niche"
                  className="text-xs font-semibold text-slate-300 block mb-1.5"
                >
                  Ngách Hoạt Động (Assigned Niches)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEFAULT_AVAILABLE_NICHES.map((niche) => {
                    const isSelected = newTenantNiches.includes(niche);
                    return (
                      <button
                        type="button"
                        key={niche}
                        onClick={() => {
                          setNewTenantNiches((prev) =>
                            isSelected ? prev.filter((n) => n !== niche) : [...prev, niche],
                          );
                        }}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-lg border transition-all',
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-purple-500/20 hover:text-white hover:border-purple-500/40',
                        )}
                      >
                        {niche}
                      </button>
                    );
                  })}
                  {newTenantNiches
                    .filter((n) => !DEFAULT_AVAILABLE_NICHES.includes(n))
                    .map((customNiche) => (
                      <span
                        key={customNiche}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white border border-purple-500"
                      >
                        {customNiche}
                        <button
                          type="button"
                          onClick={() =>
                            setNewTenantNiches((prev) => prev.filter((n) => n !== customNiche))
                          }
                          className="hover:text-rose-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="new-tenant-custom-niche"
                    type="text"
                    placeholder="Nhập ngách tự do khác..."
                    value={newTenantCustomNiche}
                    onChange={(e) => setNewTenantCustomNiche(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (
                          newTenantCustomNiche.trim() &&
                          !newTenantNiches.includes(newTenantCustomNiche.trim())
                        ) {
                          setNewTenantNiches((prev) => [...prev, newTenantCustomNiche.trim()]);
                          setNewTenantCustomNiche('');
                        }
                      }
                    }}
                    className="bg-slate-950 border-purple-500/20 text-xs rounded-xl h-8"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        newTenantCustomNiche.trim() &&
                        !newTenantNiches.includes(newTenantCustomNiche.trim())
                      ) {
                        setNewTenantNiches((prev) => [...prev, newTenantCustomNiche.trim()]);
                        setNewTenantCustomNiche('');
                      }
                    }}
                    className="rounded-xl border-purple-500/20 text-xs h-8 px-3"
                  >
                    + Thêm
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddTenantOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30"
                >
                  Tạo Công Ty & Kích Hoạt Key
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7b. MODAL: SỬA DOANH NGHIỆP                                         */}
      {/* ==================================================================== */}
      {isEditTenantOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Sửa Thông Tin Doanh Nghiệp</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditTenantOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditTenant} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-tenant-name"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Tên Công Ty / Doanh Nghiệp <span className="text-rose-400">*</span>
                </label>
                <Input
                  id="edit-tenant-name"
                  type="text"
                  value={editTenantName}
                  onChange={(e) => setEditTenantName(e.target.value)}
                  required
                  className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-tenant-code"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Mã Code Công Ty <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="edit-tenant-code"
                    type="text"
                    value={editTenantCode}
                    onChange={(e) =>
                      setEditTenantCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))
                    }
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm font-mono uppercase rounded-xl"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-admin-email"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Email Sếp / Admin Quản Trị <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="edit-admin-email"
                    type="email"
                    value={editAdminEmail}
                    onChange={(e) => setEditAdminEmail(e.target.value)}
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  />
                </div>
              </div>

              {/* Ngách Hoạt Động */}
              <div>
                <label
                  htmlFor="edit-tenant-custom-niche"
                  className="text-xs font-semibold text-slate-300 block mb-1.5"
                >
                  Ngách Hoạt Động (Assigned Niches)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEFAULT_AVAILABLE_NICHES.map((niche) => {
                    const isSelected = editTenantNiches.includes(niche);
                    return (
                      <button
                        type="button"
                        key={niche}
                        onClick={() => {
                          setEditTenantNiches((prev) =>
                            isSelected ? prev.filter((n) => n !== niche) : [...prev, niche],
                          );
                        }}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-lg border transition-all',
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-purple-500/20 hover:text-white hover:border-purple-500/40',
                        )}
                      >
                        {niche}
                      </button>
                    );
                  })}
                  {editTenantNiches
                    .filter((n) => !DEFAULT_AVAILABLE_NICHES.includes(n))
                    .map((customNiche) => (
                      <span
                        key={customNiche}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white border border-purple-500"
                      >
                        {customNiche}
                        <button
                          type="button"
                          onClick={() =>
                            setEditTenantNiches((prev) => prev.filter((n) => n !== customNiche))
                          }
                          className="hover:text-rose-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="edit-tenant-custom-niche"
                    type="text"
                    placeholder="Nhập ngách tự do khác..."
                    value={editTenantCustomNiche}
                    onChange={(e) => setEditTenantCustomNiche(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (
                          editTenantCustomNiche.trim() &&
                          !editTenantNiches.includes(editTenantCustomNiche.trim())
                        ) {
                          setEditTenantNiches((prev) => [...prev, editTenantCustomNiche.trim()]);
                          setEditTenantCustomNiche('');
                        }
                      }
                    }}
                    className="bg-slate-950 border-purple-500/20 text-xs rounded-xl h-8"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        editTenantCustomNiche.trim() &&
                        !editTenantNiches.includes(editTenantCustomNiche.trim())
                      ) {
                        setEditTenantNiches((prev) => [...prev, editTenantCustomNiche.trim()]);
                        setEditTenantCustomNiche('');
                      }
                    }}
                    className="rounded-xl border-purple-500/20 text-xs h-8 px-3"
                  >
                    + Thêm
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditTenantOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30"
                >
                  Lưu Thay Đổi
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 8. MODAL: CẤP LICENSE MỚI (LICENSE ISSUE MODAL)                      */}
      {/* ==================================================================== */}
      {isIssueLicenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Cấp License Bản Quyền Mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsIssueLicenseOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleIssueLicenseSubmit} className="space-y-4">
              {/* Preview key */}
              <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
                <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider block mb-1">
                  Mã License Sinh Tự Động:
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-base text-purple-200 select-all">
                    {previewGeneratedKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewGeneratedKey(generateStandardLicenseKey(issueTier))}
                    className="text-xs text-purple-300 hover:text-white flex items-center gap-1 bg-purple-900/40 px-2 py-1 rounded-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Đổi mã
                  </button>
                </div>
              </div>

              {/* Chọn công ty */}
              <div>
                <label
                  htmlFor="issue-company-select"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Công Ty Sở Hữu <span className="text-rose-400">*</span>
                </label>
                <select
                  id="issue-company-select"
                  value={issueCompanyId}
                  onChange={(e) => setIssueCompanyId(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chọn Gói & Presets */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="issue-tier-select"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Gói Giấy Phép (Tier)
                  </label>
                  <select
                    id="issue-tier-select"
                    value={issueTier}
                    onChange={(e) => {
                      const t = e.target.value as LicenseTier;
                      setIssueTier(t);
                      if (t === 'enterprise') setIssueSeats(50);
                      else if (t === 'pro') setIssueSeats(10);
                      else setIssueSeats(3);
                    }}
                    className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-9 px-3 focus:outline-none"
                  >
                    <option value="enterprise">Enterprise (50+ Máy)</option>
                    <option value="pro">Pro (10 Máy)</option>
                    <option value="trial">Trial (3 Máy)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="issue-days-select"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Thời Hạn Dùng
                  </label>
                  <select
                    id="issue-days-select"
                    value={issueDaysValid}
                    onChange={(e) => setIssueDaysValid(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-9 px-3 focus:outline-none"
                  >
                    <option value={30}>30 ngày</option>
                    <option value={90}>90 ngày (3 tháng)</option>
                    <option value={365}>1 năm (365 ngày)</option>
                    <option value={3650}>Trọn đời (10 năm)</option>
                  </select>
                </div>
              </div>

              {/* Presets số ghế */}
              <div>
                <label
                  htmlFor="issue-seats-input"
                  className="text-xs font-semibold text-slate-300 block mb-1.5"
                >
                  Số Ghế (Seats / Thiết bị được kích hoạt)
                </label>
                <div className="flex items-center gap-2 mb-2">
                  {[5, 10, 50, 999].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setIssueSeats(s)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        issueSeats === s
                          ? 'bg-purple-600 text-white border-purple-400'
                          : 'bg-slate-950 border-purple-500/20 text-slate-300 hover:bg-slate-800',
                      )}
                    >
                      {s === 999 ? 'Vô hạn (999)' : `${s} Máy`}
                    </button>
                  ))}
                </div>
                <Input
                  id="issue-seats-input"
                  type="number"
                  min={1}
                  max={999}
                  value={issueSeats}
                  onChange={(e) => setIssueSeats(Number(e.target.value))}
                  className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  placeholder="Hoặc nhập số ghế tùy chỉnh..."
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsIssueLicenseOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30"
                >
                  Xác Nhận Cấp Bản Quyền
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 9. MODAL: GIA HẠN LICENSE                                            */}
      {/* ==================================================================== */}
      {isExtendModalOpen && selectedLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Gia Hạn Bản Quyền</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExtendModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Key:{' '}
                <span className="font-mono text-purple-300 font-semibold">
                  {selectedLicense.licenseKey}
                </span>
              </div>
              <div>
                Công ty:{' '}
                <span className="text-white font-semibold">{selectedLicense.companyName}</span>
              </div>
              <div>
                Hạn hiện tại:{' '}
                <span className="text-slate-400">
                  {new Date(selectedLicense.expiresAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 block mb-1">
                Chọn Thời Gian Gia Hạn Thêm:
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '+30 Ngày', days: 30 },
                  { label: '+90 Ngày', days: 90 },
                  { label: '+1 Năm', days: 365 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setExtendDaysToAdd(opt.days)}
                    className={cn(
                      'py-2 rounded-xl text-xs font-semibold border transition-all',
                      extendDaysToAdd === opt.days
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-slate-950 border-purple-500/20 text-slate-300 hover:bg-slate-800',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExtendModalOpen(false)}
                className="rounded-xl border-slate-700 text-slate-300"
              >
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleExtendLicenseConfirm}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white"
              >
                Xác Nhận Gia Hạn
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 10. MODAL: TĂNG SEATS CHO LICENSE                                    */}
      {/* ==================================================================== */}
      {isAddSeatsModalOpen && selectedLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Tăng Số Lượng Máy (Seats)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSeatsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Công ty:{' '}
                <span className="text-white font-semibold">{selectedLicense.companyName}</span>
              </div>
              <div>
                Số máy hiện tại:{' '}
                <span className="text-purple-300 font-bold">{selectedLicense.maxSeats} Máy</span>{' '}
                (Đang dùng: {selectedLicense.usedSeats})
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 block mb-1.5">
                Cộng Thêm Số Máy:
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSeatsToAdd(num)}
                    className={cn(
                      'py-2 rounded-xl text-xs font-semibold border transition-all',
                      seatsToAdd === num
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-slate-950 border-purple-500/20 text-slate-300 hover:bg-slate-800',
                    )}
                  >
                    +{num} Máy
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={1}
                max={500}
                value={seatsToAdd}
                onChange={(e) => setSeatsToAdd(Number(e.target.value))}
                className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddSeatsModalOpen(false)}
                className="rounded-xl border-slate-700 text-slate-300"
              >
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleAddSeatsConfirm}
                className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white"
              >
                Cập Nhật ({selectedLicense.maxSeats + seatsToAdd} Máy)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 11. MODAL: HỦY KHÓA MÁY TỪ XA (REMOTE HWID UNBIND)                   */}
      {/* ==================================================================== */}
      {isUnbindModalOpen && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Xác Nhận Hủy Khóa Máy Từ Xa?</h3>
                <p className="text-xs text-rose-300">
                  Hành động này sẽ giải phóng slot bản quyền ngay lập tức
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Tên máy:</span>
                <span className="font-semibold text-white">{selectedDevice.deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Nhân sự:</span>
                <span className="text-slate-200">
                  {selectedDevice.userName} ({selectedDevice.userEmail})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Công ty:</span>
                <span className="text-purple-300 font-semibold">{selectedDevice.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">HWID Hash:</span>
                <span className="font-mono text-slate-300">
                  {selectedDevice.hwidHash.substring(0, 16)}...
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Sau khi hủy, máy tính này sẽ bị ngắt quyền chạy ReTubeMatrix. Nhân sự của khách hàng
              có thể mở app trên máy tính mới và đăng nhập lại để nhận slot.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsUnbindModalOpen(false)}
                className="rounded-xl border-slate-700 text-slate-300"
              >
                Hủy bỏ
              </Button>
              <Button
                size="sm"
                onClick={handleUnbindDeviceConfirm}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white"
              >
                Đồng Ý Hủy Khóa Máy
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 12. MODAL: GÁN VÀO CÔNG TY (CHỈ MASTER OWNER)                         */}
      {/* ==================================================================== */}
      {isAssignCompanyModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Gán Thành Viên Vào Công Ty</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignCompanyModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Thành viên:{' '}
                <span className="text-white font-semibold">
                  {selectedMember.fullName || selectedMember.email}
                </span>
              </div>
              <div>
                Email: <span className="font-mono text-purple-300">{selectedMember.email}</span>
              </div>
              <div>
                Công ty hiện tại:{' '}
                <span className="text-slate-400">
                  {selectedMember.companyName || 'Chưa gán công ty'}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmAssignCompany} className="space-y-4 pt-2">
              <div>
                <label
                  htmlFor="assign-comp-select"
                  className="text-xs font-semibold text-slate-300 block mb-1.5"
                >
                  Chọn Công Ty Trực Thuộc:
                </label>
                <select
                  id="assign-comp-select"
                  value={assignCompanyId}
                  onChange={(e) => setAssignCompanyId(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/20 text-slate-200 text-sm rounded-xl h-10 px-3 focus:outline-none"
                >
                  <option value="">-- Chưa Gán Vào Công Ty --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAssignCompanyModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Xác Nhận Gán Công Ty
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 13. MODAL: PHÂN QUYỀN VAI TRÒ (RBAC)                                 */}
      {/* ==================================================================== */}
      {isChangeRoleModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-blue-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Phân Quyền Vai Trò</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeRoleModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Thành viên:{' '}
                <span className="text-white font-semibold">
                  {selectedMember.fullName || selectedMember.email}
                </span>
              </div>
              <div>
                Vai trò hiện tại:{' '}
                <span className="font-semibold uppercase text-amber-300">
                  {selectedMember.role}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmChangeRole} className="space-y-4 pt-2">
              <div>
                <label
                  htmlFor="change-role-select"
                  className="text-xs font-semibold text-slate-300 block mb-1.5"
                >
                  Chọn Vai Trò Cấp Mới:
                </label>
                <select
                  id="change-role-select"
                  value={changeRoleValue}
                  onChange={(e) =>
                    setChangeRoleValue(e.target.value as 'admin' | 'leader' | 'user')
                  }
                  className="w-full bg-slate-950 border border-blue-500/20 text-slate-200 text-sm rounded-xl h-10 px-3 focus:outline-none"
                >
                  {isOwner && <option value="admin">Admin (Quản trị viên công ty)</option>}
                  <option value="leader">Leader (Trưởng nhóm)</option>
                  <option value="user">User (Nhân viên)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {changeRoleValue === 'admin' &&
                    'Admin có toàn quyền quản lý nhân sự, phân quyền User lên Leader, sửa/xóa User/Leader trong công ty.'}
                  {changeRoleValue === 'leader' &&
                    'Leader có quyền quản lý, sửa/xóa các User trong công ty/nhóm.'}
                  {changeRoleValue === 'user' &&
                    'User chỉ sử dụng app để sản xuất nội dung, không có quyền quản lý nhân sự.'}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-blue-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsChangeRoleModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Cập Nhật Phân Quyền
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CẤP TÀI KHOẢN MỚI TRỰC TIẾP (EMAIL, MẬT KHẨU & ROLE)          */}
      {/* ==================================================================== */}
      {isCreateMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-emerald-500/40 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Cấp Tài Khoản Mới & Phân Quyền</h3>
                  <p className="text-xs text-slate-400">
                    Khởi tạo tài khoản nhân viên kèm mật khẩu và doanh nghiệp trực thuộc
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateMemberModalOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Đóng modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdMemberSuccess ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>Đã tạo tài khoản thành công! Thông tin đăng nhập:</span>
                  </div>

                  <div className="space-y-2 text-xs bg-slate-950/80 p-3.5 rounded-xl border border-purple-500/20 font-mono">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400">Họ và tên:</span>
                      <span className="text-white font-semibold">
                        {createdMemberSuccess.fullName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400">Email:</span>
                      <span className="text-purple-300 font-bold select-all">
                        {createdMemberSuccess.email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400">Mật khẩu:</span>
                      <span className="text-amber-300 font-bold select-all">
                        {createdMemberSuccess.password}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400">Vai trò (Role):</span>
                      <span className="text-indigo-300 font-bold">{createdMemberSuccess.role}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Doanh nghiệp:</span>
                      <span className="text-slate-200">{createdMemberSuccess.companyName}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      const creds = `THÔNG TIN ĐĂNG NHẬP RETUBEMATRIX:\n- Họ và tên: ${createdMemberSuccess.fullName}\n- Email: ${createdMemberSuccess.email}\n- Mật khẩu: ${createdMemberSuccess.password}\n- Vai trò: ${createdMemberSuccess.role}\n- Doanh nghiệp: ${createdMemberSuccess.companyName}\n\nĐăng nhập tại ứng dụng desktop hoặc web portal.`;
                      navigator.clipboard.writeText(creds);
                      showFlashMessage('Đã sao chép Email & Mật khẩu vào bộ nhớ tạm!');
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs gap-2 py-2 h-auto"
                  >
                    <Copy className="w-4 h-4" />
                    Sao Chép Email & Mật Khẩu Để Gửi Nhân Viên
                  </Button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreatedMemberSuccess(null);
                      setCreateEmail('');
                      setCreatePassword(generateRandomPassword());
                      setCreateFullName('');
                    }}
                    className="rounded-xl border-slate-700 text-slate-300 text-xs"
                  >
                    + Cấp Thêm Tài Khoản Khác
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsCreateMemberModalOpen(false)}
                    className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs"
                  >
                    Hoàn Tất & Đóng
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmCreateMember} className="space-y-4">
                {/* Email */}
                <div>
                  <label
                    htmlFor="create-member-email"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Địa Chỉ Email Đăng Nhập <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="create-member-email"
                    type="email"
                    placeholder="nhanvien@company.vn"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  />
                </div>

                {/* Mật khẩu khởi tạo */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="create-member-password"
                      className="text-xs font-semibold text-slate-300"
                    >
                      Mật Khẩu Khởi Tạo <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCreatePassword(generateRandomPassword())}
                      className="text-[11px] text-purple-400 hover:text-purple-300 underline"
                    >
                      Tạo ngẫu nhiên
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="create-member-password"
                      type={showCreatePassword ? 'text' : 'password'}
                      placeholder="Nhập hoặc tạo ngẫu nhiên mật khẩu..."
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      required
                      className="bg-slate-950 border-purple-500/20 text-sm rounded-xl pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      title={showCreatePassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showCreatePassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Họ và tên */}
                <div>
                  <label
                    htmlFor="create-member-fullname"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Họ Và Tên Thành Viên <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id="create-member-fullname"
                    type="text"
                    placeholder="Nguyễn Văn A"
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    required
                    className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                  />
                </div>

                {/* Doanh nghiệp */}
                <div>
                  <label
                    htmlFor="create-member-company"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Thuộc Doanh Nghiệp (Công Ty) <span className="text-rose-400">*</span>
                  </label>
                  {isOwner ? (
                    <select
                      id="create-member-company"
                      value={createCompanyId}
                      onChange={(e) => setCreateCompanyId(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="create-member-company"
                      type="text"
                      disabled
                      value={
                        tenants.find((t) => t.id === currentCompanyId)?.name || 'Công ty hiện tại'
                      }
                      className="bg-slate-950/60 border-slate-800 text-sm rounded-xl opacity-70 cursor-not-allowed"
                    />
                  )}
                </div>

                {/* Vai trò */}
                <div>
                  <label
                    htmlFor="create-member-role"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Cấp Bậc Phân Quyền (Role) <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="create-member-role"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as 'admin' | 'leader' | 'user')}
                    className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {isOwner && (
                      <option value="admin">Admin — Quản trị viên / Sếp điều hành công ty</option>
                    )}
                    <option value="leader">Leader — Trưởng nhóm kỹ thuật / Quản lý kênh</option>
                    <option value="user">User — Nhân viên thực thi / Kỹ thuật viên reup</option>
                  </select>
                </div>

                {/* Ngách phụ trách */}
                <div>
                  <label
                    htmlFor="create-member-niche"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Ngách Phụ Trách
                  </label>
                  <select
                    id="create-member-niche"
                    value={createAssignedNiche}
                    onChange={(e) => setCreateAssignedNiche(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="">-- Chưa chọn ngách --</option>
                    {(() => {
                      const selComp = tenants.find((t) => t.id === createCompanyId);
                      const available =
                        selComp?.assignedNiches && selComp.assignedNiches.length > 0
                          ? selComp.assignedNiches
                          : DEFAULT_AVAILABLE_NICHES;
                      return available.map((niche) => (
                        <option key={niche} value={niche}>
                          {niche}
                        </option>
                      ));
                    })()}
                    <option value="__custom__">Nhập ngách khác...</option>
                  </select>
                  {createAssignedNiche === '__custom__' && (
                    <Input
                      type="text"
                      placeholder="Nhập tên ngách phụ trách..."
                      value={createCustomNiche}
                      onChange={(e) => setCreateCustomNiche(e.target.value)}
                      className="mt-2 bg-slate-950 border-purple-500/20 text-xs rounded-xl h-9"
                    />
                  )}
                </div>

                {/* Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateMemberModalOpen(false)}
                    className="rounded-xl border-slate-700 text-slate-300 text-xs"
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    disabled={isCreatingMember}
                    size="sm"
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs gap-1.5 shadow-md shadow-emerald-950/40"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {isCreatingMember ? 'Đang cấp tài khoản...' : 'Xác Nhận Cấp Tài Khoản'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: GÁN THÀNH VIÊN VÀO CÔNG TY                                    */}
      {/* ==================================================================== */}
      {isAssignCompanyModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-blue-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Gán Thành Viên Vào Công Ty</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignCompanyModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAssignCompany} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                <div className="text-slate-400">Thành viên:</div>
                <div className="font-semibold text-white text-sm">
                  {selectedMember.fullName || selectedMember.email}
                </div>
                <div className="font-mono text-slate-400 text-xs">{selectedMember.email}</div>
              </div>

              <div>
                <label
                  htmlFor="assign-comp-select"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Chọn Công Ty Trực Thuộc
                </label>
                <select
                  id="assign-comp-select"
                  value={assignCompanyId}
                  onChange={(e) => setAssignCompanyId(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- Không gán (Hủy gán công ty) --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAssignCompanyModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Lưu Gán Công Ty
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: PHÂN QUYỀN VAI TRÒ                                            */}
      {/* ==================================================================== */}
      {isChangeRoleModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Phân Quyền Vai Trò</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeRoleModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmChangeRole} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                <div className="text-slate-400">Thành viên:</div>
                <div className="font-semibold text-white text-sm">
                  {selectedMember.fullName || selectedMember.email}
                </div>
                <div className="font-mono text-slate-400 text-xs">
                  {selectedMember.email} • Hiện tại:{' '}
                  <span className="uppercase text-purple-300 font-semibold">
                    {selectedMember.role}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="change-role-select"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Chọn Cấp Bậc Phân Quyền Mới
                </label>
                <select
                  id="change-role-select"
                  value={changeRoleValue}
                  onChange={(e) =>
                    setChangeRoleValue(e.target.value as 'admin' | 'leader' | 'user')
                  }
                  className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {isOwner && <option value="admin">Admin (Quản trị viên / Sếp công ty)</option>}
                  <option value="leader">Leader (Trưởng nhóm)</option>
                  <option value="user">User (Nhân viên thông thường)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsChangeRoleModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Cập Nhật Quyền
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CHỈNH SỬA THÔNG TIN THÀNH VIÊN                                */}
      {/* ==================================================================== */}
      {isEditMemberModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-purple-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Chỉnh Sửa Thông Tin Thành Viên</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditMemberModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditMember} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-member-email"
                  className="text-xs font-semibold text-slate-400 block mb-1"
                >
                  Email (Không đổi)
                </label>
                <Input
                  id="edit-member-email"
                  type="email"
                  value={selectedMember.email}
                  disabled
                  className="bg-slate-950/60 border-slate-800 text-sm rounded-xl opacity-60 cursor-not-allowed"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-member-fullname"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Họ Và Tên
                </label>
                <Input
                  id="edit-member-fullname"
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  className="bg-slate-950 border-purple-500/20 text-sm rounded-xl"
                />
              </div>

              {/* Ngách phụ trách */}
              <div>
                <label
                  htmlFor="edit-member-niche"
                  className="text-xs font-semibold text-slate-300 block mb-1"
                >
                  Ngách Phụ Trách
                </label>
                <select
                  id="edit-member-niche"
                  value={editAssignedNiche}
                  onChange={(e) => setEditAssignedNiche(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/20 text-sm text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- Chưa chọn ngách --</option>
                  {(() => {
                    const selComp = tenants.find((t) => t.id === selectedMember.companyId);
                    const available =
                      selComp?.assignedNiches && selComp.assignedNiches.length > 0
                        ? selComp.assignedNiches
                        : DEFAULT_AVAILABLE_NICHES;
                    return available.map((niche) => (
                      <option key={niche} value={niche}>
                        {niche}
                      </option>
                    ));
                  })()}
                  <option value="__custom__">Nhập ngách khác...</option>
                </select>
                {editAssignedNiche === '__custom__' && (
                  <Input
                    type="text"
                    placeholder="Nhập tên ngách phụ trách..."
                    value={editCustomNiche}
                    onChange={(e) => setEditCustomNiche(e.target.value)}
                    className="mt-2 bg-slate-950 border-purple-500/20 text-xs rounded-xl h-9"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-member-active"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded bg-slate-950 border-purple-500/30 text-purple-600 focus:ring-0"
                />
                <label
                  htmlFor="edit-member-active"
                  className="text-xs text-slate-300 cursor-pointer"
                >
                  Tài khoản đang hoạt động (Active)
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-purple-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMemberModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Lưu Thay Đổi
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 14. MODAL: NÂNG CẤP GÓI BẢN QUYỀN DOANH NGHIỆP                        */}
      {/* ==================================================================== */}
      {isUpgradeTierModalOpen && upgradeTargetTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-amber-500/30 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Nâng Cấp Gói Bản Quyền Doanh Nghiệp
                  </h3>
                  <p className="text-xs text-slate-400">
                    Công ty:{' '}
                    <span className="text-white font-semibold">{upgradeTargetTenant.name}</span> (
                    {upgradeTargetTenant.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeTierModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmUpgradeTier} className="space-y-4">
              {/* Thẻ hiển thị gói hiện tại */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Gói hiện tại: </span>
                  <span className="font-bold text-purple-300 uppercase">
                    {upgradeTargetTenant.licenseTier}
                  </span>
                  <span className="text-slate-500 ml-2">
                    ({upgradeTargetTenant.maxSeats} máy • {upgradeTargetTenant.activeDeviceCount}{' '}
                    đang dùng)
                  </span>
                </div>
                <div className="text-slate-400">
                  Hạn dùng:{' '}
                  <span className="text-slate-200">
                    {new Date(upgradeTargetTenant.expiresAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>

              {/* Chọn Gói Mục Tiêu */}
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">
                  Chọn Gói Dịch Vụ Cần Nâng Cấp:
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {/* Trial */}
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeTargetTier('trial');
                      setUpgradeMaxSeats(3);
                      setUpgradeExtendDays(14);
                    }}
                    className={cn(
                      'p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      upgradeTargetTier === 'trial'
                        ? 'bg-slate-800/80 border-slate-400 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">Dùng Thử</span>
                        {upgradeTargetTier === 'trial' && (
                          <Check className="w-3.5 h-3.5 text-slate-300" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">Trial 14 Ngày</div>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-300 space-y-0.5">
                      <div>3 Máy tối đa</div>
                      <div>15 Video BKT/ngày</div>
                      <div>5 Profiles</div>
                    </div>
                  </button>

                  {/* Pro */}
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeTargetTier('pro');
                      setUpgradeMaxSeats(10);
                      setUpgradeExtendDays(365);
                    }}
                    className={cn(
                      'p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      upgradeTargetTier === 'pro'
                        ? 'bg-purple-950/50 border-purple-400 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-300">Chuyên Nghiệp</span>
                        {upgradeTargetTier === 'pro' && (
                          <Check className="w-3.5 h-3.5 text-purple-300" />
                        )}
                      </div>
                      <div className="text-[10px] text-purple-400 mt-1">Pro 1 Năm</div>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-300 space-y-0.5">
                      <div className="font-semibold text-purple-200">10 Máy tối đa</div>
                      <div>50 Video BKT/ngày</div>
                      <div>25 Profiles</div>
                    </div>
                  </button>

                  {/* Enterprise */}
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeTargetTier('enterprise');
                      setUpgradeMaxSeats(9999);
                      setUpgradeExtendDays(3650);
                    }}
                    className={cn(
                      'p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
                      upgradeTargetTier === 'enterprise'
                        ? 'bg-amber-950/50 border-amber-400 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-amber-300">Doanh Nghiệp</span>
                        {upgradeTargetTier === 'enterprise' && (
                          <Check className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>
                      <div className="text-[10px] text-amber-400 mt-1">Enterprise Trọn Đời</div>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-300 space-y-0.5">
                      <div className="font-semibold text-amber-200">9.999 Máy (Vô hạn)</div>
                      <div>9.999 Video BKT/ngày</div>
                      <div>999 Profiles</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tùy chỉnh Seats & Hạn Dùng */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="upgrade-max-seats-input"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Số Lượng Máy Tối Đa (Seats):
                  </label>
                  <Input
                    id="upgrade-max-seats-input"
                    type="number"
                    min={1}
                    max={9999}
                    value={upgradeMaxSeats}
                    onChange={(e) => setUpgradeMaxSeats(Number(e.target.value))}
                    required
                    className="bg-slate-950 border-amber-500/20 text-sm rounded-xl"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Gợi ý: Pro = 10, Enterprise = 9999
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="upgrade-extend-days-select"
                    className="text-xs font-semibold text-slate-300 block mb-1"
                  >
                    Thời Gian Cộng Thêm Vào Hạn Dùng:
                  </label>
                  <select
                    id="upgrade-extend-days-select"
                    value={upgradeExtendDays}
                    onChange={(e) => setUpgradeExtendDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-amber-500/20 text-xs text-slate-200 rounded-xl h-10 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value={0}>Giữ nguyên hạn dùng hiện tại</option>
                    <option value={30}>Cộng thêm +30 Ngày</option>
                    <option value={90}>Cộng thêm +90 Ngày</option>
                    <option value={365}>Cộng thêm +1 Năm (365 Ngày)</option>
                    <option value={3650}>Gia hạn Trọn Đời (10 Năm)</option>
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Tự động cộng dồn vào ngày hết hạn hiện tại
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                <span className="font-semibold">Lưu ý:</span> Khách hàng tiếp tục sử dụng License
                Key hiện tại mà không bị gián đoạn hay phải nhập lại key trên các máy trạm. Hạn
                ngạch và số máy sẽ tự động cập nhật ngay lập tức.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-amber-500/15">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUpgradeTierModalOpen(false)}
                  className="rounded-xl border-slate-700 text-slate-300"
                  disabled={isSubmittingUpgrade}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingUpgrade}
                  className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-semibold shadow-lg shadow-amber-900/20 gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  {isSubmittingUpgrade
                    ? 'Đang Nâng Gói...'
                    : `Xác Nhận Nâng Lên ${upgradeTargetTier.toUpperCase()}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
