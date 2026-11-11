import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  TrendingUp,
  Trophy,
  Tv,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { GATEWAY_URL } from '@/pages/SaasMasterHubPage';

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

interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  role: 'leader' | 'user';
  isActive: boolean;
  assignedNiche: string;
  hasDeviceBound?: boolean;
  boundDevice?: {
    deviceName?: string;
    osInfo?: string;
    hwidHash?: string;
    lastIp?: string;
    lastHeartbeatAt?: string;
  } | null;
  createdAt: string;
}

interface CompanyDevice {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  deviceName: string;
  osInfo: string;
  hwidHash: string;
  lastIp: string;
  lastHeartbeatAt: string;
  isActive: boolean;
  status: 'online' | 'idle' | 'offline';
}

interface CompanyResetRequest {
  id: string;
  requestId: string;
  userId: string;
  userEmail: string;
  userName: string;
  oldDeviceName: string;
  oldHwidHash: string;
  newDeviceName: string;
  newHwidHash: string;
  reason: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RawUserApiItem {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  company_id?: string;
  is_active?: boolean;
  assigned_niche?: string;
  has_device_bound?: boolean;
  bound_device?: StaffMember['boundDevice'];
  created_at?: string;
}

interface RawDeviceApiItem {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  company_id?: string;
  device_name?: string;
  os_info?: string;
  hwid_hash?: string;
  last_ip?: string;
  last_heartbeat_at?: string;
}

interface RawResetApiItem {
  id?: string;
  request_id?: string;
  user_id?: string;
  user_email?: string;
  email?: string;
  user_name?: string;
  company_id?: string;
  old_device_name?: string;
  old_hwid_hash?: string;
  new_device_name?: string;
  new_hwid_hash?: string;
  reason?: string;
  requested_at?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

const POPULAR_NICHES = [
  'Review Phim',
  'Nhạc Lofi Chill',
  'ASMR & Satisfying',
  'Tóm Tắt Sách & Tri Thức',
  'Công Nghệ & AI Tools',
  'Bí Ẩn & Top Khám Phá',
  'Hài Hước & Đời Sống',
];

export function CompanyAdminPortalPage() {
  const { company, accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'staff' | 'license' | 'devices' | 'work_comparison'>(
    'staff',
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Dữ liệu nội bộ công ty
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [devices, setDevices] = useState<CompanyDevice[]>([]);
  const [resetRequests, setResetRequests] = useState<CompanyResetRequest[]>([]);
  const [workReports, setWorkReports] = useState<StaffWorkReportItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRankItem[]>([]);
  const [teamsComparison, setTeamsComparison] = useState<TeamComparisonItem[]>([]);
  const [viewingVideosModal, setViewingVideosModal] = useState<{
    channelName: string;
    channelUrl: string;
    videos: CompetitorRecentVideo[];
  } | null>(null);

  // Modal thêm thành viên
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('RTM@123456');
  const [newStaffRole, setNewStaffRole] = useState<'leader' | 'user'>('user');
  const [newStaffNiche, setNewStaffNiche] = useState('Review Phim');

  // Thông báo phản hồi
  const showFlash = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // 1. Tải dữ liệu công ty từ Gateway
  const loadCompanyData = useCallback(async () => {
    if (!company?.id) return;
    setIsLoading(true);

    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      const [usersRes, devsRes, workReportsRes, teamsCompRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/v1/admin/users`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${GATEWAY_URL}/v1/admin/devices`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${GATEWAY_URL}/v1/admin/work-reports`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${GATEWAY_URL}/v1/admin/teams-comparison`, { headers })
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

      if (usersRes?.users && Array.isArray(usersRes.users)) {
        const companyUsers = (usersRes.users as RawUserApiItem[])
          .filter((u) => u.company_id === company.id && u.role !== 'owner')
          .map(
            (u): StaffMember => ({
              id: u.id,
              email: u.email,
              fullName: u.full_name || u.email.split('@')[0],
              role: u.role === 'leader' ? 'leader' : 'user',
              isActive: u.is_active ?? true,
              assignedNiche: u.assigned_niche || 'Review Phim',
              hasDeviceBound: !!u.has_device_bound,
              boundDevice: u.bound_device || null,
              createdAt: u.created_at || new Date().toISOString(),
            }),
          );
        setMembers(companyUsers);
      }

      if (devsRes?.devices && Array.isArray(devsRes.devices)) {
        const nowMs = Date.now();
        const companyDevs = (devsRes.devices as RawDeviceApiItem[])
          .filter((d) => d.company_id === company.id)
          .map((d): CompanyDevice => {
            const hbMs = new Date(d.last_heartbeat_at || Date.now()).getTime();
            const diffMin = (nowMs - hbMs) / (60 * 1000);
            return {
              id: d.id,
              userId: d.user_id || '',
              userName: d.user_name || 'Nhân viên',
              userEmail: d.user_email || '',
              userRole: d.user_role || 'user',
              deviceName: d.device_name || 'Máy trạm',
              osInfo: d.os_info || 'Windows',
              hwidHash: d.hwid_hash || '',
              lastIp: d.last_ip || '127.0.0.1',
              lastHeartbeatAt: d.last_heartbeat_at || new Date().toISOString(),
              isActive: true,
              status: diffMin <= 5 ? 'online' : diffMin <= 30 ? 'idle' : 'offline',
            };
          });
        setDevices(companyDevs);
      }

      if (devsRes?.pending_resets && Array.isArray(devsRes.pending_resets)) {
        const companyResets = (devsRes.pending_resets as RawResetApiItem[])
          .filter((r) => r.company_id === company.id)
          .map(
            (r): CompanyResetRequest => ({
              id: String(r.id || r.request_id || ''),
              requestId: String(r.request_id || r.id || ''),
              userId: String(r.user_id || ''),
              userEmail: String(r.user_email || r.email || ''),
              userName: String(r.user_name || 'Nhân viên'),
              oldDeviceName: String(r.old_device_name || 'Máy cũ'),
              oldHwidHash: String(r.old_hwid_hash || ''),
              newDeviceName: String(r.new_device_name || 'Máy mới'),
              newHwidHash: String(r.new_hwid_hash || ''),
              reason: String(r.reason || 'Đổi máy trạm'),
              requestedAt: String(r.requested_at || new Date().toISOString()),
              status: r.status || 'pending',
            }),
          );
        setResetRequests(companyResets);
      }
    } catch (e) {
      console.warn('Lỗi tải dữ liệu Company Admin:', e);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id, accessToken]);

  useEffect(() => {
    loadCompanyData();
  }, [loadCompanyData]);

  // 2. Thêm thành viên mới vào công ty
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail.trim() || !newStaffName.trim()) {
      showFlash('Vui lòng điền đầy đủ email và họ tên');
      return;
    }

    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: newStaffEmail.trim(),
          password: newStaffPassword,
          full_name: newStaffName.trim(),
          role: newStaffRole,
          company_id: company?.id,
          assigned_niche: newStaffNiche,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showFlash(`Đã tạo thành công tài khoản ${newStaffRole.toUpperCase()}: ${newStaffEmail}`);
        setIsAddStaffOpen(false);
        setNewStaffEmail('');
        setNewStaffName('');
        loadCompanyData();
      } else {
        showFlash(data.error || 'Tạo nhân sự thất bại');
      }
    } catch (err: unknown) {
      showFlash(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 3. Phê duyệt đơn đổi máy cho nhân viên công ty
  const handleReviewReset = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/hwid-reset/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          action,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showFlash(
          action === 'approve'
            ? 'Đã duyệt cấp quyền đổi máy trạm mới thành công!'
            : 'Đã từ chối yêu cầu đổi máy',
        );
        setResetRequests((prev) => prev.filter((r) => r.requestId !== requestId));
        loadCompanyData();
      } else {
        showFlash(data.error || 'Thao tác xét duyệt thất bại');
      }
    } catch (err: unknown) {
      showFlash(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 4. Thu hồi máy (Unbind) nhân viên nghỉ việc
  const handleUnbindDevice = async (bindingId: string, memberName: string) => {
    if (
      !confirm(
        `Bạn có chắc muốn thu hồi máy trạm của ${memberName}? Thao tác này sẽ giải phóng 1 ghế máy về công ty.`,
      )
    )
      return;

    try {
      const res = await fetch(`${GATEWAY_URL}/v1/admin/devices/unbind`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ binding_id: bindingId }),
      });

      if (res.ok) {
        showFlash(`Đã thu hồi máy của ${memberName}. Ghế máy đã được giải phóng!`);
        loadCompanyData();
      } else {
        showFlash('Không thể thu hồi thiết bị');
      }
    } catch (err: unknown) {
      showFlash(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Thống kê tính toán
  const totalStaff = members.length;
  const totalLeaders = members.filter((m) => m.role === 'leader').length;
  const onlineNow = devices.filter((d) => d.status === 'online').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Công Ty */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-indigo-950/40 border border-blue-500/20 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/30 shadow-inner">
            <Building2 className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {company?.name || 'Doanh Nghiệp Trực Thuộc'}
              </h1>
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-[11px]"
              >
                {company?.code || 'CORP'}
              </Badge>
              <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                QUẢN TRỊ VIÊN CÔNG TY
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Trung tâm điều hành nhân sự, phân bổ ngách hoạt động và phê duyệt thiết bị máy trạm
              nội bộ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCompanyData}
            disabled={isLoading}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white text-xs h-9"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isLoading && 'animate-spin')} />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddStaffOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 shadow-md shadow-blue-900/30"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />+ Thêm Nhân Viên
          </Button>
        </div>
      </div>

      {/* Thông báo Flash */}
      {statusMessage && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-200 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Thẻ Chỉ Số KPI Nội Bộ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tổng nhân sự</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalStaff}</div>
          <div className="text-[11px] text-slate-500">{totalLeaders} Trưởng nhóm (Leader)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Máy trạm Online</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{onlineNow}</div>
          <div className="text-[11px] text-slate-500">{devices.length} máy đã liên kết HWID</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Đơn xin đổi máy</span>
            <Laptop className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">{resetRequests.length}</div>
          <div className="text-[11px] text-slate-500">Chờ Sếp xét duyệt</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Gói Bản Quyền</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300">PRO</div>
          <div className="text-[11px] text-slate-500">Đang hoạt động ổn định</div>
        </div>
      </div>

      {/* Tabs điều hướng */}
      <div className="flex items-center border-b border-slate-800 space-x-2">
        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={cn(
            'flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition',
            activeTab === 'staff'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <Users className="w-4 h-4" /> 1. Nhân Sự & Phân Bổ Ngách ({totalStaff})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('devices')}
          className={cn(
            'flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition relative',
            activeTab === 'devices'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <Laptop className="w-4 h-4" /> 2. Máy Trạm & Duyệt Đổi Máy ({devices.length})
          {resetRequests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
              {resetRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('license')}
          className={cn(
            'flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition',
            activeTab === 'license'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <ShieldCheck className="w-4 h-4" /> 3. Bản Quyền & Hạn Mức (Chế độ xem)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('work_comparison')}
          className={cn(
            'flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition',
            activeTab === 'work_comparison'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <TrendingUp className="w-4 h-4" /> 4. Chi Tiết Công Việc & So Sánh Đội Nhóm
        </button>
      </div>

      {/* TAB 1: NHÂN SỰ & PHÂN BỔ NGÁCH */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <Input
                placeholder="Tìm nhân viên theo tên, email, ngách..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-xs text-white placeholder-slate-500 h-9"
              />
            </div>
            <span className="text-xs text-slate-400">Hiển thị {members.length} nhân sự nội bộ</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Vai trò</th>
                  <th className="py-3 px-4">Ngách hoạt động</th>
                  <th className="py-3 px-4">Trạng thái máy</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có nhân viên nào. Bấm nút "+ Thêm Nhân Viên" để tạo tài khoản mới.
                    </td>
                  </tr>
                ) : (
                  members
                    .filter(
                      (m) =>
                        m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        m.assignedNiche.toLowerCase().includes(searchQuery.toLowerCase()),
                    )
                    .map((member) => (
                      <tr key={member.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 font-medium text-white">{member.fullName}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{member.email}</td>
                        <td className="py-3 px-4">
                          {member.role === 'leader' ? (
                            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                              Trưởng nhóm (Leader)
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                              Nhân viên
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <Tag className="w-3 h-3 text-purple-400" /> {member.assignedNiche}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {member.hasDeviceBound ? (
                            <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Đã bind máy
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Chưa đăng nhập</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          {member.boundDevice?.hwidHash && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnbindDevice(member.id, member.fullName)}
                              className="text-[11px] h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            >
                              Hủy máy
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MÁY TRÀM & DUYỆT ĐỔI MÁY */}
      {activeTab === 'devices' && (
        <div className="space-y-6">
          {/* Hộp thư duyệt đổi máy trạm */}
          {resetRequests.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                ĐƠN XIN ĐỔI MÁY TRẠM ĐANG CHỜ PHÊ DUYỆT ({resetRequests.length})
              </div>
              <div className="space-y-2">
                {resetRequests.map((req) => (
                  <div
                    key={req.requestId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-lg border border-amber-500/20 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white">{req.userName}</span>{' '}
                      <span className="text-slate-400">({req.userEmail})</span>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Lý do: <span className="text-slate-200">{req.reason}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        Máy mới: {req.newDeviceName} • HWID: {req.newHwidHash.slice(0, 16)}...
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleReviewReset(req.requestId, 'approve')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-3"
                      >
                        Chấp thuận
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReviewReset(req.requestId, 'reject')}
                        className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs h-7 px-3"
                      >
                        Từ chối
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Danh sách máy trạm của công ty */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-slate-300">
              Danh Sách Thiết Bị Máy Trạm Đã Liên Kết
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/40 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-4">Tên máy trạm</th>
                  <th className="py-3 px-4">Hệ điều hành</th>
                  <th className="py-3 px-4">Lần online cuối</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có máy trạm nào được liên kết trong công ty.
                    </td>
                  </tr>
                ) : (
                  devices.map((dev) => (
                    <tr key={dev.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4 font-medium text-white">
                        {dev.userName}
                        <div className="text-[10px] text-slate-500">{dev.userEmail}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                        {dev.deviceName}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{dev.osInfo}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(dev.lastHeartbeatAt).toLocaleTimeString('vi-VN')}{' '}
                        {new Date(dev.lastHeartbeatAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="py-3 px-4">
                        {dev.status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{' '}
                            Đang online
                          </span>
                        ) : dev.status === 'idle' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Tạm nghỉ
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Offline</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnbindDevice(dev.id, dev.userName)}
                          className="text-[11px] h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        >
                          Thu hồi máy
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BẢN QUYỀN & HẠN MỨC (READ-ONLY) */}
      {activeTab === 'license' && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Thông Tin Giấy Phép Sử Dụng Doanh Nghiệp
                </h3>
                <p className="text-xs text-slate-400">Được cấp bởi Chủ Dự Án (Master Owner)</p>
              </div>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40">
                GÓI PRO
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400">Số ghế máy trạm được phép:</span>
                <div className="text-lg font-bold text-white">10 máy trạm đồng thời</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400">Thời hạn sử dụng còn lại:</span>
                <div className="text-lg font-bold text-emerald-400">365 ngày</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-400">Hạn mức quét BKT hàng ngày:</span>
                <div className="text-lg font-bold text-blue-400">50 lần / ngày</div>
              </div>
            </div>

            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-slate-300 space-y-1">
              <span className="font-semibold text-blue-300">Lưu ý quản trị:</span>
              <p className="text-slate-400 leading-relaxed">
                Để nâng thêm số ghế máy trạm hoặc gia hạn thêm thời gian sử dụng bản quyền, vui lòng
                liên hệ trực tiếp với Chủ dự án (Master Owner). Quản trị viên công ty không được tự
                ý sinh mã bản quyền mới.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CHI TIẾT CÔNG VIỆC & SO SÁNH ĐỘI NHÓM */}
      {activeTab === 'work_comparison' && (
        <div className="space-y-6">
          {/* KHỐI 1: BẢNG SO SÁNH ĐỐI ĐẦU GIỮA CÁC TEAM LEADER */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="p-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Bảng So Sánh Đối Đầu Giữa Các Đội Nhóm (Team Leaders)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Tự động đánh giá chất lượng dựa trên doanh thu, sản lượng & tỷ lệ BKT sạch
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/40 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Đội Nhóm (Team)</th>
                  <th className="py-3 px-4">Trưởng Nhóm (Leader)</th>
                  <th className="py-3 px-4 text-center">Quy Mô</th>
                  <th className="py-3 px-4 text-center">Kênh Đích</th>
                  <th className="py-3 px-4 text-center">Đăng Hôm Nay</th>
                  <th className="py-3 px-4">Tổng View</th>
                  <th className="py-3 px-4">Doanh Thu (VND)</th>
                  <th className="py-3 px-4 text-center">Tỷ Lệ BKT Sạch</th>
                  <th className="py-3 px-4 text-center">Đánh Giá Hiệu Suất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {teamsComparison.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Chưa có đủ dữ liệu hoạt động giữa các đội nhóm để so sánh đối đầu.
                    </td>
                  </tr>
                ) : (
                  teamsComparison.map((tm) => (
                    <tr key={tm.team_id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>{tm.team_name}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-200">{tm.leader_name}</p>
                        <p className="text-[10px] text-slate-400">{tm.leader_email}</p>
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-slate-300">
                        {tm.members_count} thành viên
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                        {tm.target_channels_count} kênh
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
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-emerald-400">{tm.quality_rate}%</span>
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

          {/* KHỐI 2: BẢNG XẾP HẠNG NHÂN SỰ TOÀN CÔNG TY (LEADERBOARD) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="p-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Bảng Xếp Hạng Nhân Sự Toàn Công Ty (Top Performers)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Xếp hạng theo sản lượng kênh đích, lượt xem & doanh thu đóng góp
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/40 text-slate-400 font-semibold border-b border-slate-800">
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
              <tbody className="divide-y divide-slate-850">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Chưa có dữ liệu xếp hạng nhân sự.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((lb, idx) => (
                    <tr
                      key={lb.user_id}
                      className={cn(
                        'hover:bg-slate-900/40 transition',
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
                        <p className="text-[10px] text-slate-400">{lb.email}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          className={cn(
                            'text-[10px] px-2 py-0.2 rounded border',
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
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] px-2 py-0.5">
                          {lb.quality_score}% Sạch
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* KHỐI 3: DANH SÁCH CHI TIẾT CÔNG VIỆC TỪNG NHÂN SỰ */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="p-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Chi Tiết Kênh Quản Lý & Kênh Đối Thủ Theo Từng Nhân Sự
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Tổng cộng {workReports.length} nhân sự báo cáo
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/40 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Nhân Sự</th>
                  <th className="py-3 px-4">Kênh Đích & Kênh Test</th>
                  <th className="py-3 px-4">Kênh Đối Thủ Đang Giám Sát</th>
                  <th className="py-3 px-4">Sản Lượng (Hôm nay/Tuần/Tháng)</th>
                  <th className="py-3 px-4">Test BKT (Xanh/Đỏ)</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {workReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có báo cáo công việc từ nhân sự.
                    </td>
                  </tr>
                ) : (
                  workReports.map((r) => (
                    <tr key={r.user_id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-white">{r.full_name}</p>
                        <p className="text-[10px] text-slate-400">{r.email}</p>
                        <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px] px-1.5 py-0.2 mt-1">
                          {r.assigned_niche || 'Mặc định'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-emerald-400">
                            {r.target_channels_count} Kênh Đích
                          </span>
                          <span className="text-[11px] text-slate-400 block">
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
                            <div className="text-[11px] text-slate-400 line-clamp-1">
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
                          <span className="text-[11px] text-slate-400 block">
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
                            className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-[11px] h-7 rounded-lg"
                          >
                            <Video className="w-3 h-3 mr-1 text-sky-400" />
                            Xem Video
                          </Button>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Không có video</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Xem 5 Video Gần Nhất */}
      {viewingVideosModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
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

            <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
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

      {/* Modal Thêm Nhân Viên */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                Thêm Nhân Sự Vào {company?.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div>
                <label htmlFor="new-staff-email" className="block text-slate-300 font-medium mb-1">
                  Email nhân viên
                </label>
                <Input
                  id="new-staff-email"
                  type="email"
                  required
                  placeholder="nhanvien@company.vn"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label htmlFor="new-staff-name" className="block text-slate-300 font-medium mb-1">
                  Họ và tên
                </label>
                <Input
                  id="new-staff-name"
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="new-staff-password"
                  className="block text-slate-300 font-medium mb-1"
                >
                  Mật khẩu ban đầu
                </label>
                <Input
                  id="new-staff-password"
                  type="text"
                  required
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs font-mono text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-staff-role" className="block text-slate-300 font-medium mb-1">
                    Vai trò nội bộ
                  </label>
                  <select
                    id="new-staff-role"
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as 'leader' | 'user')}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="user">Nhân viên (Staff)</option>
                    <option value="leader">Trưởng nhóm (Leader)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-staff-niche"
                    className="block text-slate-300 font-medium mb-1"
                  >
                    Ngách hoạt động
                  </label>
                  <select
                    id="new-staff-niche"
                    value={newStaffNiche}
                    onChange={(e) => setNewStaffNiche(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    {POPULAR_NICHES.map((niche) => (
                      <option key={niche} value={niche}>
                        {niche}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="text-xs text-slate-400"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4"
                >
                  Xác nhận tạo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
