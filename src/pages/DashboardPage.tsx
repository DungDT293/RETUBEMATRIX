import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Layers,
  Link2,
  Loader2,
  Radio,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Square,
  Tv,
  UserCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  cancelAllBktJobs,
  cancelBktJob,
  getDailyReportStats,
} from '@/contexts/channels/channels-client';
import type {
  DailyReportStats,
  FollowedChannel,
  MultiBrowserProfile,
  MultiBrowserStats,
  RunSessionRecord,
  RunSummaryRecord,
} from '@/lib/types';

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
}

const EMPTY_STATS: MultiBrowserStats = {
  total_profiles: 0,
  running: 0,
  success_today: 0,
  error_today: 0,
  ready: 0,
  running_profiles: [],
  recent_errors: [],
  warnings: [],
  run_summary: {
    last_run: null,
    today_runtime_seconds: 0,
    today_run_count: 0,
    recent_runs: [],
    recent_sessions: [],
    today_session_count: 0,
  },
  system_info: {
    os: 'Windows',
    ram: 'N/A',
    python: 'N/A',
    data_dir: '',
  },
};

type Tone = 'neutral' | 'primary' | 'success' | 'warning';

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'pill-neutral',
  primary: 'pill-info',
  success: 'pill-success',
  warning: 'pill-warning',
};

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatDuration(seconds?: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  if (minutes > 0) return `${minutes} phút ${secs} giây`;
  return `${secs} giây`;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function statusLabel(status?: string) {
  switch (status) {
    case 'success':
      return 'Hoàn thành';
    case 'error':
      return 'Lỗi';
    case 'stopped':
      return 'Đã dừng';
    case 'cancelled':
      return 'Đã hủy';
    case 'running':
      return 'Đang chạy';
    default:
      return status || '-';
  }
}

function actionLabel(action?: string) {
  switch (action) {
    case 'nurture_youtube':
      return 'Nuôi YouTube';
    case 'nurture_google':
      return 'Nuôi Google';
    case 'nurture_full':
      return 'Nuôi đầy đủ';
    case 'full_chain':
      return 'Chuỗi đầy đủ';
    case 'upload':
      return 'Đăng YouTube';
    case 'browser':
      return 'Trình duyệt';
    default:
      return action || '-';
  }
}

function runTone(status?: string): Tone {
  if (status === 'success') return 'success';
  if (status === 'error') return 'warning';
  if (status === 'running') return 'primary';
  return 'neutral';
}

function RunDetailRow({ run }: { run: RunSummaryRecord }) {
  const tone = runTone(run.status);
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-foreground">{run.profile_name || run.id || 'Hồ sơ'}</div>
        <span className={`pill ${TONE_BADGE[tone]} text-[10px]`}>{statusLabel(run.status)}</span>
      </div>
      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        <span>
          Workflow: <span className="text-foreground">{actionLabel(run.action)}</span>
        </span>
        <span>
          Thời lượng:{' '}
          <span className="text-foreground">{formatDuration(run.duration_seconds)}</span>
        </span>
        <span>
          Kết thúc: <span className="text-foreground">{formatTime(run.finished_at)}</span>
        </span>
      </div>
      {run.error && (
        <div className="mt-2 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {run.error}
        </div>
      )}
    </div>
  );
}

