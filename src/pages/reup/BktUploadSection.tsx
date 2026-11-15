import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn, maskProxy } from '@/lib/utils';
import type { ReupBktController } from './types';

interface BktUploadSectionProps {
  controller: ReupBktController;
}

export function BktUploadSection({ controller }: BktUploadSectionProps) {
  const {
    activeBackgroundJob,
    isLoginRequiredError,
    handleOpenProfileStudio,
    profiles,
    bktChannels,
    selectedProfileId,
    handleChangeBktProfileId,
    uploadVideoPath,
    setUploadVideoPath,
    handlePickUploadVideo,
    uploadThumbnailPath,
    setUploadThumbnailPath,
    uploadTitle,
    setUploadTitle,
    uploadDescription,
    setUploadDescription,
    uploadTags,
    setUploadTags,
    isUploading,
    handleUploadBkt,
    uploadResult,
    autoPublishMain,
    handleToggleAutoPublish,
    mainProfileId,
    handleChangeMainProfileId,
    mainVisibility,
    handleChangeMainVisibility,
    handlePublishWaitingCleanVideos,
    isCatchingUp,
    executePublishToMainChannel,
    isPublishingMain,
    mainPublishProgress,
    mainPublishResult,
    handleCheckStudioStatus,
    isCheckingStudio,
    studioStatus,
    autoPollSeconds,
    setActiveTab,
    setPipelineLevel,
  } = controller;

  return (
    <div className="space-y-5">
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
              Hồ sơ trình duyệt chưa đăng nhập tài khoản Google / YouTube Studio. Vui lòng mở Studio
              để đăng nhập trước khi chạy kiểm tra bản quyền.
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
                <span>Tải Video Lên Kênh Test để Thử Nghiệm</span>
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
                    Để tải video ngầm và kiểm tra bản quyền, vui lòng vào menu "Hồ sơ trình duyệt"
                    tạo profile và đăng nhập tài khoản Kênh Test.
                  </p>
                </div>
              </div>
            )}

            {/* 1. Chọn Kênh Test Bản Quyền */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Kênh Test Bản Quyền (Mượn slot Unlisted kiểm tra bản quyền ngầm)</span>
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
                    onValueChange={(val) => handleChangeBktProfileId(val)}
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
                  <span>Ảnh Thumbnail (.jpg / .png):</span>
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
                  <Label className="text-xs font-medium">Thẻ Tags (cách nhau bởi dấu phẩy):</Label>
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
                  <span>Tự Động Đăng Kênh Chính (Auto-Publish)</span>
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
                          <span className="font-medium text-foreground">{p.profile_name}</span>
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
                  <Label className="text-[11px] text-muted-foreground">Chế độ xuất bản:</Label>
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

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePublishWaitingCleanVideos}
                  disabled={isCatchingUp}
                  className="w-full text-xs gap-1.5 mt-2"
                >
                  {isCatchingUp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang đăng các video xanh đang chờ...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Đăng các video xanh đang chờ</span>
                    </>
                  )}
                </Button>

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
                      <span>Đã đăng Kênh Chính thành công!</span>
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
                <span>Theo Dõi Bản Quyền (Studio Monitor)</span>
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
                  <span>Đã tải lên Kênh Test thành công!</span>
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
                      <span>Sạch Bản Quyền (Clean)</span>
                    </Badge>
                  )}
                  {studioStatus.status === 'red_matched' && (
                    <Badge
                      variant="outline"
                      className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs px-2 py-0.5"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 mr-1 text-rose-400" />
                      <span>Dính Bản Quyền (Content ID)</span>
                    </Badge>
                  )}
                  {studioStatus.status === 'failed' && (
                    <Badge
                      variant="outline"
                      className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs px-2 py-0.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-400" />
                      <span>Kiểm tra thất bại</span>
                    </Badge>
                  )}
                  {studioStatus.status === 'pending' && (
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs px-2 py-0.5 animate-pulse"
                      >
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-amber-400" />
                        <span>Đang kiểm tra...</span>
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
    </div>
  );
}
