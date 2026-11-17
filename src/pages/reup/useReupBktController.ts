import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/components/layout';
import { useToast } from '@/components/ui/toast';
import {
  cancelAllBktJobs,
  checkBktCopyrightStatus,
  getBktTestChannels,
  getMultibrowserProfiles,
  publishBktCatchup,
} from '@/contexts/channels/channels-client';
import { useDownload } from '@/contexts/download-context';
import type {
  BktTestChannel,
  BktTestJob,
  MultiBrowserProfile,
  ReupPipelineResult,
} from '@/lib/types';
import { workTelemetryService } from '@/services/workTelemetryService';
import {
  adaptCompetitorDescription,
  executeAdaptiveReupPipeline,
  executePreflightScan,
  getBestAutoPilotTitle,
  getCompanionThumbnailPath,
  HOOK_BANK_EN,
  HOOK_BANK_VI,
  type PreflightScanResult,
  sanitizeYouTubeTitle,
} from '@/utils/reup-auto-pilot';
import type {
  MainPublishResult,
  ReupBktController,
  ReupProgressInfo,
  ReupTabKey,
  StudioCopyrightStatus,
  UploadResult,
} from './types';

export function useReupBktController(onNavigate?: (page: Page) => void): ReupBktController {
  const toast = useToast();
  const { enqueueExternalUrl } = useDownload();
  const [activeTab, setActiveTab] = useState<ReupTabKey>('bkt_channels');

  // ================= PIPELINE STATE =================
  const [inputVideoPath, setInputVideoPath] = useState<string>('');
  const [preflightScan, setPreflightScan] = useState<PreflightScanResult | null>(null);
  const [isScanningPreflight, setIsScanningPreflight] = useState<boolean>(false);
  const [pipelineLevel, setPipelineLevel] = useState<'v1' | 'v2'>('v1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<ReupPipelineResult | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [reupProgress, setReupProgress] = useState<ReupProgressInfo | null>(null);
  const [activeBackgroundJob, setActiveBackgroundJob] = useState<BktTestJob | null>(null);
  const [isLoginRequiredError, setIsLoginRequiredError] = useState<boolean>(false);

  // ================= BKT UPLOAD STATE =================
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const [bktChannels, setBktChannels] = useState<BktTestChannel[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem('rtm_reup_selected_bkt_profile_id') || '';
    } catch {
      return '';
    }
  });
  const [uploadVideoPath, setUploadVideoPath] = useState<string>('');
  const [uploadThumbnailPath, setUploadThumbnailPath] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState<string>(
    'Test copyright check on BKT shadow channel (Unlisted mode)',
  );
  const [uploadTags, setUploadTags] = useState<string>(() => {
    try {
      return sessionStorage.getItem('reup_input_video_tags') || '';
    } catch {
      return '';
    }
  });
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // ================= AUTO-PUBLISH KÊNH CHÍNH & AUTO-PILOT STATE =================
  const [autoPublishMain, setAutoPublishMain] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rtm_reup_auto_publish_main');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });
  const [mainProfileId, setMainProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem('rtm_reup_main_profile_id') || '';
    } catch {
      return '';
    }
  });
  const [mainVisibility, setMainVisibility] = useState<'public' | 'schedule' | 'unlisted'>(() => {
    try {
      const saved = localStorage.getItem('rtm_reup_main_visibility');
      return (saved as 'public' | 'schedule' | 'unlisted') || 'unlisted';
    } catch {
      return 'unlisted';
    }
  });
  const [isPublishingMain, setIsPublishingMain] = useState<boolean>(false);
  const [mainPublishProgress, setMainPublishProgress] = useState<string>('');
  const [mainPublishResult, setMainPublishResult] = useState<MainPublishResult | null>(null);
  const [isCatchingUp, setIsCatchingUp] = useState<boolean>(false);

  // Auto-Pilot Whole Flow State
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState<boolean>(false);
  const [autoPilotStep, setAutoPilotStep] = useState<number>(0);

  // Single-flight guards preventing overlapping IPC invocations
  const isPublishingMainRef = useRef<boolean>(false);
  const isCheckingStudioRef = useRef<boolean>(false);

  // ================= BKT MONITOR STATE =================
  const [isCheckingStudio, setIsCheckingStudio] = useState<boolean>(false);
  const [studioStatus, setStudioStatus] = useState<StudioCopyrightStatus | null>(null);
  const [autoPollSeconds, setAutoPollSeconds] = useState<number | null>(null);
  const [pollRetryCount, setPollRetryCount] = useState<number>(0);

  // Handlers lưu cài đặt vào localStorage
  const handleToggleAutoPublish = (checked: boolean) => {
    setAutoPublishMain(checked);
    try {
      localStorage.setItem('rtm_reup_auto_publish_main', String(checked));
    } catch {}
  };

  const handleChangeMainProfileId = (id: string) => {
    setMainProfileId(id);
    try {
      localStorage.setItem('rtm_reup_main_profile_id', id);
    } catch {}
  };

  const handleChangeMainVisibility = (v: 'public' | 'schedule' | 'unlisted') => {
    setMainVisibility(v);
    try {
      localStorage.setItem('rtm_reup_main_visibility', v);
    } catch {}
  };

  const handleChangeBktProfileId = (id: string) => {
    setSelectedProfileId(id);
    try {
      localStorage.setItem('rtm_reup_selected_bkt_profile_id', id);
    } catch {}
  };

  const handlePublishWaitingCleanVideos = async () => {
    if (isCatchingUp) return;
    const confirmed = window.confirm(
      'Chỉ đăng các job đã Sạch Bản Quyền, có artifact reup hợp lệ và chưa đăng. Không chạy test lại. Tiếp tục?',
    );
    if (!confirmed) return;
    setIsCatchingUp(true);
    try {
      const result = await publishBktCatchup();
      const detail = result.error
        ? `Đã đăng ${result.published}, bỏ qua ${result.skipped}. Dừng tại job lỗi.`
        : `Đã đăng ${result.published}, bỏ qua ${result.skipped}/${result.totalCandidates}.`;
      toast[result.error ? 'warning' : 'success']({
        title: 'Catch-up Auto-Publish hoàn tất',
        description: detail,
      });
    } catch (err) {
      toast.error({ title: 'Không thể đăng các video đang chờ', description: String(err) });
    } finally {
      setIsCatchingUp(false);
    }
  };

  // Load browser profiles & BKT test channels
  const loadProfiles = useCallback(async () => {
    try {
      const [profData, bktData] = await Promise.all([
        getMultibrowserProfiles(),
        getBktTestChannels(),
      ]);
      if (Array.isArray(profData)) {
        setProfiles(profData);
        setMainProfileId((prev) => {
          try {
            const stored = localStorage.getItem('rtm_reup_main_profile_id');
            if (stored && profData.some((p) => p.id === stored)) return stored;
          } catch {}
          return prev || (profData.length > 0 ? profData[0].id : '');
        });
      }
      if (Array.isArray(bktData)) {
        setBktChannels(bktData);
        setSelectedProfileId((prev) => {
          try {
            const stored = localStorage.getItem('rtm_reup_selected_bkt_profile_id');
            if (
              stored &&
              (bktData.some((c) => c.profileId === stored) || profData.some((p) => p.id === stored))
            ) {
              return stored;
            }
          } catch {}
          if (prev) return prev;
          const firstAvailable = bktData.find((c) => c.isActive && c.remainingQuota > 0);
          return firstAvailable
            ? firstAvailable.profileId
            : bktData.length > 0
              ? bktData[0].profileId
              : '';
        });
      } else {
        setSelectedProfileId('');
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }, []);

  // Tự động nhận diện file thumbnail (.jpg) đi kèm khi có video
  useEffect(() => {
    const target = uploadVideoPath || inputVideoPath;
    if (target) {
      const comp = getCompanionThumbnailPath(target);
      if (comp && !uploadThumbnailPath) {
        setUploadThumbnailPath(comp);
      }
    }
  }, [uploadVideoPath, inputVideoPath, uploadThumbnailPath]);

  // Quét tiền trạm AI Pre-flight Scan (phát hiện Logo, watermark, phụ đề đáy ~0.5s)
  const handleTriggerPreflightScan = useCallback(
    async (path: string): Promise<PreflightScanResult | null> => {
      if (!path || path.startsWith('http://') || path.startsWith('https://')) {
        return null;
      }
      setIsScanningPreflight(true);
      try {
        const res = await executePreflightScan(path);
        setPreflightScan(res);
        return res;
      } catch (err) {
        console.warn('Preflight scan warning:', err);
        return null;
      } finally {
        setIsScanningPreflight(false);
      }
    },
    [],
  );

  // Lắng nghe sự kiện tiến trình upload realtime từ Playwright
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    listen<{ percent?: number; remaining?: string; message?: string }>(
      'browser-upload-progress',
      (event) => {
        if (event.payload?.message) {
          setMainPublishProgress(event.payload.message);
        } else if (typeof event.payload?.percent === 'number') {
          setMainPublishProgress(
            `Đang tải lên: ${event.payload.percent}%${event.payload.remaining ? ` (${event.payload.remaining})` : ''}`,
          );
        }
      },
    ).then((unlisten) => {
      unlistenProgress = unlisten;
    });

    return () => {
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

  // Check candidate from Outlier Hunter
  useEffect(() => {
    const candidateTitle = sessionStorage.getItem('reup_input_video_title');
    const candidatePath = sessionStorage.getItem('reup_input_video_path');
    const candidateDesc = sessionStorage.getItem('reup_input_video_description');
    const candidateTags = sessionStorage.getItem('reup_input_video_tags');
    if (candidateTitle) {
      setUploadTitle(candidateTitle);
      sessionStorage.removeItem('reup_input_video_title');
    }
    if (candidatePath) {
      setInputVideoPath(candidatePath);
      setUploadVideoPath(candidatePath);
      sessionStorage.removeItem('reup_input_video_path');
      const compThumb = getCompanionThumbnailPath(candidatePath);
      if (compThumb) {
        setUploadThumbnailPath(compThumb);
      }
      if (!candidateDesc) {
        invoke<string | null>('read_companion_description', {
          videoPath: candidatePath,
          video_path: candidatePath,
        })
          .then((d) => {
            if (d?.trim()) {
              setUploadDescription(d.trim());
            }
          })
          .catch(() => {});
      }
      if (!candidatePath.startsWith('http://') && !candidatePath.startsWith('https://')) {
        void handleTriggerPreflightScan(candidatePath);
      }
    }
    if (candidateDesc) {
      setUploadDescription(candidateDesc);
      sessionStorage.removeItem('reup_input_video_description');
    }
    if (candidateTags) {
      setUploadTags(candidateTags);
      sessionStorage.removeItem('reup_input_video_tags');
    }
  }, [handleTriggerPreflightScan]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Lắng nghe tiến trình FFmpeg và BKT Test Background Jobs
  useEffect(() => {
    let cancelled = false;
    let unlistenProgress: (() => void) | undefined;
    let unlistenJob: (() => void) | undefined;

    listen<ReupProgressInfo>('reup-pipeline-progress', (event) => {
      if (cancelled) return;
      if (event.payload) {
        setReupProgress(event.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenProgress = fn;
      }
    });

    listen<BktTestJob>('bkt-test-job-updated', (event) => {
      if (cancelled) return;
      const job = event.payload;
      if (!job) return;
      setActiveBackgroundJob(job);
      if (
        job.errorMessage?.toLowerCase().includes('đăng nhập') ||
        job.errorMessage?.toLowerCase().includes('login') ||
        job.errorMessage?.toLowerCase().includes('google sign in')
      ) {
        setIsLoginRequiredError(true);
      }
      if (job.videoSourceType === 'channel_video') return;
      if (job.status === 'green_clean') {
        setStudioStatus({
          status: 'green_clean',
          restriction: 'Sạch Bản Quyền (Video không có cảnh báo bản quyền trong Studio)',
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
      } else if (job.status === 'red_matched') {
        setStudioStatus({
          status: 'red_matched',
          restriction: job.restriction || job.errorMessage || 'Phát hiện khiếu nại Content ID',
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
      } else if (
        job.status === 'publishing' ||
        job.status === 'published' ||
        job.status === 'publish_failed'
      ) {
        setStudioStatus({
          status: job.status,
          restriction:
            job.restriction ||
            (job.status === 'publishing'
              ? 'Đang đăng lên Kênh Đích...'
              : job.status === 'published'
                ? 'Đã đăng thành công lên Kênh Đích'
                : 'Đăng Kênh Đích thất bại; artifact vẫn được giữ để tiếp tục'),
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
      } else if (job.status === 'failed') {
        setStudioStatus({
          status: 'failed',
          restriction: job.errorMessage || job.restriction || 'Kiểm tra bản quyền thất bại',
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenJob = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenProgress) unlistenProgress();
      if (unlistenJob) unlistenJob();
    };
  }, []);

  const handleOpenProfileStudio = async (profileId?: string) => {
    const targetId = profileId || selectedProfileId;
    if (!targetId) {
      toast.warning({
        title: 'Chưa chọn Hồ sơ',
        description: 'Vui lòng chọn một Hồ sơ trình duyệt trước.',
      });
      return;
    }
    try {
      await invoke('launch_multibrowser_profile', {
        profileId: targetId,
        profile_id: targetId,
        targetUrl: 'https://studio.youtube.com/',
        target_url: 'https://studio.youtube.com/',
      });
      setIsLoginRequiredError(false);
      toast.success({
        title: 'Đang mở YouTube Studio',
        description:
          'Đang kích hoạt Chromium và mở YouTube Studio trong hồ sơ đã chọn để bạn kiểm tra hoặc đăng nhập.',
      });
    } catch (err) {
      toast.error({
        title: 'Không thể mở trình duyệt',
        description: String(err),
      });
    }
  };

  const handleQuickDownloadUrl = async (url: string) => {
    try {
      await enqueueExternalUrl(url, { mediaType: 'video' });
      toast.success({
        title: 'Đã thêm vào hàng đợi tải xuống',
        description:
          'Video và thumbnail đang được tải về máy. Sau khi tải xong, bạn có thể chọn từ Thư viện để đưa vào Reup.',
      });
      if (onNavigate) {
        onNavigate('library');
      }
    } catch (err) {
      toast.error({
        title: 'Lỗi tải video',
        description: String(err),
      });
    }
  };

  // Pick file video from local computer
  const handlePickInputVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video Files',
            extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'm4v'],
          },
        ],
      });
      if (typeof selected === 'string') {
        setInputVideoPath(selected);
        setPipelineResult(null);
        setProcessError(null);
        if (!uploadVideoPath) {
          setUploadVideoPath(selected);
          const filename = selected.split(/[\\/]/).pop() || 'Video Test';
          setUploadTitle(filename.replace(/\.[^/.]+$/, ''));
        }
        const compThumb = getCompanionThumbnailPath(selected);
        if (compThumb) {
          setUploadThumbnailPath(compThumb);
        }
        invoke<string | null>('read_companion_description', {
          videoPath: selected,
          video_path: selected,
        })
          .then((d) => {
            if (d?.trim()) {
              setUploadDescription(d.trim());
            }
          })
          .catch(() => {});
        void handleTriggerPreflightScan(selected);
      }
    } catch (err) {
      console.error('Pick video error:', err);
    }
  };

  const handlePickUploadVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video Files',
            extensions: ['mp4', 'mkv', 'mov', 'webm'],
          },
        ],
      });
      if (typeof selected === 'string') {
        setUploadVideoPath(selected);
        const filename = selected.split(/[\\/]/).pop() || 'Video Test';
        if (!uploadTitle) {
          setUploadTitle(filename.replace(/\.[^/.]+$/, ''));
        }
        const compThumb = getCompanionThumbnailPath(selected);
        if (compThumb) {
          setUploadThumbnailPath(compThumb);
        }
        invoke<string | null>('read_companion_description', {
          videoPath: selected,
          video_path: selected,
        })
          .then((d) => {
            if (d?.trim()) {
              setUploadDescription(d.trim());
            }
          })
          .catch(() => {});
        void handleTriggerPreflightScan(selected);
      }
    } catch (err) {
      console.error('Pick upload video error:', err);
    }
  };

  // Run FFmpeg Reup Pipeline
  const handleRunPipeline = async () => {
    if (!inputVideoPath.trim()) {
      toast.warning({
        title: 'Chưa chọn video',
        description: 'Vui lòng bấm "Chọn file từ máy tính" để chọn một tệp video trước.',
      });
      return;
    }
    if (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://')) {
      toast.warning({
        title: 'Đầu vào là liên kết Web / YouTube',
        description:
          'Vui lòng bấm nút "Tải về máy" bên cạnh để tải file về ổ đĩa trước khi xử lý Reup.',
      });
      return;
    }
    setIsProcessing(true);
    setProcessError(null);
    setPipelineResult(null);
    setReupProgress({ percent: 0, status: 'Đang chuẩn bị lệnh render FFmpeg...' });

    try {
      const ext = inputVideoPath.split('.').pop() || 'mp4';
      const base = inputVideoPath.slice(0, inputVideoPath.lastIndexOf('.'));
      const outputPath = `${base}_reup_${pipelineLevel}_${Date.now()}.${ext}`;

      const commandName =
        pipelineLevel === 'v1' ? 'run_reup_pipeline_v1_cmd' : 'run_reup_pipeline_v2_cmd';

      const res = await invoke<ReupPipelineResult>(commandName, {
        inputPath: inputVideoPath,
        input_path: inputVideoPath,
        outputPath,
        output_path: outputPath,
      });

      setPipelineResult(res);
      setUploadVideoPath(res.output_path);
      const filename = res.output_path.split(/[\\/]/).pop() || 'Video Reup';
      setUploadTitle((prev) => (prev?.trim() ? prev : filename.replace(/\.[^/.]+$/, '')));

      toast.success({
        title: 'Xử lý Reup hoàn tất',
        description: `Đã hoàn thành Cấp độ ${res.level} và thay đổi mã băm container MD5 & SHA256.`,
      });
    } catch (err) {
      const errStr = String(err);
      setProcessError(errStr);
      toast.error({
        title: 'Lỗi chạy Reup Pipeline',
        description: errStr,
      });
    } finally {
      setIsProcessing(false);
      setReupProgress(null);
    }
  };

  // Upload video to BKT Channel via Playwright
  const handleUploadBkt = async () => {
    if (!selectedProfileId) {
      toast.warning({
        title: 'Chưa chọn Profile',
        description: 'Vui lòng chọn một Hồ sơ trình duyệt đã đăng nhập kênh BKT trước khi tải lên.',
      });
      return;
    }
    if (!uploadVideoPath.trim()) {
      toast.warning({
        title: 'Chưa có video cần tải',
        description: 'Vui lòng chọn hoặc điền đường dẫn tệp video để test trên kênh BKT.',
      });
      return;
    }
    setIsUploading(true);
    setUploadResult(null);

    try {
      const res = await invoke<UploadResult>('upload_video_multibrowser', {
        params: {
          profile_id: selectedProfileId,
          video_path: uploadVideoPath,
          title: uploadTitle.trim() || 'Test Video Reup',
          description: uploadDescription,
          tags: uploadTags.trim() || undefined,
          thumbnail_path: uploadThumbnailPath.trim() || undefined,
          visibility: 'unlisted',
        },
      });

      setUploadResult(res);
      if (res.success) {
        setPollRetryCount(0);
        setAutoPollSeconds(30);
        setStudioStatus({
          status: 'pending',
          restriction:
            'Video đã được lưu trên máy chủ YouTube. Hệ thống sẽ tự động quét trạng thái bản quyền sau 30 giây...',
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
        toast.success({
          title: 'Tải lên kênh BKT thành công',
          description:
            'Video đã lên YouTube (Unlisted). Đang hẹn giờ tự động quét bản quyền sau 30 giây.',
        });
      } else {
        toast.error({
          title: 'Lỗi đăng video lên kênh BKT',
          description:
            res.error || 'Trình duyệt Playwright gặp lỗi trong quá trình tải lên Studio.',
        });
      }
    } catch (err) {
      const errStr = String(err);
      setUploadResult({
        success: false,
        error: errStr,
      });
      toast.error({
        title: 'Lỗi tiến trình upload',
        description: errStr,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Publish video to Official Channel (Kênh Chính)
  const executePublishToMainChannel = useCallback(
    async (
      overrideVideoPath?: string,
      overrideTitle?: string,
      overrideDesc?: string,
      overrideThumb?: string,
      overrideTags?: string,
    ) => {
      if (isPublishingMainRef.current) return;
      const targetVideo = (
        overrideVideoPath ||
        uploadVideoPath ||
        pipelineResult?.output_path ||
        inputVideoPath
      ).trim();

      let candidateTitle = (overrideTitle || uploadTitle).trim();
      if (
        !candidateTitle ||
        candidateTitle === 'Video Reup Official' ||
        candidateTitle.startsWith('Video Test')
      ) {
        const rawFilename = (targetVideo || inputVideoPath).split(/[\\/]/).pop() || 'Video';
        candidateTitle = rawFilename.replace(/_reup_(v1|v2)_\d+/i, '').replace(/\.[^/.]+$/, '');
      }

      const effectiveTagsStr = overrideTags !== undefined ? overrideTags : uploadTags;
      const parsedTags = effectiveTagsStr
        ? effectiveTagsStr
            .split(/[,#]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : undefined;

      const hasHook =
        Object.values(HOOK_BANK_VI).some((group) =>
          group.templates.some((tpl) => candidateTitle.includes(tpl.replace(/[—|]/g, '').trim())),
        ) ||
        Object.values(HOOK_BANK_EN).some((group) =>
          group.templates.some((tpl) => candidateTitle.includes(tpl.replace(/[—|]/g, '').trim())),
        );

      const targetTitle = sanitizeYouTubeTitle(
        (overrideTitle
          ? overrideTitle.trim()
          : hasHook
            ? candidateTitle
            : getBestAutoPilotTitle(candidateTitle, 0, undefined, parsedTags)) ||
          candidateTitle ||
          'Video Reup Official',
        95,
      );

      if (targetTitle !== uploadTitle) {
        setUploadTitle(targetTitle);
      }

      let rawDesc = (overrideDesc !== undefined ? overrideDesc : uploadDescription).trim();
      if (rawDesc.includes('Test copyright check')) {
        rawDesc = '';
      }

      const targetProf = profiles.find((p) => p.id === mainProfileId);
      const targetChannelName =
        targetProf?.youtube_preferred_channel || targetProf?.profile_name || '';

      const targetDesc = adaptCompetitorDescription({
        videoTitle: targetTitle,
        originalDescription: rawDesc,
        targetChannelName,
        includeFairUseDisclaimer: true,
        extraHashtags: parsedTags,
      });

      if (targetDesc !== uploadDescription) {
        setUploadDescription(targetDesc);
      }

      let targetThumb = (overrideThumb || uploadThumbnailPath || '').trim();
      if (!targetThumb || /_reup_(v1|v2)_\d+\.jpg$/i.test(targetThumb)) {
        const companion =
          (inputVideoPath ? getCompanionThumbnailPath(inputVideoPath) : null) ||
          (targetVideo
            ? getCompanionThumbnailPath(targetVideo.replace(/_reup_(v1|v2)_\d+\.[^/.]+$/i, '.mp4'))
            : null);
        if (companion) {
          targetThumb = companion;
        }
      }

      if (targetThumb && targetThumb !== uploadThumbnailPath) {
        setUploadThumbnailPath(targetThumb);
      }

      const targetTags =
        (overrideTags !== undefined ? overrideTags : uploadTags).trim() || undefined;

      if (!mainProfileId) {
        toast.warning({
          title: 'Chưa chọn Kênh Chính',
          description: 'Vui lòng chọn Hồ sơ Kênh Chính đích để hệ thống tiến hành xuất bản.',
        });
        return;
      }
      if (!targetVideo) {
        toast.warning({
          title: 'Chưa có video cần tải',
          description: 'Vui lòng chuẩn bị file video đã qua xử lý Reup.',
        });
        return;
      }

      isPublishingMainRef.current = true;
      setIsPublishingMain(true);
      setMainPublishProgress('Đang kết nối trình duyệt...');
      setMainPublishResult(null);

      toast.info({
        title: 'Đang tải lên Kênh Chính...',
        description: 'Video đã sạch bản quyền. Playwright đang mở Kênh Chính để đăng tải tự động.',
      });

      try {
        const res = await invoke<MainPublishResult>('upload_video_multibrowser', {
          params: {
            profile_id: mainProfileId,
            video_path: targetVideo,
            title: targetTitle,
            description: targetDesc,
            tags: targetTags,
            thumbnail_path: targetThumb || undefined,
            visibility: mainVisibility,
          },
        });

        setMainPublishResult(res);
        if (res.success) {
          workTelemetryService.reportUpload({
            channel_id: mainProfileId,
          });

          toast.success({
            title: 'Xuất bản Kênh Chính thành công',
            description: `Video đã được đăng lên Kênh Chính (${mainVisibility}). URL: ${res.video_url || 'YouTube Studio'}`,
          });
        } else {
          toast.error({
            title: 'Lỗi đăng tải Kênh Chính',
            description:
              res.error || 'Trình duyệt Playwright gặp lỗi trong quá trình tải lên Kênh Chính.',
          });
        }
      } catch (err) {
        const errStr = String(err);
        setMainPublishResult({ success: false, error: errStr });
        toast.error({
          title: 'Lỗi tiến trình tải Kênh Chính',
          description: errStr,
        });
      } finally {
        isPublishingMainRef.current = false;
        setIsPublishingMain(false);
        setMainPublishProgress('');
      }
    },
    [
      mainProfileId,
      uploadVideoPath,
      inputVideoPath,
      pipelineResult?.output_path,
      uploadTitle,
      uploadDescription,
      uploadTags,
      uploadThumbnailPath,
      mainVisibility,
      profiles,
      toast,
    ],
  );

  // Check copyright status on YouTube Studio
  const handleCheckStudioStatus = useCallback(async () => {
    if (isCheckingStudioRef.current) return;
    if (!selectedProfileId) {
      toast.warning({
        title: 'Chưa chọn Profile',
        description:
          'Vui lòng chọn Hồ sơ trình duyệt đích để Playwright mở YouTube Studio quét kết quả.',
      });
      return;
    }
    isCheckingStudioRef.current = true;
    setIsCheckingStudio(true);
    try {
      const res = await checkBktCopyrightStatus({
        profileId: selectedProfileId || null,
        channelVideoId: uploadResult?.youtube_video_id || null,
      });

      if (res?.status) {
        setStudioStatus({
          status: res.status,
          restriction:
            res.restriction ||
            (res.status === 'green_clean' ? 'None / — (Sạch bản quyền)' : 'Content ID'),
          checked_at: new Date().toLocaleTimeString('vi-VN'),
        });
        if (res.status === 'green_clean') {
          setAutoPollSeconds(null);
          setPollRetryCount(0);

          workTelemetryService.reportBktResult({
            competitor_channel_url: uploadResult?.video_url,
            status: 'green',
          });

          toast.success({
            title: 'Sạch Bản Quyền',
            description: 'YouTube Studio xác nhận không có bất kỳ hạn chế bản quyền nào.',
          });
        } else if (res.status === 'red_matched') {
          setAutoPollSeconds(null);
          setPollRetryCount(0);

          workTelemetryService.reportBktResult({
            competitor_channel_url: uploadResult?.video_url,
            status: 'red',
          });

          toast.error({
            title: 'Dính Bản Quyền (Content ID)',
            description:
              res.restriction || 'YouTube phát hiện bản quyền trên kênh BKT. Khuyên dùng Cấp độ 2.',
          });
        } else {
          const MAX_POLLS = 25;
          if (pollRetryCount < MAX_POLLS) {
            setPollRetryCount((prev) => prev + 1);
            setAutoPollSeconds(25);
            setStudioStatus((prev) =>
              prev
                ? {
                    ...prev,
                    restriction: `${res.restriction || 'YouTube đang phân tích video và âm thanh'} [Lần ${pollRetryCount + 1}/${MAX_POLLS}]`,
                  }
                : null,
            );
          } else {
            setAutoPollSeconds(null);
            toast.warning({
              title: 'YouTube kiểm tra lâu hơn bình thường (>10 phút)',
              description:
                'Video dung lượng lớn vẫn đang được YouTube phân tích ngầm. Bấm "Quét kết quả" để kiểm tra tiếp khi hoàn tất.',
            });
          }
          toast.info({
            title: `Đang chờ YouTube quét... [${pollRetryCount + 1}/${MAX_POLLS}]`,
            description:
              res.restriction ||
              'YouTube Studio đang xử lý định dạng & chạy thuật toán Content ID.',
          });
        }
      } else if (res?.error) {
        setAutoPollSeconds(null);
        setPollRetryCount(0);
        toast.warning({
          title: 'Thông báo quét Studio',
          description: res.error,
        });
      } else {
        setAutoPollSeconds(null);
        setPollRetryCount(0);
        setStudioStatus(null);
        toast.info({
          title: 'Chưa có video BKT được quét',
          description:
            res?.checked_count === 0
              ? 'Hồ sơ này chưa có video BKT nào trong danh sách quét. Hãy tải video hoặc tải lên kênh BKT trước.'
              : 'Không có dữ liệu bản quyền nào được ghi nhận từ YouTube Studio.',
        });
      }
    } catch (err) {
      console.error('Check Studio status error:', err);
      toast.error({
        title: 'Lỗi quét trạng thái bản quyền',
        description: String(err),
      });
    } finally {
      isCheckingStudioRef.current = false;
      setIsCheckingStudio(false);
    }
  }, [
    selectedProfileId,
    uploadResult?.youtube_video_id,
    uploadResult?.video_url,
    pollRetryCount,
    toast,
  ]);

  // 100% Zero-Touch Auto-Pilot Pipeline
  const handleRunAutoPilot = async () => {
    if (!inputVideoPath.trim()) {
      toast.warning({
        title: 'Chưa chọn video',
        description: 'Vui lòng chọn video gốc hoặc lấy video từ Outlier Hunter trước.',
      });
      return;
    }
    if (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://')) {
      toast.warning({
        title: 'Đầu vào là liên kết Web / YouTube',
        description:
          'Vui lòng bấm nút "Tải về máy" bên cạnh video gốc để tải về máy trước khi chạy Auto-Pilot.',
      });
      return;
    }
    if (!selectedProfileId) {
      toast.warning({
        title: 'Chưa chọn Kênh BKT',
        description: 'Vui lòng chọn Kênh BKT để kiểm tra bản quyền ngầm.',
      });
      return;
    }
    if (autoPublishMain && !mainProfileId) {
      toast.warning({
        title: 'Chưa chọn Kênh Chính',
        description: 'Vui lòng chọn Hồ sơ Kênh Chính đích để tự động xuất bản.',
      });
      return;
    }

    setIsAutoPilotRunning(true);
    setAutoPilotStep(1);
    setIsProcessing(true);
    setReupProgress({
      percent: 0,
      fps: 0,
      speed: '0x',
      eta_seconds: 0,
      status: 'Quét tiền trạm và khởi tạo render...',
    });

    try {
      let currentScan = preflightScan;
      if (!currentScan) {
        toast.info({
          title: 'Auto-Pilot [1/4]: Đang quét tiền trạm AI (~0.5s)...',
          description:
            'Phân tích logo, watermark và phụ đề đáy để chọn chiến lược render tối ưu...',
        });
        currentScan = await handleTriggerPreflightScan(inputVideoPath);
      }

      toast.info({
        title: 'Auto-Pilot [1/4]: Xử lý Reup Thích Ứng (Adaptive)...',
        description: currentScan
          ? `Chiến lược: ${currentScan.badgeText}`
          : 'Đang biến đổi MD5/SHA256, Speed 1.03x, Pitch 1.02x, xóa EXIF...',
      });
      const ext = inputVideoPath.split('.').pop() || 'mp4';
      const base = inputVideoPath.slice(0, inputVideoPath.lastIndexOf('.'));
      const outputPath = `${base}_reup_adaptive_${Date.now()}.${ext}`;

      const reupRes = await executeAdaptiveReupPipeline(
        inputVideoPath,
        outputPath,
        currentScan || undefined,
      );
      setPipelineResult(reupRes);
      setUploadVideoPath(reupRes.output_path);
      setIsProcessing(false);

      setAutoPilotStep(2);
      toast.info({
        title: 'Auto-Pilot [2/4]: Tối ưu Tiêu đề 95/5 & Mô tả...',
        description: 'Bóc tách 95% từ khóa gốc và ghép Hook CTR cao...',
      });
      const filename = inputVideoPath.split(/[\\/]/).pop() || 'Video';
      const rawTitle = uploadTitle.trim() || filename.replace(/\.[^/.]+$/, '');
      const parsedTags = uploadTags
        ? uploadTags
            .split(/[,#]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : undefined;

      const optTitle = getBestAutoPilotTitle(rawTitle, 0, undefined, parsedTags);
      setUploadTitle(optTitle);

      let compDesc = '';
      try {
        const d = await invoke<string | null>('read_companion_description', {
          videoPath: inputVideoPath,
          video_path: inputVideoPath,
        });
        if (d?.trim()) {
          compDesc = d.trim();
        }
      } catch {}

      const activeDesc =
        compDesc || (uploadDescription.includes('Test copyright check') ? '' : uploadDescription);

      const targetProf = profiles.find((p) => p.id === (mainProfileId || selectedProfileId));
      const targetChannelName =
        targetProf?.youtube_preferred_channel || targetProf?.profile_name || '';

      const optDesc = adaptCompetitorDescription({
        videoTitle: optTitle,
        originalDescription: activeDesc,
        targetChannelName,
        includeFairUseDisclaimer: true,
        extraHashtags: parsedTags,
      });
      setUploadDescription(optDesc);

      setAutoPilotStep(3);
      const compThumb = getCompanionThumbnailPath(inputVideoPath);
      if (compThumb) {
        setUploadThumbnailPath(compThumb);
      }

      setAutoPilotStep(4);
      toast.info({
        title: 'Auto-Pilot [3/4]: Tải lên Kênh BKT (Unlisted)...',
        description: 'Đang tải video ẩn lên YouTube Studio để quét bản quyền...',
      });

      const bktRes = await invoke<UploadResult>('upload_video_multibrowser', {
        params: {
          profile_id: selectedProfileId,
          video_path: reupRes.output_path,
          title: optTitle,
          description: optDesc,
          tags: uploadTags.trim() || undefined,
          thumbnail_path: compThumb || undefined,
          visibility: 'unlisted',
        },
      });

      setUploadResult(bktRes);
      if (!bktRes.success) {
        throw new Error(bktRes.error || 'Lỗi khi tải video lên kênh BKT');
      }

      setAutoPilotStep(5);
      setPollRetryCount(0);
      setAutoPollSeconds(35);
      setStudioStatus({
        status: 'pending',
        restriction:
          'Đã tải lên. YouTube đang xử lý SD/HD & chuẩn bị chạy thuật toán quét bản quyền Content ID...',
        checked_at: new Date().toLocaleTimeString('vi-VN'),
      });

      toast.success({
        title: 'Auto-Pilot: Đã lên kênh BKT',
        description:
          'Đang bắt đầu chu kỳ theo dõi YouTube xử lý & quét Content ID liên tục cho đến khi có kết luận.',
      });
    } catch (err) {
      const errStr = String(err);
      toast.error({
        title: 'Lỗi quy trình Auto-Pilot',
        description: errStr,
      });
    } finally {
      setIsProcessing(false);
      setIsAutoPilotRunning(false);
    }
  };

  const handleStopAutoPilot = async () => {
    try {
      await cancelAllBktJobs();
      setIsAutoPilotRunning(false);
      setIsProcessing(false);
      setAutoPilotStep(0);
      setAutoPollSeconds(null);
      toast.info({
        title: 'Đã dừng Auto-Pilot',
        description: 'Tiến trình tự động hóa đã được hủy theo yêu cầu.',
      });
    } catch (err) {
      toast.error({ title: 'Lỗi dừng Auto-Pilot', description: String(err) });
    }
  };

  // Auto-poll countdown effect
  useEffect(() => {
    if (autoPollSeconds === null) return;
    if (autoPollSeconds <= 0) {
      setAutoPollSeconds(null);
      void handleCheckStudioStatus();
      return;
    }
    const timer = setTimeout(() => {
      setAutoPollSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoPollSeconds, handleCheckStudioStatus]);

  return {
    activeTab,
    setActiveTab,

    inputVideoPath,
    setInputVideoPath,
    preflightScan,
    isScanningPreflight,
    pipelineLevel,
    setPipelineLevel,
    isProcessing,
    pipelineResult,
    processError,
    reupProgress,
    activeBackgroundJob,
    isLoginRequiredError,
    setIsLoginRequiredError,
    handleTriggerPreflightScan,
    handlePickInputVideo,
    handleQuickDownloadUrl,
    handleRunPipeline,

    profiles,
    bktChannels,
    selectedProfileId,
    setSelectedProfileId,
    uploadVideoPath,
    setUploadVideoPath,
    uploadThumbnailPath,
    setUploadThumbnailPath,
    uploadTitle,
    setUploadTitle,
    uploadDescription,
    setUploadDescription,
    uploadTags,
    setUploadTags,
    isUploading,
    uploadResult,
    handlePickUploadVideo,
    handleUploadBkt,
    handleChangeBktProfileId,
    handleOpenProfileStudio,

    autoPublishMain,
    handleToggleAutoPublish,
    mainProfileId,
    handleChangeMainProfileId,
    mainVisibility,
    handleChangeMainVisibility,
    isPublishingMain,
    mainPublishProgress,
    mainPublishResult,
    isCatchingUp,
    handlePublishWaitingCleanVideos,
    executePublishToMainChannel,

    isAutoPilotRunning,
    autoPilotStep,
    handleRunAutoPilot,
    handleStopAutoPilot,

    isCheckingStudio,
    studioStatus,
    autoPollSeconds,
    pollRetryCount,
    handleCheckStudioStatus,
  };
}
