import { AlertCircle, FileVideo, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { dispatchBatchBktTest, getBktTestChannels } from '@/contexts/channels/channels-client';
import type { BktBatchItemRequest, BktTestChannel } from '@/lib/types';
import { cn } from '@/lib/utils';

interface BatchBktTestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BktBatchItemRequest[];
  onSuccess?: () => void;
}

export function BatchBktTestModal({
  open,
  onOpenChange,
  items,
  onSuccess,
}: BatchBktTestModalProps) {
  const toast = useToast();
  const [channels, setChannels] = useState<BktTestChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState<boolean>(true);
  const [targetChannelId, setTargetChannelId] = useState<string>('auto'); // 'auto' | channelId
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setLoadingChannels(true);
      getBktTestChannels()
        .then((data) => {
          setChannels(data);
          setLoadingChannels(false);
        })
        .catch((err) => {
          console.error(err);
          setLoadingChannels(false);
        });
    }
  }, [open]);

  const activeChannels = channels.filter((c) => c.isActive);
  const totalAvailableQuota = activeChannels.reduce((acc, c) => acc + c.remainingQuota, 0);

  const handleDispatch = async () => {
    if (items.length === 0) {
      toast.warning({
        title: 'Chưa có video',
        description: 'Vui lòng chọn ít nhất 1 video để test.',
      });
      return;
    }

    if (activeChannels.length === 0) {
      toast.error({
        title: 'Chưa có Kênh Test Bản Quyền',
        description:
          'Vui lòng vào tab Kênh Test Bản Quyền để thêm ít nhất 1 kênh test trước khi chạy.',
      });
      return;
    }

    setIsDispatching(true);
    try {
      const res = await dispatchBatchBktTest({
        items,
        targetTestChannelId: targetChannelId === 'auto' ? undefined : targetChannelId,
      });

      if (res.success) {
        toast.success({
          title: 'Đã gửi video sang Kênh Test Bản Quyền',
          description: `Đã phân bổ thành công ${res.totalDispatched}/${res.totalRequested} video vào hàng đợi test ngầm (Unlisted).`,
        });
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error({
          title: 'Lỗi phân bổ video',
          description: res.error || 'Không thể điều phối video vào kênh test.',
        });
      }
    } catch (err) {
      toast.error({
        title: 'Lỗi gửi test bản quyền',
        description: String(err),
      });
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Kiểm Tra Bản Quyền Trên Kênh Test (BKT)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Hệ thống sẽ chạy Reup Pipeline Lv.1 và tải video lên kênh test ở chế độ Không công khai
            (Unlisted) để kiểm tra Content ID từ YouTube Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Selected Videos Summary */}
          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-foreground flex items-center gap-1.5">
                <FileVideo className="w-3.5 h-3.5 text-primary" />
                Số video đã chọn để test:
              </span>
              <Badge variant="outline" className="font-mono text-primary border-primary/30">
                {items.length} video
              </Badge>
            </div>

            <div className="max-h-24 overflow-y-auto divide-y divide-border/20 text-[11px] text-muted-foreground pt-1">
              {items.map((it, idx) => (
                <div key={idx} className="py-1 truncate">
                  {idx + 1}. {it.videoTitle}
                </div>
              ))}
            </div>
          </div>

          {/* Allocation Mode / Channel Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center justify-between">
              <span>Phương thức phân bổ kênh test:</span>
              <span className="text-[11px] text-muted-foreground">
                Tổng slot khả dụng hôm nay: {totalAvailableQuota}
              </span>
            </Label>

            {loadingChannels ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Đang tải danh sách kênh test...
              </div>
            ) : (
              <Select value={targetChannelId} onValueChange={setTargetChannelId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Chọn phương thức phân bổ..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs font-medium text-primary">
                    ⚡ Tự động phân bổ thông minh (Load Balancing theo Quota)
                  </SelectItem>
                  {activeChannels.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      disabled={c.remainingQuota <= 0}
                      className="text-xs"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{c.name}</span>
                        <span
                          className={cn(
                            'text-[10px] font-mono',
                            c.remainingQuota <= 0 ? 'text-rose-400' : 'text-emerald-400',
                          )}
                        >
                          (Còn {c.remainingQuota}/{c.dailyQuota} lượt)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <p className="text-[10px] text-muted-foreground">
              Mỗi kênh test bị giới hạn 15 video/ngày. Chế độ Tự động sẽ tự động chia đều các video
              vào những kênh còn lượt test hôm nay.
            </p>
          </div>

          {/* Quota Warning if exceeded */}
          {items.length > totalAvailableQuota && (
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Cảnh báo vượt hạn ngạch: </span>
                Bạn đã chọn {items.length} video nhưng toàn bộ kênh test chỉ còn{' '}
                {totalAvailableQuota} lượt khả dụng hôm nay. Vui lòng thêm kênh test mới hoặc giảm
                bớt số video.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDispatching}
            className="h-8 text-xs"
          >
            Hủy
          </Button>

          <Button
            size="sm"
            onClick={handleDispatch}
            disabled={isDispatching || items.length === 0 || activeChannels.length === 0}
            className="h-8 text-xs gap-1.5 bg-primary"
          >
            {isDispatching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Bắt Đầu Test Bản Quyền ({items.length} video)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
