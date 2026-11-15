import { listen } from '@tauri-apps/api/event';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Download,
  ExternalLink,
  Film,
  Flame,
  FlaskConical,
  Loader2,
  PlaySquare,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  canContinueBktPublish,
  canRetryBktTest,
  nextSequentialRedCount,
} from '@/contexts/channels/channel-flow-safety';
import {
  cancelAllBktJobs,
  dispatchBatchBktTest,
  getBktTestJobs,
  getChannelVideoFilepath,
  publishBktJobToMain,
  recheckBktJob,
  toggleChannelAutoDownload,
  updateChannelBktConfig,
  waitBktJobCompletion,
} from '@/contexts/channels/channels-client';
import { useChannels } from '@/contexts/channels-context';
import type { BktBatchItemRequest, BktTestJob, ChannelVideo, FollowedChannel } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  formatUploadDateTime,
  parseVideoUploadEpoch,
} from '@/pages/channels/channelUtils';
import {
  adaptCompetitorDescription,
  getBestAutoPilotTitle,
  getCompanionThumbnailPath,
} from '@/utils/reup-auto-pilot';

interface ChannelVideoAccordionProps {
  channelName: string;
  videos: ChannelVideo[];
  isLoading: boolean;
  selectedVideoIds: Set<string>;
  onToggleVideoSelection: (videoId: string) => void;
  onSelectAll: (videoIds: string[]) => void;
  onDeselectAll: () => void;
  onDownloadSelected: (videos: ChannelVideo[]) => void;
  isDownloading: boolean;
  onDeleteVideo?: (videoId: string) => void;
  channel?: FollowedChannel;
}

type FilterType = 'all' | 'video' | 'shorts' | 'stream';
type TimeFilterOption = 'all' | '3d' | '7d';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'views_desc'
  | 'duration_desc'
  | 'duration_asc'
  | 'title_asc';

function formatCompactViews(count?: number): string | null {
  if (count == null) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M xem`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K xem`;
  return `${count} xem`;
}

