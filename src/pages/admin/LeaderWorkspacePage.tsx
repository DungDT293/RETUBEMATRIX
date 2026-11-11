import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Layers,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Tv,
  Users2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { GATEWAY_URL } from '@/services/saasService';

interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: 'leader' | 'user';
  assignedNiche?: string;
  isActive: boolean;
  hasDeviceBound?: boolean;
  boundDevice?: {
    deviceName?: string;
    osInfo?: string;
    lastHeartbeatAt?: string;
  } | null;
  createdAt: string;
}

interface TargetChannelItem {
  id: string;
  channel_name: string;
  youtube_channel_id: string;
  channel_url?: string;
  videos_uploaded_today: number;
  videos_uploaded_week: number;
  videos_uploaded_month: number;
  total_views: number;
  estimated_revenue: number;
}

interface CompetitorRecentVideo {
  id?: string;
  video_id?: string;
  title: string;
  views?: number;
  view_count?: number;
  upload_date?: string;
  uploaded_at?: string;
  url?: string;
}

interface CompetitorChannelItem {
  id: string;
  channel_name: string;
  channel_url: string;
  youtube_channel_id?: string;
  competitor_channel_id?: string;
  primary_keyword: string;
  subscriber_count: number;
  total_views: number;
  total_videos: number;
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
  target_channels: TargetChannelItem[];
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

interface TeamResetRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  oldDeviceName: string;
  newDeviceName: string;
  reason: string;
  requestedAt: string;
  leaderEndorsed: boolean;
  status: 'pending' | 'endorsed' | 'rejected';
}

interface RawLeaderUserApi {
  id: string;
  email: string;
  full_name?: string;
  role?: 'leader' | 'user';
  company_id?: string;
  assigned_niche?: string;
  assignedNiche?: string;
  is_active?: boolean;
  has_device_bound?: boolean;
  bound_device?: TeamMember['boundDevice'];
  created_at?: string;
}

interface RawLeaderResetApi {
  id?: string;
  request_id?: string;
  user_id?: string;
  user_email?: string;
  email?: string;
  user_name?: string;
  company_id?: string;
  old_device_name?: string;
  new_device_name?: string;
  reason?: string;
  requested_at?: string;
}

