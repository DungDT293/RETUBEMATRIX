import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  Film,
  Flame,
  FlaskConical,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { canContinueBktPublish, canRetryBktTest } from '@/contexts/channels/channel-flow-safety';
import type { BktTestJob, ChannelVideo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDuration, formatUploadDateTime } from '@/pages/channels/channelUtils';

function formatCompactViews(count?: number): string | null {
  if (count == null) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M xem`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K xem`;
  return `${count} xem`;
}

interface ChannelVideoRowProps {
  video: ChannelVideo;
  isSelected: boolean;
  onToggleSelect: (videoId: string) => void;
  linkedJob?: BktTestJob;
  activePhase?: string;
  isTestingThisVideo: boolean;
  isJobActionBusy: boolean;
  onTriggerBktTest: (videoId: string, dbId?: string, channelId?: string) => void;
  onBktJobAction: (job: BktTestJob, action: 'retry' | 'publish') => void;
  onDirectEditAndPublish: (video: ChannelVideo) => void;
}

export const ChannelVideoRow = React.memo(function ChannelVideoRow({
  video,
  isSelected,
  onToggleSelect,
  linkedJob,
  activePhase,
  isTestingThisVideo,
  isJobActionBusy,
  onTriggerBktTest,
  onBktJobAction,
  onDirectEditAndPublish,
}: ChannelVideoRowProps) {
  const isDownloaded = video.status === 'downloaded';
  const viewsStr = formatCompactViews(video.view_count);

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 transition-colors hover:bg-muted/40',
        isSelected && 'bg-primary/5',
      )}
    >
      {/* Select Checkbox */}
      <button
        type="button"
        onClick={() => onToggleSelect(video.video_id)}
        className="p-1 text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4 text-primary" />
        ) : (
          <Square className="w-4 h-4" />
        )}
      </button>

      {/* Thumbnail & duration */}
      <div className="relative w-24 sm:w-28 h-14 sm:h-16 rounded overflow-hidden bg-muted flex-shrink-0">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Film className="w-5 h-5" />
          </div>
        )}
        {video.duration ? (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded font-mono">
            {formatDuration(video.duration)}
          </span>
        ) : null}
      </div>

      {/* Video Info */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="text-xs sm:text-sm font-medium leading-snug line-clamp-2 text-foreground"
            title={video.title}
          >
            {video.title}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
          {/* KHÂU 1: Risk Status Badge (Kênh nguồn: An toàn / Đỏ rủi ro) */}
          {video.risk_status === 'red' ? (
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
              title={video.risk_reason || 'Rủi ro bản quyền cao hoặc trùng lặp lịch sử'}
            >
              <ShieldAlert className="w-3 h-3 text-red-400" />
              <span>Kênh nguồn: Rủi ro / Chặn</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
              title={video.risk_reason || 'Kênh ngách an toàn / Chưa phát hiện tiền sử gậy'}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Kênh nguồn: An toàn</span>
            </Badge>
          )}

          {/* KHÂU 3: Pipeline Reup Level (Chỉ hiển thị khi đã tải về máy và xử lý) */}
          {isDownloaded && video.reup_pipeline_level === 1 && (
            <Badge
              variant="outline"
              className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
              title="Đã qua Reup Pipeline Lv.1 (95% gốc - 5% lách nhẹ, đổi Hash MD5/SHA256)"
            >
              <Wand2 className="w-3 h-3 text-blue-400" />
              <span>Pipeline Lv.1 (5%)</span>
            </Badge>
          )}
          {isDownloaded && video.reup_pipeline_level === 2 && (
            <Badge
              variant="outline"
              className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
              title="Đã qua Reup Pipeline Lv.2 (Lách sâu Deep Evasion)"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Pipeline Lv.2 (Deep)</span>
            </Badge>
          )}

          {/* KHÂU 4: BKT Shadow Check Status */}
          {(Boolean(video.is_bkt_test) || video.bkt_check_status) && (
            <>
              {video.bkt_check_status === 'green_clean' && (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>BKT: Sạch Bản Quyền</span>
                </Badge>
              )}
              {video.bkt_check_status === 'red_matched' && (
                <Badge
                  variant="outline"
                  className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                  title={
                    video.bkt_restriction || video.risk_reason || 'YouTube phát hiện bản quyền'
                  }
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>
                    BKT: Dính ({video.bkt_restriction || video.risk_reason || 'Bản quyền'}) -&gt;
                    Lv.2
                  </span>
                </Badge>
              )}
              {video.bkt_check_status === 'failed' && (
                <Badge
                  variant="outline"
                  className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                  title={video.bkt_restriction || video.risk_reason || 'Tiến trình BKT gặp lỗi'}
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  <span>
                    BKT: Lỗi ({video.bkt_restriction || video.risk_reason || 'Kiểm tra thất bại'})
                  </span>
                </Badge>
              )}
              {video.bkt_check_status === 'publish_failed' && (
                <Badge
                  variant="outline"
                  className="bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                  title={video.bkt_restriction || 'BKT sạch; bước đăng Kênh Đích thất bại'}
                >
                  <AlertCircle className="w-3 h-3 text-orange-400" />
                  <span>BKT: Sạch, đăng lỗi</span>
                </Badge>
              )}
              {(!video.bkt_check_status || video.bkt_check_status === 'pending') &&
                (() => {
                  const isBusy = Boolean(activePhase);
                  const liveLabel =
                    video.bkt_restriction || video.risk_reason || 'BKT: Chờ YouTube Check';
                  const badgeTone =
                    activePhase === 'uploading'
                      ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
                  return (
                    <div className="inline-flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          badgeTone,
                          'border text-[10px] px-1.5 py-0 flex items-center gap-1 max-w-[260px]',
                          isBusy && 'animate-pulse',
                        )}
                        title={liveLabel}
                      >
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        <span className="truncate">
                          {liveLabel.startsWith('BKT:') ? liveLabel : `BKT: ${liveLabel}`}
                        </span>
                      </Badge>
                    </div>
                  );
                })()}
            </>
          )}

          {(() => {
            const uploadTimeStr = formatUploadDateTime(
              video.upload_date,
              video.upload_timestamp,
              video.created_at,
            );
            if (!uploadTimeStr) return null;
            return (
              <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/60 px-2 py-0.5 rounded font-mono text-[10px] border border-border/40">
                <Calendar className="w-3 h-3 text-primary/80" />
                <span>{uploadTimeStr}</span>
              </span>
            );
          })()}

          {viewsStr && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium text-[10px] border border-amber-500/20">
              <Flame className="w-3 h-3" />
              <span>{viewsStr}</span>
            </span>
          )}

          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary transition-colors inline-flex items-center gap-0.5 text-[10px]"
          >
            <span>Xem link</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* Status Badge & Action */}
      <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
        {(() => {
          if (!linkedJob) return null;
          const jobStatus = linkedJob.status;
          return (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-sky-500/30 text-sky-400"
                title={`Job test: ${linkedJob.id}`}
              >
                Test: {linkedJob.testChannelName || linkedJob.testChannelId}
              </Badge>
              {jobStatus === 'publishing' && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-blue-500/40 text-blue-400 animate-pulse"
                  title={linkedJob.restriction || 'Đang đăng lên Kênh Đích'}
                >
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Đang đăng Kênh Đích
                </Badge>
              )}
              {jobStatus === 'published' && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-400"
                  title={linkedJob.restriction || 'Đã đăng thành công lên Kênh Đích'}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Đã đăng Kênh Đích
                </Badge>
              )}
              {jobStatus === 'green_clean' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBktJobAction(linkedJob, 'publish')}
                  disabled={isJobActionBusy}
                  className="h-7 px-2 text-[11px] gap-1 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 font-medium"
                  title="Video đã sạch bản quyền; đăng ngay lên Kênh Đích"
                >
                  {isJobActionBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Radio className="w-3 h-3" />
                  )}
                  <span>Đăng ngay</span>
                </Button>
              )}
              {canContinueBktPublish(jobStatus) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBktJobAction(linkedJob, 'publish')}
                  disabled={isJobActionBusy}
                  className="h-7 px-2 text-[11px] gap-1 border-orange-500/40 text-orange-500 hover:bg-orange-500/10 font-medium"
                  title="Giữ video đã tải về; chỉ chạy lại bước đăng bị lỗi"
                >
                  {isJobActionBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>Tiếp tục đăng</span>
                </Button>
              )}
              {jobStatus === 'failed' && canRetryBktTest(jobStatus) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBktJobAction(linkedJob, 'retry')}
                  disabled={isJobActionBusy}
                  className="h-7 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-medium"
                  title="Mở đúng kênh test và kiểm tra lại upload/Content ID"
                >
                  {isJobActionBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>Kiểm tra lại</span>
                </Button>
              )}
            </div>
          );
        })()}

        {/* Nút bấm Test trên kênh BKT */}
        {(() => {
          const flowStatus = video.bkt_check_status as string | undefined;
          return (
            (video.risk_status === 'red' || isDownloaded) &&
            flowStatus !== 'green_clean' &&
            flowStatus !== 'pending' &&
            flowStatus !== 'publish_failed' &&
            flowStatus !== 'publishing' &&
            flowStatus !== 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTriggerBktTest(video.video_id, video.id, video.channel_id)}
                disabled={isTestingThisVideo}
                className="h-7 px-2 text-[11px] gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
                title="Tải về (nếu chưa có), chạy Reup Pipeline Lv.1 và tải lên kênh BKT để test nhận diện"
              >
                <FlaskConical
                  className={cn('w-3 h-3 text-amber-500', isTestingThisVideo && 'animate-spin')}
                />
                <span>Test BKT</span>
              </Button>
            )
          );
        })()}

        {(() => {
          const isPublished = linkedJob?.status === 'published';
          const isPublishing = linkedJob?.status === 'publishing';
          const hasCleanJob = linkedJob?.status === 'green_clean';
          const canContinue = linkedJob && canContinueBktPublish(linkedJob.status);

          if (!isDownloaded || isPublished || isPublishing || hasCleanJob || canContinue)
            return null;

          const hasEditedArtifact = Boolean(linkedJob?.reupPath);
          const buttonLabel = hasEditedArtifact ? 'Đăng ngay (Đã Edit)' : 'Chỉnh sửa & Đăng ngay';
          const buttonTitle = hasEditedArtifact
            ? 'Video đã có bản edit trong [DA_EDIT], đăng thẳng lên Kênh Đích mà không cần render lại'
            : 'Chỉnh sửa (Reup) & Đăng ngay lên Kênh Đích';

          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDirectEditAndPublish(video)}
              disabled={isTestingThisVideo}
              className={cn(
                'h-7 px-2 text-[11px] gap-1 font-medium',
                hasEditedArtifact
                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                  : 'border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10',
              )}
              title={buttonTitle}
            >
              {isTestingThisVideo ? (
                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              ) : hasEditedArtifact ? (
                <Radio className="w-3 h-3 text-emerald-500" />
              ) : (
                <Send className="w-3 h-3 text-purple-500" />
              )}
              <span>{buttonLabel}</span>
            </Button>
          );
        })()}

        {isDownloaded ? (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs"
          >
            Đã tải về
          </Badge>
        ) : video.status === 'skipped' ? (
          <Badge variant="outline" className="text-xs text-muted-foreground/70 border-dashed">
            Đã bỏ qua
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs text-muted-foreground">
            Chưa tải
          </Badge>
        )}
      </div>
    </div>
  );
});
