import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { detectPlatform } from '@/contexts/channels/useChannelsController';
import type { ChannelStats, FollowedChannel, MultiBrowserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelSettingsDialog } from './ChannelSettingsDialog';
import { CompetitorSeoDialog } from './CompetitorSeoDialog';
import { formatPostingScheduleVietnamese } from './channelUtils';
import { PlatformTag } from './PlatformTag';

export interface ChannelReupProgress {
  channelId: string;
  isRunning: boolean;
  currentStep: number;
  totalSteps: number;
  progressText: string;
  status: 'idle' | 'running' | 'success' | 'error';
}

interface ChannelCardProps {
  channel: FollowedChannel;
  stats?: ChannelStats | null;
  profiles?: MultiBrowserProfile[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCheckNow: () => void;
  isChecking: boolean;
  onUnfollow: () => void;
  onToggleAutoDownload: (enabled: boolean) => void;
  onUpdateSettings?: (
    settings: Parameters<React.ComponentProps<typeof ChannelSettingsDialog>['onSave']>[0],
  ) => Promise<void>;
  onRefreshChannels?: () => Promise<void>;
  reupProgress?: ChannelReupProgress;
  onClearReupProgress?: (channelId: string) => void;
}

export function ChannelCard({
  channel,
  stats,
  profiles = [],
  isExpanded,
  onToggleExpand,
  onCheckNow,
  isChecking,
  onUnfollow,
  onToggleAutoDownload,
  onUpdateSettings,
  onRefreshChannels,
  reupProgress,
  onClearReupProgress,
}: ChannelCardProps) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSeoDialog, setShowSeoDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'filter' | 'bkt' | 'filename'>('filter');

  const handleToggleReupSwitch = (enabled: boolean) => {
    if (enabled && !channel.bkt_profile_id) {
      toast.warning({
        title: 'Chưa Gán Hồ Sơ Kênh Đích',
        message: 'Vui lòng chọn Hồ Sơ Kênh Đích để hệ thống biết xuất bản video vào kênh nào.',
      });
      setSettingsTab('bkt');
      setShowSettings(true);
      return;
    }
    onToggleAutoDownload(enabled);
  };