export function LeaderWorkspacePage() {
  const { user, accessToken, company } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'work_progress' | 'competitors' | 'leaderboard' | 'members' | 'hwid_requests'
  >('work_progress');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [resetRequests, setResetRequests] = useState<TeamResetRequest[]>([]);
  const [workReports, setWorkReports] = useState<StaffWorkReportItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRankItem[]>([]);

  // Modal xem 5 video gần nhất của kênh đối thủ
  const [viewingVideosModal, setViewingVideosModal] = useState<{
    channelName: string;
    channelUrl: string;
    videos: CompetitorRecentVideo[];
  } | null>(null);

  const showFlashMessage = useCallback((msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => {
      setActionSuccessMsg(null);
    }, 4000);
  }, []);

  const fetchTeamData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (accessToken) {
        // 1. Tải báo cáo công việc và hiệu suất đội ngũ
        const reportsRes = await fetch(`${GATEWAY_URL}/v1/admin/work-reports`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (reportsRes?.success && reportsRes?.data) {
          if (Array.isArray(reportsRes.data.reports)) {
            setWorkReports(reportsRes.data.reports);
          }
          if (Array.isArray(reportsRes.data.leaderboard)) {
            setLeaderboard(reportsRes.data.leaderboard);
          }
        }

        // 2. Tải danh sách tài khoản thành viên trong nhóm
        const usersRes = await fetch(`${GATEWAY_URL}/v1/admin/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (usersRes?.users && Array.isArray(usersRes.users)) {
          const mapped: TeamMember[] = (usersRes.users as RawLeaderUserApi[])
            .filter((u) => u.company_id === user?.companyId)
            .map((u) => ({
              id: u.id,
              email: u.email,
              fullName: u.full_name || u.email,
              role: u.role || 'user',
              assignedNiche: u.assigned_niche || u.assignedNiche || 'Chưa gán',
              isActive: u.is_active ?? true,
              hasDeviceBound: !!u.has_device_bound,
              boundDevice: u.bound_device || null,
              createdAt: u.created_at || new Date().toISOString(),
            }));
          setMembers(mapped);
        }

        // 3. Tải đơn xin đổi máy trạm
        const devRes = await fetch(`${GATEWAY_URL}/v1/admin/devices`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (devRes?.pending_resets && Array.isArray(devRes.pending_resets)) {
          const mappedResets: TeamResetRequest[] = (devRes.pending_resets as RawLeaderResetApi[])
            .filter((r) => r.company_id === user?.companyId)
            .map((r) => ({
              id: String(r.id || r.request_id || ''),
              userId: String(r.user_id || ''),
              userEmail: String(r.user_email || r.email || ''),
              userName: String(r.user_name || 'Nhân viên'),
              oldDeviceName: String(r.old_device_name || 'Máy trạm cũ'),
              newDeviceName: String(r.new_device_name || 'Máy trạm mới'),
              reason: String(r.reason || 'Đổi máy trạm'),
              requestedAt: String(r.requested_at || new Date().toISOString()),
              leaderEndorsed: false,
              status: 'pending',
            }));
          setResetRequests(mappedResets);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu Leader Workspace:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user?.companyId]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Xác nhận sơ bộ đơn xin đổi máy của thành viên trong nhóm
  const handleEndorseReset = (requestId: string, memberName: string) => {
    setResetRequests((prev) =>
      prev.map((r) =>
        r.id === requestId ? { ...r, leaderEndorsed: true, status: 'endorsed' } : r,
      ),
    );
    showFlashMessage(
      `Đã xác nhận sơ bộ đơn đổi máy của ${memberName}. Đã chuyển lên Giám đốc (Admin) phê duyệt chính thức.`,
    );
  };

  // Tính toán KPI Tổng hợp thực tế của nhóm
  const totalTargetChannels = useMemo(() => {
    return workReports.reduce((sum, r) => sum + (r.target_channels_count || 0), 0);
  }, [workReports]);

  const totalCompetitors = useMemo(() => {
    return workReports.reduce((sum, r) => sum + (r.competitor_channels_count || 0), 0);
  }, [workReports]);

  const totalGreenBkt = useMemo(() => {
    return workReports.reduce((sum, r) => sum + (r.videos_tested_green || 0), 0);
  }, [workReports]);

  const totalRedBkt = useMemo(() => {
    return workReports.reduce((sum, r) => sum + (r.videos_tested_red || 0), 0);
  }, [workReports]);

  const totalUploadedToday = useMemo(() => {
    return workReports.reduce((sum, r) => sum + (r.videos_uploaded_today || 0), 0);
  }, [workReports]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.assignedNiche?.toLowerCase().includes(q),
    );
  }, [members, searchQuery]);

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return workReports;
    const q = searchQuery.toLowerCase();
    return workReports.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.assigned_niche?.toLowerCase().includes(q),
    );
  }, [workReports, searchQuery]);

  // Danh sách toàn bộ kênh đối thủ thuộc nhóm
  const allTeamCompetitors = useMemo(() => {
    const list: Array<CompetitorChannelItem & { staffName: string; staffEmail: string }> = [];
    for (const rep of workReports) {
      if (rep.competitor_channels && Array.isArray(rep.competitor_channels)) {
        for (const comp of rep.competitor_channels) {
          list.push({
            ...comp,
            staffName: rep.full_name,
            staffEmail: rep.email,
          });
        }
      }
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.channel_name?.toLowerCase().includes(q) ||
        c.primary_keyword?.toLowerCase().includes(q) ||
        c.staffName?.toLowerCase().includes(q),
    );
  }, [workReports, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Thông báo Flash Message */}
      {actionSuccessMsg && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Header Ban Chỉ Huy Nhóm */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                Bàn Làm Việc Trưởng Nhóm
              </h1>
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-0.5">
                Leader Workspace
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Đơn vị: {company?.name || 'Doanh Nghiệp Trực Thuộc'} | Trưởng nhóm:{' '}
              {user?.fullName || user?.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTeamData}
            disabled={isLoading}
            className="border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 gap-2 h-9 rounded-xl text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Làm Mới
          </Button>
        </div>
      </div>

      {/* KPI Thống Kê Thực Tế 5 Thẻ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 pt-5">
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Nhân Sự Nhóm</p>
            <p className="text-xl font-bold text-white mt-0.5">{members.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {members.filter((m) => m.isActive).length} đang hoạt động
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Users2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Kênh Đích Vận Hành</p>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">{totalTargetChannels}</p>
            <p className="text-xs text-slate-400 mt-0.5">Đang quản lý</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Kênh Đối Thủ</p>
            <p className="text-xl font-bold text-sky-400 mt-0.5">{totalCompetitors}</p>
            <p className="text-xs text-slate-400 mt-0.5">Đang theo dõi cào data</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Tv className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">BKT: Xanh vs Đỏ</p>
            <p className="text-xl font-bold text-white mt-0.5">
              <span className="text-emerald-400">{totalGreenBkt}</span> /{' '}
              <span className="text-rose-400">{totalRedBkt}</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Tỷ lệ sạch:{' '}
              {totalGreenBkt + totalRedBkt > 0
                ? `${Math.round((totalGreenBkt / (totalGreenBkt + totalRedBkt)) * 100)}%`
                : '100%'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <p className="text-xs text-slate-400 font-medium">Đăng Hôm Nay</p>
            <p className="text-xl font-bold text-amber-400 mt-0.5">{totalUploadedToday} video</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {resetRequests.filter((r) => r.status === 'pending').length} đơn đổi máy
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Tabs Chuyển Đổi 5 Tab Rõ Ràng */}
      <div className="px-6 pt-5 pb-2 flex flex-wrap items-center gap-2 border-b border-slate-800/80">
        <button
          type="button"
          onClick={() => setActiveTab('work_progress')}
          className={cn(
            'px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all',
            activeTab === 'work_progress'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40',
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Tiến Độ Kênh Đích ({filteredReports.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('competitors')}
          className={cn(
            'px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all',
            activeTab === 'competitors'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40',
          )}
        >
          <Tv className="w-3.5 h-3.5" />
          Kênh Đối Thủ & Xu Hướng ({allTeamCompetitors.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leaderboard')}
          className={cn(
            'px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all',
            activeTab === 'leaderboard'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40',
          )}
        >
          <Trophy className="w-3.5 h-3.5" />
          Bảng Xếp Hạng Đội Nhóm
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={cn(
            'px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all',
            activeTab === 'members'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40',
          )}
        >
          <Users2 className="w-3.5 h-3.5" />
          Thành Viên & Ngách ({members.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hwid_requests')}
          className={cn(
            'px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all',
            activeTab === 'hwid_requests'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40',
          )}
        >
          <Laptop className="w-3.5 h-3.5" />
          Đơn Đổi Máy ({resetRequests.length})
        </button>
      </div>

      {/* Nội dung theo Tab */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* TAB 1: TIẾN ĐỘ KÊNH ĐÍCH & TEST BÁO CÁO THẬT */}
        {activeTab === 'work_progress' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <Input
                  placeholder="Tìm theo nhân sự, ngách..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/80 border-slate-800 text-xs rounded-xl h-9 text-slate-200"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Nhân Sự</th>
                    <th className="py-3 px-4">Kênh Đích & Test</th>
                    <th className="py-3 px-4">Video Đăng (Hôm nay/Tuần/Tháng)</th>
                    <th className="py-3 px-4">Test BKT (Xanh/Đỏ)</th>
                    <th className="py-3 px-4">Tổng View</th>
                    <th className="py-3 px-4">Điểm Đánh Giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Chưa có dữ liệu tiến độ sản xuất từ các thành viên.
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((r) => (
                      <tr key={r.user_id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{r.full_name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{r.email}</p>
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs px-2 py-0.2 mt-1">
                            {r.assigned_niche || 'Mặc định'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="text-slate-200 font-semibold">
                              {r.target_channels_count} Kênh Đích
                            </span>
                            <span className="text-slate-400 text-xs block">
                              {r.test_channels_count} Kênh Test BKT
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="text-emerald-400 font-bold">
                              Hôm nay: {r.videos_uploaded_today} video
                            </span>
                            <span className="text-slate-400 text-xs block">
                              Tuần: {r.videos_uploaded_week} | Tháng: {r.videos_uploaded_month}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {r.videos_tested_green} Xanh
                            </span>
                            <span className="text-rose-400 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {r.videos_tested_red} Đỏ
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {r.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-emerald-400 h-2 rounded-full"
                                style={{ width: `${Math.min(100, r.quality_score || 85)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-emerald-400">
                              {r.quality_score || 85}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: KÊNH ĐỐI THỦ & XU HƯỚNG CÀO DATA */}
        {activeTab === 'competitors' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <Input
                  placeholder="Tìm kênh đối thủ, từ khóa, nhân sự..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/80 border-slate-800 text-xs rounded-xl h-9 text-slate-200"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Kênh Đối Thủ & Link</th>
                    <th className="py-3 px-4">Từ Khóa Chính</th>
                    <th className="py-3 px-4">Thông Số (Sub / Views)</th>
                    <th className="py-3 px-4">5 Video Mới & Tăng Trưởng</th>
                    <th className="py-3 px-4">Test BKT Thu Hoạch</th>
                    <th className="py-3 px-4">Nhân Sự Theo Dõi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allTeamCompetitors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Chưa có kênh đối thủ nào được theo dõi trong nhóm.
                      </td>
                    </tr>
                  ) : (
                    allTeamCompetitors.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{c.channel_name}</p>
                          {c.channel_url ? (
                            <a
                              href={c.channel_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300 text-xs inline-flex items-center gap-1 mt-0.5"
                            >
                              <span>{c.channel_url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-slate-500 text-xs">Chưa có link</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5">
                            {c.primary_keyword || 'Tổng hợp'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">
                            {c.subscriber_count.toLocaleString('vi-VN')} Subs
                          </p>
                          <p className="text-slate-400 text-xs mt-0.5">
                            {c.total_views.toLocaleString('vi-VN')} Lượt xem
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          {c.recent_5_videos && c.recent_5_videos.length > 0 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setViewingVideosModal({
                                  channelName: c.channel_name,
                                  channelUrl: c.channel_url,
                                  videos: c.recent_5_videos,
                                })
                              }
                              className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 gap-1.5 h-7 rounded-lg text-xs"
                            >
                              <Video className="w-3 h-3 text-sky-400" />
                              Xem {c.recent_5_videos.length} Video Gần Nhất
                            </Button>
                          ) : (
                            <span className="text-slate-500 text-xs">Chưa có video mới</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-semibold">
                              {c.videos_tested_green} Xanh
                            </span>
                            <span className="text-slate-500">/</span>
                            <span className="text-rose-400 font-semibold">
                              {c.videos_tested_red} Đỏ
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{c.staffName}</p>
                          <p className="text-slate-400 text-xs">{c.staffEmail}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: BẢNG XẾP HẠNG ĐỘI NHÓM (LEADERBOARD) */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Hạng</th>
                    <th className="py-3 px-4">Thành Viên</th>
                    <th className="py-3 px-4">Kênh Đích Nắm Giữ</th>
                    <th className="py-3 px-4">Video Đăng Hôm Nay</th>
                    <th className="py-3 px-4">Tổng Lượt Xem</th>
                    <th className="py-3 px-4">Doanh Thu Ước Tính (VND)</th>
                    <th className="py-3 px-4">Chất Lượng (BKT Clean)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Chưa có dữ liệu xếp hạng trong nhóm.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((item, idx) => (
                      <tr
                        key={item.user_id}
                        className={cn(
                          'hover:bg-slate-900/60 transition-colors',
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
                          <p className="font-semibold text-slate-200">{item.full_name}</p>
                          <p className="text-slate-400 text-xs">{item.email}</p>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400">
                          {item.target_channels_count} kênh
                        </td>
                        <td className="py-3.5 px-4 font-bold text-amber-400">
                          {item.videos_uploaded_today} video
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {item.total_views.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          {item.estimated_revenue_vnd.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5">
                            {item.quality_score}% Sạch
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: THÀNH VIÊN & NGÁCH */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <Input
                  placeholder="Tìm thành viên theo tên, email, ngách..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/80 border-slate-800 text-xs rounded-xl h-9 text-slate-200"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Thành Viên</th>
                    <th className="py-3 px-4">Vai Trò</th>
                    <th className="py-3 px-4">Ngách Phụ Trách</th>
                    <th className="py-3 px-4">Trạng Thái Máy</th>
                    <th className="py-3 px-4">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Không có dữ liệu thành viên trong nhóm.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{m.fullName}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{m.email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-lg border font-medium',
                              m.role === 'leader'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700',
                            )}
                          >
                            {m.role === 'leader' ? 'Trưởng nhóm' : 'Kỹ thuật viên'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs px-2 py-0.5">
                            {m.assignedNiche}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          {m.hasDeviceBound ? (
                            <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              {m.boundDevice?.deviceName || 'Đã liên kết'}
                            </span>
                          ) : (
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-600" />
                              Chưa gắn máy
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-lg border',
                              m.isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                            )}
                          >
                            {m.isActive ? 'Đang hoạt động' : 'Tạm khóa'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: ĐƠN ĐỔI MÁY HWID */}
        {activeTab === 'hwid_requests' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/80 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Nhân Viên</th>
                    <th className="py-3 px-4">Thiết Bị Cũ / Mới</th>
                    <th className="py-3 px-4">Lý Do Đổi Máy</th>
                    <th className="py-3 px-4">Thời Gian Yêu Cầu</th>
                    <th className="py-3 px-4">Hành Động Trưởng Nhóm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {resetRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Không có đơn yêu cầu đổi máy nào đang chờ xử lý.
                      </td>
                    </tr>
                  ) : (
                    resetRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-200">{r.userName}</p>
                          <p className="text-slate-400 text-xs">{r.userEmail}</p>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <p className="text-slate-400 line-through text-xs">{r.oldDeviceName}</p>
                          <p className="text-emerald-400 font-medium">{r.newDeviceName}</p>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 max-w-xs">{r.reason}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(r.requestedAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.leaderEndorsed || r.status === 'endorsed' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1">
                              Đã xác nhận sơ bộ
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleEndorseReset(r.id, r.userName)}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-8 rounded-xl text-xs px-3"
                            >
                              Xác Nhận Sơ Bộ
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
      </div>

      {/* Modal Xem 5 Video Gần Nhất Của Kênh Đối Thủ */}
      {viewingVideosModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-sky-400" />5 Video Mới Nhất & Tăng Trưởng
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kênh: {viewingVideosModal.channelName}
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
    </div>
  );
}
