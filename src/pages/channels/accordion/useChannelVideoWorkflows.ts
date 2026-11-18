import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  canPublishBktStatus,
  nextSequentialRedCount,
} from '@/contexts/channels/channel-flow-safety';
import {
  cancelAllBktJobs,
  dispatchBatchBktTest,
  getBktTestJobs,
  getChannelVideoEditedFilepath,
  getChannelVideoFilepath,
  publishBktJobToMain,
  recheckBktJob,
  toggleChannelAutoDownload,
  updateChannelBktConfig,
  waitBktJobCompletion,
} from '@/contexts/channels/channels-client';
import { useChannels } from '@/contexts/channels-context';
import { formatEta } from '@/lib/format-eta';
import type { BktBatchItemRequest, BktTestJob, ChannelVideo, FollowedChannel } from '@/lib/types';
import { parseVideoUploadEpoch } from '@/pages/channels/channelUtils';
import {
  adaptCompetitorDescription,
  getBestAutoPilotTitle,
  getCompanionThumbnailPath,
} from '@/utils/reup-auto-pilot';
import type { ActiveJobPhasesMap, VideoOverridesMap } from './types';

interface UseChannelVideoWorkflowsParams {
  channelName: string;
  videos: ChannelVideo[];
  filteredAndSortedVideos: ChannelVideo[];
  selectedVideoIds: Set<string>;
  onDownloadSelected: (videos: ChannelVideo[]) => void;
  channel?: FollowedChannel;
}

