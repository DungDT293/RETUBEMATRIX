import {
  Calendar,
  Clock,
  Download,
  FileVideo,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDailyReportStats } from '@/contexts/channels/channels-client';
import type { DailyReportStats } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

interface BktDailyReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BktDailyReportModal({ open, onOpenChange }: BktDailyReportModalProps) {
  const [stats, setStats] = useState<DailyReportStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [timelineCategory, setTimelineCategory] = useState<
    'all' | 'publish' | 'reup' | 'bkt_test' | 'download' | 'discovery'
  >('all');

  const loadReport = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const data = await getDailyReportStats('today');
      setStats(data);
    } catch (err) {
      console.warn('Lỗi getDailyReportStats:', err);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      loadReport();
    }
  }, [open, loadReport]);

  const filteredEvents = useMemo(() => {
    const events = stats?.timelineEvents || [];
    if (timelineCategory === 'all') return events;
    if (timelineCategory === 'publish') {
      return events.filter(
        (e) =>
          e.eventType === 'upload_main' ||
          e.eventType === 'publish_scheduled' ||
          (e.eventType === 'bkt_test' && ['publishing', 'published'].includes(e.status)),
      );
    }
    if (timelineCategory === 'reup') {
      return events.filter((e) => e.eventType === 'reup');
    }
    if (timelineCategory === 'bkt_test') {
      return events.filter((e) => e.eventType === 'bkt_test');
    }
    if (timelineCategory === 'download') {
      return events.filter((e) => e.eventType === 'download');
    }
    if (timelineCategory === 'discovery') {
      return events.filter((e) => e.eventType === 'discovery');
    }
    return events;
  }, [stats, timelineCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
          <div>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Báo Cáo Hoạt Động &amp; Thống Kê BKT Hôm Nay</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Tổng hợp tiến trình cào, tải về, xử lý Reup, kiểm tra bản quyền và xuất bản kênh đích
              ({stats?.targetDate || 'Hôm nay'})
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadReport}
            disabled={loading}
            className="h-8 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>Làm mới</span>
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pt-3 pr-1">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 bg-card/60 border-border/50 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Video Đã Cào</span>
                <Tv className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground">
                {stats?.totalDiscoveredToday ?? 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">video</span>
              </div>
            </Card>

            <Card className="p-3 bg-card/60 border-border/50 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Video Tải Về</span>
                <Download className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-blue-400">
                {stats?.totalDownloadedToday ?? 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">video</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {formatBytes(stats?.totalDownloadSizeBytes ?? 0)}
              </div>
            </Card>

            <Card className="p-3 bg-card/60 border-border/50 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Test Bản Quyền</span>
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-400">
                {stats?.totalBktTestedToday ?? 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">lần</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                <span className="text-emerald-400 font-medium">
                  Sạch: {stats?.bktCleanCount ?? 0}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-rose-400 font-medium">
                  Dính: {stats?.bktClaimedCount ?? 0}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-sky-400 font-medium">Chờ: {stats?.bktPendingCount ?? 0}</span>
              </div>
            </Card>

            <Card className="p-3 bg-card/60 border-border/50 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Xuất Bản Kênh Đích</span>
                <Rocket className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400">
                {stats?.totalPublishedMainToday ?? 0}{' '}
                <span className="text-xs font-normal text-muted-foreground">video</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Reup: {stats?.totalReupToday ?? 0} video
              </div>
            </Card>
          </div>

          {/* Quota bar */}
          <Card className="p-3.5 bg-muted/20 border-border/40 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Hạn Ngạch Kênh Test Bản Quyền Hôm Nay
              </span>
              <span className="font-mono text-muted-foreground text-[11px]">
                Đã dùng {stats?.testQuotaUsed ?? 0} / {stats?.testQuotaTotal ?? 0} slot (Còn lại:{' '}
                <strong className="text-emerald-400">{stats?.testQuotaRemaining ?? 0}</strong>)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    stats?.testQuotaTotal
                      ? Math.min(
                          100,
                          Math.round(((stats.testQuotaUsed || 0) / stats.testQuotaTotal) * 100),
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </Card>

          {/* Timeline Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Nhật Ký Dòng Thời Gian</span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimelineCategory('all')}
                  className={cn(
                    'h-6 px-2 text-[10px]',
                    timelineCategory === 'all'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Tất cả ({stats?.timelineEvents?.length ?? 0})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimelineCategory('publish')}
                  className={cn(
                    'h-6 px-2 text-[10px]',
                    timelineCategory === 'publish'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Xuất bản ({stats?.totalPublishedMainToday ?? 0})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimelineCategory('bkt_test')}
                  className={cn(
                    'h-6 px-2 text-[10px]',
                    timelineCategory === 'bkt_test'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Test BKT ({stats?.totalBktTestedToday ?? 0})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimelineCategory('reup')}
                  className={cn(
                    'h-6 px-2 text-[10px]',
                    timelineCategory === 'reup'
                      ? 'bg-purple-600 text-white font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Reup ({stats?.totalReupToday ?? 0})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimelineCategory('download')}
                  className={cn(
                    'h-6 px-2 text-[10px]',
                    timelineCategory === 'download'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Tải về ({stats?.totalDownloadedToday ?? 0})
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Đang tải số liệu báo cáo...</span>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border/40 rounded-lg">
                Không có sự kiện nào trong danh mục này hôm nay.
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 overflow-hidden divide-y divide-border/20 bg-card/20 max-h-[320px] overflow-y-auto">
                {filteredEvents.map((evt, idx) => (
                  <div
                    key={`${evt.id || idx}-${evt.timestamp}`}
                    className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/10 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded bg-muted/40 flex items-center justify-center flex-shrink-0 text-muted-foreground">
                        {evt.eventType === 'upload_main' ? (
                          <Rocket className="w-3 h-3 text-emerald-400" />
                        ) : evt.eventType === 'bkt_test' ? (
                          <ShieldCheck className="w-3 h-3 text-amber-400" />
                        ) : evt.eventType === 'reup' ? (
                          <Layers className="w-3 h-3 text-purple-400" />
                        ) : evt.eventType === 'download' ? (
                          <Download className="w-3 h-3 text-blue-400" />
                        ) : (
                          <FileVideo className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{evt.title}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                          {evt.channelName && <span>{evt.channelName}</span>}
                          {evt.details && <span className="truncate">{evt.details}</span>}
                          <span>{evt.timestamp}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] py-0',
                          evt.status === 'published' || evt.status === 'green_clean'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : evt.status === 'red_matched' || evt.status === 'failed'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-muted/40 text-muted-foreground border-border/40',
                        )}
                      >
                        {evt.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
