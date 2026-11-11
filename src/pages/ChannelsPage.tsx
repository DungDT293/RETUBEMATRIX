import { FolderDown, Globe, Loader2, Plus, RefreshCw, Search, Tv } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  dispatchBatchBktTest,
  getAllChannelStats,
  getChannelVideoFilepath,
  getMultibrowserProfiles,
  getSavedChannelVideos,
  toggleChannelAutoDownload,
  updateChannelBktConfig,
  waitBktJobCompletion,
} from '@/contexts/channels/channels-client';
import { isSupportedPlatform } from '@/contexts/channels/useChannelsController';
import { useChannels } from '@/contexts/channels-context';
import type {
  ChannelStats,
  ChannelVideo,
  FollowedChannel,
  MultiBrowserProfile,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelCard, type ChannelReupProgress } from '@/pages/channels/ChannelCard';
import { ChannelVideoAccordion } from '@/pages/channels/ChannelVideoAccordion';
import { workTelemetryService } from '@/services/workTelemetryService';
import {
  adaptCompetitorDescription,
  getBestAutoPilotTitle,
  getCompanionThumbnailPath,
} from '@/utils/reup-auto-pilot';

function resolvePrettyChannelName(url: string): string {
  try {
    const trimmed = url.trim();
    const handleMatch = trimmed.match(/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch?.[1]) {
      const handle = handleMatch[1];
      const spaced = handle.replace(/([a-z])([A-Z])/g, '$1 $2');
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }
    const customMatch = trimmed.match(/\/(?:c|user)\/([a-zA-Z0-9_.-]+)/i);
    if (customMatch?.[1]) {
      return customMatch[1];
    }
    const channelMatch = trimmed.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/i);
    if (channelMatch?.[1]) {
      return `Kênh YouTube (${channelMatch[1].slice(0, 8)}...)`;
    }
    return trimmed;
  } catch {
    return url;
  }
}