export function ChannelVideoAccordion({
  channelName,
  videos,
  isLoading,
  selectedVideoIds,
  onToggleVideoSelection,
  onSelectAll,
  onDeselectAll,
  onDownloadSelected,
  isDownloading,
  channel,
}: ChannelVideoAccordionProps) {
  const toast = useToast();
  const { followedChannels, refreshChannels } = useChannels();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [testingVideoId, setTestingVideoId] = useState<string | null>(null);
  const [bktJobs, setBktJobs] = useState<BktTestJob[]>([]);
  const [jobActionId, setJobActionId] = useState<string | null>(null);
  const [isBatchTestingBkt, setIsBatchTestingBkt] = useState<boolean>(false);
  const [isSequentialTop5Running, setIsSequentialTop5Running] = useState<boolean>(false);
  const [sequentialProgressText, setSequentialProgressText] = useState<string>('');
  const [videoOverrides, setVideoOverrides] = useState<Record<string, Partial<ChannelVideo>>>({});
  const [activeJobPhases, setActiveJobPhases] = useState<Record<string, string>>({});
  const sequentialStopRequestedRef = useRef<boolean>(false);
  const videosRef = useRef<ChannelVideo[]>(videos);
  videosRef.current = videos;

  useEffect(() => {
    let cancelled = false;
    getBktTestJobs(300)
      .then((jobs) => {
        if (!cancelled) setBktJobs(jobs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBktJobAction = async (job: BktTestJob, action: 'retry' | 'publish') => {
    setJobActionId(job.id);
    try {
      if (action === 'retry') {
        await recheckBktJob(job.id);
        toast.info({
          title: 'Đã xếp hàng kiểm tra lại',
          message: `Đang kiểm tra lại trên ${job.testChannelName || 'kênh test'}.`,
        });
      } else {
        const result = await publishBktJobToMain(job.id);
        toast.success({ title: 'Đã gửi đăng Kênh Đích', message: result });
      }
      setBktJobs(await getBktTestJobs(300));
    } catch (error) {
      toast.error({
        title: action === 'retry' ? 'Lỗi kiểm tra lại' : 'Lỗi đăng video',
        message: String(error),
      });
    } finally {
      setJobActionId(null);
    }
  };

  const handleStopSequentialTop5 = async () => {
    sequentialStopRequestedRef.current = true;
    setIsSequentialTop5Running(false);
    setSequentialProgressText('');
    try {
      await cancelAllBktJobs();
    } catch (e) {
      console.warn('Lỗi khi hủy jobs BKT:', e);
    }
    toast.info({
      title: 'Đã dừng Chu trình Reup Tuần Tự',
      message: 'Đã dừng chu trình tuần tự và hủy các tác vụ BKT liên quan.',
    });
  };

  // Lắng nghe realtime tiến trình BKT test từ background
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<BktTestJob>('bkt-test-job-updated', (event) => {
      if (cancelled) return;
      const job = event.payload;
      if (!job) return;
      setBktJobs((prev) => {
        const index = prev.findIndex((item) => item.id === job.id);
        if (index < 0) return [job, ...prev].slice(0, 300);
        const next = [...prev];
        next[index] = job;
        return next;
      });
      const targetRef = job.sourceRefId;
      if (!targetRef) return;

      const matchedVideo = videosRef.current.find(
        (item) => item.id === targetRef || item.video_id === targetRef,
      );

      setActiveJobPhases((prev) => {
        const next = { ...prev };
        const isTerminal =
          job.status === 'green_clean' ||
          job.status === 'red_matched' ||
          job.status === 'published' ||
          job.status === 'publish_failed' ||
          job.status === 'failed';
        if (isTerminal) {
          delete next[targetRef];
          if (matchedVideo?.id) delete next[matchedVideo.id];
          if (matchedVideo?.video_id) delete next[matchedVideo.video_id];
        } else {
          next[targetRef] = job.status;
          if (matchedVideo?.id) next[matchedVideo.id] = job.status;
          if (matchedVideo?.video_id) next[matchedVideo.video_id] = job.status;
        }
        return next;
      });

      setVideoOverrides((prev) => {
        const current = prev[targetRef] || {};
        let resolvedStatus:
          | 'pending'
          | 'green_clean'
          | 'red_matched'
          | 'failed'
          | 'publish_failed'
          | undefined = current.bkt_check_status;
        if (job.status === 'green_clean' || job.status === 'published')
          resolvedStatus = 'green_clean';
        else if (job.status === 'red_matched') resolvedStatus = 'red_matched';
        else if (job.status === 'publish_failed') resolvedStatus = 'publish_failed';
        else if (job.status === 'failed') resolvedStatus = 'failed';
        else if (
          job.status === 'queued' ||
          job.status === 'checking' ||
          job.status === 'uploading' ||
          job.status === 'reuping'
        ) {
          resolvedStatus = 'pending';
        }

        const patch = {
          ...current,
          is_bkt_test: true,
          bkt_check_status: resolvedStatus,
          bkt_restriction:
            job.restriction ||
            job.errorMessage ||
            (job.status === 'uploading'
              ? 'Đang tải video lên YouTube Studio...'
              : job.status === 'checking'
                ? 'Studio đang quét Content ID...'
                : undefined),
        };

        const next: typeof prev = {
          ...prev,
          [targetRef]: patch,
        };
        // Đồng bộ cả v.id và v.video_id để override cũ không che khuất trạng thái mới
        if (matchedVideo) {
          if (matchedVideo.id) next[matchedVideo.id] = patch;
          if (matchedVideo.video_id) next[matchedVideo.video_id] = patch;
        }
        return next;
      });
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

  const handleRunSequentialTop5AutoPilot = async () => {
    if (isSequentialTop5Running) return;

    const resolvedChannel = channel || followedChannels.find((c) => c.name === channelName);

    // 1. Sắp xếp danh sách video theo thời gian đăng mới nhất (loại bỏ video live/stream và Shorts nếu là kênh video dài)
    const validVideos = videos.filter((v) => {
      const vt = (v.video_type || '').toLowerCase();
      const isLive = vt === 'live' || vt === 'stream' || v.url.includes('/live/');
      const isShort =
        vt === 'short' ||
        vt === 'shorts' ||
        v.url.includes('/shorts/') ||
        ((v.duration ?? 0) > 0 && (v.duration ?? 0) <= 60);
      if (isLive) return false;
      if (resolvedChannel?.youtube_content_type !== 'shorts' && isShort) return false;
      return true;
    });

    const sortedNewest = [...validVideos].sort((a, b) => {
      return parseVideoUploadEpoch(b) - parseVideoUploadEpoch(a);
    });

    const top5 = sortedNewest.slice(0, 5);
    if (top5.length === 0) {
      toast.warning({
        title: 'Chưa có video khả dụng',
        message: 'Kênh đối thủ này chưa có video dài nào khả dụng để chạy quy trình.',
      });
      return;
    }

    const targetProfileId =
      resolvedChannel?.target_profile_id || resolvedChannel?.bkt_profile_id || null;

    if (!targetProfileId) {
      toast.warning({
        title: 'Chưa cấu hình Kênh Đích',
        message:
          'Vui lòng gán Hồ Sơ Kênh Đích (Target Profile) cho kênh đối thủ này trước khi chạy quy trình xuất bản.',
      });
      return;
    }

    sequentialStopRequestedRef.current = false;
    setIsSequentialTop5Running(true);
    toast.info({
      title: 'Bắt đầu Chu trình Reup Tuần Tự Top 5 (FIFO)',
      message:
        'Đang xử lý lần lượt từng video trong Top 5 mới nhất để tối ưu dung lượng ổ cứng (1-by-1).',
    });

    let successCount = 0;
    let redCount = 0;
    let failedCount = 0;

    try {
      for (let idx = 0; idx < top5.length; idx++) {
        if (sequentialStopRequestedRef.current) {
          break;
        }
        const v = top5[idx];
        const stepIndex = idx + 1;
        const total = top5.length;
        const targetId = v.id || v.video_id;

        setSequentialProgressText(`[${stepIndex}/${total}] Chuẩn bị...`);

        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: `[${stepIndex}/${total}] Đang xử lý tuần tự...`,
          },
          [v.video_id]: {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: `[${stepIndex}/${total}] Đang xử lý tuần tự...`,
          },
        }));

        // BƯỚC 1: Kiểm tra xem video đã có trên ổ cứng chưa
        let filePath = await getChannelVideoFilepath(v.video_id);
        if (!filePath) {
          setSequentialProgressText(`[${stepIndex}/${total}] Đang tải video...`);
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: { bkt_restriction: `[${stepIndex}/${total}] Đang tải video về máy...` },
            [v.video_id]: { bkt_restriction: `[${stepIndex}/${total}] Đang tải video về máy...` },
          }));

          // Gọi tải duy nhất 1 video này
          onDownloadSelected([v]);

          // Chờ cho đến khi file tải xong và xuất hiện trên đĩa (tối đa 600s cho video dài)
          let attempts = 0;
          while (!filePath && attempts < 300) {
            if (sequentialStopRequestedRef.current) break;
            await new Promise((r) => setTimeout(r, 2000));
            filePath = await getChannelVideoFilepath(v.video_id);
            attempts++;
          }
        }

        if (sequentialStopRequestedRef.current) {
          break;
        }

        if (!filePath) {
          console.error(`Không thể tải video: ${v.title}`);
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: { bkt_restriction: `[${stepIndex}/${total}] Lỗi tải video về máy` },
            [v.video_id]: { bkt_restriction: `[${stepIndex}/${total}] Lỗi tải video về máy` },
          }));
          continue;
        }

        // BƯỚC 2: AI Tối ưu hóa Tiêu đề, Mô tả, Hashtag (Hỗ trợ Thái, Lào, CJK, Việt, Quốc tế, <=95 ký tự)
        setSequentialProgressText(`[${stepIndex}/${total}] Reup Lv.1 & Gửi Studio...`);
        const aiTitle = getBestAutoPilotTitle(v.title);
        const adaptedDesc = adaptCompetitorDescription({
          originalDescription: '',
          targetChannelName: resolvedChannel?.name || channelName,
          videoTitle: aiTitle,
          includeFairUseDisclaimer: true,
        });
        const thumbPath = getCompanionThumbnailPath(filePath);

        // BƯỚC 3: Gửi BKT Job tuần tự
        if (sequentialStopRequestedRef.current) break;
        const dispatchRes = await dispatchBatchBktTest({
          items: [
            {
              videoTitle: v.title,
              videoPath: filePath,
              videoSourceType: 'channel_video',
              sourceRefId: targetId,
              channelId: resolvedChannel?.id,
              mainTargetProfileId: targetProfileId,
              targetProfileId: targetProfileId,
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

        const jobId = dispatchedJob.jobId;
        setSequentialProgressText(`[${stepIndex}/${total}] Đang tải lên & theo dõi Studio...`);
        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            bkt_restriction: `[${stepIndex}/${total}] Đang tải lên YouTube Studio & theo dõi Content ID...`,
          },
          [v.video_id]: {
            bkt_restriction: `[${stepIndex}/${total}] Đang tải lên YouTube Studio & theo dõi Content ID...`,
          },
        }));

        // BƯỚC 4: Chờ hoàn thành BKT & Tự động xuất bản & Tự động xóa file giải phóng ổ cứng
        try {
          const finishedJob = await waitBktJobCompletion(jobId, 3600);
          if (finishedJob.status === 'green_clean') {
            successCount++;
            redCount = nextSequentialRedCount(redCount, finishedJob.status);
            setVideoOverrides((prev) => ({
              ...prev,
              [targetId]: {
                bkt_check_status: 'green_clean',
                bkt_restriction: `[${stepIndex}/${total}] Sạch Bản Quyền; chờ thao tác đăng Kênh Đích.`,
              },
              [v.video_id]: {
                bkt_check_status: 'green_clean',
                bkt_restriction: `[${stepIndex}/${total}] Sạch Bản Quyền; chờ thao tác đăng Kênh Đích.`,
              },
            }));
            toast.success({
              title: `Video ${stepIndex}/${total} Hoàn tất!`,
              message: `"${aiTitle}" đã sạch bản quyền; sẵn sàng cho thao tác đăng Kênh Đích.`,
            });
          } else if (finishedJob.status === 'red_matched') {
            redCount = nextSequentialRedCount(redCount, finishedJob.status);
            setVideoOverrides((prev) => ({
              ...prev,
              [targetId]: {
                bkt_check_status: 'red_matched',
                bkt_restriction: `[${stepIndex}/${total}] Dính bản quyền: ${finishedJob.restriction || ''} (Đã dọn file tạm)`,
              },
              [v.video_id]: {
                bkt_check_status: 'red_matched',
                bkt_restriction: `[${stepIndex}/${total}] Dính bản quyền: ${finishedJob.restriction || ''} (Đã dọn file tạm)`,
              },
            }));
            toast.warning({
              title: `Video ${stepIndex}/${total} Dính Bản Quyền`,
              message: `"${v.title}" bị hạn chế bởi Content ID. Đã dừng xuất bản và dọn dẹp file tạm.`,
            });
          } else if (finishedJob.status === 'published') {
            successCount++;
            redCount = nextSequentialRedCount(redCount, 'green_clean');
            setVideoOverrides((prev) => ({
              ...prev,
              [targetId]: {
                bkt_check_status: 'green_clean',
                bkt_restriction: finishedJob.restriction,
              },
              [v.video_id]: {
                bkt_check_status: 'green_clean',
                bkt_restriction: finishedJob.restriction,
              },
            }));
          } else if (finishedJob.status === 'failed' || finishedJob.status === 'publish_failed') {
            failedCount++;
            const errMsg =
              finishedJob.errorMessage || finishedJob.restriction || 'Kiểm tra BKT thất bại';
            const failedStatus =
              finishedJob.status === 'publish_failed' ? 'publish_failed' : 'failed';
            setVideoOverrides((prev) => ({
              ...prev,
              [targetId]: {
                bkt_check_status: failedStatus,
                bkt_restriction: `[${stepIndex}/${total}] Lỗi BKT: ${errMsg}`,
              },
              [v.video_id]: {
                bkt_check_status: failedStatus,
                bkt_restriction: `[${stepIndex}/${total}] Lỗi BKT: ${errMsg}`,
              },
            }));
            toast.error({
              title: `Video ${stepIndex}/${total} Thất Bại`,
              message: `"${v.title}": ${errMsg}`,
            });
          }
        } catch (waitErr) {
          console.error(`Lỗi khi chờ BKT video ${v.title}:`, waitErr);
          failedCount++;
          const errMsg = String(waitErr || 'Hết thời gian chờ hoặc tiến trình bị ngắt');
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: {
              bkt_check_status: 'failed',
              bkt_restriction: `[${stepIndex}/${total}] Lỗi BKT: ${errMsg}`,
            },
            [v.video_id]: {
              bkt_check_status: 'failed',
              bkt_restriction: `[${stepIndex}/${total}] Lỗi BKT: ${errMsg}`,
            },
          }));
        }
      }

      // BƯỚC 5: Sau khi xong 5 video mới nhất -> Chuyển kênh sang chế độ Real-time RSS Polling tự động nếu có video thành công
      if (resolvedChannel?.id) {
        if (successCount > 0) {
          await toggleChannelAutoDownload(resolvedChannel.id, true);
          await updateChannelBktConfig({
            channelId: resolvedChannel.id,
            bktTestMode: true,
            bktProfileId: targetProfileId,
          });
          await refreshChannels();
          toast.success({
            title: 'Hoàn tất Toàn bộ Chu trình Top 5!',
            message: `Đã xử lý xong: ${successCount} video đăng thành công, ${redCount} video cảnh báo, ${failedCount} video lỗi. Kênh đối thủ đã được kích hoạt Real-time RSS Polling để tiếp tục theo dõi các video tương lai!`,
          });
        } else {
          toast.warning({
            title: 'Tạm dừng kích hoạt Auto-Pilot',
            message: `Toàn bộ video trong đợt quét đều không thành công (${failedCount} lỗi, ${redCount} cảnh báo). Hệ thống không kích hoạt Auto-Download để tránh lặp lỗi. Vui lòng kiểm tra lại Hồ sơ Kênh Test hoặc Proxy trước khi thử lại.`,
          });
        }
      }
    } catch (err) {
      console.error('Lỗi quy trình tuần tự Top 5:', err);
      toast.error({
        title: 'Lỗi thực thi quy trình tuần tự',
        message: String(err),
      });
    } finally {
      setIsSequentialTop5Running(false);
      setSequentialProgressText('');
    }
  };

  const handleBatchBktSelected = async () => {
    const selectedList = filteredAndSortedVideos.filter((v) => selectedVideoIds.has(v.video_id));
    if (selectedList.length === 0) return;

    setIsBatchTestingBkt(true);
    let successCount = 0;
    const newOverrides: Record<string, Partial<ChannelVideo>> = {};
    const toDownloadList: ChannelVideo[] = [];
    const bktItemsToDispatch: BktBatchItemRequest[] = [];

    try {
      for (const v of selectedList) {
        const filePath = await getChannelVideoFilepath(v.video_id);
        if (filePath) {
          const aiTitle = getBestAutoPilotTitle(v.title);
          const adaptedDesc = adaptCompetitorDescription({
            originalDescription: '',
            targetChannelName: channel?.name || channelName,
            videoTitle: aiTitle,
            includeFairUseDisclaimer: true,
          });
          const thumbPath = getCompanionThumbnailPath(filePath);
          const targetProfileId = channel?.target_profile_id || channel?.bkt_profile_id || null;

          bktItemsToDispatch.push({
            videoTitle: v.title,
            videoPath: filePath,
            videoSourceType: 'channel_video',
            sourceRefId: v.id || v.video_id,
            channelId: channel?.id,
            mainTargetProfileId: targetProfileId,
            targetProfileId: targetProfileId,
            autoPublishMain: false,
            targetTitle: aiTitle,
            targetDescription: adaptedDesc,
            thumbnailPath: thumbPath,
          });

          newOverrides[v.id || v.video_id] = {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang gửi lên Kênh Test BKT...',
          };
          newOverrides[v.video_id] = {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang gửi lên Kênh Test BKT...',
          };
        } else {
          toDownloadList.push(v);
        }
      }

      if (bktItemsToDispatch.length > 0) {
        const dispatchRes = await dispatchBatchBktTest({
          items: bktItemsToDispatch,
          targetTestChannelId: undefined,
        });
        successCount = dispatchRes.totalDispatched;
      }

      if (toDownloadList.length > 0) {
        onDownloadSelected(toDownloadList);
        for (const v of toDownloadList) {
          newOverrides[v.id || v.video_id] = {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang tải video về máy...',
          };
          newOverrides[v.video_id] = {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang tải video về máy...',
          };
        }
      }
    } catch (err) {
      console.error('Batch BKT test item failed:', err);
    }

    setVideoOverrides((prev) => ({ ...prev, ...newOverrides }));
    setIsBatchTestingBkt(false);

    if (successCount > 0 || toDownloadList.length > 0) {
      toast.success({
        title: 'Đã kích hoạt BKT Test',
        description: `Đã đưa ${successCount} video vào Kênh Test BKT${toDownloadList.length > 0 ? ` (và đang tải ${toDownloadList.length} video)` : ''}.`,
      });
    } else {
      toast.error({
        title: 'Lỗi gửi test BKT',
        description: 'Không thể kích hoạt test bản quyền cho các video đã chọn.',
      });
    }
  };

  const handleTriggerBktTest = async (videoId: string, dbId?: string, channelId?: string) => {
    const targetId = dbId || videoId;
    const targetVideo = videos.find((v) => v.id === targetId || v.video_id === videoId);
    if (!targetVideo) return;

    const resolvedChannel =
      channel || (channelId ? followedChannels.find((c) => c.id === channelId) : undefined);

    setTestingVideoId(targetId);
    try {
      const filePath = await getChannelVideoFilepath(videoId);
      if (!filePath) {
        toast.info({
          title: 'Đang tải video về máy...',
          message:
            'Video chưa có sẵn trên máy. Đang bắt đầu tải video để chuẩn bị chạy Reup & Test BKT.',
        });
        onDownloadSelected([targetVideo]);
        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang tải video về máy...',
          },
          [videoId]: {
            status: 'downloading',
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang tải video về máy...',
          },
        }));
        return;
      }

      const aiTitle = getBestAutoPilotTitle(targetVideo.title);
      const adaptedDesc = adaptCompetitorDescription({
        originalDescription: '',
        targetChannelName: resolvedChannel?.name || channelName,
        videoTitle: aiTitle,
        includeFairUseDisclaimer: true,
      });
      const thumbPath = getCompanionThumbnailPath(filePath);
      const targetProfileId =
        resolvedChannel?.target_profile_id || resolvedChannel?.bkt_profile_id || null;

      await dispatchBatchBktTest({
        items: [
          {
            videoTitle: targetVideo.title,
            videoPath: filePath,
            videoSourceType: 'channel_video',
            sourceRefId: targetId,
            channelId: resolvedChannel?.id,
            mainTargetProfileId: targetProfileId,
            targetProfileId: targetProfileId,
            autoPublishMain: true,
            targetTitle: aiTitle,
            targetDescription: adaptedDesc,
            thumbnailPath: thumbPath,
          },
        ],
        targetTestChannelId: undefined,
      });

      setVideoOverrides((prev) => ({
        ...prev,
        [targetId]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang chạy Reup Lv.1 & gửi lên Kênh Test BKT...',
        },
        [videoId]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang chạy Reup Lv.1 & gửi lên Kênh Test BKT...',
        },
      }));

      toast.success({
        title: 'Kích hoạt Test BKT thành công',
        message: targetProfileId
          ? `Đang chạy Reup Lv.1, upload test và sẽ tự động đăng lên Kênh Đích (${targetProfileId}) khi Sạch Bản Quyền!`
          : 'Đang chạy Reup Lv.1 và kiểm tra bản quyền ngầm trên Kênh Test BKT.',
      });
    } catch (e) {
      console.error('Trigger BKT test failed:', e);
      toast.error({
        title: 'Lỗi kích hoạt Test BKT',
        message: String(e),
      });
    } finally {
      setTestingVideoId(null);
    }
  };

  const videoCounts = useMemo(() => {
    let regular = 0;
    let shorts = 0;
    let stream = 0;
    for (const v of videos) {
      const vt = v.video_type || '';
      if (vt === 'stream' || vt === 'live' || v.url.includes('/live/')) {
        stream++;
      } else if (vt === 'shorts' || vt === 'short' || v.url.includes('/shorts/')) {
        shorts++;
      } else {
        regular++;
      }
    }
    return { regular, shorts, stream };
  }, [videos]);

  const filteredAndSortedVideos = useMemo(() => {
    // 0. Merge state overrides
    const listMerged = videos.map((v) => {
      const override = (v.id && videoOverrides[v.id]) || videoOverrides[v.video_id];
      return override ? { ...v, ...override } : v;
    });

    // 1. Tab filter
    let list = listMerged.filter((v) => {
      if (filterType === 'all') return true;
      const vt = v.video_type || '';
      const resolvedType =
        vt === 'stream' || vt === 'live' || v.url.includes('/live/')
          ? 'stream'
          : vt === 'shorts' || vt === 'short' || v.url.includes('/shorts/')
            ? 'shorts'
            : 'video';
      return resolvedType === filterType;
    });

    // 2. Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((v) => (v.title || '').toLowerCase().includes(query));
    }

    // 2.5 Time filter (3 days, 7 days)
    if (timeFilter === '3d') {
      const limitSec = Math.floor(Date.now() / 1000) - 3 * 86400;
      list = list.filter((v) => (v.upload_timestamp ?? 0) >= limitSec);
    } else if (timeFilter === '7d') {
      const limitSec = Math.floor(Date.now() / 1000) - 7 * 86400;
      list = list.filter((v) => (v.upload_timestamp ?? 0) >= limitSec);
    }

    // 3. Sorting
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') {
        return parseVideoUploadEpoch(b) - parseVideoUploadEpoch(a);
      }
      if (sortBy === 'oldest') {
        return parseVideoUploadEpoch(a) - parseVideoUploadEpoch(b);
      }
      if (sortBy === 'views_desc') {
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      }
      if (sortBy === 'duration_desc') {
        return (b.duration ?? 0) - (a.duration ?? 0);
      }
      if (sortBy === 'duration_asc') {
        return (a.duration ?? 0) - (b.duration ?? 0);
      }
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });
  }, [videos, filterType, searchQuery, sortBy, videoOverrides, timeFilter]);

  const [visibleCount, setVisibleCount] = useState<number>(30);
  const filterKey = `${searchQuery}:${filterType}:${timeFilter}:${sortBy}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(30);
  }

  const visibleVideos = useMemo(() => {
    return filteredAndSortedVideos.slice(0, visibleCount);
  }, [filteredAndSortedVideos, visibleCount]);

  const latestBktJobMap = useMemo(() => {
    const map = new Map<string, BktTestJob>();
    for (const job of bktJobs) {
      if (!job.sourceRefId) continue;
      const existing = map.get(job.sourceRefId);
      if (!existing) {
        map.set(job.sourceRefId, job);
      } else {
        const left = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
        const right = Date.parse(job.updatedAt || job.createdAt || '') || 0;
        if (right > left) {
          map.set(job.sourceRefId, job);
        }
      }
    }
    return map;
  }, [bktJobs]);

  const allFilteredSelected = useMemo(() => {
    if (filteredAndSortedVideos.length === 0) return false;
    return filteredAndSortedVideos.every((v) => selectedVideoIds.has(v.video_id));
  }, [filteredAndSortedVideos, selectedVideoIds]);

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      onDeselectAll();
    } else {
      onSelectAll(filteredAndSortedVideos.map((v) => v.video_id));
    }
  };

  const selectedCount = useMemo(() => {
    return filteredAndSortedVideos.filter((v) => selectedVideoIds.has(v.video_id)).length;
  }, [filteredAndSortedVideos, selectedVideoIds]);

  return (
    <div className="border-t border-border/50 bg-background/50 p-4 sm:p-5 flex flex-col gap-3.5">
      {/* Top Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm tiêu đề video đối thủ..."
            className="pl-8 pr-8 h-8 text-xs bg-muted/40 border-border/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Selector & Batch Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Sắp xếp Viral / Lượt xem / Thời lượng */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline flex items-center gap-1">
              <ArrowDownUp className="w-3 h-3" />
              Sắp xếp:
            </span>
            <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
              <SelectTrigger className="h-8 text-xs min-w-[145px] bg-muted/40 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="text-xs">
                  Mới nhất
                </SelectItem>
                <SelectItem value="views_desc" className="text-xs">
                  Xem nhiều nhất (Viral)
                </SelectItem>
                <SelectItem value="duration_desc" className="text-xs">
                  Dài nhất (Thời lượng)
                </SelectItem>
                <SelectItem value="duration_asc" className="text-xs">
                  Ngắn nhất (Thời lượng)
                </SelectItem>
                <SelectItem value="oldest" className="text-xs">
                  Cũ nhất
                </SelectItem>
                <SelectItem value="title_asc" className="text-xs">
                  Tiêu đề A-Z
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Batch download action */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleSelectAll}
              className="h-8 text-xs gap-1.5"
              disabled={filteredAndSortedVideos.length === 0}
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>{allFilteredSelected ? 'Bỏ chọn' : 'Chọn tất cả'}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const selectedList = filteredAndSortedVideos.filter((v) =>
                  selectedVideoIds.has(v.video_id),
                );
                onDownloadSelected(selectedList);
              }}
              disabled={selectedCount === 0 || isDownloading}
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải {selectedCount} video</span>
            </Button>

            {selectedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchBktSelected}
                disabled={isBatchTestingBkt}
                className="h-8 text-xs gap-1.5 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-medium"
                title="Gửi các video đã chọn vào hàng đợi Kênh Test Bản Quyền"
              >
                {isBatchTestingBkt ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                ) : (
                  <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Test BKT ({selectedCount})</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSequentialTop5AutoPilot}
              disabled={isSequentialTop5Running || filteredAndSortedVideos.length === 0}
              className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
              title="Tự động lấy 5 video mới nhất, tải lần lượt 1-by-1 -> Reup Lv.1 -> Test BKT Studio -> Đăng Kênh Đích -> Tự động xóa file giải phóng ổ cứng sau mỗi video -> Kích hoạt Real-time Polling"
            >
              {isSequentialTop5Running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              ) : (
                <PlaySquare className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>
                {isSequentialTop5Running
                  ? sequentialProgressText
                  : 'Reup Tuần Tự Top 5 (Tối Ưu Đĩa)'}
              </span>
            </Button>

            {isSequentialTop5Running && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopSequentialTop5}
                className="h-8 text-xs gap-1.5 font-semibold bg-red-600 hover:bg-red-700 text-white"
                title="Dừng chu trình tuần tự ngay lập tức"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Dừng lại</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs, Time Window & Quick Selection */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Filter Tabs (All / Video / Shorts / Stream) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs w-fit">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors',
              filterType === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tất cả ({videos.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('video')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'video'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Film className="w-3 h-3 text-primary" />
            Video dài ({videoCounts.regular})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('shorts')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'shorts'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <PlaySquare className="w-3 h-3 text-rose-500" />
            Shorts ({videoCounts.shorts})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('stream')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'stream'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Radio className="w-3 h-3 text-red-500" />
            Trực tiếp ({videoCounts.stream})
          </button>
        </div>

        {/* Time Window (All / 3 Days / 7 Days) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
          <span className="text-[10px] text-muted-foreground px-1.5 font-medium flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Khung giờ:
          </span>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('3d')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === '3d'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            3 ngày qua
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('7d')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === '7d'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            7 ngày qua
          </button>
        </div>

        {/* Quick Pick (Top 5 / Top 10 / Top 20) */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>Chọn nhanh:</span>
          {[5, 10, 20].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                const slice = filteredAndSortedVideos.slice(0, num);
                onDeselectAll();
                for (const v of slice) {
                  onToggleVideoSelection(v.video_id);
                }
              }}
              className="px-2 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground border border-border/40 text-[10px] font-semibold transition-colors"
            >
              Top {num}
            </button>
          ))}
        </div>
      </div>

      {/* Video List */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Đang tải danh sách video...
        </div>
      ) : filteredAndSortedVideos.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/60">
          {searchQuery
            ? 'Không tìm thấy video nào khớp với từ khóa tìm kiếm.'
            : 'Chưa có video nào thuộc danh mục này trong cơ sở dữ liệu.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-border/40 rounded-lg border border-border/40 bg-card overflow-hidden max-h-[460px] overflow-y-auto">
          {visibleVideos.map((video) => {
            const isSelected = selectedVideoIds.has(video.video_id);
            const isDownloaded = video.status === 'downloaded';
            const viewsStr = formatCompactViews(video.view_count);

            return (
              <div
                key={video.id || video.video_id}
                className={cn(
                  'flex items-center gap-3 p-3 transition-colors hover:bg-muted/40',
                  isSelected && 'bg-primary/5',
                )}
              >
                {/* Select Checkbox */}
                <button
                  type="button"
                  onClick={() => onToggleVideoSelection(video.video_id)}
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
                        title={
                          video.risk_reason || 'Kênh ngách an toàn / Chưa phát hiện tiền sử gậy'
                        }
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
                              video.bkt_restriction ||
                              video.risk_reason ||
                              'YouTube phát hiện bản quyền'
                            }
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>
                              BKT: Dính ({video.bkt_restriction || video.risk_reason || 'Bản quyền'}
                              ) -&gt; Lv.2
                            </span>
                          </Badge>
                        )}
                        {video.bkt_check_status === 'failed' && (
                          <Badge
                            variant="outline"
                            className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                            title={
                              video.bkt_restriction || video.risk_reason || 'Tiến trình BKT gặp lỗi'
                            }
                          >
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span>
                              BKT: Lỗi (
                              {video.bkt_restriction || video.risk_reason || 'Kiểm tra thất bại'})
                            </span>
                          </Badge>
                        )}
                        {video.bkt_check_status === 'publish_failed' && (
                          <Badge
                            variant="outline"
                            className="bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                            title={
                              video.bkt_restriction || 'BKT sạch; bước đăng Kênh Đích thất bại'
                            }
                          >
                            <AlertCircle className="w-3 h-3 text-orange-400" />
                            <span>BKT: Sạch, đăng lỗi</span>
                          </Badge>
                        )}
                        {(!video.bkt_check_status || video.bkt_check_status === 'pending') &&
                          (() => {
                            const activePhase =
                              activeJobPhases[video.id] || activeJobPhases[video.video_id] || '';
                            const isBusy = Boolean(activePhase);
                            const liveLabel =
                              video.bkt_restriction ||
                              video.risk_reason ||
                              'BKT: Chờ YouTube Check';
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
                    const linkedJob =
                      (video.id && latestBktJobMap.get(video.id)) ||
                      (video.video_id && latestBktJobMap.get(video.video_id));
                    if (!linkedJob) return null;
                    const actionBusy = jobActionId === linkedJob.id;
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
                            onClick={() => handleBktJobAction(linkedJob, 'publish')}
                            disabled={actionBusy}
                            className="h-7 px-2 text-[11px] gap-1 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 font-medium"
                            title="Video đã sạch bản quyền; đăng ngay lên Kênh Đích"
                          >
                            {actionBusy ? (
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
                            onClick={() => handleBktJobAction(linkedJob, 'publish')}
                            disabled={actionBusy}
                            className="h-7 px-2 text-[11px] gap-1 border-orange-500/40 text-orange-500 hover:bg-orange-500/10 font-medium"
                            title="Giữ video đã tải về; chỉ chạy lại bước đăng bị lỗi"
                          >
                            {actionBusy ? (
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
                            onClick={() => handleBktJobAction(linkedJob, 'retry')}
                            disabled={actionBusy}
                            className="h-7 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-medium"
                            title="Mở đúng kênh test và kiểm tra lại upload/Content ID"
                          >
                            {actionBusy ? (
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
                          onClick={() =>
                            handleTriggerBktTest(video.video_id, video.id, video.channel_id)
                          }
                          disabled={testingVideoId === (video.id || video.video_id)}
                          className="h-7 px-2 text-[11px] gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
                          title="Tải về (nếu chưa có), chạy Reup Pipeline Lv.1 và tải lên kênh BKT để test nhận diện"
                        >
                          <FlaskConical
                            className={cn(
                              'w-3 h-3 text-amber-500',
                              testingVideoId === (video.id || video.video_id) && 'animate-spin',
                            )}
                          />
                          <span>Test BKT</span>
                        </Button>
                      )
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
                    <Badge
                      variant="outline"
                      className="text-xs text-muted-foreground/70 border-dashed"
                    >
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
          })}
          {filteredAndSortedVideos.length > visibleCount && (
            <div className="flex items-center justify-between p-3 bg-muted/20 border-t border-border/40 text-xs text-muted-foreground">
              <span>
                Đang hiển thị {visibleCount} / {filteredAndSortedVideos.length} video
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((prev) => Math.min(prev + 30, filteredAndSortedVideos.length))
                  }
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Tải thêm (+30)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(filteredAndSortedVideos.length)}
                  className="h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Hiển thị tất cả
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
