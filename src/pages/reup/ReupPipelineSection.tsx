import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileVideo,
  FolderOpen,
  Hash,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Timer,
  Tv,
  Wand2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ReupBktController } from './types';

interface ReupPipelineSectionProps {
  controller: ReupBktController;
}

export function ReupPipelineSection({ controller }: ReupPipelineSectionProps) {
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

  const isWebUrl =
    inputVideoPath &&
    (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://'));

  return (
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
                  <span className="text-[11px] text-muted-foreground block">Đường dẫn tệp:</span>
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
                Chọn video và bấm "Bắt đầu Chạy Reup" để xem sự thay đổi Checksum MD5 &amp; SHA256
                tại đây.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
