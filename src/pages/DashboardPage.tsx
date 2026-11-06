import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Folder,
  Layers,
  Link2,
  RefreshCw,
  Server,
  Tv,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Page } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
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

const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/30',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
};

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

function StatCard({
  title,
  value,
  hint,
  tone,
  badge,
  delay,
}: {
  title: string;
  value: number | string;
  hint: string;
  tone: Tone;
  badge: string;
  delay: number;
}) {
  return (
    <div
      className="surface-card relative overflow-hidden p-5 card-enter border border-border"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r ${TONE_BAR[tone]}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <span className={`pill ${TONE_BADGE[tone]} text-[10px]`}>{badge}</span>
      </div>
      <div className="mt-3 stat-num text-3xl font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground truncate">{hint}</div>
    </div>
  );
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

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [stats, setStats] = useState<MultiBrowserStats>(EMPTY_STATS);
  const [channels, setChannels] = useState<FollowedChannel[]>([]);
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [showRunDetails, setShowRunDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsData, channelsData, profilesData] = await Promise.all([
        invoke<MultiBrowserStats>('get_multibrowser_stats').catch(() => EMPTY_STATS),
        invoke<FollowedChannel[]>('get_followed_channels').catch(() => []),
        invoke<MultiBrowserProfile[]>('get_multibrowser_profiles').catch(() => []),
      ]);

      setStats({
        ...EMPTY_STATS,
        ...statsData,
        run_summary: {
          ...EMPTY_STATS.run_summary,
          ...(statsData.run_summary || {}),
        },
      });
      setChannels(channelsData);
      setProfiles(profilesData);
      setError('');
      const now = new Date();
      setUpdatedAt(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
    } catch (e) {
      console.error('Lỗi khi tải thống kê:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const runSummary = stats.run_summary || EMPTY_STATS.run_summary;
  const recentRuns = runSummary?.recent_runs || [];
  const recentSessions = runSummary?.recent_sessions || [];
  const lastSession = recentSessions[0] || null;

  const cards = useMemo(
    () => [
      {
        title: 'Tổng hồ sơ',
        value: stats.total_profiles,
        hint: 'Hồ sơ trong hệ thống',
        tone: 'neutral' as Tone,
        badge: 'Tổng',
      },
      {
        title: 'Sẵn sàng chạy',
        value: stats.ready ?? 0,
        hint: 'Không đang chạy và không lỗi',
        tone: 'success' as Tone,
        badge: 'Ready',
      },
      {
        title: 'Đang chạy',
        value: stats.running,
        hint: 'Trình duyệt đang mở',
        tone: 'primary' as Tone,
        badge: 'Live',
      },
      {
        title: 'Lỗi hôm nay',
        value: stats.error_today,
        hint: stats.error_today > 0 ? 'Cần kiểm tra' : 'Mọi thứ ổn',
        tone: stats.error_today > 0 ? ('warning' as Tone) : ('success' as Tone),
        badge: 'Lỗi',
      },
      {
        title: 'Thời gian hôm nay',
        value: formatDuration(runSummary?.today_runtime_seconds),
        hint: `${runSummary?.today_session_count || 0} phiên • ${runSummary?.today_run_count || 0} lượt chạy`,
        tone: 'primary' as Tone,
        badge: 'Runtime',
      },
      {
        title: 'Trạng thái hệ thống',
        value: 'Sẵn sàng',
        hint: 'Engine cục bộ đang chạy',
        tone: 'success' as Tone,
        badge: 'Engine',
      },
    ],
    [stats, runSummary],
  );

  return (
    <div className="h-full w-full min-w-0 overflow-auto">
      <div className="w-full min-w-0 p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase font-bold tracking-widest text-primary/80">
              TỔNG QUAN HỆ THỐNG
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              Bảng điều khiển trung tâm
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Theo dõi trạng thái profile, tài nguyên runtime và lịch sử phiên chạy tự động.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {updatedAt ? (
                <>
                  Cập nhật: <span className="font-medium text-foreground">{updatedAt}</span>
                </>
              ) : (
                'Đang tải dữ liệu...'
              )}
            </span>
            <button
              type="button"
              onClick={load}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              title="Tải lại số liệu vận hành"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profiles')}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Quản lý hồ sơ
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 6 Stat Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map((card, i) => (
            <StatCard key={card.title} {...card} delay={i * 45} />
          ))}
        </div>

        {/* Chức năng 1: Bảng đối chiếu 1-1 Kênh đối thủ ↔ Kênh hệ thống */}
        <div className="surface-card p-5 border border-border rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  Đối Chiếu 1-1: Kênh Đối Thủ ↔ Kênh Hệ Thống
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    Chống đăng nhầm kênh
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Đảm bảo mỗi kênh đối thủ được cào video chỉ ánh xạ duy nhất vào 1 hồ sơ / kênh
                  đích hệ thống.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('channels')}
                className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5"
              >
                <Tv className="w-3.5 h-3.5 text-primary" />
                Quản lý Kênh
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Theo dõi
              </div>
              <div className="text-lg font-bold text-foreground mt-0.5">{channels.length} kênh</div>
            </div>
            <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Tổng video cào
              </div>
              <div className="text-lg font-bold text-primary mt-0.5">
                {channels.reduce((acc, c) => acc + (c.total_videos || 0), 0)} video
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-[10px] text-emerald-500 uppercase font-semibold">
                Đã khớp 1-1
              </div>
              <div className="text-lg font-bold text-emerald-500 mt-0.5">
                {channels.filter((c) => c.bkt_profile_id).length} kênh
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="text-[10px] text-amber-500 uppercase font-semibold">
                Chưa gán đích
              </div>
              <div className="text-lg font-bold text-amber-500 mt-0.5">
                {channels.filter((c) => !c.bkt_profile_id).length} kênh
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-[10px] text-emerald-500 uppercase font-semibold">
                Kênh sạch (Xanh)
              </div>
              <div className="text-lg font-bold text-emerald-500 mt-0.5">
                {channels.filter((c) => !c.risk_status || c.risk_status === 'green').length}
              </div>
            </div>
            <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5">
              <div className="text-[10px] text-rose-500 uppercase font-semibold">
                Khóa Đỏ (2 lỗi)
              </div>
              <div className="text-lg font-bold text-rose-500 mt-0.5">
                {channels.filter((c) => c.risk_status === 'red').length}
              </div>
            </div>
          </div>

          {/* Mapping Table */}
          <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 border-b border-border/60 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="py-2.5 px-3">Kênh đối thủ (Scraped Source)</th>
                    <th className="py-2.5 px-3">Hồ sơ / Kênh đích hệ thống</th>
                    <th className="py-2.5 px-3 text-center">Video cào</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái rủi ro</th>
                    <th className="py-2.5 px-3">Từ khóa đối chiếu</th>
                    <th className="py-2.5 px-3 text-right">Khớp 1-1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Chưa có kênh đối thủ nào được theo dõi. Hãy thêm kênh tại mục "Theo dõi
                        Kênh".
                      </td>
                    </tr>
                  ) : (
                    channels.map((ch) => {
                      const matchedProfile = profiles.find((p) => p.id === ch.bkt_profile_id);
                      const isRed = ch.risk_status === 'red';
                      const isYellow = ch.risk_status === 'yellow';

                      return (
                        <tr key={ch.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {ch.thumbnail ? (
                                <img
                                  src={ch.thumbnail}
                                  alt={ch.name}
                                  className="w-6 h-6 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                  {ch.name.substring(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 max-w-[200px]">
                                <div className="font-semibold text-foreground truncate">
                                  {ch.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {ch.url}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {matchedProfile ? (
                              <div className="flex items-center gap-1.5 text-foreground font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="truncate max-w-[160px]">
                                  {matchedProfile.profile_name}
                                </span>
                                {matchedProfile.youtube_preferred_channel && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({matchedProfile.youtube_preferred_channel})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-amber-500 font-medium text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Chưa gán (Dễ nhầm lẫn)</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-semibold">
                            {ch.total_videos || 0}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isRed ? (
                              <Badge className="bg-rose-500/15 text-rose-500 border border-rose-500/30 text-[10px]">
                                Đỏ (Khóa tải 2 lỗi)
                              </Badge>
                            ) : isYellow ? (
                              <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px]">
                                Vàng (Có video dính)
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px]">
                                Xanh (Sạch)
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[150px]">
                            {ch.filter_include_keywords || 'Tất cả từ khóa'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {matchedProfile ? (
                              <Badge
                                variant="outline"
                                className="text-emerald-500 border-emerald-500/30 text-[10px]"
                              >
                                ✓ Khớp 1-1
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
        </div>

        {/* Lower Grid: Sessions, System Info, Errors */}
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_360px]">
          {/* Card 1: Recent Sessions */}
          <button
            type="button"
            title="Mở chi tiết phiên auto gần nhất và lịch sử chạy."
            onClick={() => setShowRunDetails(true)}
            className="surface-card p-5 text-left card-enter transition hover:border-primary/50 hover:bg-muted/20 border border-border flex flex-col justify-between"
            style={{ animationDelay: '260ms' }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Phiên gần nhất
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    Chi tiết lần chạy mới nhất
                  </div>
                </div>
                <span className="pill pill-info text-xs">Bấm để xem</span>
              </div>
              {lastSession ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-foreground">
                        {actionLabel(lastSession.action)} •{' '}
                        {lastSession.profile_count || lastSession.runs?.length || 0} hồ sơ
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {statusLabel(lastSession.status)} • {formatTime(lastSession.finished_at)}
                      </div>
                    </div>
                    <span className={`pill ${TONE_BADGE[runTone(lastSession.status)]}`}>
                      {formatDuration(lastSession.duration_seconds)}
                    </span>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <span className="text-muted-foreground">Bắt đầu: </span>
                      <span className="text-foreground font-medium">
                        {formatTime(lastSession.started_at)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <span className="text-muted-foreground">Thời lượng: </span>
                      <span className="text-foreground font-medium">
                        {formatDuration(lastSession.duration_seconds)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-xs text-muted-foreground">
                  Chưa có phiên chạy nào được ghi nhận hôm nay.
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Tổng số lượt chạy: {recentRuns.length}</span>
              <span className="text-primary hover:underline">Xem tất cả →</span>
            </div>
          </button>

          {/* Card 2: Runtime & Engine Info */}
          <div
            className="surface-card p-5 card-enter border border-border flex flex-col justify-between"
            style={{ animationDelay: '350ms' }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Runtime & Môi trường
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    Thông số hệ thống
                  </div>
                </div>
                <span className="pill pill-success text-xs">Active</span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" /> Hệ điều hành
                  </span>
                  <span className="font-semibold text-foreground">
                    {stats.system_info?.os || 'Windows 10'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Bộ nhớ RAM
                  </span>
                  <span className="font-semibold text-foreground">
                    {stats.system_info?.ram || 'Khả dụng'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Python Engine
                  </span>
                  <span className="font-semibold text-foreground">
                    Python {stats.system_info?.python || '3.11'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5 truncate">
                    <Folder className="w-3.5 h-3.5 shrink-0" /> Dữ liệu hồ sơ
                  </span>
                  <span
                    className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]"
                    title={stats.system_info?.data_dir}
                  >
                    {stats.system_info?.data_dir || '%LOCALAPPDATA%\\RETubeMatrix\\browser_engine'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
              Kho hồ sơ độc lập, bảo mật và lưu trữ riêng biệt trên máy.
            </div>
          </div>

          {/* Card 3: Recent Errors & Profiles Needing Check */}
          <div
            className="surface-card p-5 card-enter border border-border flex flex-col justify-between"
            style={{ animationDelay: '470ms' }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Lỗi gần nhất
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">Cần kiểm tra</div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('logs')}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  Xem log
                </button>
              </div>
              {(stats.recent_errors || []).length > 0 ? (
                <div className="space-y-2">
                  {(stats.recent_errors || []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(item.time)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-destructive/90 text-[11px]">
                        {item.error || 'Không có chi tiết lỗi'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-10 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500/70" />
                  Mọi thứ đang hoạt động ổn định, không có lỗi gần đây.
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
              Trạng thái tự động cập nhật mỗi 5 giây.
            </div>
          </div>
        </div>
      </div>

      {/* Session Details Modal */}
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
              Hiển thị thời lượng, workflow, trạng thái và lỗi chi tiết.
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
                <div className="text-muted-foreground">Bản ghi gần nhất</div>
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
