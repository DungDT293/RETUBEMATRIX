import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Tv,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { useToast } from '@/components/ui/toast';
import {
  cancelAllBktJobs,
  cancelBktJob,
  deleteBktTestChannel,
  getBktTestChannels,
  getBktTestJobs,
  getMultibrowserProfiles,
  publishBktJobToMain,
  recheckBktJob,
  saveBktTestChannel,
} from '@/contexts/channels/channels-client';
import type {
  BktTestChannel,
  BktTestChannelInput,
  BktTestJob,
  MultiBrowserProfile,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { workTelemetryService } from '@/services/workTelemetryService';

export function BktChannelManagerTab() {
  const toast = useToast();
  const [channels, setChannels] = useState<BktTestChannel[]>([]);
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const [jobs, setJobs] = useState<BktTestJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [editingChannel, setEditingChannel] = useState<BktTestChannel | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formQuota, setFormQuota] = useState<number>(15);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formPriority, setFormPriority] = useState<number>(1);
  const [formNote, setFormNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [chData, profData, jobData] = await Promise.all([
        getBktTestChannels(),
        getMultibrowserProfiles(),
        getBktTestJobs(50),
      ]);
      setChannels(chData);
      setProfiles(profData);
      setJobs(jobData);
    } catch (err) {
      console.error('Failed to load BKT channels:', err);
      toast.error({
        title: 'Lỗi tải danh sách kênh test',
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResetQuota = async () => {
    try {
      setLoading(true);
      await invoke('reset_bkt_channel_daily_quota', { channelId: null });
      toast.success({
        title: 'Đã làm mới hạn ngạch',
        description: 'Đã hoàn trả toàn bộ hạn ngạch test bản quyền hôm nay về 0.',
      });
      await loadData();
    } catch (err) {
      toast.error({
        title: 'Lỗi làm mới hạn ngạch',
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  // Listen to background job updates
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<BktTestJob>('bkt-test-job-updated', (event) => {
      if (cancelled) return;
      const updated = event.payload;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
      // Chỉ refresh quota kênh khi job vừa vào hàng đợi hoặc hoàn tất (tránh spam SQLite ở mỗi % upload)
      if (
        updated.status === 'queued' ||
        updated.status === 'green_clean' ||
        updated.status === 'red_matched' ||
        updated.status === 'failed'
      ) {
        getBktTestChannels()
          .then((list) => {
            if (!cancelled) setChannels(list);
          })
          .catch(() => {});
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Open Dialog for Add or Edit
  const handleOpenAdd = () => {
    setEditingChannel(null);
    setFormName('');
    setFormQuota(15);
    setFormIsActive(true);
    setFormPriority(1);
    setFormNote('');
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (ch: BktTestChannel) => {
    setEditingChannel(ch);
    setFormName(ch.name);
    setFormQuota(ch.dailyQuota);
    setFormIsActive(ch.isActive);
    setFormPriority(ch.priority);
    setFormNote(ch.note || '');
    setIsDialogOpen(true);
  };

  // Save Channel
  const handleSave = async () => {
    if (!formName.trim()) {
      toast.warning({ title: 'Thiếu thông tin', description: 'Vui lòng nhập tên kênh test.' });
      return;
    }

    setSaving(true);
    try {
      const input: BktTestChannelInput = {
        id: editingChannel ? editingChannel.id : undefined,
        name: formName.trim(),
        profileId: editingChannel ? editingChannel.profileId : '',
        dailyQuota: Number(formQuota) || 15,
        isActive: formIsActive,
        priority: Number(formPriority) || 1,
        note: formNote.trim() || undefined,
      };

      await saveBktTestChannel(input);

      // Telemetry: Đồng bộ kênh test lên Supabase
      workTelemetryService.syncManagedChannel({
        channel_type: 'test',
        channel_id: input.profileId,
        channel_title: input.name,
        status: input.isActive ? 'active' : 'inactive',
        action: 'upsert',
      });

      toast.success({
        title: editingChannel ? 'Cập nhật thành công' : 'Thêm kênh test thành công',
        description: `Kênh test "${formName}" đã sẵn sàng kiểm tra bản quyền.`,
      });
      setIsDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error({
        title: 'Lỗi lưu kênh test',
        description: String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete Channel
  const handleDelete = async (ch: BktTestChannel) => {
    if (!confirm(`Bạn có chắc muốn xóa kênh test "${ch.name}" không?`)) return;
    try {
      await deleteBktTestChannel(ch.id);

      // Telemetry: Đồng bộ xóa kênh test 1-1
      workTelemetryService.syncManagedChannel({
        channel_type: 'test',
        channel_id: ch.profileId,
        channel_title: ch.name,
        action: 'delete',
      });

      toast.success({
        title: 'Đã xóa kênh test',
        description: `Kênh "${ch.name}" đã được gỡ khỏi hệ thống.`,
      });
      await loadData();
    } catch (err) {
      toast.error({
        title: 'Lỗi xóa kênh test',
        description: String(err),
      });
    }
  };

  // Launch Chromium Profile to login YouTube Studio
  const handleLaunchProfile = async (profileId: string) => {
    try {
      toast.info({
        title: 'Đang mở trình duyệt',
        description: 'Đang kích hoạt Chromium và mở YouTube Studio...',
      });
      await invoke('launch_multibrowser_profile', {
        profileId,
        profile_id: profileId,
        targetUrl: 'https://studio.youtube.com/',
        target_url: 'https://studio.youtube.com/',
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi mở trình duyệt',
        description: String(err),
      });
    }
  };

  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);

  const handlePublishToMain = async (jobId: string) => {
    try {
      setPublishingJobId(jobId);
      toast.info({
        title: 'Đang đăng sang Kênh Đích',
        description: 'Trình duyệt đang khởi động và tải video lên Kênh Chính...',
      });
      const res = await publishBktJobToMain(jobId);
      toast.success({ title: 'Thành công', description: res });
      await loadData();
    } catch (err) {
      toast.error({ title: 'Lỗi đăng Kênh Đích', description: String(err) });
    } finally {
      setPublishingJobId(null);
    }
  };

  const handleRecheckJob = async (jobId: string) => {
    try {
      toast.info({
        title: 'Đang kiểm tra lại',
        description: 'Khởi động phiên kiểm tra Studio...',
      });
      await recheckBktJob(jobId);
      await loadData();
    } catch (err) {
      toast.error({ title: 'Lỗi', description: String(err) });
    }
  };

  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);

  const handleCancelJob = async (jobId: string) => {
    try {
      setCancellingJobId(jobId);
      toast.info({
        title: 'Đang hủy tác vụ',
        description: 'Đang yêu cầu dừng tiến trình và giải phóng tài nguyên...',
      });
      await cancelBktJob(jobId);
      toast.success({
        title: 'Đã hủy tác vụ',
        description: 'Tác vụ kiểm tra bản quyền đã được dừng an toàn.',
      });
      await loadData();
    } catch (err) {
      toast.error({ title: 'Lỗi hủy tác vụ', description: String(err) });
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleCancelAllJobs = async () => {
    try {
      setCancellingAll(true);
      toast.info({
        title: 'Đang dừng tất cả tác vụ',
        description: 'Đang hủy toàn bộ hàng đợi và đóng các tiến trình kiểm tra...',
      });
      const count = await cancelAllBktJobs();
      toast.success({
        title: 'Đã dừng tất cả tác vụ kiểm tra bản quyền',
        description: `Đã dừng thành công ${count} tác vụ.`,
      });
      await loadData();
    } catch (err) {
      toast.error({ title: 'Lỗi', description: String(err) });
    } finally {
      setCancellingAll(false);
    }
  };

  // Quota calculation helpers
  const totalSlots = channels.filter((c) => c.isActive).reduce((acc, c) => acc + c.dailyQuota, 0);
  const totalUsed = channels.filter((c) => c.isActive).reduce((acc, c) => acc + c.dailyUsed, 0);
  const totalRemaining = Math.max(0, totalSlots - totalUsed);
  const activeJobsCount = jobs.filter((j) =>
    ['queued', 'reuping', 'uploading', 'checking', 'pending'].includes(j.status),
  ).length;

  return (
    <div className="space-y-6">
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
            Danh Sách Kênh Test Bản Quyền
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
            onClick={handleResetQuota}
            disabled={loading}
            className="h-8 text-xs gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            title="Khôi phục lại toàn bộ quota hôm nay về 0 khi có sự cố kỹ thuật hoặc muốn test lại ngay"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Làm mới Quota
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Làm mới
          </Button>

          <Button size="sm" onClick={handleOpenAdd} className="h-8 text-xs gap-1.5 bg-primary">
            <Plus className="w-3.5 h-3.5" />
            Thêm Kênh Test
          </Button>
        </div>
      </div>

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
            Thêm Kênh Test Đầu Tiên
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
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0"
                          >
                            Hoạt động
                          </Badge>
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
                          <strong className="text-foreground">
                            {prof ? prof.profile_name : `[Kênh Test] ${ch.name}`}
                          </strong>
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

      {/* Recent BKT Test Tasks Table */}
      <div className="space-y-3 pt-4 border-t border-border/40">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Lịch Sử Tiến Trình Test Bản Quyền Gần Nhất
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
                Dừng tất cả ({activeJobsCount})
              </Button>
            )}
            <Badge variant="outline" className="text-xs">
              {jobs.length} tác vụ
            </Badge>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            Chưa có tác vụ test bản quyền nào. Bạn có thể chọn video từ Kênh theo dõi hoặc Thư viện
            để tiến hành kiểm tra.
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
                      Reup Lv.1
                    </Badge>
                  );
                } else if (job.status === 'uploading') {
                  statusBadge = (
                    <Badge
                      variant="outline"
                      className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse gap-1"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang tải lên Studio
                    </Badge>
                  );
                } else if (job.status === 'checking') {
                  statusBadge = (
                    <Badge
                      variant="outline"
                      className="text-xs bg-indigo-500/15 text-indigo-400 border-indigo-500/30 animate-pulse gap-1"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang chờ YouTube Check
                    </Badge>
                  );
                } else if (job.status === 'green_clean') {
                  statusBadge = (
                    <Badge
                      variant="outline"
                      className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 font-medium"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Sạch Bản Quyền
                    </Badge>
                  );
                } else if (job.status === 'red_matched') {
                  statusBadge = (
                    <Badge
                      variant="outline"
                      className="text-xs bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1 font-medium"
                    >
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      Dính Bản Quyền Content ID
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
                      Lỗi
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
                          Dừng
                        </Button>
                      )}
                      {job.status === 'green_clean' && job.mainTargetProfileId && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={publishingJobId === job.id}
                          onClick={() => handlePublishToMain(job.id)}
                          className="h-7 text-[11px] gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                          title="Đăng video công khai sang Kênh Đích"
                        >
                          {publishingJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          Đăng Kênh Đích
                        </Button>
                      )}
                      {(job.status === 'pending' || job.status === 'failed') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecheckJob(job.id)}
                          className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          title={
                            job.status === 'failed'
                              ? 'Thử lại tác vụ kiểm tra bản quyền'
                              : 'Quét lại trạng thái bản quyền trên YouTube Studio'
                          }
                        >
                          <RefreshCw className="w-3 h-3" />
                          {job.status === 'failed' ? 'Thử lại' : 'Quét Lại'}
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
                Kênh Test Bản Quyền hoạt động độc lập 100% với Hồ Sơ Kênh Đích (Chức năng 2). Hệ
                thống tự động quản lý phiên Chromium riêng cho kênh test này để mượn slot Unlisted
                kiểm tra bản quyền ngầm, tuyệt đối không ảnh hưởng đến Kênh Chính.
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
              {editingChannel ? 'Cập Nhật Kênh Test' : 'Thêm Kênh Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
