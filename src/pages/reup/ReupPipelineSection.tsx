import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileVideo,
  FolderOpen,
  FolderPlus,
  Hash,
  Layers,
  ListOrdered,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  StopCircle,
  Timer,
  Trash2,
  Tv,
  Wand2,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import type { ReupPipelineResult } from '@/lib/types';
import { cn } from '@/lib/utils';
import { type PreflightScanResult, parsePreflightScanResult } from '@/utils/reup-auto-pilot';
import type { ReupBktController, ReupProgressInfo } from './types';

export interface BatchReupItem {
  id: string;
  path: string;
  filename: string;
  status: 'pending' | 'scanning' | 'processing' | 'completed' | 'error';
  preflight?: PreflightScanResult | null;
  progressPercent: number;
  speed?: string;
  fps?: number;
  etaSeconds?: number;
  result?: ReupPipelineResult | null;
  error?: string;
}

interface ReupPipelineSectionProps {
  controller: ReupBktController;
}

export function ReupPipelineSection({ controller }: ReupPipelineSectionProps) {
  const toast = useToast();
  const {
    inputVideoPath,
    handlePickInputVideo,
    handleQuickDownloadUrl,
    preflightScan,
    isScanningPreflight,
    handleTriggerPreflightScan,
    pipelineLevel,
    setPipelineLevel,
    handleRunPipeline,
    isProcessing,
    reupProgress,
    processError,
    pipelineResult,
    setActiveTab,
  } = controller;

  // View mode: 'batch' (Hàng đợi nhiều tệp) or 'single' (Xử lý đơn tệp)
  const [viewMode, setViewMode] = useState<'batch' | 'single'>('batch');

  // Batch Queue state
  const [batchQueue, setBatchQueue] = useState<BatchReupItem[]>([]);
  const [batchPipelineMode, setBatchPipelineMode] = useState<'adaptive' | 'v1' | 'v2'>('adaptive');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [activeBatchIndex, setActiveBatchIndex] = useState<number>(-1);
  const [isDragOver, setIsDragOver] = useState(false);
  const stopRequestedRef = useRef(false);

  // Listen to ffmpeg progress event for the currently processing batch item
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let isSubscribed = true;

    listen<ReupProgressInfo>('reup-pipeline-progress', (event) => {
      if (!isSubscribed || !event.payload) return;
      const { percent, speed, fps, eta_seconds } = event.payload;

      setBatchQueue((prev) => {
        if (activeBatchIndex < 0 || activeBatchIndex >= prev.length) return prev;
        return prev.map((item, idx) => {
          if (idx !== activeBatchIndex) return item;
          return {
            ...item,
            progressPercent: Math.min(100, Math.max(0, percent)),
            speed,
            fps,
            etaSeconds: eta_seconds,
          };
        });
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      isSubscribed = false;
      if (unlisten) unlisten();
    };
  }, [activeBatchIndex]);

  // Add multiple files from file picker
  const handleAddMultipleFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Video Files',
            extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'm4v'],
          },
        ],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const newItems: BatchReupItem[] = paths.map((p) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: p,
        filename: p.split(/[\\/]/).pop() || p,
        status: 'pending',
        progressPercent: 0,
      }));

      setBatchQueue((prev) => {
        const existingPaths = new Set(prev.map((i) => i.path));
        const filtered = newItems.filter((i) => !existingPaths.has(i.path));
        return [...prev, ...filtered];
      });

      toast.success({
        title: 'Đã thêm video vào hàng đợi',
        message: `Đã nạp ${newItems.length} video.`,
      });
    } catch (err) {
      console.error('Pick files error:', err);
    }
  };

  // Add folder of videos
  const handleAddFolder = async () => {
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: 'Chọn thư mục chứa video cần Reup',
      });
      if (typeof folder !== 'string') return;

      const files = await invoke<string[]>('scan_directory_videos_cmd', {
        dirPath: folder,
        dir_path: folder,
      });

      if (!files || files.length === 0) {
        toast.warning({
          title: 'Không tìm thấy video',
          message: 'Thư mục không chứa file video định dạng mp4, mkv, mov, webm, avi, flv.',
        });
        return;
      }

      const newItems: BatchReupItem[] = files.map((p) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: p,
        filename: p.split(/[\\/]/).pop() || p,
        status: 'pending',
        progressPercent: 0,
      }));

      setBatchQueue((prev) => {
        const existingPaths = new Set(prev.map((i) => i.path));
        const filtered = newItems.filter((i) => !existingPaths.has(i.path));
        return [...prev, ...filtered];
      });

      toast.success({
        title: 'Đã nạp thư mục',
        message: `Đã tìm thấy và thêm ${files.length} video từ ${folder}.`,
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi nạp thư mục',
        message: String(err),
      });
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    const validVideoExts = ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.flv', '.m4v'];
    const videoFiles = droppedFiles.filter((f) => {
      const lower = f.name.toLowerCase();
      return validVideoExts.some((ext) => lower.endsWith(ext));
    });

    if (videoFiles.length === 0) {
      toast.warning({
        title: 'Định dạng không hợp lệ',
        message: 'Chỉ chấp nhận các tệp video .mp4, .mkv, .mov, .webm, .avi, .flv, .m4v',
      });
      return;
    }

    const newItems: BatchReupItem[] = videoFiles.map((f) => {
      const path = (f as unknown as { path?: string }).path || f.name;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path,
        filename: f.name,
        status: 'pending',
        progressPercent: 0,
      };
    });

    setBatchQueue((prev) => {
      const existingPaths = new Set(prev.map((i) => i.path));
      const filtered = newItems.filter((i) => !existingPaths.has(i.path));
      return [...prev, ...filtered];
    });

    toast.success({
      title: 'Đã nhận tệp kéo thả',
      message: `Đã thêm ${newItems.length} video vào hàng đợi.`,
    });
  };

  // Remove single item from queue
  const handleRemoveQueueItem = (id: string) => {
    if (isBatchRunning) return;
    setBatchQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Clear all items in queue
  const handleClearQueue = () => {
    if (isBatchRunning) return;
    setBatchQueue([]);
  };

  // Preflight scan single item in queue
  const handleScanQueueItem = async (index: number) => {
    const item = batchQueue[index];
    if (!item) return;

    setBatchQueue((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, status: 'scanning' } : it)),
    );

    try {
      const raw = await invoke('run_preflight_scan_cmd', {
        inputPath: item.path,
        input_path: item.path,
      });
      const parsed = parsePreflightScanResult(raw);
      setBatchQueue((prev) =>
        prev.map((it, idx) =>
          idx === index ? { ...it, status: 'pending', preflight: parsed } : it,
        ),
      );
    } catch {
      setBatchQueue((prev) =>
        prev.map((it, idx) => (idx === index ? { ...it, status: 'pending' } : it)),
      );
    }
  };

  // Run sequential batch render with hardware overload protection
  const handleRunBatchSequential = async () => {
    if (batchQueue.length === 0 || isBatchRunning) return;
    setIsBatchRunning(true);
    stopRequestedRef.current = false;

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batchQueue.length; i++) {
      if (stopRequestedRef.current) {
        break;
      }

      const item = batchQueue[i];
      if (item.status === 'completed') {
        continue;
      }

      setActiveBatchIndex(i);
      setBatchQueue((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'processing', progressPercent: 0, error: undefined } : it,
        ),
      );

      try {
        // Step 1: Preflight scan if not already done
        let itemPreflight = item.preflight;
        if (!itemPreflight && batchPipelineMode === 'adaptive') {
          try {
            const raw = await invoke('run_preflight_scan_cmd', {
              inputPath: item.path,
              input_path: item.path,
            });
            itemPreflight = parsePreflightScanResult(raw);
            setBatchQueue((prev) =>
              prev.map((it, idx) => (idx === i ? { ...it, preflight: itemPreflight } : it)),
            );
          } catch {
            // Preflight error is non-fatal; continue to rendering
          }
        }

        if (stopRequestedRef.current) break;

        // Step 2: Render video sequentially
        const ext = item.path.split('.').pop() || 'mp4';
        const base = item.path.slice(0, item.path.lastIndexOf('.'));
        const outputPath = `${base}_reup_${batchPipelineMode}_${Date.now()}.${ext}`;

        let result: ReupPipelineResult;
        if (batchPipelineMode === 'adaptive') {
          result = await invoke<ReupPipelineResult>('run_reup_pipeline_adaptive_cmd', {
            inputPath: item.path,
            input_path: item.path,
            outputPath,
            output_path: outputPath,
            preflight: itemPreflight
              ? {
                  has_logo: itemPreflight.hasLogo,
                  logo_corner: itemPreflight.hasLogo ? itemPreflight.logoPosition : null,
                  logo_position: itemPreflight.hasLogo ? itemPreflight.logoPosition : null,
                  has_subtitles: itemPreflight.hasSubtitles,
                  subtitle_roi_ratio: itemPreflight.hasSubtitles ? 0.18 : null,
                  recommended_pipeline: itemPreflight.mode,
                  scan_time_ms: itemPreflight.scanDurationMs,
                  scan_duration_ms: itemPreflight.scanDurationMs,
                }
              : null,
          });
        } else if (batchPipelineMode === 'v1') {
          result = await invoke<ReupPipelineResult>('run_reup_pipeline_v1_cmd', {
            inputPath: item.path,
            input_path: item.path,
            outputPath,
            output_path: outputPath,
          });
        } else {
          result = await invoke<ReupPipelineResult>('run_reup_pipeline_v2_cmd', {
            inputPath: item.path,
            input_path: item.path,
            outputPath,
            output_path: outputPath,
          });
        }

        setBatchQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'completed',
                  progressPercent: 100,
                  result,
                }
              : it,
          ),
        );
        processedCount += 1;
      } catch (err) {
        failedCount += 1;
        setBatchQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'error',
                  progressPercent: 0,
                  error: String(err),
                }
              : it,
          ),
        );
      }
    }

    setIsBatchRunning(false);
    setActiveBatchIndex(-1);

    if (stopRequestedRef.current) {
      toast.warning({
        title: 'Đã dừng hàng đợi',
        message: `Đã xử lý xong ${processedCount} video trước khi dừng.`,
      });
    } else {
      toast.success({
        title: 'Hàng đợi Reup hoàn tất',
        message: `Đã render thành công ${processedCount} video${failedCount > 0 ? `, ${failedCount} lỗi` : ''}.`,
      });
    }
  };

  const handleStopBatch = () => {
    stopRequestedRef.current = true;
    setIsBatchRunning(false);
  };

  // Stats calculation
  const completedCount = batchQueue.filter((x) => x.status === 'completed').length;
  const currentBatchItem = activeBatchIndex >= 0 ? batchQueue[activeBatchIndex] : null;
  const overallPercent =
    batchQueue.length > 0
      ? Math.round(
          ((completedCount * 100 + (currentBatchItem?.progressPercent || 0)) /
            (batchQueue.length * 100)) *
            100,
        )
      : 0;

  const isWebUrl =
    inputVideoPath &&
    (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://'));

  return (
    <div className="space-y-6">
      {/* View Mode Switcher */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40">
          <button
            type="button"
            onClick={() => setViewMode('batch')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
              viewMode === 'batch'
                ? 'bg-background shadow-sm text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ListOrdered className="w-3.5 h-3.5 text-primary" />
            <span>Hàng đợi Nhiều tệp (Batch Queue)</span>
            {batchQueue.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary/20 text-primary border border-primary/30">
                {batchQueue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('single')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
              viewMode === 'single'
                ? 'bg-background shadow-sm text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileVideo className="w-3.5 h-3.5 text-emerald-500" />
            <span>Xử lý Đơn tệp (Single File)</span>
          </button>
        </div>

        <div className="text-xs text-muted-foreground hidden sm:block">
          {viewMode === 'batch'
            ? 'Xử lý tuần tự từng video chống quá tải CPU/GPU'
            : 'Phân tích chi tiết mã băm MD5/SHA256 trên một video'}
        </div>
      </div>

      {/* VIEW MODE 1: BATCH QUEUE */}
      {viewMode === 'batch' && (
        <div className="space-y-5">
          {/* Top Control Bar */}
          <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddMultipleFiles}
                  disabled={isBatchRunning}
                  className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Chọn nhiều file</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddFolder}
                  disabled={isBatchRunning}
                  className="gap-1.5 text-xs border-border/70 hover:border-primary/50 text-foreground hover:text-primary"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-primary" />
                  <span>Nạp cả thư mục</span>
                </Button>
                {batchQueue.length > 0 && !isBatchRunning && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearQueue}
                    className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa danh sách</span>
                  </Button>
                )}
              </div>

              {/* Pipeline Mode Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Chế độ Reup:</span>
                <select
                  value={batchPipelineMode}
                  onChange={(e) => setBatchPipelineMode(e.target.value as 'adaptive' | 'v1' | 'v2')}
                  disabled={isBatchRunning}
                  className="text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="adaptive">Tự động thích ứng AI (Preflight - Khuyên dùng)</option>
                  <option value="v1">Cấp độ 1 (Chuẩn 95% gốc - Đổi MD5/Audio)</option>
                  <option value="v2">Cấp độ 2 (Deep Evasion - Lật hình/Zoom nhẹ)</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {isBatchRunning ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStopBatch}
                    className="gap-1.5 text-xs font-medium"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>Dừng hàng đợi</span>
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleRunBatchSequential}
                    disabled={batchQueue.length === 0}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Bắt đầu Render Hàng Đợi ({batchQueue.length} video)</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Drag & Drop Zone */}
            <button
              type="button"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'w-full border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200 cursor-pointer block',
                isDragOver
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                  : 'border-border/60 hover:border-border/90 bg-muted/20 hover:bg-muted/30',
              )}
              onClick={handleAddMultipleFiles}
            >
              <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <FileVideo className="w-6 h-6 text-primary/70 mb-1" />
                <p className="font-medium text-foreground">
                  Kéo thả nhiều video vào đây hoặc bấm để chọn tệp
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Hỗ trợ định dạng: .mp4, .mkv, .mov, .webm, .avi, .flv, .m4v. Hệ thống sẽ tự động
                  quét tiền trạm AI và render tuần tự.
                </p>
              </div>
            </button>
          </Card>

          {/* Overall Queue Progress Card */}
          {batchQueue.length > 0 && (
            <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-foreground">
                    Tiến độ tổng thể: {completedCount}/{batchQueue.length} video hoàn tất
                  </span>
                  {isBatchRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                  {currentBatchItem && isBatchRunning && (
                    <span>
                      Đang render:{' '}
                      <strong className="text-foreground">{currentBatchItem.filename}</strong>
                    </span>
                  )}
                  <span className="font-bold text-primary text-xs">{overallPercent}%</span>
                </div>
              </div>

              <Progress value={overallPercent} className="h-2 bg-muted/60" />
            </Card>
          )}

          {/* Queue Items List */}
          {batchQueue.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span className="font-semibold text-foreground">
                  Danh sách hàng đợi ({batchQueue.length} video)
                </span>
                <span className="text-[11px]">
                  Cơ chế chống quá tải: Render tuần tự 1 video tại một thời điểm
                </span>
              </div>

              <div className="space-y-2">
                {batchQueue.map((item, index) => (
                  <Card
                    key={item.id}
                    className={cn(
                      'p-3.5 border transition-all text-xs',
                      item.status === 'processing'
                        ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                        : item.status === 'completed'
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : item.status === 'error'
                            ? 'border-rose-500/30 bg-rose-500/5'
                            : 'border-border/50 bg-card/40',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Left: Index & Name */}
                      <div className="flex items-center gap-2.5 min-w-[220px] flex-1">
                        <span className="w-5 text-center font-mono text-[11px] text-muted-foreground">
                          {index + 1}.
                        </span>
                        <div className="space-y-0.5 truncate">
                          <p
                            className="font-medium text-foreground truncate max-w-[400px]"
                            title={item.path}
                          >
                            {item.filename}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[400px]">
                            {item.path}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Preflight Scan Status */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.preflight ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] py-0 font-medium',
                              item.preflight.mode === 'clean' &&
                                'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
                              item.preflight.mode === 'logo_only' &&
                                'bg-amber-500/10 text-amber-500 border-amber-500/30',
                              item.preflight.mode === 'subtitles_only' &&
                                'bg-blue-500/10 text-blue-500 border-blue-500/30',
                              item.preflight.mode === 'comprehensive' &&
                                'bg-purple-500/10 text-purple-500 border-purple-500/30',
                            )}
                          >
                            {item.preflight.badgeText}
                          </Badge>
                        ) : item.status === 'scanning' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 bg-muted/60 text-muted-foreground border-border/60 flex items-center gap-1"
                          >
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>Đang quét AI...</span>
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleScanQueueItem(index)}
                            disabled={isBatchRunning}
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            title="Quét tiền trạm AI cho video này"
                          >
                            <Zap className="w-2.5 h-2.5 text-amber-500 mr-1" />
                            <span>Quét AI</span>
                          </Button>
                        )}
                      </div>

                      {/* Status / Output / Error */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {item.status === 'pending' && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 bg-muted/40 text-muted-foreground border-border/50"
                          >
                            Chờ render
                          </Badge>
                        )}

                        {item.status === 'processing' && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-primary font-bold">
                              {item.progressPercent.toFixed(1)}%
                            </span>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          </div>
                        )}

                        {item.status === 'completed' && (
                          <div className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-medium">Hoàn tất</span>
                            {item.result?.new_md5 && (
                              <span
                                className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40"
                                title={`MD5: ${item.result.new_md5}`}
                              >
                                MD5: {item.result.new_md5.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        )}

                        {item.status === 'error' && (
                          <div
                            className="flex items-center gap-1 text-rose-500 max-w-[200px] truncate"
                            title={item.error || 'Lỗi render'}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="text-[11px] truncate">{item.error || 'Lỗi'}</span>
                          </div>
                        )}

                        {/* Remove Action */}
                        {!isBatchRunning && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveQueueItem(item.id)}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="Xóa khỏi hàng đợi"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar per processing item */}
                    {item.status === 'processing' && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1.5">
                        <Progress value={item.progressPercent} className="h-1.5 bg-muted/60" />
                        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span>Tốc độ: {item.speed || 'N/A'}</span>
                          {item.fps !== undefined && <span>FPS: {item.fps}</span>}
                          {item.etaSeconds !== undefined && (
                            <span>
                              Còn lại: ~
                              {item.etaSeconds < 60
                                ? `${Math.ceil(item.etaSeconds)}s`
                                : `${Math.floor(item.etaSeconds / 60)}m ${Math.ceil(item.etaSeconds % 60)}s`}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card className="p-8 border-dashed border-border/60 bg-card/30 text-center space-y-2">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-medium text-foreground">Hàng đợi hiện đang trống</p>
              <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                Bấm "Chọn nhiều file", "Nạp cả thư mục" hoặc kéo thả các file video vào khung trên
                để bắt đầu xử lý hàng loạt.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* VIEW MODE 2: SINGLE FILE (FULL BACKWARD COMPATIBLE) */}
      {viewMode === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Input Video & Config */}
          <div className="lg:col-span-2 space-y-5">
            {/* 1. Chọn video */}
            <Card className="p-4 sm:p-5 border-border/60 bg-card/60 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <FileVideo className="w-4 h-4 text-primary" />
                  <span>Video gốc cần xử lý Reup</span>
                </Label>
                <div className="flex items-center gap-2">
                  {isWebUrl && (
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
                      {isWebUrl && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10"
                        >
                          URL Web / YouTube (Cần tải về)
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs font-mono font-medium text-foreground break-all">
                      {inputVideoPath}
                    </p>

                    {/* Pre-flight Scan Smart Status */}
                    {!isWebUrl && (
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
                <span>Chọn Cấp độ Lách Reup (Pipeline Level)</span>
              </Label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Level 1 Option */}
                <button
                  type="button"
                  onClick={() => setPipelineLevel('v1')}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer',
                    pipelineLevel === 'v1'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/50 bg-muted/20 hover:border-border',
                  )}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                        <Wand2 className="w-4 h-4 text-primary" />
                        <span>Cấp độ 1 (Chuẩn 95% gốc)</span>
                      </span>
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]"
                      >
                        Khuyên dùng
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Giữ trọn 95% chất lượng gốc, can thiệp nhẹ 5% để phá vỡ nhận diện bản quyền tự
                      động.
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
                    'p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer',
                    pipelineLevel === 'v2'
                      ? 'border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/30'
                      : 'border-border/50 bg-muted/20 hover:border-border',
                  )}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-rose-500" />
                        <span>Cấp độ 2 (Deep Evasion)</span>
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

            {/* Action buttons */}
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

            {/* Progress Bar when single file processing */}
            {isProcessing && reupProgress && (
              <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>{reupProgress.status || 'Đang render video...'}</span>
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
                    <span>
                      Còn lại: ~
                      {reupProgress.eta_seconds < 60
                        ? `${Math.ceil(reupProgress.eta_seconds)}s`
                        : `${Math.floor(reupProgress.eta_seconds / 60)}m ${Math.ceil(reupProgress.eta_seconds % 60)}s`}
                    </span>
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
                <span>Kết quả So sánh Checksum &amp; File</span>
              </Label>

              {pipelineResult ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-1">
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Xử lý Reup hoàn tất thành công!</span>
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {pipelineResult.message || `Đã chạy xong Reup Cấp độ ${pipelineResult.level}`}
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
      )}
    </div>
  );
}
