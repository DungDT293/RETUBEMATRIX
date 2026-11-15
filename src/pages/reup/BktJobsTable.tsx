import {
  Layers,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BktChannelsManager } from './types';

interface BktJobsTableProps {
  manager: BktChannelsManager;
}

export function BktJobsTable({ manager }: BktJobsTableProps) {
  const {
    jobs,
    activeJobsCount,
    cancellingAll,
    cancellingJobId,
    publishingJobId,
    handleCancelAllJobs,
    handleCancelJob,
    handlePublishToMain,
    handleRecheckJob,
  } = manager;

  return (
    <div className="space-y-3 pt-4 border-t border-border/40">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span>Lịch Sử Tiến Trình Test Bản Quyền Gần Nhất</span>
        </h3>
        <div className="flex items-center gap-2">
          {activeJobsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancellingAll}
              onClick={handleCancelAllJobs}
              className="h-7 text-[11px] gap-1 text-destructive border-destructive/40 bg-destructive/10 hover:bg-destructive hover:text-white"
            >
              {cancellingAll ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Square className="w-3 h-3 fill-current" />
              )}
              <span>Dừng tất cả ({activeJobsCount})</span>
            </Button>
          )}
          <Badge variant="outline" className="text-xs">
            {jobs.length} tác vụ
          </Badge>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          Chưa có tác vụ test bản quyền nào. Bạn có thể chọn video từ Kênh theo dõi hoặc Thư viện để
          tiến hành kiểm tra.
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 overflow-hidden bg-card/20">
          <div className="max-h-[300px] overflow-y-auto divide-y divide-border/20">
            {jobs.map((job) => {
              let statusBadge = (
                <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                  Chờ xử lý
                </Badge>
              );

              if (job.status === 'reuping') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse gap-1"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Reup Lv.1</span>
                  </Badge>
                );
              } else if (job.status === 'uploading') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse gap-1"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Đang tải lên Studio</span>
                  </Badge>
                );
              } else if (job.status === 'checking') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-indigo-500/15 text-indigo-400 border-indigo-500/30 animate-pulse gap-1"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Đang chờ YouTube Check</span>
                  </Badge>
                );
              } else if (job.status === 'green_clean') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 font-medium"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Sạch Bản Quyền</span>
                  </Badge>
                );
              } else if (job.status === 'red_matched') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1 font-medium"
                  >
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>Dính Bản Quyền Content ID</span>
                  </Badge>
                );
              } else if (job.status === 'publish_failed') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="bg-rose-500/15 text-rose-400 border-rose-500/30"
                  >
                    Đăng thất bại
                  </Badge>
                );
              } else if (job.status === 'published') {
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  >
                    Đã đăng
                  </Badge>
                );
              } else if (job.status === 'failed') {
                const failureReason = job.errorMessage || job.restriction || 'Lỗi không xác định';
                statusBadge = (
                  <Badge
                    variant="outline"
                    className="text-xs bg-rose-500/10 text-rose-400 border-rose-500/20 gap-1 cursor-help"
                    title={failureReason}
                  >
                    <XCircle className="w-3 h-3 text-rose-400" />
                    <span>Lỗi</span>
                  </Badge>
                );
              }

              return (
                <div
                  key={job.id}
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/10 transition-colors gap-3"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{job.videoTitle}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>Kênh: {job.testChannelName || job.testChannelId}</span>
                      {job.youtubeVideoId && (
                        <span className="font-mono text-primary">
                          YouTube ID: {job.youtubeVideoId}
                        </span>
                      )}
                      <span>{new Date(job.createdAt).toLocaleTimeString('vi-VN')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {job.status === 'failed' ? (
                      <span
                        className="text-[11px] text-rose-400 font-medium max-w-[280px] truncate cursor-help"
                        title={job.errorMessage || job.restriction || 'Lỗi không xác định'}
                      >
                        {job.errorMessage || job.restriction || 'Lỗi không xác định'}
                      </span>
                    ) : (
                      job.restriction && (
                        <span
                          className="text-[11px] text-muted-foreground max-w-[200px] truncate"
                          title={job.restriction}
                        >
                          {job.restriction}
                        </span>
                      )
                    )}
                    {statusBadge}
                    {['queued', 'reuping', 'uploading', 'checking', 'pending'].includes(
                      job.status,
                    ) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cancellingJobId === job.id}
                        onClick={() => handleCancelJob(job.id)}
                        className="h-7 text-[11px] gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border border-destructive/30"
                        title="Hủy tác vụ kiểm tra bản quyền này"
                      >
                        {cancellingJobId === job.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Square className="w-3 h-3 fill-current" />
                        )}
                        <span>Dừng</span>
                      </Button>
                    )}
                    {(job.status === 'green_clean' || job.status === 'publish_failed') &&
                      job.mainTargetProfileId && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={publishingJobId === job.id}
                          onClick={() => handlePublishToMain(job.id)}
                          className="h-7 text-[11px] gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                          title={
                            job.status === 'publish_failed'
                              ? 'Tiếp tục đăng artifact đã kiểm tra'
                              : 'Đăng video công khai sang Kênh Đích'
                          }
                        >
                          {publishingJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          <span>
                            {job.status === 'publish_failed' ? 'Tiếp tục đăng' : 'Đăng Kênh Đích'}
                          </span>
                        </Button>
                      )}
                    {job.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRecheckJob(job.id)}
                        className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                        title="Thử lại tác vụ kiểm tra bản quyền"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Thử lại</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
