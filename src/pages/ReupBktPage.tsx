import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  FlaskConical,
  FolderOpen,
  Globe,
  Hash,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tv,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AiTitleThumbnailTab } from '@/components/bkt/AiTitleThumbnailTab';
import { BktChannelManagerTab } from '@/components/bkt/BktChannelManagerTab';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import {
  checkBktCopyrightStatus,
  getBktTestChannels,
  getMultibrowserProfiles,
} from '@/contexts/channels/channels-client';
import type { BktTestChannel, MultiBrowserProfile, ReupPipelineResult } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ReupBktPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    'pipeline' | 'bkt_upload' | 'bkt_channels' | 'ai_optimization'
  >('pipeline');

  // ================= PIPELINE STATE =================
  const [inputVideoPath, setInputVideoPath] = useState<string>('');
  const [pipelineLevel, setPipelineLevel] = useState<'v1' | 'v2'>('v1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<ReupPipelineResult | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  // ================= BKT UPLOAD STATE =================
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const [bktChannels, setBktChannels] = useState<BktTestChannel[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [uploadVideoPath, setUploadVideoPath] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState<string>(
    'Test copyright check on BKT shadow channel (Unlisted mode)',
  );
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    video_url?: string;
    youtube_video_id?: string;
    error?: string;
  } | null>(null);

  // ================= BKT MONITOR STATE =================
  const [isCheckingStudio, setIsCheckingStudio] = useState<boolean>(false);
  const [studioStatus, setStudioStatus] = useState<{
    status: 'pending' | 'green_clean' | 'red_matched';
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
      }
      if (Array.isArray(bktData)) {
        setBktChannels(bktData);
        if (bktData.length > 0 && !selectedProfileId) {
          const firstAvailable = bktData.find((c) => c.isActive && c.remainingQuota > 0);
          if (firstAvailable) {
            setSelectedProfileId(firstAvailable.profileId);
          } else if (profData.length > 0) {
            setSelectedProfileId(profData[0].id);
          }
        }
      } else if (profData.length > 0 && !selectedProfileId) {
        setSelectedProfileId(profData[0].id);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }, [selectedProfileId]);

  // Check candidate from Outlier Hunter
  useEffect(() => {
    const candidateTitle = sessionStorage.getItem('reup_input_video_title');
    if (candidateTitle) {
      setUploadTitle(candidateTitle);
      sessionStorage.removeItem('reup_input_video_title');
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

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
        setUploadTitle(filename.replace(/\.[^/.]+$/, ''));
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
    setIsProcessing(true);
    setProcessError(null);
    setPipelineResult(null);

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
      setUploadTitle(filename.replace(/\.[^/.]+$/, ''));

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

  // Check copyright status on YouTube Studio
  const handleCheckStudioStatus = useCallback(async () => {
    if (!selectedProfileId) {
      toast.warning({
        title: 'Chưa chọn Profile',
        description:
          'Vui lòng chọn Hồ sơ trình duyệt đích để Playwright mở YouTube Studio quét kết quả.',
      });
      return;
    }
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
          toast.success({
            title: 'Sạch Bản Quyền (Clean)',
            description: 'YouTube Studio xác nhận không có bất kỳ hạn chế bản quyền nào.',
          });
        } else if (res.status === 'red_matched') {
          setAutoPollSeconds(null);
          setPollRetryCount(0);
          toast.error({
            title: 'Dính Bản Quyền (Content ID)',
            description:
              res.restriction || 'YouTube phát hiện bản quyền trên kênh BKT. Khuyên dùng Cấp độ 2.',
          });
        } else {
          // Vẫn pending -> Tự động thử lại tối đa 4 lần nếu đang trong chu kỳ
          if (pollRetryCount < 4) {
            setPollRetryCount((prev) => prev + 1);
            setAutoPollSeconds(25);
          } else {
            setAutoPollSeconds(null);
          }
          toast.info({
            title: 'Đang kiểm tra...',
            description: 'YouTube Studio vẫn đang phân tích âm thanh & video ngầm.',
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
      setIsCheckingStudio(false);
    }
  }, [selectedProfileId, uploadResult?.youtube_video_id, pollRetryCount, toast]);

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
            <h1 className="text-lg font-bold text-foreground">Reup Pipeline & Test Kênh BKT</h1>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs py-0"
            >
              Chuyên biệt Reup
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Xử lý lách bản quyền video chuyên sâu (đổi Checksum MD5/SHA256, xóa metadata) &amp; Tự
            động đăng test kiểm tra bản quyền ngầm trên kênh BKT
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemePicker />
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as 'pipeline' | 'bkt_upload' | 'bkt_channels' | 'ai_optimization')
          }
          className="w-full space-y-5"
        >
          <TabsList className="grid grid-cols-4 max-w-2xl bg-muted/60 p-1 border border-border/40">
            <TabsTrigger value="pipeline" className="flex items-center gap-1.5 text-xs py-2">
              <Wand2 className="w-4 h-4 text-rose-500" />
              <span className="font-medium">1. Xử Lý Reup</span>
            </TabsTrigger>
            <TabsTrigger value="bkt_upload" className="flex items-center gap-1.5 text-xs py-2">
              <FlaskConical className="w-4 h-4 text-amber-500" />
              <span className="font-medium">2. Đăng BKT</span>
            </TabsTrigger>
            <TabsTrigger value="bkt_channels" className="flex items-center gap-1.5 text-xs py-2">
              <Tv className="w-4 h-4 text-emerald-500" />
              <span className="font-medium">3. Kênh Test BKT</span>
            </TabsTrigger>
            <TabsTrigger value="ai_optimization" className="flex items-center gap-1.5 text-xs py-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="font-medium">4. AI Tiêu Đề &amp; Thumb</span>
            </TabsTrigger>
          </TabsList>

          {/* ================= TAB 1: REUP PIPELINE ================= */}
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

                  <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                    {inputVideoPath ? (
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground block">
                          Đường dẫn tệp:
                        </span>
                        <p className="text-xs font-mono font-medium text-foreground break-all">
                          {inputVideoPath}
                        </p>
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

                      {/* Chuyển nhanh sang Test BKT */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab('bkt_upload')}
                        className="w-full gap-2 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
                      >
                        <span>Chuyển video này sang Test Kênh BKT</span>
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

          {/* ================= TAB 2: BKT SHADOW TEST ================= */}
          <TabsContent value="bkt_upload" className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: BKT Upload Configuration */}
              <div className="lg:col-span-2 space-y-5">
                <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-blue-500" />
                      Tải Video Lên Kênh BKT để Thử Nghiệm
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
                          duyệt" tạo profile và đăng nhập tài khoản kênh BKT.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 1. Chọn Profile Browser Multi BKT */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-primary" />
                      Hồ sơ Browser Multi đích (Kênh BKT đã đăng nhập YouTube)
                    </Label>
                    <Select
                      value={selectedProfileId}
                      onValueChange={(val) => {
                        setSelectedProfileId(val);
                        setStudioStatus(null);
                        setAutoPollSeconds(null);
                        setPollRetryCount(0);
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs bg-muted/40 border-border/50">
                        <SelectValue
                          placeholder={
                            profiles.length === 0 ? 'Chưa có profile nào...' : 'Chọn Profile...'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {bktChannels.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-semibold text-primary uppercase tracking-wider">
                            Kênh Test Bản Quyền (Giới hạn 15 video/ngày)
                          </div>
                        )}
                        {bktChannels.map((bc) => (
                          <SelectItem key={`bkt-${bc.id}`} value={bc.profileId} className="text-xs">
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
                              (Còn {bc.remainingQuota}/{bc.dailyQuota} lượt)
                            </span>
                          </SelectItem>
                        ))}

                        {profiles.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1 border-t border-border/30">
                            Tất cả Hồ sơ Profile
                          </div>
                        )}
                        {profiles.length === 0 && bktChannels.length === 0 ? (
                          <SelectItem value="__none__" disabled className="text-xs">
                            Chưa có profile nào. Tạo tại Quản lý Profile.
                          </SelectItem>
                        ) : (
                          profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              <span className="font-medium text-foreground">{p.profile_name}</span>
                              {p.proxy ? (
                                <span className="text-[10px] text-muted-foreground ml-2">
                                  (Proxy: {p.proxy})
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground ml-2">
                                  (IP Trực tiếp)
                                </span>
                              )}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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

                  {/* 3. Tiêu đề & Mô tả */}
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Tiêu đề video test:</Label>
                      <Input
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="Tiêu đề video tải lên"
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
                          <span>Tải Lên Kênh BKT để Test</span>
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
                        Đã tải lên kênh BKT thành công!
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
                        Sau khi video được đăng lên kênh BKT, bấm "Quét kết quả" để đọc trạng thái
                        Restrictions từ YouTube Studio.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ================= TAB 3: QUẢN LÝ KÊNH TEST BẢN QUYỀN ================= */}
          <TabsContent value="bkt_channels" className="space-y-5">
            <BktChannelManagerTab />
          </TabsContent>

          {/* ================= TAB 4: AI TỐI ƯU TIÊU ĐỀ & THUMBNAIL ================= */}
          <TabsContent value="ai_optimization" className="space-y-5">
            <AiTitleThumbnailTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