  const platform = detectPlatform(channel.url);
  const totalVideos = stats?.total_videos ?? channel.total_videos;
  const totalScanned = stats?.total_scanned ?? 0;
  const totalDownloaded = stats?.total_downloaded ?? 0;
  const postingSchedule = formatPostingScheduleVietnamese(stats?.posting_schedule?.formatted);
  const matchedProfile = profiles.find((p) => p.id === channel.bkt_profile_id);

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200 overflow-hidden bg-card/60 backdrop-blur-sm',
        isExpanded
          ? 'border-primary shadow-md shadow-primary/5 ring-1 ring-primary/20'
          : 'border-border/60 hover:border-primary/40',
      )}
    >
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        {/* Top: Avatar, Info, Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-primary/10 flex-shrink-0 flex items-center justify-center ring-2 ring-primary/20">
              {channel.thumbnail ? (
                <img
                  src={channel.thumbnail}
                  alt={channel.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/30 via-purple-500/20 to-blue-500/30 flex items-center justify-center font-bold text-xs text-primary uppercase select-none">
                  {channel.name
                    .trim()
                    .slice(0, 2)
                    .replace(/[^a-zA-Z0-9]/g, '') || 'YT'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base leading-snug truncate" title={channel.name}>
                  {channel.name}
                </h3>
                <PlatformTag platform={platform} />
                {channel.risk_status === 'red' ? (
                  <Badge
                    variant="outline"
                    className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] py-0 cursor-help"
                    title={channel.risk_reason || 'Kênh có nguy cơ bản quyền cao'}
                  >
                    Kênh Rủi Ro
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] py-0 cursor-help"
                    title={channel.risk_reason || 'Kênh ngách an toàn / Nội dung sạch'}
                  >
                    Kênh Sạch
                  </Badge>
                )}
                {channel.bkt_profile_id ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] py-0 cursor-pointer flex items-center gap-1 hover:bg-emerald-500/25 transition-colors"
                    onClick={() => {
                      setSettingsTab('bkt');
                      setShowSettings(true);
                    }}
                    title="Đã khớp 1-1 với hồ sơ hệ thống. Bấm để đổi hồ sơ"
                  >
                    <UserCheck className="w-3 h-3 text-emerald-400" />
                    <span>{matchedProfile?.profile_name || 'Đã khớp 1-1'}</span>
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSettingsTab('bkt');
                      setShowSettings(true);
                    }}
                    className="h-5 px-1.5 text-[10px] text-amber-500 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 font-medium gap-1"
                    title="Chưa gán hồ sơ đích! Bấm để gán đối chiếu 1-1"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>Gán hồ sơ đích</span>
                  </Button>
                )}
                {Boolean(channel.bkt_test_mode) && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] py-0 cursor-help"
                    title="Chế độ Test BKT đang BẬT: Video dính rủi ro sẽ được gửi sang kênh BKT để kiểm tra ngầm"
                  >
                    Test BKT bật
                  </Badge>
                )}
                {channel.auto_download ? (
                  <Badge
                    variant="outline"
                    className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px] py-0 font-medium flex items-center gap-1 shadow-sm"
                    title="Chế độ Auto Reup đang BẬT: Hệ thống tự động theo dõi, tải và xuất bản video mới lên Kênh Đích"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    <span>Auto Reup</span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-muted/40 text-muted-foreground border-border/50 text-[10px] py-0 font-normal"
                    title="Chưa bật Auto Reup"
                  >
                    Chưa
                  </Badge>
                )}
              </div>
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 mt-0.5 truncate max-w-[280px]"
              >
                <Globe className="w-3 h-3" />
                <span className="truncate">{channel.url}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSeoDialog(true)}
              className="h-8 gap-1.5 text-xs font-medium border-border/70 hover:border-primary/50 text-foreground hover:text-primary bg-background/50 hover:bg-accent/50 hidden sm:inline-flex shadow-sm transition-colors"
              title="Tự động bóc tách từ khóa đối thủ và cài đặt vào YouTube Studio"
            >
              <Settings className="w-3.5 h-3.5 text-primary/80" />
              <span className="hidden md:inline">Cài đặt Studio</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onCheckNow}
              disabled={isChecking}
              className="h-8 gap-1.5 text-xs font-medium"
              title="Quét tìm video mới ngay"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isChecking && 'animate-spin text-primary')} />
              <span className="hidden sm:inline">{isChecking ? 'Đang quét...' : 'Quét ngay'}</span>
            </Button>

            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onUnfollow();
                    setConfirmDelete(false);
                  }}
                  className="h-8 text-xs px-2.5"
                >
                  Xác nhận
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 text-xs px-2"
                >
                  Hủy
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Hủy theo dõi kênh"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant={isExpanded ? 'secondary' : 'ghost'}
              size="sm"
              onClick={onToggleExpand}
              className="h-8 gap-1 text-xs px-2.5 font-medium border border-border/40"
            >
              <span>{isExpanded ? 'Thu gọn' : 'Xem video'}</span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 transition-transform duration-200',
                  isExpanded && 'rotate-180',
                )}
              />
            </Button>
          </div>
        </div>

        {/* Middle Stats Grid: 4 KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* KPI 1: Tổng số video kênh */}
          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/40 flex flex-col justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-primary" />
              Tổng video kênh
            </span>
            <span className="font-semibold text-base mt-1 text-foreground">
              {totalVideos != null
                ? totalVideos.toLocaleString()
                : totalScanned > 0
                  ? `${totalScanned.toLocaleString()}+`
                  : 'N/A'}
            </span>
          </div>

          {/* KPI 2: Đã quét được */}
          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/40 flex flex-col justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
              Đã quét vào DB
            </span>
            <span className="font-semibold text-base mt-1 text-blue-600 dark:text-blue-400">
              {totalScanned.toLocaleString()} video
            </span>
          </div>

          {/* KPI 3: Đã tải xuống */}
          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/40 flex flex-col justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Đã tải về máy
            </span>
            <span className="font-semibold text-base mt-1 text-emerald-600 dark:text-emerald-400">
              {totalDownloaded.toLocaleString()} video
            </span>
          </div>

          {/* KPI 4: Khung giờ & tần suất đăng video */}
          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/40 flex flex-col justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Lịch & tần suất đăng
            </span>
            <span
              className="font-medium text-xs mt-1 text-amber-700 dark:text-amber-400 truncate"
              title={postingSchedule}
            >
              {postingSchedule}
            </span>
          </div>
        </div>

        {/* Real-time Auto Reup Top 5 Progress Banner */}
        {reupProgress?.isRunning && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 via-purple-500/15 to-purple-500/10 border border-purple-500/30 text-xs shadow-sm space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                <span className="font-semibold text-purple-300 shrink-0">
                  Auto Reup Top 5 ({reupProgress.currentStep}/{reupProgress.totalSteps}):
                </span>
                <span className="text-foreground/90 truncate font-medium">
                  {reupProgress.progressText}
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30 shrink-0">
                {Math.round((reupProgress.currentStep / reupProgress.totalSteps) * 100)}%
              </span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.max(5, Math.min(100, Math.round((reupProgress.currentStep / reupProgress.totalSteps) * 100)))}%`,
                }}
              />
            </div>
          </div>
        )}

        {reupProgress && !reupProgress.isRunning && reupProgress.status === 'success' && (
          <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">
                {reupProgress.progressText ||
                  'Đã hoàn tất Reup Tuần Tự Top 5! Kênh đang tự động theo dõi video mới.'}
              </span>
            </span>
            {onClearReupProgress && (
              <button
                type="button"
                onClick={() => onClearReupProgress(channel.id)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline ml-2 shrink-0 cursor-pointer"
              >
                Đóng
              </button>
            )}
          </div>
        )}

        {/* Bottom Bar: Auto Reup switch & settings */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(channel.auto_download)}
                onCheckedChange={handleToggleReupSwitch}
                disabled={reupProgress?.isRunning}
                id={`auto-dl-${channel.id}`}
              />
              <label
                htmlFor={`auto-dl-${channel.id}`}
                className="font-medium text-foreground cursor-pointer select-none flex items-center gap-1.5"
              >
                <span>Auto Reup</span>
                {reupProgress?.isRunning && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                )}
              </label>
            </div>
            {channel.auto_download && (
              <Badge
                variant="outline"
                className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[11px] py-0"
              >
                Mỗi {channel.check_interval} phút
              </Badge>
            )}

            {!channel.bkt_profile_id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingsTab('bkt');
                  setShowSettings(true);
                }}
                className="h-7 px-2.5 text-xs gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-semibold shadow-sm"
                title="Bấm để gán hồ sơ trình duyệt / kênh đích cho kênh này"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>Gán hồ sơ đích</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingsTab('bkt');
                  setShowSettings(true);
                }}
                className="h-7 px-2.5 text-xs gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-medium"
                title="Hồ sơ đã được liên kết 1-1. Bấm để đổi hồ sơ"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{matchedProfile?.profile_name || 'Đã khớp 1-1'}</span>
              </Button>
            )}

            {onUpdateSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingsTab('filter');
                  setShowSettings(true);
                }}
                className="h-7 px-2.5 text-xs gap-1.5 border-border/60 hover:border-primary/60 font-medium"
                title="Cài đặt lọc tự động & lách bản quyền"
              >
                <SlidersHorizontal className="w-3 h-3 text-primary" />
                <span>Cài đặt & Reup</span>
                {channel.reup_mod_enabled && (
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 text-[9px] bg-rose-500/10 text-rose-500 font-medium ml-0.5"
                  >
                    Reup Mod
                  </Badge>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSeoDialog(true)}
              className="h-7 px-2.5 text-xs gap-1.5 border-purple-500/40 hover:border-purple-500/60 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium shadow-sm transition-all"
              title="Trích xuất từ khóa kênh, thẻ video và hashtags đối thủ để cài đặt YouTube Studio & Nuôi kênh tự nhiên (Chuẩn quy trình BrowserMulti)"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>Cài Đặt & Nuôi Kênh SEO (Đối thủ)</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span>Lần quét gần nhất:</span>
            <span className="font-medium text-foreground">
              {channel.last_checked_at
                ? new Date(channel.last_checked_at).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                  })
                : 'Chưa quét'}
            </span>
          </div>
        </div>
      </div>

      {showSettings && onUpdateSettings && (
        <ChannelSettingsDialog
          open={showSettings}
          onOpenChange={setShowSettings}
          channel={channel}
          initialTab={settingsTab}
          onSave={onUpdateSettings}
          onBktConfigSaved={onRefreshChannels}
        />
      )}

      {showSeoDialog && (
        <CompetitorSeoDialog
          isOpen={showSeoDialog}
          onClose={() => setShowSeoDialog(false)}
          channel={channel}
          profiles={profiles}
        />
      )}
    </div>
  );
}
