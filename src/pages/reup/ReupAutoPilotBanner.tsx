import { Loader2, Rocket, Square, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ReupBktController } from './types';

interface ReupAutoPilotBannerProps {
  controller: ReupBktController;
}

export function ReupAutoPilotBanner({ controller }: ReupAutoPilotBannerProps) {
  const {
    isAutoPilotRunning,
    autoPilotStep,
    inputVideoPath,
    isProcessing,
    isUploading,
    handleRunAutoPilot,
    handleStopAutoPilot,
    reupProgress,
  } = controller;

  return (
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
            -&gt; Tự Nhận Thumbnail -&gt; Đăng Test Bản Quyền (Unlisted) -&gt; Tự Quét Studio -&gt;
            Tự Đăng Kênh Chính khi Xanh.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAutoPilotRunning && (
            <Button
              size="default"
              variant="destructive"
              onClick={handleStopAutoPilot}
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
              <span>
                Auto-Pilot [1/4]: {reupProgress.status || 'Đang render video Reup Lv.1...'}
              </span>
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
    </Card>
  );
}
