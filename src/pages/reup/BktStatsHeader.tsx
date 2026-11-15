import { Calendar, Flame, Layers, Plus, RefreshCw, RotateCcw, ShieldCheck, Tv } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BktDailyReportModal } from './BktDailyReportModal';
import type { BktChannelsManager } from './types';

interface BktStatsHeaderProps {
  manager: BktChannelsManager;
}

export function BktStatsHeader({ manager }: BktStatsHeaderProps) {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const {
    channels,
    totalSlots,
    totalUsed,
    totalRemaining,
    loading,
    handleResetQuota,
    loadData,
    handleOpenAdd,
  } = manager;

  return (
    <div className="space-y-4">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20 border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Tổng Kênh Test</span>
            <Tv className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">{channels.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {channels.filter((c) => c.isActive).length} kênh đang hoạt động
          </p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Tổng Quota Hôm Nay</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-sky-400">{totalSlots}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Mặc định 15 video/kênh/ngày</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Đã Test Hôm Nay</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-amber-400">{totalUsed}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Reset về 0 lúc 00:00 hằng ngày</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Lượt Khả Dụng Còn Lại</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-400">{totalRemaining}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sẵn sàng nhận thêm video</p>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tv className="w-4 h-4 text-primary" />
            <span>Danh Sách Kênh Test Bản Quyền</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Mỗi kênh được gán 1 Profile trình duyệt độc lập để tự động đăng video không công khai
            (Unlisted) và kiểm tra hạn chế Content ID.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportModalOpen(true)}
            className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
            title="Xem báo cáo chi tiết về tiến trình cào, tải, reup và xuất bản hôm nay"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Báo Cáo Hôm Nay</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetQuota}
            disabled={loading}
            className="h-8 text-xs gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            title="Khôi phục lại toàn bộ quota hôm nay về 0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Làm mới Quota</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>Làm mới</span>
          </Button>

          <Button size="sm" onClick={handleOpenAdd} className="h-8 text-xs gap-1.5 bg-primary">
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Kênh Test</span>
          </Button>
        </div>
      </div>

      <BktDailyReportModal open={reportModalOpen} onOpenChange={setReportModalOpen} />
    </div>
  );
}