function RunSessionCard({ session, index }: { session: RunSessionRecord; index: number }) {
  const tone = runTone(session.status);
  const runs = session.runs || [];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Phiên #{index + 1}
          </div>
          <div className="mt-1 font-semibold text-foreground">
            {actionLabel(session.action)} • {session.profile_count || runs.length || 0} hồ sơ
          </div>
        </div>
        <span className={`pill ${TONE_BADGE[tone]} text-[10px]`}>
          {statusLabel(session.status)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>
          Bắt đầu: <span className="text-foreground">{formatTime(session.started_at)}</span>
        </span>
        <span>
          Kết thúc: <span className="text-foreground">{formatTime(session.finished_at)}</span>
        </span>
        <span>
          Tổng thời lượng:{' '}
          <span className="text-foreground">{formatDuration(session.duration_seconds)}</span>
        </span>
      </div>
      {runs.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {runs.map((run, runIndex) => (
            <RunDetailRow key={`${run.id || 'run'}-${run.finished_at || runIndex}`} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

let cachedStats: MultiBrowserStats | null = null;
let cachedChannels: FollowedChannel[] | null = null;
let cachedProfiles: MultiBrowserProfile[] | null = null;
let cachedDailyStats: DailyReportStats | null = null;
let cachedUpdatedAt = '';

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [timeFilter, setTimeFilter] = useState<'today' | 'yesterday' | '7days' | string>('today');
  const [dailyStats, setDailyStats] = useState<DailyReportStats | null>(() => cachedDailyStats);
  const [stats, setStats] = useState<MultiBrowserStats>(() => cachedStats || EMPTY_STATS);
  const [channels, setChannels] = useState<FollowedChannel[]>(() => cachedChannels || []);
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>(() => cachedProfiles || []);
  const [timelineCategory, setTimelineCategory] = useState<
    'all' | 'publish' | 'bkt' | 'download' | 'discovered'
  >('all');
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>(() => cachedUpdatedAt);
  const [showRunDetails, setShowRunDetails] = useState(false);

  const isFetchingRef = useRef(false);
  const pendingEventReloadRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDashboardData = useCallback(
    async (silent = false) => {
      const reqSeq = ++fetchSeqRef.current;
      if (isFetchingRef.current) {
        if (!silent) {
          pendingEventReloadRef.current = true;
        }
        return;
      }
      isFetchingRef.current = true;
      if (!silent) {
        setLoading(true);
      }
      try {
        const [dailyData, mbStats, chData, prData] = await Promise.all([
          getDailyReportStats(timeFilter).catch((err) => {
            console.warn('Lỗi getDailyReportStats:', err);
            return null;
          }),
          invoke<MultiBrowserStats>('get_multibrowser_stats').catch(() => EMPTY_STATS),
          invoke<FollowedChannel[]>('get_followed_channels').catch(() => []),
          invoke<MultiBrowserProfile[]>('get_multibrowser_profiles').catch(() => []),
        ]);

        if (!isMountedRef.current || reqSeq !== fetchSeqRef.current) {
          return;
        }

        if (dailyData) {
          cachedDailyStats = dailyData;
          setDailyStats(dailyData);
        }

        const mergedStats = {
          ...EMPTY_STATS,
          ...mbStats,
          run_summary: {
            ...EMPTY_STATS.run_summary,
            ...(mbStats?.run_summary || {}),
          },
        };

        cachedStats = mergedStats;
        cachedChannels = chData;
        cachedProfiles = prData;

        setStats(mergedStats);
        setChannels(chData);
        setProfiles(prData);

        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        cachedUpdatedAt = timeStr;
        setUpdatedAt(timeStr);
      } catch (e) {
        console.error('Lỗi khi tải dữ liệu dashboard:', e);
      } finally {
        isFetchingRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
          if (pendingEventReloadRef.current) {
            pendingEventReloadRef.current = false;
            window.setTimeout(() => {
              if (isMountedRef.current) {
                void fetchDashboardData(true);
              }
            }, 150);
          }
        }
      }
    },
    [timeFilter],
  );

  const loadData = useCallback(async () => {
    await fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Tự động polling mỗi 5 giây khi cửa sổ hiển thị + Lắng nghe sự kiện thời gian thực (single-flight)
  useEffect(() => {
    void fetchDashboardData(false);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void fetchDashboardData(true);
    }, 5000);

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedLoad = () => {
      if (cancelled) return;
      if (isFetchingRef.current) {
        pendingEventReloadRef.current = true;
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!cancelled) {
          void fetchDashboardData(true);
        }
      }, 300);
    };

    const unlistenPromises = [
      listen('bkt-test-job-updated', triggerDebouncedLoad),
      listen('bkt-auto-published-main', triggerDebouncedLoad),
      listen('channel-bkt-test-queued', triggerDebouncedLoad),
      listen('channel-new-videos', triggerDebouncedLoad),
      listen('download-completed', triggerDebouncedLoad),
    ];

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      unlistenPromises.forEach((p) => {
        p.then((unlisten) => {
          unlisten();
        }).catch(() => {});
      });
    };
  }, [fetchDashboardData]);

  // Bộ lọc timeline
  const filteredEvents = useMemo(() => {
    const events = dailyStats?.timelineEvents || [];
    if (timelineCategory === 'all') return events;
    if (timelineCategory === 'publish') {
      return events.filter((e) => e.eventType === 'auto_publish');
    }
    if (timelineCategory === 'bkt') {
      return events.filter((e) => e.eventType === 'bkt_test');
    }
    if (timelineCategory === 'download') {
      return events.filter((e) => e.eventType === 'download');
    }
    if (timelineCategory === 'discovered') {
      return events.filter((e) => e.eventType === 'discovered');
    }
    return events;
  }, [dailyStats, timelineCategory]);

  const hasActiveBktTasks = useMemo(() => {
    return (dailyStats?.timelineEvents || []).some(
      (e) =>
        e.eventType === 'bkt_test' &&
        ['queued', 'reuping', 'uploading', 'checking', 'pending'].includes(e.status),
    );
  }, [dailyStats]);

  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);

  const handleCancelSingleBkt = useCallback(
    async (jobId: string) => {
      try {
        setCancellingJobId(jobId);
        await cancelBktJob(jobId);
        await loadData();
      } catch (err) {
        console.error('Lỗi hủy tác vụ BKT:', err);
      } finally {
        setCancellingJobId(null);
      }
    },
    [loadData],
  );

  const handleCancelAllBkt = useCallback(async () => {
    try {
      setCancellingAll(true);
      await cancelAllBktJobs();
      await loadData();
    } catch (err) {
      console.error('Lỗi hủy toàn bộ tác vụ BKT:', err);
    } finally {
      setCancellingAll(false);
    }
  }, [loadData]);

  const runSummary = stats.run_summary || EMPTY_STATS.run_summary;
  const recentRuns = runSummary?.recent_runs || [];
  const recentSessions = runSummary?.recent_sessions || [];

  return (
    <div className="h-full w-full min-w-0 overflow-auto bg-background text-foreground">
      <div className="w-full min-w-0 p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* HEADER VẬN HÀNH & TIME FILTER */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-primary">
              <Activity className="w-3.5 h-3.5" />
              BÁO CÁO HOẠT ĐỘNG SẢN XUẤT NỘI DUNG
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              Bảng Điều Khiển Vận Hành Hằng Ngày
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Theo dõi trực tiếp chuỗi: Cào video đối thủ ➔ Tải về ➔ Test Bản Quyền Studio ➔ Xuất
              bản Kênh Đích.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Tabs: Hôm nay / Hôm qua / 7 ngày qua / Custom */}
            <div className="flex items-center p-1 rounded-lg bg-muted/40 border border-border/60 text-xs font-medium">
              <button
                type="button"
                onClick={() => setTimeFilter('today')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  timeFilter === 'today'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('yesterday')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  timeFilter === 'yesterday'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Hôm qua
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('7days')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  timeFilter === '7days'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                7 ngày qua
              </button>
            </div>

            <div className="text-xs text-muted-foreground hidden sm:block">
              {updatedAt ? (
                <>
                  Cập nhật:{' '}
                  <span className="font-mono text-foreground font-medium">{updatedAt}</span>
                </>
              ) : (
                'Đang tải...'
              )}
            </div>

            <button
              type="button"
              onClick={loadData}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              title="Làm mới báo cáo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        {/* 5 THẺ CHỈ SỐ KPI SẢN XUẤT TRỌNG TÂM */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* KPI 1: Video mới cào */}
          <button
            type="button"
            onClick={() => onNavigate('channels')}
            className="surface-card p-4 text-left relative overflow-hidden border border-border hover:border-sky-500/50 hover:bg-muted/20 transition group"
          >
            <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-sky-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Video mới phát hiện</span>
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Radio className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {dailyStats?.totalDiscoveredToday ?? 0}{' '}
              <span className="text-xs font-normal text-muted-foreground">video</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground truncate">
              Từ {channels.length} kênh đối thủ theo dõi
            </div>
          </button>

          {/* KPI 2: Video đã tải về & Dung lượng */}
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="surface-card p-4 text-left relative overflow-hidden border border-border hover:border-blue-500/50 hover:bg-muted/20 transition group"
          >
            <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-blue-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Đã tải về máy</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Download className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {dailyStats?.totalDownloadedToday ?? 0}{' '}
              <span className="text-xs font-normal text-muted-foreground">video</span>
            </div>
            <div className="mt-1 text-[11px] text-blue-400 font-medium truncate">
              Dung lượng: {formatBytes(dailyStats?.totalDownloadSizeBytes ?? 0)}
            </div>
          </button>

          {/* KPI 3: Kết quả kiểm tra Bản Quyền BKT */}
          <button
            type="button"
            onClick={() => onNavigate('reup')}
            className="surface-card p-4 text-left relative overflow-hidden border border-border hover:border-emerald-500/50 hover:bg-muted/20 transition group"
          >
            <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-emerald-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Kiểm tra Bản Quyền</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {dailyStats?.totalBktTestedToday ?? 0}{' '}
              <span className="text-xs font-normal text-muted-foreground">đã test</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                Sạch: {dailyStats?.bktCleanCount ?? 0}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">
                Dính: {dailyStats?.bktClaimedCount ?? 0}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                Chờ: {dailyStats?.bktPendingCount ?? 0}
              </span>
            </div>
          </button>

          {/* KPI 4: Đã đăng Kênh Đích */}
          <button
            type="button"
            onClick={() => onNavigate('profiles')}
            className="surface-card p-4 text-left relative overflow-hidden border border-border hover:border-purple-500/50 hover:bg-muted/20 transition group"
          >
            <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-purple-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Đã đăng Kênh Đích</span>
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Rocket className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {dailyStats?.totalPublishedMainToday ?? 0}{' '}
              <span className="text-xs font-normal text-muted-foreground">video</span>
            </div>
            <div className="mt-1 text-[11px] text-purple-400 font-medium truncate">
              Xuất bản công khai lên Kênh Chính
            </div>
          </button>

          {/* KPI 5: Quota test Bản Quyền còn lại */}
          <div className="surface-card p-4 relative overflow-hidden border border-border">
            <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-amber-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Quota Test Bản Quyền Còn
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {dailyStats?.testQuotaRemaining ?? 0}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                / {dailyStats?.testQuotaTotal ?? 0} slot
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground truncate">
              Đã dùng: {dailyStats?.testQuotaUsed ?? 0} slot • Reset 00:00
            </div>
          </div>
        </div>

        {/* TIẾN TRÌNH TỰ ĐỘNG HÓA TRONG NGÀY (DAILY PRODUCTION TIMELINE) */}
        <div className="surface-card p-5 border border-border rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  Tiến Trình Tự Động Hóa Trong Ngày
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Dòng thời gian vận hành: Tải video, kiểm tra bản quyền và xuất bản kênh đích (
                  {dailyStats?.targetDate || 'Hôm nay'}).
                </p>
              </div>
            </div>

            {/* Filter Tabs & Nút Dừng tác vụ Test */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {hasActiveBktTasks && (
                <button
                  type="button"
                  disabled={cancellingAll}
                  onClick={handleCancelAllBkt}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-destructive/40 text-destructive bg-destructive/10 hover:bg-destructive hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  {cancellingAll ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Square className="w-3 h-3 fill-current" />
                  )}
                  Dừng tất cả tác vụ Test
                </button>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimelineCategory('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                    timelineCategory === 'all'
                      ? 'bg-primary/20 text-primary font-semibold border border-primary/40'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  Tất cả ({dailyStats?.timelineEvents?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategory('publish')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                    timelineCategory === 'publish'
                      ? 'bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/40'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  Xuất bản đích ({dailyStats?.totalPublishedMainToday ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategory('bkt')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                    timelineCategory === 'bkt'
                      ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/40'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  Test Bản Quyền ({dailyStats?.totalBktTestedToday ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategory('download')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                    timelineCategory === 'download'
                      ? 'bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/40'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  Tải về ({dailyStats?.totalDownloadedToday ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategory('discovered')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                    timelineCategory === 'discovered'
                      ? 'bg-sky-500/20 text-sky-400 font-semibold border border-sky-500/40'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  Cào video ({dailyStats?.totalDiscoveredToday ?? 0})
                </button>
              </div>
            </div>
          </div>

          {/* Timeline Feed Container */}
          <div className="max-h-[380px] overflow-y-auto pr-2 space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-10 text-center text-xs text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                Chưa có hoạt động tự động hóa nào được ghi nhận trong khoảng thời gian này.
              </div>
            ) : (
              <div className="relative pl-6 space-y-3 border-l-2 border-border/60 ml-3">
                {filteredEvents.map((ev) => {
                  const isClean = ev.status === 'green_clean';
                  const isClaim = ev.status === 'red_matched';
                  const isFailed = ev.status === 'failed';
                  const isPublish = ev.eventType === 'auto_publish';
                  const isDownload = ev.eventType === 'download';
                  const isDiscovered = ev.eventType === 'discovered';
                  const isRunningBkt =
                    ev.eventType === 'bkt_test' &&
                    ['queued', 'reuping', 'uploading', 'checking', 'pending'].includes(ev.status);

                  return (
                    <div key={ev.id} className="relative group">
                      {/* Node Bullet Icon */}
                      <span
                        className={`absolute -left-[31px] top-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ring-4 ring-background ${
                          isPublish
                            ? 'bg-purple-500 text-white'
                            : isClean
                              ? 'bg-emerald-500 text-white'
                              : isClaim
                                ? 'bg-rose-500 text-white'
                                : isFailed
                                  ? 'bg-rose-600 text-white'
                                  : isDownload
                                    ? 'bg-blue-500 text-white'
                                    : isDiscovered
                                      ? 'bg-sky-500 text-white'
                                      : 'bg-amber-500 text-white'
                        }`}
                      >
                        {isPublish ? (
                          <Rocket className="w-2.5 h-2.5" />
                        ) : isClean ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : isClaim ? (
                          <AlertTriangle className="w-2.5 h-2.5" />
                        ) : isFailed ? (
                          <XCircle className="w-2.5 h-2.5" />
                        ) : isDownload ? (
                          <Download className="w-2.5 h-2.5" />
                        ) : isDiscovered ? (
                          <Radio className="w-2.5 h-2.5" />
                        ) : (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        )}
                      </span>

                      {/* Event Card */}
                      <div className="p-3 rounded-lg border border-border/60 bg-muted/15 hover:bg-muted/30 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-muted-foreground font-semibold">
                              {ev.time}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 uppercase font-bold tracking-wider ${
                                isPublish
                                  ? 'border-purple-500/40 text-purple-400 bg-purple-500/10'
                                  : isClean
                                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                                    : isClaim
                                      ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                                      : isFailed
                                        ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                                        : isDownload
                                          ? 'border-blue-500/40 text-blue-400 bg-blue-500/10'
                                          : isDiscovered
                                            ? 'border-sky-500/40 text-sky-400 bg-sky-500/10'
                                            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                              }`}
                            >
                              {isPublish
                                ? 'Xuất bản đích'
                                : isClean
                                  ? 'Sạch Bản Quyền'
                                  : isClaim
                                    ? 'Dính Bản Quyền'
                                    : isFailed
                                      ? 'Test Thất Bại'
                                      : isDownload
                                        ? 'Tải video'
                                        : isDiscovered
                                          ? 'Cào video mới'
                                          : 'Đang Kiểm Tra'}
                            </Badge>

                            {isRunningBkt && (
                              <button
                                type="button"
                                disabled={cancellingJobId === ev.id}
                                onClick={() => handleCancelSingleBkt(ev.id)}
                                title="Dừng tác vụ kiểm tra này"
                                className="text-[10px] px-2 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 hover:bg-destructive hover:text-white flex items-center gap-1 transition-colors"
                              >
                                {cancellingJobId === ev.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <Square className="w-2.5 h-2.5 fill-current" />
                                )}
                                Dừng
                              </button>
                            )}
                          </div>
                          {ev.channelName && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Tv className="w-3 h-3 text-primary/70" /> {ev.channelName}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs font-semibold text-foreground line-clamp-1">
                          {ev.title}
                        </div>

                        {ev.details && (
                          <div className="mt-1 text-[11px] text-muted-foreground/90 truncate">
                            {ev.details}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PHẦN DƯỚI: ĐỐI CHIẾU 1-1 KÊNH (7 PHẦN) + HẠ TẦNG ENGINE (5 PHẦN) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI (7 cols): Đối Chiếu 1-1 Kênh Đối Thủ ↔ Kênh Đích */}
          <div className="lg:col-span-7 surface-card p-5 border border-border rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Link2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    Đối Chiếu 1-1: Kênh Đối Thủ ↔ Kênh Đích Hệ Thống
                    <Badge
                      variant="outline"
                      className="text-[9px] text-emerald-400 border-emerald-500/30"
                    >
                      Chống đăng nhầm kênh
                    </Badge>
                  </h3>
                  <div className="text-[11px] text-muted-foreground">
                    Khớp 1-1:{' '}
                    {channels.filter((c) => c.target_profile_id || c.bkt_profile_id).length}/
                    {channels.length} kênh • Kênh sạch:{' '}
                    {channels.filter((c) => !c.risk_status || c.risk_status === 'green').length}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('channels')}
                className="btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1 text-primary"
              >
                Quản lý Kênh <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Bảng ánh xạ rút gọn */}
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card max-h-[240px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 border-b border-border/60 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="py-2 px-3">Kênh đối thủ (Scraped)</th>
                    <th className="py-2 px-3">Kênh đích hệ thống</th>
                    <th className="py-2 px-3 text-center">Video cào</th>
                    <th className="py-2 px-3 text-right">Khớp 1-1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        Chưa có kênh đối thủ nào được theo dõi.
                      </td>
                    </tr>
                  ) : (
                    channels.map((ch) => {
                      const targetId = ch.target_profile_id || ch.bkt_profile_id;
                      const matchedProfile = profiles.find(
                        (p) => p.id === targetId || p.profile_name === targetId,
                      );
                      return (
                        <tr key={ch.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-3 font-medium text-foreground truncate max-w-[180px]">
                            {ch.name}
                          </td>
                          <td className="py-2 px-3">
                            {matchedProfile ? (
                              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {matchedProfile.profile_name}
                              </span>
                            ) : targetId ? (
                              <span className="text-emerald-400/90 flex items-center gap-1 font-mono text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                                Hồ sơ (
                                {targetId.length > 8 ? `${targetId.slice(0, 8)}...` : targetId})
                              </span>
                            ) : (
                              <span className="text-amber-500 text-[11px]">Chưa gán đích</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">
                            {ch.total_videos || 0}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {matchedProfile || targetId ? (
                              <Badge
                                variant="outline"
                                className="text-emerald-400 border-emerald-500/30 text-[9px]"
                              >
                                Đã khớp 1-1
                              </Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onNavigate('channels')}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Gán ngay →
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CỘT PHẢI (5 cols): Hạ Tầng Engine & Runtime */}
          <div className="lg:col-span-5 surface-card p-5 border border-border rounded-xl space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Server className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Hạ Tầng Engine & Runtime</h3>
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Local Engine Đang Hoạt Động
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRunDetails(true)}
                  className="btn-ghost text-[11px] px-2 py-1 text-primary hover:underline"
                >
                  Chi tiết phiên →
                </button>
              </div>

              {/* Hardware / Engine Spec Mini Grid */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="p-2 rounded-lg border border-border/60 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Server className="w-3 h-3" /> Hệ Điều Hành
                  </div>
                  <div className="font-semibold text-foreground mt-0.5">
                    {stats.system_info?.os || 'Windows 10/11'}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-border/60 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> RAM Khả Dụng
                  </div>
                  <div className="font-semibold text-foreground mt-0.5">
                    {stats.system_info?.ram || 'Khả dụng'}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-border/60 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Python Engine
                  </div>
                  <div className="font-semibold text-foreground mt-0.5">
                    Python {stats.system_info?.python || '3.11'}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-border/60 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <UserCheck className="w-3 h-3" /> Tổng Hồ Sơ
                  </div>
                  <div className="font-semibold text-foreground mt-0.5">
                    {stats.total_profiles || profiles.length} hồ sơ
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-muted-foreground flex items-center justify-between border-t border-border/50">
              <span>
                Đang mở: <strong className="text-primary">{stats.running || 0}</strong> • Sẵn sàng:{' '}
                <strong className="text-emerald-400">{stats.ready || 0}</strong>
              </span>
              <button
                type="button"
                onClick={() => onNavigate('profiles')}
                className="text-primary hover:underline font-medium"
              >
                Quản lý hồ sơ →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT PHIÊN CHẠY (RUN HISTORY) */}
      <Dialog open={showRunDetails} onOpenChange={setShowRunDetails}>
        <DialogContent className="max-w-4xl max-h-[86vh] overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <div className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Chi tiết phiên chạy
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Lịch sử chạy gần nhất
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Hiển thị thời lượng, workflow, trạng thái và lỗi chi tiết của từng phiên automation.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] overflow-auto p-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                <div className="text-muted-foreground">Tổng thời gian hôm nay</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {formatDuration(runSummary?.today_runtime_seconds)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                <div className="text-muted-foreground">Số phiên hôm nay</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {runSummary?.today_session_count || 0}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                <div className="text-muted-foreground">Lượt chạy gần nhất</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {recentRuns.length}
                </div>
              </div>
            </div>
            {recentSessions.length > 0 ? (
              <div className="space-y-3">
                {recentSessions.map((session, index) => (
                  <RunSessionCard
                    key={session.session_id || index}
                    session={session}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
                Chưa có dữ liệu phiên chạy nào.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
