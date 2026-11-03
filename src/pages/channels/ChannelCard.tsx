import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Tv,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { detectPlatform } from '@/contexts/channels/useChannelsController';
import type { ChannelStats, FollowedChannel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelSettingsDialog } from './ChannelSettingsDialog';
import { formatPostingScheduleVietnamese } from './channelUtils';
import { PlatformTag } from './PlatformTag';

interface ChannelCardProps {
  channel: FollowedChannel;
  stats?: ChannelStats | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCheckNow: () => void;
  isChecking: boolean;
  onUnfollow: () => void;
  onToggleAutoDownload: (enabled: boolean) => void;
  onUpdateSettings?: (
    settings: Parameters<React.ComponentProps<typeof ChannelSettingsDialog>['onSave']>[0],
  ) => Promise<void>;
}

export function ChannelCard({
  channel,
  stats,
  isExpanded,
  onToggleExpand,
  onCheckNow,
  isChecking,
  onUnfollow,
  onToggleAutoDownload,
  onUpdateSettings,
}: ChannelCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const platform = detectPlatform(channel.url);
  const totalVideos = stats?.total_videos ?? channel.total_videos;
  const totalScanned = stats?.total_scanned ?? 0;
  const totalDownloaded = stats?.total_downloaded ?? 0;
  const postingSchedule = formatPostingScheduleVietnamese(stats?.posting_schedule?.formatted);

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
                <Tv className="w-6 h-6 text-primary" />
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
                {Boolean(channel.bkt_test_mode) && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] py-0 cursor-help"
                    title="Chế độ Test BKT đang BẬT: Video dính rủi ro sẽ được gửi sang kênh BKT để kiểm tra ngầm"
                  >
                    Test BKT bật
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

        {/* Bottom Bar: Auto download switch & settings */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={channel.auto_download}
                onCheckedChange={onToggleAutoDownload}
                id={`auto-dl-${channel.id}`}
              />
              <label
                htmlFor={`auto-dl-${channel.id}`}
                className="font-medium text-foreground cursor-pointer select-none"
              >
                Tự động tải video mới
              </label>
            </div>
            {channel.auto_download && (
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 text-[11px] py-0"
              >
                Mỗi {channel.check_interval} phút
              </Badge>
            )}

            {onUpdateSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
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
          onSave={onUpdateSettings}
        />
      )}
    </div>
  );
}
