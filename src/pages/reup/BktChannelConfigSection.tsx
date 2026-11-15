import {
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Tv,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BktChannelsManager } from './types';

interface BktChannelConfigSectionProps {
  manager: BktChannelsManager;
}

export function BktChannelConfigSection({ manager }: BktChannelConfigSectionProps) {
  const {
    channels,
    profiles,
    isDialogOpen,
    setIsDialogOpen,
    editingChannel,
    formName,
    setFormName,
    formQuota,
    setFormQuota,
    formIsActive,
    setFormIsActive,
    formPriority,
    setFormPriority,
    formNote,
    setFormNote,
    saving,
    handleOpenAdd,
    handleOpenEdit,
    handleSave,
    handleDelete,
    handleLaunchProfile,
  } = manager;

  return (
    <div className="space-y-4">
      {/* Channels List Cards */}
      {channels.length === 0 ? (
        <Card className="p-8 text-center bg-card/40 border-dashed border-border/60">
          <Tv className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-foreground">Chưa có Kênh Test Bản Quyền nào</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Bấm nút bên dưới để tạo kênh test đầu tiên. Mỗi kênh test sẽ sở hữu hồ sơ Chromium riêng
            biệt để kiểm tra bản quyền ngầm mà không làm ảnh hưởng Kênh Đích.
          </p>
          <Button size="sm" onClick={handleOpenAdd} className="h-8 text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Kênh Test Đầu Tiên</span>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => {
            const prof = profiles.find((p) => p.id === ch.profileId);
            const percent = Math.min(100, Math.round((ch.dailyUsed / ch.dailyQuota) * 100));
            const isFull = ch.remainingQuota <= 0;

            return (
              <Card
                key={ch.id}
                className={cn(
                  'p-4 bg-card/40 border transition-all relative overflow-hidden flex flex-col justify-between gap-3',
                  !ch.isActive && 'opacity-60 border-border/40',
                  !prof && 'border-amber-500/40 bg-amber-500/[0.02]',
                  isFull && ch.isActive && 'border-rose-500/30',
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{ch.name}</span>
                        {ch.isActive ? (
                          prof ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0"
                            >
                              Hoạt động
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] px-1.5 py-0"
                            >
                              Thiếu Hồ Sơ Chromium
                            </Badge>
                          )
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0"
                          >
                            Tạm dừng
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px] px-1.5 py-0"
                        >
                          Hồ Sơ Độc Lập
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-primary/70" />
                        <span>
                          Hồ sơ Chromium:{' '}
                          {prof ? (
                            <strong className="text-foreground">{prof.profile_name}</strong>
                          ) : (
                            <strong className="text-rose-400">
                              Chưa gắn hồ sơ hợp lệ (ID: {ch.profileId || 'Trống'})
                            </strong>
                          )}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleLaunchProfile(ch.profileId)}
                        title="Mở Trình Duyệt Đăng Nhập Kênh Test (YouTube Studio)"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(ch)}
                        title="Chỉnh sửa kênh test"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(ch)}
                        title="Xóa kênh test"
                        className="h-7 w-7 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Hạn ngạch hôm nay:</span>
                      <span
                        className={cn(
                          'font-mono font-medium',
                          isFull
                            ? 'text-rose-400'
                            : ch.remainingQuota <= 3
                              ? 'text-amber-400'
                              : 'text-emerald-400',
                        )}
                      >
                        {ch.dailyUsed} / {ch.dailyQuota} video
                      </span>
                    </div>

                    <Progress
                      value={percent}
                      className={cn(
                        'h-2 bg-muted/40',
                        isFull && '[&>div]:bg-rose-500',
                        !isFull && ch.remainingQuota <= 3 && '[&>div]:bg-amber-500',
                        !isFull && ch.remainingQuota > 3 && '[&>div]:bg-emerald-500',
                      )}
                    />

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span>
                        {isFull ? (
                          <span className="text-rose-400 font-medium">Đã hết quota hôm nay</span>
                        ) : (
                          <span>Còn {ch.remainingQuota} lượt test</span>
                        )}
                      </span>
                      <span>Ưu tiên: Lv.{ch.priority}</span>
                    </div>
                  </div>
                </div>

                {ch.note && (
                  <p className="text-[11px] text-muted-foreground/80 italic border-t border-border/20 pt-1.5 line-clamp-1">
                    Ghi chú: {ch.note}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Add/Edit Channel */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? 'Chỉnh Sửa Kênh Test Bản Quyền' : 'Thêm Kênh Test Bản Quyền Mới'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mỗi kênh test sở hữu một Hồ sơ Chromium độc lập để mượn slot Unlisted kiểm tra bản
              quyền.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Tên Kênh Test (Gợi nhớ):</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ví dụ: Kênh Test US 01, Kênh Test Phim..."
                className="h-8 text-xs"
              />
            </div>

            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs space-y-1">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Hồ Sơ Chromium Độc Lập Cho Kênh Test</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Kênh Test Bản Quyền hoạt động độc lập 100% với Hồ Sơ Kênh Đích. Hệ thống tự động
                quản lý phiên Chromium riêng cho kênh test này để mượn slot Unlisted kiểm tra bản
                quyền ngầm, tuyệt đối không ảnh hưởng đến Kênh Chính.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Hạn ngạch video/ngày:</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formQuota}
                  onChange={(e) => setFormQuota(Number(e.target.value))}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Mặc định YouTube là 15 video/ngày.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Độ ưu tiên phân bổ:</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formPriority}
                  onChange={(e) => setFormPriority(Number(e.target.value))}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Số càng cao càng ưu tiên nhận video trước.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Trạng thái hoạt động</Label>
                <p className="text-[10px] text-muted-foreground">
                  Bật để kênh sẵn sàng nhận video test bản quyền tự động
                </p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Ghi chú (Tuỳ chọn):</Label>
              <Textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Ghi chú về proxy, thời điểm tạo kênh..."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
              className="h-8 text-xs"
            >
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-xs gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingChannel ? 'Cập Nhật Kênh Test' : 'Thêm Kênh Test'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
