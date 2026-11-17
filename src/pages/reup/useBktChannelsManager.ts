import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
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
import { workTelemetryService } from '@/services/workTelemetryService';
import type { BktChannelsManager } from './types';

export function useBktChannelsManager(): BktChannelsManager {
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

  // Action status
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState<boolean>(false);

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [chData, profData, jobData] = await Promise.all([
        getBktTestChannels(),
        getMultibrowserProfiles({ includeBkt: true }),
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
      await invoke('reset_bkt_channel_daily_quota', { channelId: null, channel_id: null });
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
      // Chỉ refresh quota kênh khi job vừa vào hàng đợi hoặc hoàn tất
      if (
        updated.status === 'queued' ||
        updated.status === 'green_clean' ||
        updated.status === 'red_matched' ||
        updated.status === 'published' ||
        updated.status === 'publish_failed' ||
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

  const handleDelete = async (ch: BktTestChannel) => {
    if (!confirm(`Bạn có chắc muốn xóa kênh test "${ch.name}" không?`)) return;
    try {
      await deleteBktTestChannel(ch.id);

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

  const totalSlots = channels.filter((c) => c.isActive).reduce((acc, c) => acc + c.dailyQuota, 0);
  const totalUsed = channels.filter((c) => c.isActive).reduce((acc, c) => acc + c.dailyUsed, 0);
  const totalRemaining = Math.max(0, totalSlots - totalUsed);
  const activeJobsCount = jobs.filter((j) =>
    ['queued', 'reuping', 'uploading', 'checking', 'pending'].includes(j.status),
  ).length;

  return {
    channels,
    profiles,
    jobs,
    loading,
    totalSlots,
    totalUsed,
    totalRemaining,
    activeJobsCount,
    loadData,
    handleResetQuota,
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
    publishingJobId,
    handlePublishToMain,
    handleRecheckJob,
    cancellingJobId,
    cancellingAll,
    handleCancelJob,
    handleCancelAllJobs,
  };
}