export function ChannelsPage() {
  const {
    followedChannels,
    refreshChannels,
    followChannel,
    unfollowChannel,
    checkingChannelIds,
    checkChannelNow,
    isDownloading,
    outputPath,
    selectOutputFolder,
    downloadSelectedVideos,
    updateChannelSettings,
  } = useChannels();

  // Search & Add new channel state
  const [urlInput, setUrlInput] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Stats for all channels
  const [statsMap, setStatsMap] = useState<Record<string, ChannelStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  // Expanded channel id (accordion)
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  // Videos of expanded channel
  const [channelVideosMap, setChannelVideosMap] = useState<Record<string, ChannelVideo[]>>({});
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Selected videos for batch download
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Profiles list for 1-1 mapping
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);

  // Toast & Auto Reup Progress State
  const toast = useToast();
  const [reupProgressMap, setReupProgressMap] = useState<Record<string, ChannelReupProgress>>({});
  const autoReupAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const refreshProfiles = useCallback(async () => {
    try {
      const data = await getMultibrowserProfiles();
      if (Array.isArray(data)) {
        setProfiles(data);
      }
    } catch (err) {
      console.error('Failed to load profiles in ChannelsPage:', err);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  // Load stats for all channels
  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const statsList = await getAllChannelStats();
      const map: Record<string, ChannelStats> = {};
      for (const item of statsList) {
        map[item.channel_id] = item;
      }
      setStatsMap(map);
    } catch (e) {
      console.error('Failed to load channel stats:', e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Load videos when a channel is expanded
  const handleToggleExpand = useCallback(
    async (channelId: string) => {
      if (expandedChannelId === channelId) {
        setExpandedChannelId(null);
        setSelectedVideoIds(new Set());
        return;
      }

      setExpandedChannelId(channelId);
      setSelectedVideoIds(new Set());

      // If not yet fetched or want fresh
      setLoadingVideos(true);
      try {
        const videos = await getSavedChannelVideos({
          channelId,
          status: null,
          limit: 0, // 0 = lấy toàn bộ video đã quét
        });
        setChannelVideosMap((prev) => ({ ...prev, [channelId]: videos }));
      } catch (err) {
        console.error('Failed to get saved channel videos:', err);
      } finally {
        setLoadingVideos(false);
      }
    },
    [expandedChannelId],
  );

  // Handle Add channel
  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url || !isSupportedPlatform(url)) return;

    setAddingChannel(true);
    try {
      const prettyName = resolvePrettyChannelName(url);
      const contentType: YoutubeChannelContentType = 'all';
      await followChannel(url, prettyName, undefined, undefined, contentType);
      setUrlInput('');
      await refreshChannels();
      await refreshStats();
    } catch (err) {
      console.error('Add channel failed:', err);
    } finally {
      setAddingChannel(false);
    }
  };

  // Handle Check now for single channel
  const handleCheckNow = async (channel: FollowedChannel) => {
    try {
      await checkChannelNow(channel);
      await refreshStats();
      // Refresh video list
      const videos = await getSavedChannelVideos({
        channelId: channel.id,
        status: null,
        limit: 0, // 0 = lấy toàn bộ video
      });
      setChannelVideosMap((prev) => ({ ...prev, [channel.id]: videos }));

      // Telemetry: Đồng bộ thông số đối thủ và 5 video mới nhất
      if (channel.url && videos.length > 0) {
        const top5 = videos.slice(0, 5).map((v) => ({
          video_id: v.video_id,
          id: v.video_id,
          title: v.title,
          view_count: 0,
          upload_date: v.upload_date || '',
          url: v.url,
        }));
        workTelemetryService.syncCompetitorChannel({
          channel_url: channel.url,
          channel_name: channel.name,
          competitor_channel_id: channel.id,
          subscriber_count: 0,
          view_count: 0,
          total_videos: statsMap[channel.id]?.total_videos || 0,
          recent_5_videos: top5,
          action: 'upsert',
        });
      }
    } catch (err) {
      console.error('Check channel failed:', err);
    }
  };

  // Sequential Top 5 Reup Worker (1-by-1 FIFO, Tối ưu ổ cứng)
  const runSequentialTop5ForChannel = async (channel: FollowedChannel) => {
    const channelId = channel.id;
    const targetProfileId = channel.bkt_profile_id;
    if (!targetProfileId) return;

    const abortController = new AbortController();
    autoReupAbortControllersRef.current.set(channelId, abortController);

    setReupProgressMap((prev) => ({
      ...prev,
      [channelId]: {
        channelId,
        isRunning: true,
        currentStep: 0,
        totalSteps: 5,
        progressText: 'Đang chuẩn bị danh sách 5 video mới nhất...',
        status: 'running',
      },
    }));

    try {
      let videos = channelVideosMap[channelId] || [];
      if (videos.length === 0) {
        try {
          videos = await getSavedChannelVideos({ channelId, status: null, limit: 10 });
        } catch (e) {
          console.warn('Lỗi getSavedChannelVideos:', e);
        }
      }

      if (videos.length === 0) {
        setReupProgressMap((prev) => ({
          ...prev,
          [channelId]: {
            ...prev[channelId],
            progressText: 'Đang quét video mới từ YouTube...',
          },
        }));
        try {
          await checkChannelNow(channel);
          videos = await getSavedChannelVideos({ channelId, status: null, limit: 10 });
        } catch (err) {
          console.warn('Lỗi checkChannelNow:', err);
        }
      }

      const top5 = videos.slice(0, 5);
      if (top5.length === 0) {
        setReupProgressMap((prev) => ({
          ...prev,
          [channelId]: {
            channelId,
            isRunning: false,
            currentStep: 0,
            totalSteps: 0,
            progressText: 'Kênh chưa có video nào. Đang ở chế độ chờ video mới xuất hiện.',
            status: 'idle',
          },
        }));
        toast.info({
          title: 'Đã bật Auto Reup',
          message: `Kênh "${channel.name}" chưa có video cũ. Hệ thống sẽ tự động Reup ngay khi đối thủ đăng video mới!`,
        });
        return;
      }

      toast.info({
        title: `Bắt đầu Auto Reup Top ${top5.length}`,
        message: `Đang xử lý tuần tự ${top5.length} video mới nhất của "${channel.name}" để tối ưu ổ cứng (1-by-1).`,
      });

      let successCount = 0;
      let redCount = 0;

      for (let idx = 0; idx < top5.length; idx++) {
        if (abortController.signal.aborted) {
          break;
        }

        const v = top5[idx];
        const stepIndex = idx + 1;
        const total = top5.length;
        const targetId = v.id || v.video_id;

        // BƯỚC 1: Kiểm tra file video trên đĩa
        let filePath = await getChannelVideoFilepath(v.video_id);
        if (!filePath) {
          setReupProgressMap((prev) => ({
            ...prev,
            [channelId]: {
              channelId,
              isRunning: true,
              currentStep: stepIndex,
              totalSteps: total,
              progressText: `[${stepIndex}/${total}] Đang tải video: "${v.title}"...`,
              status: 'running',
            },
          }));

          await downloadSelectedVideos(
            channel.download_quality || 'best',
            channel.download_format || 'mp4',
            channel.download_video_codec || 'auto',
            channel.download_preferred_fps || 'original',
            [
              {
                id: v.video_id,
                title: v.title,
                url: v.url,
                thumbnail: v.thumbnail || undefined,
                duration: v.duration || undefined,
              },
            ],
            channel.url,
            channel.name,
          );

          let attempts = 0;
          while (!filePath && attempts < 90) {
            if (abortController.signal.aborted) break;
            await new Promise((r) => setTimeout(r, 2000));
            filePath = await getChannelVideoFilepath(v.video_id);
            attempts++;
          }
        }

        if (abortController.signal.aborted) break;

        if (!filePath) {
          console.error(`Không thể tải video: ${v.title}`);
          continue;
        }

        // BƯỚC 2: AI Tối ưu tiêu đề, mô tả, thumbnail
        setReupProgressMap((prev) => ({
          ...prev,
          [channelId]: {
            channelId,
            isRunning: true,
            currentStep: stepIndex,
            totalSteps: total,
            progressText: `[${stepIndex}/${total}] Reup Lv.1 & AI Tối ưu tiêu đề...`,
            status: 'running',
          },
        }));

        const aiTitle = getBestAutoPilotTitle(v.title);
        const adaptedDesc = adaptCompetitorDescription({
          originalDescription: '',
          targetChannelName: channel.name,
          videoTitle: aiTitle,
          includeFairUseDisclaimer: true,
        });
        const thumbPath = getCompanionThumbnailPath(filePath);

        // BƯỚC 3: Gửi BKT Job tuần tự với autoPublishMain = true
        setReupProgressMap((prev) => ({
          ...prev,
          [channelId]: {
            channelId,
            isRunning: true,
            currentStep: stepIndex,
            totalSteps: total,
            progressText: `[${stepIndex}/${total}] Studio đang quét Content ID & Đăng đích...`,
            status: 'running',
          },
        }));

        const dispatchRes = await dispatchBatchBktTest({
          items: [
            {
              videoTitle: v.title,
              videoPath: filePath,
              videoSourceType: 'channel_video',
              sourceRefId: targetId,
              mainTargetProfileId: targetProfileId,
              autoPublishMain: true,
              targetTitle: aiTitle,
              targetDescription: adaptedDesc,
              thumbnailPath: thumbPath,
            },
          ],
          targetTestChannelId: undefined,
          sequential: true,
        });

        const dispatchedJob = dispatchRes.results?.[0];
        if (!dispatchedJob?.success || !dispatchedJob.jobId) {
          console.error(`Lỗi điều phối BKT cho video ${v.title}:`, dispatchedJob?.error);
          continue;
        }

        // BƯỚC 4: Chờ hoàn thành BKT & Tự động xuất bản & Dọn sạch đĩa
        const jobId = dispatchedJob.jobId;
        try {
          const finishedJob = await waitBktJobCompletion(jobId, 900);
          if (finishedJob.status === 'green_clean') {
            successCount++;
            setReupProgressMap((prev) => ({
              ...prev,
              [channelId]: {
                channelId,
                isRunning: true,
                currentStep: stepIndex,
                totalSteps: total,
                progressText: `[${stepIndex}/${total}] Sạch bản quyền & Đã xuất bản Kênh Đích!`,
                status: 'running',
              },
            }));
            // Telemetry: Báo cáo video test xanh & xuất bản video lên kênh đích
            workTelemetryService.reportBktResult({
              competitor_channel_url: channel.url,
              competitor_channel_id: channel.id,
              status: 'green',
            });
            workTelemetryService.reportUpload({
              channel_id: targetProfileId,
            });

            toast.success({
              title: `Video ${stepIndex}/${total} Hoàn tất!`,
              message: `"${aiTitle}" đã sạch bản quyền và xuất bản lên Kênh Đích! File gốc, reup & thumbnail đã được dọn sạch để tối ưu bộ nhớ.`,
            });
          } else if (finishedJob.status === 'red_matched') {
            redCount++;
            setReupProgressMap((prev) => ({
              ...prev,
              [channelId]: {
                channelId,
                isRunning: true,
                currentStep: stepIndex,
                totalSteps: total,
                progressText: `[${stepIndex}/${total}] Dính bản quyền: ${finishedJob.restriction || ''}`,
                status: 'running',
              },
            }));
            // Telemetry: Báo cáo video test đỏ
            workTelemetryService.reportBktResult({
              competitor_channel_url: channel.url,
              competitor_channel_id: channel.id,
              status: 'red',
            });
          }
        } catch (waitErr) {
          console.error(`Lỗi khi chờ BKT video ${v.title}:`, waitErr);
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      setReupProgressMap((prev) => ({
        ...prev,
        [channelId]: {
          channelId,
          isRunning: false,
          currentStep: top5.length,
          totalSteps: top5.length,
          progressText: `Đã hoàn tất Reup Tuần Tự Top 5 (${successCount} thành công, ${redCount} cảnh báo)! Kênh đang ở chế độ Auto Reup cho video mới.`,
          status: 'success',
        },
      }));
      await refreshChannels();
      toast.success({
        title: 'Hoàn tất Auto Reup Top 5!',
        message: `Đã xử lý xong Top 5 video cho kênh "${channel.name}". Kênh tiếp tục duy trì chế độ Auto Reup để bắt video mới tiếp theo!`,
      });
    } catch (err) {
      console.error('Lỗi quy trình tuần tự Top 5:', err);
      setReupProgressMap((prev) => ({
        ...prev,
        [channelId]: {
          channelId,
          isRunning: false,
          currentStep: 0,
          totalSteps: 0,
          progressText: `Lỗi Auto Reup: ${String(err)}`,
          status: 'error',
        },
      }));
    } finally {
      autoReupAbortControllersRef.current.delete(channelId);
    }
  };

  // Handle Toggle Auto Reup
  const handleToggleAutoDownload = async (channelId: string, enabled: boolean) => {
    const channel = followedChannels.find((c) => c.id === channelId);
    if (!channel) return;

    if (enabled) {
      if (!channel.bkt_profile_id) {
        toast.warning({
          title: 'Chưa Gán Hồ Sơ Kênh Đích',
          message: `Vui lòng gán Hồ Sơ Kênh Đích (Target Profile) cho kênh "${channel.name}" trước khi bật Auto Reup!`,
        });
        return;
      }

      try {
        await toggleChannelAutoDownload(channelId, true);
        await updateChannelBktConfig({
          channelId,
          bktTestMode: true,
          bktProfileId: channel.bkt_profile_id ?? null,
        });
        await refreshChannels();
        // Kích hoạt ngay Top 5
        runSequentialTop5ForChannel(channel);
      } catch (err) {
        console.error('Bật Auto Reup thất bại:', err);
      }
    } else {
      // Hủy nếu đang chạy
      const controller = autoReupAbortControllersRef.current.get(channelId);
      if (controller) {
        controller.abort();
        autoReupAbortControllersRef.current.delete(channelId);
      }

      try {
        await toggleChannelAutoDownload(channelId, false);
        await updateChannelBktConfig({
          channelId,
          bktTestMode: false,
          bktProfileId: channel.bkt_profile_id ?? null,
        });
        await refreshChannels();
        setReupProgressMap((prev) => ({
          ...prev,
          [channelId]: {
            channelId,
            isRunning: false,
            currentStep: 0,
            totalSteps: 0,
            progressText: 'Đã dừng Auto Reup.',
            status: 'idle',
          },
        }));
        toast.info({
          title: 'Đã tắt Auto Reup',
          message: `Đã dừng chế độ Auto Reup cho kênh "${channel.name}".`,
        });
      } catch (err) {
        console.error('Tắt Auto Reup thất bại:', err);
      }
    }
  };

  // Video selection helpers
  const handleToggleVideoSelection = (videoId: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const handleSelectAllVideos = (videoIds: string[]) => {
    setSelectedVideoIds(new Set(videoIds));
  };

  const handleDeselectAllVideos = () => {
    setSelectedVideoIds(new Set());
  };

  // Batch download selected videos
  const handleDownloadSelected = async (videosToDownload: ChannelVideo[]) => {
    if (videosToDownload.length === 0) return;
    const channel = followedChannels.find((c) => c.id === expandedChannelId);
    const entries = videosToDownload.map((v) => ({
      id: v.video_id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail || undefined,
      duration: v.duration || undefined,
    }));
    try {
      await downloadSelectedVideos(
        channel?.download_quality || 'best',
        channel?.download_format || 'mp4',
        channel?.download_video_codec || 'auto',
        channel?.download_preferred_fps || 'original',
        entries,
        channel?.url,
        channel?.name,
      );
    } catch (err) {
      console.error('Failed to download selected videos:', err);
    }
  };

  // Filter channels by search
  const filteredChannels = followedChannels.filter(
    (c) =>
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.url.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex-shrink-0 border-b border-border/50 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm shadow-primary/10">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg leading-tight">
              Theo dõi Kênh & Phân tích Đăng Video
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                Theo dõi kênh, nhận biết khung giờ thường đăng & tự động tải video sạch
              </p>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-time RSS • Chạy ngầm Khay hệ thống
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {outputPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={selectOutputFolder}
              className="hidden md:inline-flex h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <FolderDown className="w-3.5 h-3.5 text-primary" />
              <span className="max-w-[140px] truncate">{outputPath}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await refreshChannels();
              await refreshStats();
            }}
            disabled={loadingStats}
            className="h-8 gap-1 text-xs"
            title="Làm mới thống kê"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loadingStats && 'animate-spin')} />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>

          <ThemePicker />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Add Channel & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Add Channel Form */}
          <form onSubmit={handleAddChannel} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Dán link kênh YouTube (ví dụ: https://www.youtube.com/@ChannelName)..."
                className="pl-9 h-10 text-sm bg-card/60 border-border/60 focus-visible:ring-primary"
              />
            </div>
            <Button
              type="submit"
              disabled={addingChannel || !urlInput.trim()}
              className="h-10 px-4 gap-1.5 font-medium text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
            >
              {addingChannel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Thêm kênh theo dõi</span>
            </Button>
          </form>

          {/* Quick Filter Search */}
          {followedChannels.length > 3 && (
            <div className="relative w-full sm:w-60 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Tìm kênh trong danh sách..."
                className="pl-9 h-10 text-xs bg-card/40 border-border/50"
              />
            </div>
          )}
        </div>

        {/* Channels List */}
        {followedChannels.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-border/70 bg-card/20 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Tv className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              Chưa có kênh nào được theo dõi
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Hãy dán URL kênh YouTube bạn muốn theo dõi vào ô trên để phân tích khung giờ đăng,
              quét video và tự động tải video sạch về máy.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Đang theo dõi {followedChannels.length} kênh</span>
              <span>Bấm 'Xem video' trên từng card để xổ danh sách & tải video</span>
            </div>

            {filteredChannels.map((channel) => {
              const isExpanded = expandedChannelId === channel.id;
              const stats = statsMap[channel.id];
              const videos = channelVideosMap[channel.id] || [];
              const isChecking = checkingChannelIds.has(channel.id);

              return (
                <div key={channel.id} className="flex flex-col">
                  {/* Channel Main Card */}
                  <ChannelCard
                    channel={channel}
                    stats={stats}
                    profiles={profiles}
                    isExpanded={isExpanded}
                    onToggleExpand={() => handleToggleExpand(channel.id)}
                    onCheckNow={() => handleCheckNow(channel)}
                    isChecking={isChecking}
                    onUnfollow={() => unfollowChannel(channel.id)}
                    onToggleAutoDownload={(enabled) =>
                      handleToggleAutoDownload(channel.id, enabled)
                    }
                    onUpdateSettings={updateChannelSettings}
                    onRefreshChannels={refreshChannels}
                    reupProgress={reupProgressMap[channel.id]}
                    onClearReupProgress={(id) =>
                      setReupProgressMap((prev) => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                      })
                    }
                  />

                  {/* Accordion Video List */}
                  {isExpanded && (
                    <div className="mt-1">
                      <ChannelVideoAccordion
                        channelName={channel.name}
                        channel={channel}
                        videos={videos}
                        isLoading={loadingVideos}
                        selectedVideoIds={selectedVideoIds}
                        onToggleVideoSelection={handleToggleVideoSelection}
                        onSelectAll={handleSelectAllVideos}
                        onDeselectAll={handleDeselectAllVideos}
                        onDownloadSelected={handleDownloadSelected}
                        isDownloading={isDownloading}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