export function useChannelVideoWorkflows({
  channelName,
  videos,
  filteredAndSortedVideos,
  selectedVideoIds,
  onDownloadSelected,
  channel,
}: UseChannelVideoWorkflowsParams) {
  const toast = useToast();
  const { followedChannels, refreshChannels } = useChannels();
  const [testingVideoId, setTestingVideoId] = useState<string | null>(null);
  const [bktJobs, setBktJobs] = useState<BktTestJob[]>([]);
  const [jobActionId, setJobActionId] = useState<string | null>(null);
  const [isBatchTestingBkt, setIsBatchTestingBkt] = useState<boolean>(false);
  const [isSequentialTop5Running, setIsSequentialTop5Running] = useState<boolean>(false);
  const [sequentialProgressText, setSequentialProgressText] = useState<string>('');
  const sequentialProgressTextRef = useRef('');
  sequentialProgressTextRef.current = sequentialProgressText;
  const [isBatchReupPublishing, setIsBatchReupPublishing] = useState<boolean>(false);
  const [batchReupProgressText, setBatchReupProgressText] = useState<string>('');
  const [videoOverrides, setVideoOverrides] = useState<VideoOverridesMap>({});
  const [activeJobPhases, setActiveJobPhases] = useState<ActiveJobPhasesMap>({});
  const sequentialStopRequestedRef = useRef<boolean>(false);
  const batchReupStopRequestedRef = useRef<boolean>(false);
  const videosRef = useRef<ChannelVideo[]>(videos);
  videosRef.current = videos;
  const testingVideoIdRef = useRef<string | null>(testingVideoId);

  useEffect(() => {
    testingVideoIdRef.current = testingVideoId;
  }, [testingVideoId]);

  useEffect(() => {
    let cancelled = false;
    getBktTestJobs(300)
      .then((jobs) => {
        if (!cancelled) {
          setBktJobs(jobs);
          const activePhases: ActiveJobPhasesMap = {};
          const overrides: VideoOverridesMap = {};
          const ACTIVE_STATUSES = [
            'pending',
            'downloading',
            'reup_processing',
            'uploading',
            'studio_checking',
            'publishing',
          ];
          for (const job of jobs) {
            if (job.sourceRefId && ACTIVE_STATUSES.includes(job.status)) {
              activePhases[job.sourceRefId] = job.status;
              overrides[job.sourceRefId] = {
                is_bkt_test: true,
                bkt_check_status: 'pending',
                bkt_restriction: job.restriction || `Đang xử lý (${job.status})...`,
              };
            }
          }
          if (Object.keys(activePhases).length > 0) {
            setActiveJobPhases((prev) => ({ ...prev, ...activePhases }));
          }
          if (Object.keys(overrides).length > 0) {
            setVideoOverrides((prev) => ({ ...prev, ...overrides }));
          }
        }
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
          | 'reuping'
          | 'uploading'
          | 'checking'
          | 'publishing'
          | 'published'
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
          job.status === 'reuping' ||
          job.status === 'publishing'
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
                : job.status === 'publishing'
                  ? 'Đang xuất bản lên Kênh Đích...'
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

    let unlistenReup: (() => void) | undefined;
    listen<{
      percent: number;
      speed?: string;
      fps?: number;
      eta_seconds?: number;
      status: string;
    }>('reup-pipeline-progress', (event) => {
      if (cancelled) return;
      const p = event.payload;
      if (!p) return;
      const vId = testingVideoIdRef.current;
      if (!vId) return;

      const etaStr = formatEta(p.eta_seconds);
      const speedStr = p.speed || (p.fps ? `${p.fps.toFixed(0)} fps` : '');
      const restriction = `Đang render Reup: ${p.percent.toFixed(0)}%${speedStr ? ` (${speedStr})` : ''} • ${etaStr}`;

      setVideoOverrides((prev) => ({
        ...prev,
        [vId]: {
          ...prev[vId],
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: restriction,
        },
      }));
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenReup = fn;
      }
    });

    let unlistenDownload: (() => void) | undefined;
    listen<{
      id: string;
      status: string;
      error_message?: string;
      percent?: number;
      speed?: string;
      eta?: string;
    }>('download-progress', (event) => {
      if (cancelled) return;
      const p = event.payload;
      if (!p) return;
      if (p.status === 'downloading') {
        const vId = testingVideoIdRef.current;
        const etaStr = p.eta ? ` • ${formatEta(p.eta)}` : '';
        const speedStr = p.speed ? ` • ${p.speed}` : '';
        const dlLabel = `Đang tải: ${Math.round(p.percent || 0)}%${speedStr}${etaStr}`;
        if (vId) {
          setVideoOverrides((prev) => ({
            ...prev,
            [vId]: {
              ...prev[vId],
              status: 'downloading',
              bkt_restriction: dlLabel,
            },
          }));
        }
        if (sequentialProgressTextRef.current) {
          setSequentialProgressText((prev) => {
            if (!prev) return prev;
            const match = prev.match(/Video \d+\/\d+:/);
            const prefix = match ? match[0] : 'Auto-Pilot:';
            return `${prefix} ${dlLabel}`;
          });
        }
      } else if (p.status === 'error') {
        const rawErr = p.error_message || '';
        let msg = rawErr;
        if (rawErr.includes("confirm you're not a bot") || rawErr.includes('Sign in to confirm')) {
          msg = 'YouTube chặn bot. Đang tự động trích xuất Cookie từ Hồ sơ Test...';
        }
        const vId = testingVideoIdRef.current;
        if (vId) {
          setVideoOverrides((prev) => ({
            ...prev,
            [vId]: {
              ...prev[vId],
              status: 'new',
              bkt_restriction: `Lỗi tải: ${msg}`,
            },
          }));
        }
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenDownload = fn;
      }
    });

    let unlistenReupPipeline: (() => void) | undefined;
    listen<{
      percent: number;
      speed?: string;
      fps?: number;
      eta_seconds?: number;
      status: string;
    }>('reup-pipeline-progress', (event) => {
      if (cancelled) return;
      const p = event.payload;
      if (!p) return;
      const vId = testingVideoIdRef.current;
      const etaStr = p.eta_seconds != null ? ` • ${formatEta(p.eta_seconds)}` : '';
      const speedStr = p.speed ? ` • ${p.speed}` : '';
      const progressLabel = `Đang Reup: ${Math.round(p.percent)}%${speedStr}${etaStr}`;
      if (vId) {
        setVideoOverrides((prev) => ({
          ...prev,
          [vId]: {
            ...prev[vId],
            bkt_restriction: progressLabel,
          },
        }));
      }
      if (sequentialProgressTextRef.current) {
        setSequentialProgressText((prev) => {
          if (!prev) return prev;
          const match = prev.match(/Video \d+\/\d+:/);
          const prefix = match ? match[0] : 'Auto-Pilot:';
          return `${prefix} ${progressLabel}`;
        });
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenReupPipeline = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (unlistenReup) unlistenReup();
      if (unlistenDownload) unlistenDownload();
      if (unlistenReupPipeline) unlistenReupPipeline();
    };
  }, []);

  const handleRunSequentialTop5AutoPilot = async () => {
    if (isSequentialTop5Running) return;

    const resolvedChannel = channel || followedChannels.find((c) => c.name === channelName);

    // 1. Sắp xếp danh sách video theo thời gian đăng mới nhất (loại bỏ video live/stream, Shorts và video đã xuất bản)
    const validVideos = videos.filter((v) => {
      // Loại bỏ video đã được xuất bản lên Kênh Đích để tuyệt đối không đăng trùng
      const isAlreadyPublished =
        v.target_published === 1 ||
        v.bkt_check_status === 'published' ||
        v.bkt_restriction?.includes('Đã xuất bản') ||
        v.bkt_restriction?.includes('xuất bản Công khai');
      if (isAlreadyPublished) return false;

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
    let _failedCount = 0;

    try {
      for (let idx = 0; idx < top5.length; idx++) {
        if (sequentialStopRequestedRef.current) break;

        const v = top5[idx];
        const stepIndex = idx + 1;
        const total = top5.length;
        const targetId = v.id || v.video_id;

        setSequentialProgressText(`Video ${stepIndex}/${total}: Đang tải...`);

        // Bước A: Kiểm tra xem đã có video tải sẵn hay chưa, nếu chưa thì tải 1 video này
        let filePath = await getChannelVideoFilepath(v.video_id);
        if (!filePath) {
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: {
              status: 'downloading',
              bkt_restriction: `[${stepIndex}/${total}] Đang tải video gốc về máy...`,
            },
            [v.video_id]: {
              status: 'downloading',
              bkt_restriction: `[${stepIndex}/${total}] Đang tải video gốc về máy...`,
            },
          }));

          onDownloadSelected([v]);

          // Chờ cho đến khi file tải về xong trên đĩa (tối đa 600 giây)
          let waitAttempts = 0;
          while (!filePath && waitAttempts < 300) {
            if (sequentialStopRequestedRef.current) break;
            await new Promise((r) => setTimeout(r, 2000));
            filePath = await getChannelVideoFilepath(v.video_id);
            waitAttempts++;
          }
        }

        if (sequentialStopRequestedRef.current) break;

        if (!filePath) {
          _failedCount++;
          toast.error({
            title: `Bỏ qua Video ${stepIndex}/${total}`,
            message: `Không thể tải về tệp video "${v.title}". Chuyển sang video tiếp theo.`,
          });
          continue;
        }

        // Bước B: Chuẩn bị AI Title, Description và Thumbnail
        setSequentialProgressText(`Video ${stepIndex}/${total}: Chuẩn bị Reup...`);
        const aiTitle = getBestAutoPilotTitle(v.title);
        const adaptedDesc = adaptCompetitorDescription({
          originalDescription: '',
          targetChannelName: resolvedChannel?.name || channelName,
          videoTitle: aiTitle,
          includeFairUseDisclaimer: true,
        });
        const thumbPath = getCompanionThumbnailPath(filePath);

        // Bước C: Gửi vào BKT Test Channel và yêu cầu tự động Publish nếu Clean
        setSequentialProgressText(`Video ${stepIndex}/${total}: Test BKT & Kiểm tra...`);
        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: `[${stepIndex}/${total}] Đang Reup Lv.1 & gửi lên Kênh Test BKT...`,
          },
          [v.video_id]: {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: `[${stepIndex}/${total}] Đang Reup Lv.1 & gửi lên Kênh Test BKT...`,
          },
        }));

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
              autoPublishMain: false,
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
          _failedCount++;
          toast.error({
            title: `Lỗi dispatch Video ${stepIndex}/${total}`,
            message: dispatchedJob?.error || 'Không thể tạo tác vụ BKT Test.',
          });
          continue;
        }

        const jobId = dispatchedJob.jobId;

        // Bước D: Đợi kết quả BKT kiểm duyệt từ YouTube Studio (timeout 7200s)
        const finishedJob = await waitBktJobCompletion(jobId, 7200);
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
          redCount = nextSequentialRedCount(redCount, finishedJob.status);
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: {
              bkt_check_status: 'green_clean',
              bkt_restriction: `[${stepIndex}/${total}] Đã xuất bản thành công lên Kênh Đích!`,
            },
            [v.video_id]: {
              bkt_check_status: 'green_clean',
              bkt_restriction: `[${stepIndex}/${total}] Đã xuất bản thành công lên Kênh Đích!`,
            },
          }));
          toast.success({
            title: `Video ${stepIndex}/${total} Đã Đăng Thành Công!`,
            message: `"${aiTitle}" đã được đăng tải và dọn dẹp bộ nhớ đệm an toàn.`,
          });
        } else {
          _failedCount++;
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: {
              bkt_check_status:
                finishedJob.status === 'publish_failed' ? 'publish_failed' : 'failed',
              bkt_restriction: `[${stepIndex}/${total}] ${finishedJob.restriction || finishedJob.errorMessage || 'Lỗi kiểm tra bản quyền'}`,
            },
            [v.video_id]: {
              bkt_check_status:
                finishedJob.status === 'publish_failed' ? 'publish_failed' : 'failed',
              bkt_restriction: `[${stepIndex}/${total}] ${finishedJob.restriction || finishedJob.errorMessage || 'Lỗi kiểm tra bản quyền'}`,
            },
          }));
          toast.error({
            title: `Video ${stepIndex}/${total} Thất bại`,
            message:
              finishedJob.restriction || finishedJob.errorMessage || 'Tiến trình BKT bị lỗi.',
          });
          break;
        }

        // Tự động giải phóng bộ nhớ đệm giữa các video
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Kích hoạt Real-time Auto Download RSS nếu đã xử lý thành công ít nhất 1 video
      if (successCount > 0 && resolvedChannel?.id) {
        try {
          await toggleChannelAutoDownload(resolvedChannel.id, true);
          await updateChannelBktConfig({
            channelId: resolvedChannel.id,
            bktTestMode: true,
            bktProfileId: targetProfileId,
          });
          await refreshChannels();
          toast.success({
            title: 'Kích hoạt Real-time Polling',
            message:
              'Đã tự động kích hoạt tính năng Tải ngầm & Reup thời gian thực cho kênh đối thủ này!',
          });
        } catch (e) {
          console.warn('Auto toggle channel real-time failed:', e);
        }
      }
    } catch (e) {
      console.error('Sequential Top 5 process error:', e);
      toast.error({
        title: 'Lỗi Chu trình Reup Tuần Tự',
        message: String(e),
      });
    } finally {
      setIsSequentialTop5Running(false);
      setSequentialProgressText('');
      setBktJobs(await getBktTestJobs(300).catch(() => []));
    }
  };

  const handleDirectEditAndPublishSingle = async (v: ChannelVideo) => {
    const resolvedChannel = channel || followedChannels.find((c) => c.name === channelName);
    const targetProfileId =
      resolvedChannel?.target_profile_id || resolvedChannel?.bkt_profile_id || null;

    if (!targetProfileId) {
      toast.warning({
        title: 'Chưa cấu hình Kênh Đích',
        message:
          'Vui lòng gán Hồ Sơ Kênh Đích (Target Profile) cho kênh này trước khi chạy quy trình xuất bản.',
      });
      return;
    }

    const targetId = v.id || v.video_id;

    // 0. Nếu video đã có BKT job ở trạng thái đã xuất bản hoặc đang đăng, ngăn chặn tuyệt đối việc đăng trùng lặp
    const existingJob = bktJobs.find(
      (j) => j.sourceRefId === targetId || j.sourceRefId === v.video_id,
    );
    if (existingJob && existingJob.status === 'published') {
      toast.info({
        title: 'Video đã được xuất bản',
        message: 'Video này đã được đăng thành công lên Kênh Đích từ trước, không cần tải lại.',
      });
      return;
    }
    if (existingJob && existingJob.status === 'publishing') {
      toast.info({
        title: 'Đang tiến hành xuất bản',
        message: 'Video này đang trong quá trình tải lên Kênh Đích. Vui lòng đợi hoàn tất.',
      });
      return;
    }
    if (existingJob && canPublishBktStatus(existingJob.status)) {
      await handleBktJobAction(existingJob, 'publish');
      return;
    }

    setTestingVideoId(targetId);
    try {
      // 1. Ưu tiên kiểm tra xem video này đã có file edit sẵn trên đĩa hay chưa
      const editedPath = await getChannelVideoEditedFilepath(v.video_id);
      let filePath = editedPath;
      if (!filePath) {
        filePath = await getChannelVideoFilepath(v.video_id);
      }

      if (!filePath) {
        toast.error({
          title: 'Tệp video không tồn tại',
          message: 'Không tìm thấy tệp video trên ổ cứng. Vui lòng tải lại video trước.',
        });
        return;
      }

      const hasEditedReady = Boolean(editedPath);
      const aiTitle = getBestAutoPilotTitle(v.title);
      const adaptedDesc = adaptCompetitorDescription({
        originalDescription: '',
        targetChannelName: resolvedChannel?.name || channelName,
        videoTitle: aiTitle,
        includeFairUseDisclaimer: true,
      });
      const thumbPath = getCompanionThumbnailPath(filePath);

      const statusMsg = hasEditedReady
        ? 'Đã có sẵn video trong [DA_EDIT], đang xuất bản thẳng lên Kênh Đích...'
        : 'Đang Reup và chuẩn bị đăng lên Kênh Đích...';

      setVideoOverrides((prev) => ({
        ...prev,
        [targetId]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: statusMsg,
        },
        [v.video_id]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: statusMsg,
        },
      }));

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
            skipBktTest: true,
            skip_bkt_test: true,
          },
        ],
        targetTestChannelId: 'fast_track_direct',
        sequential: true,
      });

      const dispatchedJob = dispatchRes.results?.[0];
      if (dispatchedJob?.success) {
        toast.success({
          title: hasEditedReady
            ? 'Đang xuất bản Kênh Đích'
            : 'Đã kích hoạt Chỉnh sửa & Đăng Kênh Đích',
          message: hasEditedReady
            ? `Video "${aiTitle}" đã có bản edit hoàn tất, đang đưa vào YouTube Studio Kênh Đích...`
            : `Video "${aiTitle}" đã được gửi vào tiến trình Reup và xuất bản tự động.`,
        });
      } else {
        toast.error({
          title: 'Lỗi kích hoạt',
          message: dispatchedJob?.error || 'Không thể tạo tác vụ Reup.',
        });
      }
    } catch (err) {
      toast.error({
        title: 'Lỗi thực thi',
        message: String(err),
      });
    } finally {
      setTestingVideoId(null);
    }
  };

  const handleBatchEditAndPublishSelected = async () => {
    if (isBatchReupPublishing) return;

    const resolvedChannel = channel || followedChannels.find((c) => c.name === channelName);
    const targetProfileId =
      resolvedChannel?.target_profile_id || resolvedChannel?.bkt_profile_id || null;

    if (!targetProfileId) {
      toast.warning({
        title: 'Chưa cấu hình Kênh Đích',
        message:
          'Vui lòng gán Hồ Sơ Kênh Đích (Target Profile) cho kênh này trước khi chạy quy trình xuất bản hàng loạt.',
      });
      return;
    }

    const selectedList = filteredAndSortedVideos.filter((v) => {
      if (!selectedVideoIds.has(v.video_id)) return false;
      const isAlreadyPublished =
        v.target_published === 1 ||
        v.bkt_check_status === 'published' ||
        v.bkt_restriction?.includes('Đã xuất bản') ||
        v.bkt_restriction?.includes('xuất bản Công khai');
      return !isAlreadyPublished;
    });

    if (selectedList.length === 0) {
      toast.warning({
        title: 'Không có video phù hợp',
        message: 'Các video bạn chọn đều đã được xuất bản lên Kênh Đích hoặc chưa chọn video nào.',
      });
      return;
    }

    batchReupStopRequestedRef.current = false;
    setIsBatchReupPublishing(true);

    toast.info({
      title: 'Bắt đầu Chỉnh sửa & Đăng Hàng Loạt',
      message: `Đang chuẩn bị xử lý ${selectedList.length} video với khoảng cách an toàn (Smart Jitter) chống thuật toán quét...`,
    });

    let successCount = 0;
    let _failedCount = 0;

    try {
      for (let idx = 0; idx < selectedList.length; idx++) {
        if (batchReupStopRequestedRef.current) break;

        const v = selectedList[idx];
        const stepIndex = idx + 1;
        const total = selectedList.length;
        const targetId = v.id || v.video_id;

        setBatchReupProgressText(`[${stepIndex}/${total}] Kiểm tra tệp video...`);

        // Ưu tiên tìm bản [DA_EDIT] đã render trước, nếu không có mới tìm file gốc
        const editedPath = await getChannelVideoEditedFilepath(v.video_id);
        let filePath = editedPath;
        if (!filePath) {
          filePath = await getChannelVideoFilepath(v.video_id);
        }

        if (!filePath) {
          setBatchReupProgressText(`[${stepIndex}/${total}] Đang tải video về máy...`);
          setVideoOverrides((prev) => ({
            ...prev,
            [targetId]: {
              status: 'downloading',
              bkt_restriction: `[${stepIndex}/${total}] Đang tải video gốc về máy...`,
            },
            [v.video_id]: {
              status: 'downloading',
              bkt_restriction: `[${stepIndex}/${total}] Đang tải video gốc về máy...`,
            },
          }));

          onDownloadSelected([v]);

          let waitAttempts = 0;
          while (!filePath && waitAttempts < 300) {
            if (batchReupStopRequestedRef.current) break;
            await new Promise((r) => setTimeout(r, 2000));
            const recheckEdited = await getChannelVideoEditedFilepath(v.video_id);
            filePath = recheckEdited || (await getChannelVideoFilepath(v.video_id));
            waitAttempts++;
          }
        }

        if (batchReupStopRequestedRef.current) break;

        if (!filePath) {
          _failedCount++;
          toast.error({
            title: `Bỏ qua Video ${stepIndex}/${total}`,
            message: `Không thể tìm thấy tệp video "${v.title}". Chuyển sang video kế tiếp.`,
          });
          continue;
        }

        const hasEditedReady = Boolean(editedPath);
        setBatchReupProgressText(
          hasEditedReady
            ? `[${stepIndex}/${total}] Đã có bản edit, gửi YouTube Studio...`
            : `[${stepIndex}/${total}] Render Reup & Gửi Kênh Đích...`,
        );

        const aiTitle = getBestAutoPilotTitle(v.title);
        const adaptedDesc = adaptCompetitorDescription({
          originalDescription: '',
          targetChannelName: resolvedChannel?.name || channelName,
          videoTitle: aiTitle,
          includeFairUseDisclaimer: true,
        });
        const thumbPath = getCompanionThumbnailPath(filePath);

        const statusMsg = hasEditedReady
          ? `[${stepIndex}/${total}] Đã có bản edit, đang xuất bản thẳng Kênh Đích...`
          : `[${stepIndex}/${total}] Đang Reup và chuẩn bị đăng lên Kênh Đích...`;

        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: statusMsg,
          },
          [v.video_id]: {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: statusMsg,
          },
        }));

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
              skipBktTest: true,
              skip_bkt_test: true,
            },
          ],
          targetTestChannelId: 'fast_track_direct',
          sequential: true,
        });

        const dispatchedJob = dispatchRes.results?.[0];
        if (!dispatchedJob?.success || !dispatchedJob.jobId) {
          _failedCount++;
          toast.error({
            title: `Lỗi Video ${stepIndex}/${total}`,
            message: dispatchedJob?.error || 'Không thể tạo tác vụ Reup.',
          });
          continue;
        }

        successCount++;
        toast.success({
          title: `Video ${stepIndex}/${total} Thành công`,
          message: hasEditedReady
            ? `Video "${aiTitle}" đã có bản edit hoàn tất, đang đưa vào YouTube Studio Kênh Đích...`
            : `Video "${aiTitle}" đã được gửi vào hàng đợi Reup & Xuất bản.`,
        });

        // Smart Jitter: Giãn cách an toàn giữa các lần đăng để tránh YouTube spam flag
        if (idx < selectedList.length - 1 && !batchReupStopRequestedRef.current) {
          const scheduleMode = resolvedChannel?.upload_interval_mode || 'auto_30_60';
          let intervalMinutes = 45;

          if (scheduleMode === 'fixed') {
            intervalMinutes = resolvedChannel?.upload_interval_minutes || 45;
          } else {
            intervalMinutes = 30 + Math.floor(Math.random() * 31);
          }

          let remainingSeconds = intervalMinutes * 60;
          while (remainingSeconds > 0 && !batchReupStopRequestedRef.current) {
            const mins = Math.ceil(remainingSeconds / 60);
            setBatchReupProgressText(
              `Đã xong ${stepIndex}/${total}. Chờ đăng video tiếp sau ${mins} phút (Chống Spam)...`,
            );
            const sleepStep = Math.min(5, remainingSeconds);
            await new Promise((r) => setTimeout(r, sleepStep * 1000));
            remainingSeconds -= sleepStep;
          }
        }
      }

      if (successCount > 0) {
        toast.success({
          title: 'Hoàn tất chu trình Đăng Hàng Loạt',
          message: `Đã xử lý thành công ${successCount}/${selectedList.length} video.`,
        });
      }
    } catch (err) {
      console.error('Batch reup and publish error:', err);
      toast.error({
        title: 'Lỗi chu trình Đăng Hàng Loạt',
        message: String(err),
      });
    } finally {
      setIsBatchReupPublishing(false);
      setBatchReupProgressText('');
      setBktJobs(await getBktTestJobs(300).catch(() => []));
    }
  };

  const handleStopBatchReupPublish = () => {
    batchReupStopRequestedRef.current = true;
    setIsBatchReupPublishing(false);
    setBatchReupProgressText('');
    toast.info({
      title: 'Đã dừng Đăng Hàng Loạt',
      message: 'Đã gửi tín hiệu dừng quy trình sau khi hoàn tất tác vụ hiện tại.',
    });
  };

  const handleBatchBktSelected = async () => {
    const selectedList = filteredAndSortedVideos.filter((v) => selectedVideoIds.has(v.video_id));
    if (selectedList.length === 0) return;

    setIsBatchTestingBkt(true);
    const toTestItems: BktBatchItemRequest[] = [];
    const toDownloadList: ChannelVideo[] = [];
    const newOverrides: VideoOverridesMap = {};

    try {
      for (const v of selectedList) {
        const targetId = v.id || v.video_id;
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

          toTestItems.push({
            videoTitle: v.title,
            videoPath: filePath,
            videoSourceType: 'channel_video',
            sourceRefId: targetId,
            channelId: channel?.id,
            targetTitle: aiTitle,
            targetDescription: adaptedDesc,
            thumbnailPath: thumbPath,
            mainTargetProfileId: channel?.target_profile_id || channel?.bkt_profile_id || null,
            targetProfileId: channel?.target_profile_id || channel?.bkt_profile_id || null,
            autoPublishMain: false,
          });

          newOverrides[targetId] = {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang xếp hàng test BKT...',
          };
          newOverrides[v.video_id] = {
            is_bkt_test: true,
            bkt_check_status: 'pending',
            bkt_restriction: 'Đang xếp hàng test BKT...',
          };
        } else {
          toDownloadList.push(v);
          newOverrides[targetId] = {
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

      let successCount = 0;
      if (toTestItems.length > 0) {
        const res = await dispatchBatchBktTest({
          items: toTestItems,
          targetTestChannelId: undefined,
        });
        successCount = res.totalDispatched;
      }

      if (toDownloadList.length > 0) {
        onDownloadSelected(toDownloadList);
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
    } catch (err) {
      console.error('Batch BKT test item failed:', err);
      setIsBatchTestingBkt(false);
      toast.error({
        title: 'Lỗi gửi test BKT',
        description: String(err),
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

  return {
    bktJobs,
    latestBktJobMap,
    videoOverrides,
    activeJobPhases,
    testingVideoId,
    jobActionId,
    isBatchTestingBkt,
    isSequentialTop5Running,
    sequentialProgressText,
    isBatchReupPublishing,
    batchReupProgressText,
    handleBktJobAction,
    handleRunSequentialTop5AutoPilot,
    handleStopSequentialTop5,
    handleDirectEditAndPublishSingle,
    handleBatchEditAndPublishSelected,
    handleStopBatchReupPublish,
    handleBatchBktSelected,
    handleTriggerBktTest,
  };
}
