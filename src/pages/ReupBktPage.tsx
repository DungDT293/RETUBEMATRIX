import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileVideo,
  FlaskConical,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Timer,
  Tv,
  UploadCloud,
  Wand2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AiTitleThumbnailTab } from '@/components/bkt/AiTitleThumbnailTab';
import { BktChannelManagerTab } from '@/components/bkt/BktChannelManagerTab';
import type { Page } from '@/components/layout';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import {
  cancelAllBktJobs,
  checkBktCopyrightStatus,
  getBktTestChannels,
  getMultibrowserProfiles,
} from '@/contexts/channels/channels-client';
import { useDownload } from '@/contexts/download-context';
import type {
  BktTestChannel,
  BktTestJob,
  MultiBrowserProfile,
  ReupPipelineResult,
} from '@/lib/types';
import { cn, maskProxy } from '@/lib/utils';
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

export function ReupBktPage({ onNavigate }: { onNavigate?: (page: Page) => void } = {}) {
  const toast = useToast();
  const { enqueueExternalUrl } = useDownload();
  const [activeTab, setActiveTab] = useState<
    'bkt_channels' | 'pipeline' | 'bkt_upload' | 'ai_optimization'
  >('bkt_channels');

  // ================= PIPELINE STATE =================
  const [inputVideoPath, setInputVideoPath] = useState<string>('');
  const [preflightScan, setPreflightScan] = useState<PreflightScanResult | null>(null);
  const [isScanningPreflight, setIsScanningPreflight] = useState<boolean>(false);
  const [pipelineLevel, setPipelineLevel] = useState<'v1' | 'v2'>('v1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<ReupPipelineResult | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [reupProgress, setReupProgress] = useState<{
    percent: number;
    speed?: string;
    fps?: number;
    eta_seconds?: number;
    status: string;
  } | null>(null);
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
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    video_url?: string;
    youtube_video_id?: string;
    error?: string;
  } | null>(null);

  // ================= AUTO-PUBLISH KÊNH CHÍNH & AUTO-PILOT STATE (PERSISTED) =================
  const [autoPublishMain, setAutoPublishMain] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rtm_reup_auto_publish_main');
      return saved !== null ? saved === 'true' : false; // Mặc định an toàn: false
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
      return (saved as 'public' | 'schedule' | 'unlisted') || 'unlisted'; // Mặc định an toàn: unlisted
    } catch {
      return 'unlisted';
    }
  });
  const [isPublishingMain, setIsPublishingMain] = useState<boolean>(false);
  const [mainPublishProgress, setMainPublishProgress] = useState<string>('');
  const [mainPublishResult, setMainPublishResult] = useState<{
    success: boolean;
    video_url?: string;
    youtube_video_id?: string;
    error?: string;
  } | null>(null);

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

  // Auto-Pilot Whole Flow State
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState<boolean>(false);
  const [autoPilotStep, setAutoPilotStep] = useState<number>(0);

  // Single-flight guards preventing overlapping IPC invocations
  const isPublishingMainRef = useRef<boolean>(false);
  const isCheckingStudioRef = useRef<boolean>(false);

  // ================= BKT MONITOR STATE =================
  const [isCheckingStudio, setIsCheckingStudio] = useState<boolean>(false);
  const [studioStatus, setStudioStatus] = useState<{
    status: 'pending' | 'green_clean' | 'red_matched' | 'failed';
    restriction?: string;
    checked_at?: string;
  } | null>(null);
  const [autoPollSeconds, setAutoPollSeconds] = useState<number | null>(null);
  const [pollRetryCount, setPollRetryCount] = useState<number>(0);

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

  // Lắng nghe sự kiện tiến trình upload realtime từ Playwright (hỗ trợ hiển thị mượt mà qua proxy)
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
        invoke<string | null>('read_companion_description', { videoPath: candidatePath })
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

    listen<{
      percent: number;
      speed?: string;
      fps?: number;
      eta_seconds?: number;
      status: string;
    }>('reup-pipeline-progress', (event) => {
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
        title: 'Đã thêm vào hàng đợi tải xuống!',
        description:
          'Video và thumbnail .jpg đang được tải về máy. Sau khi tải xong, bạn có thể chọn từ Thư viện để đưa vào Reup.',
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
        // Tự động gán cho upload nếu chưa có
        if (!uploadVideoPath) {
          setUploadVideoPath(selected);
          const filename = selected.split(/[\\/]/).pop() || 'Video Test';
          setUploadTitle(filename.replace(/\.[^/.]+$/, ''));
        }
        // Tự động tìm thumbnail và mô tả (.description) đi kèm nếu có
        const compThumb = getCompanionThumbnailPath(selected);
        if (compThumb) {
          setUploadThumbnailPath(compThumb);
        }
        invoke<string | null>('read_companion_description', { videoPath: selected })
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
        invoke<string | null>('read_companion_description', { videoPath: selected })
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
        outputPath,
      });

      setPipelineResult(res);
      // Cập nhật sẵn sang tab test BKT
      setUploadVideoPath(res.output_path);
      const filename = res.output_path.split(/[\\/]/).pop() || 'Video Reup';
      setUploadTitle((prev) => (prev?.trim() ? prev : filename.replace(/\.[^/.]+$/, '')));

      toast.success({
        title: 'Xử lý Reup hoàn tất!',
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
      const res = await invoke<{
        success: boolean;
        video_url?: string;
        youtube_video_id?: string;
        error?: string;
      }>('upload_video_multibrowser', {
        params: {
          profile_id: selectedProfileId,
          video_path: uploadVideoPath,
          title: uploadTitle.trim() || 'Test Video Reup',
          description: uploadDescription,
          tags: uploadTags.trim() || undefined,
          thumbnail_path: uploadThumbnailPath.trim() || undefined,
          visibility: 'unlisted', // Cố định Unlisted để an toàn
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
          title: 'Tải lên kênh BKT thành công!',
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

      // 1. TIÊU ĐỀ: Đảm bảo sinh hoặc bảo toàn bởi AI 95/5 (bảo toàn 95% từ khóa gốc + Hook CTR cao)
      let candidateTitle = (overrideTitle || uploadTitle).trim();
      if (
        !candidateTitle ||
        candidateTitle === 'Video Reup Official' ||
        candidateTitle.startsWith('Video Test')
      ) {
        const rawFilename = (targetVideo || inputVideoPath).split(/[\\/]/).pop() || 'Video';
        candidateTitle = rawFilename.replace(/_reup_(v1|v2)_\d+/i, '').replace(/\.[^/.]+$/, '');
      }

      // Trích xuất mảng tags từ uploadTags hoặc overrideTags
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

      // 2. MÔ TẢ: Đảm bảo mô tả SEO chuẩn đa tầng (Bảo toàn 100% Tracklist/Timestamps + Thay thế Kênh đích + Fair Use)
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

      // 3. THUMBNAIL: Tự động nạp file ảnh bìa (.jpg) đi kèm nếu chưa có
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

      // 4. TAGS
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
        description: 'Video đã sạch bản quyền! Playwright đang mở Kênh Chính để đăng tải tự động.',
      });

      try {
        const res = await invoke<{
          success: boolean;
          video_url?: string;
          youtube_video_id?: string;
          error?: string;
        }>('upload_video_multibrowser', {
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
          // Telemetry: Báo cáo video xuất bản lên kênh đích
          workTelemetryService.reportUpload({
            channel_id: mainProfileId,
          });

          toast.success({
            title: 'Xuất bản Kênh Chính thành công!',
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

          // Telemetry: Báo cáo video test BKT Xanh (sạch)
          workTelemetryService.reportBktResult({
            competitor_channel_url: uploadResult?.video_url,
            status: 'green',
          });

          toast.success({
            title: 'Sạch Bản Quyền (Clean)',
            description: 'YouTube Studio xác nhận không có bất kỳ hạn chế bản quyền nào.',
          });

          // TỰ ĐỘNG BẮN LỆNH SANG KÊNH CHÍNH NẾU BẬT AUTO-PUBLISH (Chỉ khi không có tác vụ background worker đang chạy xử lý)
          if (autoPublishMain && mainProfileId && !activeBackgroundJob) {
            void executePublishToMainChannel();
          }
        } else if (res.status === 'red_matched') {
          setAutoPollSeconds(null);
          setPollRetryCount(0);

          // Telemetry: Báo cáo video test BKT Đỏ (dính bản quyền)
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
          // Vẫn pending (Processing SD/HD hoặc Checks...) -> Tự động lặp lại liên tục tối đa 25 lần (~10-12 phút)
          const MAX_POLLS = 25;
          if (pollRetryCount < MAX_POLLS) {
            setPollRetryCount((prev) => prev + 1);
            setAutoPollSeconds(25);
            setStudioStatus((prev) =>
              prev
                ? {
                    ...prev,
                    restriction: `${res.restriction || 'YouTube đang phân tích video & âm thanh'} [Lần ${pollRetryCount + 1}/${MAX_POLLS}]`,
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
    autoPublishMain,
    mainProfileId,
    executePublishToMainChannel,
    toast,
    activeBackgroundJob,
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
      // 1. PRE-FLIGHT SCAN & ADAPTIVE REUP PIPELINE
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

      // 2. AI TỐI ƯU TIÊU ĐỀ 95/5 & MÔ TẢ
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

      // Đọc file .description đồng hành nếu có
      let compDesc = '';
      try {
        const d = await invoke<string | null>('read_companion_description', {
          videoPath: inputVideoPath,
        });
        if (d?.trim()) {
          compDesc = d.trim();
        }
      } catch {
        // ignore
      }

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

      // 3. DÒ TÌM THUMBNAIL ĐI KÈM
      setAutoPilotStep(3);
      const compThumb = getCompanionThumbnailPath(inputVideoPath);
      if (compThumb) {
        setUploadThumbnailPath(compThumb);
      }

      // 4. TỰ ĐỘNG ĐĂNG KÊNH BKT UNLISTED ĐỂ TEST
      setAutoPilotStep(4);
      toast.info({
        title: 'Auto-Pilot [3/4]: Tải lên Kênh BKT (Unlisted)...',
        description: 'Đang tải video ẩn lên YouTube Studio để quét bản quyền...',
      });

      const bktRes = await invoke<{
        success: boolean;
        video_url?: string;
        youtube_video_id?: string;
        error?: string;
      }>('upload_video_multibrowser', {
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

      // 5. BẮT ĐẦU CHU KỲ QUÉT STUDIO THÔNG MINH (POLLING)
      setAutoPilotStep(5);
      setPollRetryCount(0);
      setAutoPollSeconds(35); // 35s khởi đầu cho YouTube khởi tạo hàng xử lý
      setStudioStatus({
        status: 'pending',
        restriction:
          'Đã tải lên! YouTube đang xử lý SD/HD & chuẩn bị chạy thuật toán quét bản quyền Content ID (Checks)...',
        checked_at: new Date().toLocaleTimeString('vi-VN'),
      });

      toast.success({
        title: 'Auto-Pilot: Đã lên kênh BKT!',
        description:
          'Đang bắt đầu chu kỳ theo dõi YouTube xử lý & quét Content ID liên tục cho đến khi có kết luận!',
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/40 backdrop-blur-md flex-shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FlaskConical className="w-4 h-4 text-amber-500" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Reup Pipeline & Test Bản Quyền</h1>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs py-0"
            >
              Chuyên biệt Reup
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quản lý kênh test bản quyền độc lập, xử lý lách bản quyền video chuyên sâu & tự động
            kiểm tra trên YouTube Studio
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemePicker />
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ================= 100% ZERO-TOUCH AUTO-PILOT BANNER ================= */}
        <Card className="p-4 sm:p-5 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-background to-emerald-500/10 backdrop-blur-md space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm font-bold text-foreground">
                  Quy Trình Tự Động Hóa 100% (Zero-Touch Auto-Pilot)
                </h2>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                  A → Z Khép Kín
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tự động từ đầu đến cuối: Lách Reup (Đổi MD5/Audio) -&gt; AI Tiêu Đề 95/5 &amp; Mô Tả
                -&gt; Tự Nhận Thumbnail -&gt; Đăng Test Bản Quyền (Unlisted) -&gt; Tự Quét Studio
                -&gt; Tự Đăng Kênh Chính khi Xanh!
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isAutoPilotRunning && (
                <Button
                  size="default"
                  variant="destructive"
                  onClick={async () => {
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
                  }}
                  className="gap-2 font-semibold text-xs px-4 h-9 shadow-sm"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Dừng Auto-Pilot</span>
                </Button>
              )}
              <Button
                size="default"
                onClick={handleRunAutoPilot}
                disabled={!inputVideoPath || isAutoPilotRunning || isProcessing || isUploading}
                className="gap-2 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/20 text-xs px-5 h-9"
              >
                {isAutoPilotRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang chạy Auto-Pilot (Bước {autoPilotStep}/4)...</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    <span>Bắt Đầu Auto-Pilot 100% (1-Click)</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Progress bar thời gian thực khi Auto-Pilot đang render Reup */}
          {isAutoPilotRunning && autoPilotStep === 1 && reupProgress && (
            <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 mt-4 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  Auto-Pilot [1/4]: {reupProgress.status || 'Đang render video Reup Lv.1...'}
                </span>
                <span className="font-mono font-bold text-emerald-500">
                  {reupProgress.percent.toFixed(1)}%
                </span>
              </div>
              <Progress value={reupProgress.percent} className="h-2 bg-muted/60" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>Tốc độ: {reupProgress.speed || 'N/A'}</span>
                {reupProgress.fps !== undefined && <span>FPS: {reupProgress.fps}</span>}
                {reupProgress.eta_seconds !== undefined && (
                  <span>Còn lại: ~{Math.ceil(reupProgress.eta_seconds)}s</span>
                )}
              </div>
            </div>
          )}
        </Card>

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as 'bkt_channels' | 'pipeline' | 'bkt_upload' | 'ai_optimization')
          }
          className="w-full space-y-5"
        >
          <TabsList className="grid grid-cols-4 max-w-2xl bg-muted/60 p-1 border border-border/40">
            <TabsTrigger value="bkt_channels" className="flex items-center gap-1.5 text-xs py-2">
              <Tv className="w-4 h-4 text-emerald-500" />
              <span className="font-medium">1. Kênh Test Bản Quyền</span>
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-1.5 text-xs py-2">
              <Wand2 className="w-4 h-4 text-rose-500" />
              <span className="font-medium">2. Xử Lý Reup</span>
            </TabsTrigger>
            <TabsTrigger value="bkt_upload" className="flex items-center gap-1.5 text-xs py-2">
              <FlaskConical className="w-4 h-4 text-amber-500" />
              <span className="font-medium">3. Đăng Test Bản Quyền</span>
            </TabsTrigger>
            <TabsTrigger value="ai_optimization" className="flex items-center gap-1.5 text-xs py-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="font-medium">4. AI Tiêu Đề &amp; Thumb</span>
            </TabsTrigger>
          </TabsList>

          {/* ================= TAB 1: QUẢN LÝ KÊNH TEST BẢN QUYỀN ================= */}
          <TabsContent value="bkt_channels" className="space-y-5">
            <BktChannelManagerTab />
          </TabsContent>

          {/* ================= TAB 2: REUP PIPELINE ================= */}
          <TabsContent value="pipeline" className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Input Video & Config */}
              <div className="lg:col-span-2 space-y-5">
                {/* 1. Chọn video */}
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <FileVideo className="w-4 h-4 text-primary" />
                      Video gốc cần xử lý Reup
                    </Label>
                    <div className="flex items-center gap-2">
                      {inputVideoPath &&
                        (inputVideoPath.startsWith('http://') ||
                          inputVideoPath.startsWith('https://')) && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleQuickDownloadUrl(inputVideoPath)}
                            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Tải về máy</span>
                          </Button>
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePickInputVideo}
                        className="h-8 text-xs gap-1.5 border-primary/30 hover:border-primary text-primary"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Chọn file từ máy tính</span>
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                    {inputVideoPath ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground block">
                            Đường dẫn tệp:
                          </span>
                          {(inputVideoPath.startsWith('http://') ||
                            inputVideoPath.startsWith('https://')) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10"
                            >
                              URL Web/YouTube (Cần tải về)
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-mono font-medium text-foreground break-all">
                          {inputVideoPath}
                        </p>

                        {/* Pre-flight Scan Smart Status */}
                        {!inputVideoPath.startsWith('http://') &&
                          !inputVideoPath.startsWith('https://') && (
                            <div className="mt-3 pt-2.5 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isScanningPreflight ? (
                                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/60 text-muted-foreground border border-border/50">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                    <span>Đang quét tiền trạm AI (~0.5s)...</span>
                                  </div>
                                ) : preflightScan ? (
                                  <>
                                    <div
                                      className={cn(
                                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border',
                                        preflightScan.mode === 'clean' &&
                                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                                        preflightScan.mode === 'logo_only' &&
                                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                                        preflightScan.mode === 'subtitles_only' &&
                                          'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
                                        preflightScan.mode === 'comprehensive' &&
                                          'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
                                      )}
                                    >
                                      {preflightScan.mode === 'clean' && (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                      )}
                                      {preflightScan.mode === 'logo_only' && (
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                      )}
                                      {preflightScan.mode === 'subtitles_only' && (
                                        <Tv className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                      )}
                                      {preflightScan.mode === 'comprehensive' && (
                                        <Wand2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                                      )}
                                      <span>{preflightScan.badgeText}</span>
                                    </div>

                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-muted-foreground bg-muted/50 border border-border/40">
                                      <Timer className="w-3 h-3 text-muted-foreground" />
                                      <span>
                                        {preflightScan.scanDurationMs > 0
                                          ? `${(preflightScan.scanDurationMs / 1000).toFixed(2)}s`
                                          : '~0.5s'}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTriggerPreflightScan(inputVideoPath)}
                                    className="h-7 px-2.5 text-xs gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5"
                                  >
                                    <Zap className="w-3 h-3 text-primary" />
                                    <span>Quét tiền trạm AI (~0.5s)</span>
                                  </Button>
                                )}
                              </div>

                              {preflightScan && !isScanningPreflight && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTriggerPreflightScan(inputVideoPath)}
                                  className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                  title="Quét lại tiền trạm video"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Quét lại</span>
                                </Button>
                              )}
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Chưa chọn video nào. Bấm nút "Chọn file từ máy tính" ở trên để nạp video.
                      </div>
                    )}
                  </div>
                </Card>

                {/* 2. Cấu hình cấp độ Reup */}
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Chọn Cấp độ Lách Reup (Pipeline Level)
                  </Label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Level 1 Option */}
                    <button
                      type="button"
                      onClick={() => setPipelineLevel('v1')}
                      className={cn(
                        'p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3',
                        pipelineLevel === 'v1'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/50 bg-muted/20 hover:border-border',
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                            <Wand2 className="w-4 h-4 text-primary" />
                            Cấp độ 1 (Chuẩn 95% gốc)
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]"
                          >
                            Khuyên dùng
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Giữ trọn 95% chất lượng gốc, can thiệp nhẹ 5% để phá vỡ nhận diện bản
                          quyền tự động.
                        </p>
                      </div>

                      <ul className="text-[11px] text-muted-foreground space-y-1 border-t border-border/40 pt-2.5">
                        <li>• Scale 1.01x kết hợp cắt nhẹ 1.01x viền ngoài</li>
                        <li>• Tăng tốc độ video nhẹ 1.03x (setpts PTS/1.03)</li>
                        <li>• Dịch tần số Pitch 1.02x (phá Audio Fingerprint)</li>
                        <li>• Xóa sạch Metadata EXIF camera/phần mềm gốc</li>
                        <li>• Đệm 32-bytes random padding đổi mã băm MD5/SHA256</li>
                      </ul>
                    </button>

                    {/* Level 2 Option */}
                    <button
                      type="button"
                      onClick={() => setPipelineLevel('v2')}
                      className={cn(
                        'p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3',
                        pipelineLevel === 'v2'
                          ? 'border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/30'
                          : 'border-border/50 bg-muted/20 hover:border-border',
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-rose-500" />
                            Cấp độ 2 (Deep Evasion)
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px]"
                          >
                            Lách sâu
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Sử dụng khi video bị YouTube bắt bản quyền chặt ở Cấp độ 1.
                        </p>
                      </div>

                      <ul className="text-[11px] text-muted-foreground space-y-1 border-t border-border/40 pt-2.5">
                        <li>• Lật ngang khung hình video (Horizontal Flip)</li>
                        <li>• Tinh chỉnh màu nhẹ (Contrast +4%, Saturation +5%)</li>
                        <li>• Scale zoom 1.02x + Tốc độ phát 1.05x</li>
                        <li>• Tần số âm thanh Pitch 1.04x</li>
                        <li>• Đệm 48-bytes random padding đổi mã băm container</li>
                      </ul>
                    </button>
                  </div>
                </Card>

                {/* Nút hành động chạy */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground">
                    Video xuất ra sẽ được lưu cùng thư mục với file gốc và hậu tố mã hóa.
                  </div>
                  <Button
                    variant="default"
                    size="default"
                    onClick={handleRunPipeline}
                    disabled={!inputVideoPath || isProcessing}
                    className="gap-2 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-md shadow-primary/20"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang render lách Reup...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Bắt đầu Chạy Reup Pipeline</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress bar khi đang xử lý */}
                {isProcessing && reupProgress && (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        {reupProgress.status || 'Đang render video...'}
                      </span>
                      <span className="font-mono font-bold text-primary">
                        {reupProgress.percent.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={reupProgress.percent} className="h-2 bg-muted/60" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                      <span>Tốc độ: {reupProgress.speed || 'N/A'}</span>
                      {reupProgress.fps !== undefined && <span>FPS: {reupProgress.fps}</span>}
                      {reupProgress.eta_seconds !== undefined && (
                        <span>Còn lại: ~{Math.ceil(reupProgress.eta_seconds)}s</span>
                      )}
                    </div>
                  </div>
                )}

                {processError && (
                  <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Lỗi xử lý Reup: {processError}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Processing Result Card */}
              <div className="space-y-4">
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4 h-full">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Hash className="w-4 h-4 text-emerald-500" />
                    Kết quả So sánh Checksum &amp; File
                  </Label>

                  {pipelineResult ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-1">
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Xử lý Reup hoàn tất thành công!
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {pipelineResult.message ||
                            `Đã chạy xong Reup Cấp độ ${pipelineResult.level}`}
                        </p>
                      </div>

                      {/* File xuất ra */}
                      <div className="space-y-1 text-xs">
                        <span className="text-muted-foreground font-medium">Tệp Reup xuất ra:</span>
                        <p className="font-mono text-[11px] text-foreground bg-muted/40 p-2 rounded border border-border/40 break-all select-all">
                          {pipelineResult.output_path}
                        </p>
                      </div>

                      {/* So sánh Checksum MD5 */}
                      <div className="space-y-2 text-xs">
                        <span className="text-muted-foreground font-medium">
                          Mã băm MD5 Container (Đổi hoàn toàn):
                        </span>
                        <div className="p-2.5 rounded bg-muted/40 border border-border/40 space-y-1.5 text-[11px] font-mono">
                          <div>
                            <span className="text-muted-foreground">Gốc: </span>
                            <span className="text-foreground/80 break-all">
                              {pipelineResult.original_md5 || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-emerald-500 font-semibold">Mới: </span>
                            <span className="text-emerald-400 font-bold break-all">
                              {pipelineResult.new_md5 || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Checksum SHA256 */}
                      {pipelineResult.new_sha256 && (
                        <div className="space-y-1 text-xs">
                          <span className="text-muted-foreground font-medium">SHA256 Mới:</span>
                          <p className="font-mono text-[10px] text-muted-foreground bg-muted/30 p-2 rounded border border-border/30 break-all select-all">
                            {pipelineResult.new_sha256}
                          </p>
                        </div>
                      )}

                      {/* Chuyển nhanh sang Test Bản Quyền */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab('bkt_upload')}
                        className="w-full gap-2 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
                      >
                        <span>Chuyển video này sang Kênh Test Bản Quyền</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
                      <Wand2 className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                      <p>Chưa có kết quả xử lý.</p>
                      <p className="text-[11px] text-muted-foreground/70">
                        Chọn video và bấm "Bắt đầu Chạy Reup" để xem sự thay đổi Checksum MD5 &amp;
                        SHA256 tại đây.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ================= TAB 3: ĐĂNG TEST BẢN QUYỀN ================= */}
          <TabsContent value="bkt_upload" className="space-y-5">
            {/* Real-time Background Task Monitor Banner */}
            {activeBackgroundJob &&
              (activeBackgroundJob.status === 'queued' ||
                activeBackgroundJob.status === 'pending' ||
                activeBackgroundJob.status === 'reuping' ||
                activeBackgroundJob.status === 'uploading' ||
                activeBackgroundJob.status === 'checking') &&
              (() => {
                const pctMatch = activeBackgroundJob.restriction?.match(/\b(\d{1,3})%/);
                const livePct =
                  activeBackgroundJob.uploadPercent ??
                  (pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : null);
                return (
                  <Card className="p-4 border-primary/40 bg-primary/5 backdrop-blur-sm space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Tiến Trình Chạy Ngầm Test Bản Quyền Đang Hoạt Động</span>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-primary text-[10px] font-mono uppercase"
                      >
                        {activeBackgroundJob.status}
                        {livePct !== null && activeBackgroundJob.status === 'uploading'
                          ? ` ${livePct}%`
                          : ''}
                      </Badge>
                    </div>
                    <div className="text-xs text-foreground font-medium truncate">
                      Video: {activeBackgroundJob.videoTitle}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px] pt-1">
                      <div
                        className={cn(
                          'p-2 rounded border text-center font-medium',
                          activeBackgroundJob.status === 'queued'
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-muted/30 border-border/30 text-muted-foreground',
                        )}
                      >
                        1. Xếp hàng
                      </div>
                      <div
                        className={cn(
                          'p-2 rounded border text-center font-medium',
                          activeBackgroundJob.status === 'uploading'
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-muted/30 border-border/30 text-muted-foreground',
                        )}
                      >
                        2. Tải lên Studio
                      </div>
                      <div
                        className={cn(
                          'p-2 rounded border text-center font-medium',
                          activeBackgroundJob.status === 'checking' ||
                            activeBackgroundJob.status === 'pending'
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-muted/30 border-border/30 text-muted-foreground',
                        )}
                      >
                        3. Quét Content ID
                      </div>
                      <div
                        className={cn(
                          'p-2 rounded border text-center font-medium',
                          activeBackgroundJob.status === 'reuping'
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-muted/30 border-border/30 text-muted-foreground',
                        )}
                      >
                        4. Reup &amp; Kênh Đích
                      </div>
                    </div>
                    {livePct !== null && activeBackgroundJob.status === 'uploading' && (
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${livePct}%` }}
                        />
                      </div>
                    )}
                    {activeBackgroundJob.restriction && (
                      <div className="text-[11px] text-muted-foreground">
                        Chi tiết: {activeBackgroundJob.restriction}
                      </div>
                    )}
                  </Card>
                );
              })()}

            {/* Cảnh báo chưa đăng nhập Google Studio */}
            {isLoginRequiredError && (
              <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Hồ sơ trình duyệt chưa đăng nhập tài khoản Google / YouTube Studio. Vui lòng mở
                    Studio để đăng nhập trước khi chạy kiểm tra bản quyền.
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => handleOpenProfileStudio()}
                  className="h-7 px-3 text-xs gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Đăng Nhập Studio Ngay</span>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Test Upload Configuration */}
              <div className="lg:col-span-2 space-y-5">
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-blue-500" />
                      Tải Video Lên Kênh Test để Thử Nghiệm
                    </Label>
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs"
                    >
                      Chế độ Không Công Khai (Unlisted)
                    </Badge>
                  </div>

                  {profiles.length === 0 && (
                    <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-500 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-semibold">Chưa có Hồ sơ trình duyệt nào!</span>
                        <p className="text-[11px] text-muted-foreground">
                          Để tải video ngầm và kiểm tra bản quyền, vui lòng vào menu "Hồ sơ trình
                          duyệt" tạo profile và đăng nhập tài khoản Kênh Test.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 1. Chọn Kênh Test Bản Quyền */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        Kênh Test Bản Quyền (Mượn slot Unlisted kiểm tra bản quyền ngầm)
                      </Label>
                      {selectedProfileId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenProfileStudio()}
                          className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
                          title="Mở trực tiếp YouTube Studio của Kênh Test này"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Mở Studio Kênh Test</span>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select
                          value={selectedProfileId}
                          onValueChange={(val) => {
                            handleChangeBktProfileId(val);
                            setStudioStatus(null);
                            setActiveBackgroundJob(null);
                            setUploadResult(null);
                            setAutoPollSeconds(null);
                            setPollRetryCount(0);
                            setIsLoginRequiredError(false);
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs bg-muted/40 border-border/50">
                            <SelectValue
                              placeholder={
                                bktChannels.length === 0
                                  ? 'Chưa có Kênh Test nào...'
                                  : 'Chọn Kênh Test Bản Quyền...'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {bktChannels.length > 0 ? (
                              bktChannels.map((bc) => (
                                <SelectItem
                                  key={`bkt-${bc.id}`}
                                  value={bc.profileId}
                                  className="text-xs"
                                >
                                  <span className="font-medium text-foreground">{bc.name}</span>
                                  <span
                                    className={cn(
                                      'text-[10px] ml-2 font-mono',
                                      bc.remainingQuota <= 0
                                        ? 'text-rose-400'
                                        : bc.remainingQuota <= 3
                                          ? 'text-amber-400'
                                          : 'text-emerald-400',
                                    )}
                                  >
                                    (Còn {bc.remainingQuota}/{bc.dailyQuota} lượt test)
                                  </span>
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="__none__" disabled className="text-xs">
                                Chưa có kênh test nào. Tạo tại tab '1. Kênh Test Bản Quyền'.
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenProfileStudio()}
                        disabled={!selectedProfileId}
                        className="h-9 px-3 text-xs gap-1.5 border-border/60 hover:border-primary/50 text-foreground"
                        title="Mở YouTube Studio trên hồ sơ này"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở Studio</span>
                      </Button>
                    </div>
                  </div>

                  {/* 2. File video cần test */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">File Video Reup cần test:</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePickUploadVideo}
                        className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>Chọn file khác</span>
                      </Button>
                    </div>
                    <Input
                      value={uploadVideoPath}
                      onChange={(e) => setUploadVideoPath(e.target.value)}
                      placeholder="D:/Videos/.../video_reup.mp4"
                      className="h-8 text-xs font-mono bg-muted/40"
                    />
                  </div>

                  {/* 3. File Ảnh Thumbnail */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-primary" />
                        Ảnh Thumbnail (.jpg / .png):
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const selected = await open({
                            multiple: false,
                            filters: [
                              {
                                name: 'Image Files',
                                extensions: ['jpg', 'jpeg', 'png', 'webp'],
                              },
                            ],
                          });
                          if (typeof selected === 'string') {
                            setUploadThumbnailPath(selected);
                          }
                        }}
                        className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>Chọn ảnh khác</span>
                      </Button>
                    </div>
                    <Input
                      value={uploadThumbnailPath}
                      onChange={(e) => setUploadThumbnailPath(e.target.value)}
                      placeholder="Tự động nhận diện file ảnh cùng tên trong thư mục video"
                      className="h-8 text-xs font-mono bg-muted/40"
                    />
                  </div>

                  {/* 4. Tiêu đề & Mô tả */}
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Tiêu đề video test:</Label>
                        <span
                          className={cn(
                            'text-[10px] font-mono',
                            uploadTitle.length > 90
                              ? 'text-amber-400 font-bold'
                              : 'text-muted-foreground',
                          )}
                        >
                          {uploadTitle.length}/100 ký tự
                        </span>
                      </div>
                      <Input
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value.slice(0, 100))}
                        maxLength={100}
                        placeholder="Tiêu đề video tải lên (tối đa 100 ký tự)"
                        className="h-8 text-xs bg-muted/40"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Mô tả (Description):</Label>
                      <Textarea
                        value={uploadDescription}
                        onChange={(e) => setUploadDescription(e.target.value)}
                        rows={2}
                        className="text-xs bg-muted/40 resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">
                          Thẻ Tags (cách nhau bởi dấu phẩy):
                        </Label>
                        <span className="text-[10px] text-muted-foreground">
                          Tối đa 480 ký tự • Tự động tạo chip khi upload
                        </span>
                      </div>
                      <Input
                        value={uploadTags}
                        onChange={(e) => setUploadTags(e.target.value)}
                        placeholder="ví dụ: review phim, tom tat phim, phim hay 2025..."
                        className="h-8 text-xs bg-muted/40"
                      />
                    </div>
                  </div>

                  {/* Nút thực thi đăng */}
                  <div className="pt-2 flex items-center justify-end">
                    <Button
                      variant="default"
                      size="default"
                      onClick={handleUploadBkt}
                      disabled={!selectedProfileId || !uploadVideoPath || isUploading}
                      className="gap-2 px-6 bg-blue-600 text-white hover:bg-blue-700 font-medium shadow-md shadow-blue-500/20"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Playwright đang tải lên YouTube Studio...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" />
                          <span>Tải Lên Kênh Test để Kiểm Tra</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {uploadResult?.error && (
                    <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Lỗi đăng video: {uploadResult.error}</span>
                    </div>
                  )}
                </Card>

                {/* ================= THIẾT LẬP AUTO-PUBLISH KÊNH CHÍNH ================= */}
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        Tự Động Đăng Kênh Chính (Auto-Publish)
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Tự động đẩy video + thumbnail + metadata sang Kênh Chính khi Sạch Bản Quyền
                      </p>
                    </div>
                    <Switch checked={autoPublishMain} onCheckedChange={handleToggleAutoPublish} />
                  </div>

                  {autoPublishMain && (
                    <div className="space-y-3 pt-2 text-xs border-t border-border/40">
                      {/* Chọn Hồ Sơ Kênh Chính */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          Hồ sơ Kênh Chính đích:
                        </Label>
                        <Select value={mainProfileId} onValueChange={handleChangeMainProfileId}>
                          <SelectTrigger className="h-8 text-xs bg-muted/40 border-border/50">
                            <SelectValue placeholder="Chọn Hồ sơ Kênh Chính..." />
                          </SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => (
                              <SelectItem key={`main-${p.id}`} value={p.id} className="text-xs">
                                <span className="font-medium text-foreground">
                                  {p.profile_name}
                                </span>
                                {p.proxy && (
                                  <span className="text-[10px] text-muted-foreground ml-2">
                                    (Proxy: {maskProxy(p.proxy)})
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Chế độ hiển thị */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          Chế độ xuất bản:
                        </Label>
                        <Select
                          value={mainVisibility}
                          onValueChange={(v: 'public' | 'schedule' | 'unlisted') =>
                            handleChangeMainVisibility(v)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-muted/40 border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">Công khai (Public)</SelectItem>
                            <SelectItem value="schedule">Lên lịch (Schedule)</SelectItem>
                            <SelectItem value="unlisted">Không công khai (Unlisted)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Nút bấm thủ công hoặc cưỡng chế */}
                      <Button
                        size="sm"
                        onClick={() => executePublishToMainChannel()}
                        disabled={!mainProfileId || !uploadVideoPath || isPublishingMain}
                        className={cn(
                          'w-full text-xs gap-1.5 mt-2',
                          studioStatus?.status === 'green_clean'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        )}
                      >
                        {isPublishingMain ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{mainPublishProgress || 'Đang đăng Kênh Chính...'}</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>
                              {studioStatus?.status === 'green_clean'
                                ? 'Đăng Kênh Chính Ngay (Đã Sạch Bản Quyền)'
                                : 'Đăng Kênh Chính Ngay'}
                            </span>
                          </>
                        )}
                      </Button>

                      {mainPublishResult?.success && (
                        <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã đăng Kênh Chính thành công!
                          </span>
                          {mainPublishResult.video_url && (
                            <a
                              href={mainPublishResult.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] underline flex items-center gap-0.5"
                            >
                              <span>Xem</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      )}
                      {mainPublishResult?.error && (
                        <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>Lỗi: {mainPublishResult.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {/* Right Column: Shadow Check Monitor */}
              <div className="space-y-4">
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4 h-full">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Theo Dõi Bản Quyền (Studio Monitor)
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckStudioStatus}
                      disabled={isCheckingStudio}
                      className="h-7 px-2 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                      title="Chạy Playwright quét cột Hạn chế trên YouTube Studio ngay"
                    >
                      <RefreshCw
                        className={cn('w-3 h-3', isCheckingStudio && 'animate-spin text-primary')}
                      />
                      <span>Quét kết quả</span>
                    </Button>
                  </div>

                  {uploadResult?.success && (
                    <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 space-y-1">
                      <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đã tải lên Kênh Test thành công!
                      </span>
                      {uploadResult.video_url && (
                        <a
                          href={uploadResult.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-300 hover:underline flex items-center gap-1"
                        >
                          <span>Xem video trên YouTube</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {studioStatus ? (
                    <div className="space-y-3 p-3.5 rounded-xl border border-border/60 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Trạng thái YouTube:</span>
                        {studioStatus.status === 'green_clean' && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs px-2 py-0.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                            Sạch Bản Quyền (Clean)
                          </Badge>
                        )}
                        {studioStatus.status === 'red_matched' && (
                          <Badge
                            variant="outline"
                            className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs px-2 py-0.5"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 mr-1 text-rose-400" />
                            Dính Bản Quyền (Content ID)
                          </Badge>
                        )}
                        {studioStatus.status === 'failed' && (
                          <Badge
                            variant="outline"
                            className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs px-2 py-0.5"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-400" />
                            Kiểm tra thất bại
                          </Badge>
                        )}
                        {studioStatus.status === 'pending' && (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs px-2 py-0.5 animate-pulse"
                            >
                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-amber-400" />
                              Đang kiểm tra...
                            </Badge>
                            {autoPollSeconds !== null && autoPollSeconds > 0 && (
                              <span className="text-[11px] text-amber-400/80 font-mono">
                                ({autoPollSeconds}s)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 text-xs">
                        <span className="text-muted-foreground">Cột Hạn chế (Restrictions):</span>
                        <p className="font-medium text-foreground bg-background/60 p-2 rounded border border-border/40">
                          {studioStatus.restriction || 'Không có hạn chế nào'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                        <span>Lần quét gần nhất:</span>
                        <span>{studioStatus.checked_at || 'Vừa xong'}</span>
                      </div>

                      {studioStatus.status === 'red_matched' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setActiveTab('pipeline');
                            setPipelineLevel('v2');
                          }}
                          className="w-full text-xs gap-1.5 mt-2"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Chuyển sang Reup Cấp độ 2 (Lách sâu) ngay</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
                      <ShieldCheck className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                      <p>Chưa có dữ liệu kiểm tra bản quyền.</p>
                      <p className="text-[11px] text-muted-foreground/70">
                        Sau khi video được đăng lên Kênh Test, bấm "Quét kết quả" để đọc trạng thái
                        Restrictions từ YouTube Studio.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ================= TAB 4: AI TỐI ƯU TIÊU ĐỀ & THUMBNAIL ================= */}
          <TabsContent value="ai_optimization" className="space-y-5">
            <AiTitleThumbnailTab
              activeVideoTitle={
                uploadTitle ||
                (inputVideoPath
                  ? inputVideoPath
                      .split(/[\\/]/)
                      .pop()
                      ?.replace(/\.[^/.]+$/, '')
                  : '')
              }
              activeThumbnailPath={uploadThumbnailPath}
              activeVideoUrl={
                inputVideoPath &&
                (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://'))
                  ? inputVideoPath
                  : undefined
              }
              activeTags={
                uploadTags
                  ? uploadTags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  : undefined
              }
              onApplyTitle={(title) => {
                setUploadTitle(title);
                toast.success({
                  title: 'Đã cập nhật tiêu đề',
                  description: 'Tiêu đề đã được đồng bộ sang BKT Upload & Auto-Publish.',
                });
              }}
              onApplyThumbnail={(thumbPath) => {
                setUploadThumbnailPath(thumbPath);
                toast.success({
                  title: 'Đã cập nhật thumbnail',
                  description: 'Ảnh bìa đã được gắn vào quy trình BKT Upload & Auto-Publish.',
                });
              }}
              onApplyTags={(tagsArr) => {
                const tagsStr = tagsArr.join(', ');
                setUploadTags(tagsStr);
                try {
                  sessionStorage.setItem('reup_input_video_tags', tagsStr);
                } catch {}
                toast.success({
                  title: 'Đã cập nhật Thẻ Tags',
                  description: `Đã đồng bộ ${tagsArr.length} thẻ tags sang form BKT & Kênh Chính.`,
                });
              }}
              onApplyDescription={(desc) => {
                setUploadDescription(desc);
                toast.success({
                  title: 'Đã cập nhật Mô tả',
                  description: 'Mô tả tối ưu đã được đồng bộ sang form BKT & Kênh Chính.',
                });
              }}
              onNavigateToBkt={() => {
                setActiveTab('bkt_upload');
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
