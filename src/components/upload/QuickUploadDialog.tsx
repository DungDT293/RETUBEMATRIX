import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  FolderOpen,
  Image,
  Loader2,
  MessageSquare,
  Terminal,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  isBktTestProfile,
  type MultiBrowserProfile,
  type MultiBrowserUploadParams,
  type MultiBrowserUploadResult,
} from '@/lib/types';

interface QuickUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVideoPath?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialThumbnail?: string;
  initialProfileId?: string;
  onSuccess?: () => void;
}

export function QuickUploadDialog({
  open: isOpen,
  onOpenChange,
  initialVideoPath = '',
  initialTitle = '',
  initialDescription = '',
  initialThumbnail = '',
  initialProfileId = '',
  onSuccess,
}: QuickUploadDialogProps) {
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProfileId);
  const [videoPath, setVideoPath] = useState<string>(initialVideoPath);
  const [title, setTitle] = useState<string>(initialTitle);
  const [description, setDescription] = useState<string>(initialDescription);
  const [tags, setTags] = useState<string>('');
  const [thumbnailPath, setThumbnailPath] = useState<string>(initialThumbnail);
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private' | 'schedule'>(
    'public',
  );
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [pinnedComment, setPinnedComment] = useState<string>('');

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<MultiBrowserUploadResult | null>(null);
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Sync props when opening dialog
  useEffect(() => {
    if (isOpen) {
      if (initialVideoPath) setVideoPath(initialVideoPath);
      if (initialTitle) setTitle(initialTitle.slice(0, 100));
      if (initialDescription) setDescription(initialDescription);
      if (initialThumbnail) setThumbnailPath(initialThumbnail);
      if (initialProfileId) setSelectedProfileId(initialProfileId);
      setUploadResult(null);
      setLogs([]);

      // Fetch profiles (chỉ lấy profile đích, loại bỏ hồ sơ test BKT)
      invoke<MultiBrowserProfile[]>('get_multibrowser_profiles', {
        includeBkt: false,
        include_bkt: false,
      })
        .then((data) => {
          const list = (data || []).filter((p) => !isBktTestProfile(p));
          setProfiles(list);
          if (!selectedProfileId && list.length > 0) {
            setSelectedProfileId(initialProfileId || list[0].id);
          }
        })
        .catch((err) => console.error('Lỗi lấy danh sách profiles:', err));
    }
  }, [
    isOpen,
    initialVideoPath,
    initialTitle,
    initialDescription,
    initialThumbnail,
    initialProfileId,
    selectedProfileId,
  ]);

  // Listen to upload logs
  useEffect(() => {
    const unlistenPromise = listen<{ profile_id: string; log: string }>(
      'browser-upload-log',
      (event) => {
        setLogs((prev) => [...prev.slice(-150), event.payload.log]);
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (showLogs && logEndRef.current && logs.length > 0) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, showLogs]);

  const handlePickVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi'] }],
      });
      if (selected && typeof selected === 'string') {
        setVideoPath(selected);
      }
    } catch (err) {
      console.error('Lỗi chọn file video:', err);
    }
  };

  const handlePickThumbnail = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (selected && typeof selected === 'string') {
        setThumbnailPath(selected);
      }
    } catch (err) {
      console.error('Lỗi chọn thumbnail:', err);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedProfileId) {
      alert('Vui lòng chọn Profile trình duyệt để đăng bài!');
      return;
    }
    if (!videoPath.trim()) {
      alert('Vui lòng chọn hoặc nhập đường dẫn file video!');
      return;
    }
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề video!');
      return;
    }

    setIsUploading(true);
    setLogs([`[System] Bắt đầu khởi chạy trình duyệt profile '${selectedProfileId}'...`]);
    setUploadResult(null);

    let finalDesc = description;
    if (tags.trim()) {
      finalDesc = `${finalDesc}\n\nTags: ${tags.trim()}`;
    }

    const params: MultiBrowserUploadParams = {
      profile_id: selectedProfileId,
      video_path: videoPath.trim(),
      title: title.trim(),
      description: finalDesc.trim(),
      thumbnail_path: thumbnailPath.trim() || undefined,
      visibility,
      schedule_date: visibility === 'schedule' ? scheduleDate : undefined,
      schedule_time: visibility === 'schedule' ? scheduleTime : undefined,
      pinned_comment: pinnedComment.trim() || undefined,
    };

    try {
      const res = await invoke<MultiBrowserUploadResult>('upload_video_multibrowser', {
        params,
      });
      setUploadResult(res);
      if (res.success) {
        onSuccess?.();
      }
    } catch (err) {
      setUploadResult({
        success: false,
        error: String(err),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const activeProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[660px] max-h-[88vh] flex flex-col p-6 rounded-2xl">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-primary text-lg">
            <UploadCloud className="w-5 h-5" />
            Đăng Video Tự Động lên YouTube
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sử dụng hồ sơ trình duyệt anti-detect đã đăng nhập, tự động upload & cấu hình metadata
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 text-xs">
          {/* Success Banner */}
          {uploadResult?.success && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Đăng video lên YouTube thành công!</span>
              </div>
              {uploadResult.video_url && (
                <div className="flex items-center gap-2 bg-emerald-500/10 p-2 rounded-lg">
                  <span className="truncate flex-1 font-mono text-xs">
                    {uploadResult.video_url}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      if (uploadResult.video_url) {
                        navigator.clipboard.writeText(uploadResult.video_url);
                        alert('Đã sao chép link video!');
                      }
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Failure Banner */}
          {uploadResult && !uploadResult.success && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadResult.error || 'Đăng video thất bại'}</span>
            </div>
          )}

          {/* Profile Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="upload-profile" className="text-xs font-medium">
              Chọn Profile đăng video <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
                disabled={isUploading}
              >
                <SelectTrigger className="w-full text-xs h-9">
                  <SelectValue placeholder="Chọn profile trình duyệt..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: p.color || '#E15B64' }}
                        />
                        <span className="font-medium">{p.profile_name}</span>
                        {p.youtube_preferred_channel && (
                          <span className="text-muted-foreground">
                            ({p.youtube_preferred_channel})
                          </span>
                        )}
                        {p.proxy ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 h-4 border-sky-500/30 text-sky-500"
                          >
                            Proxy
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30 text-muted-foreground"
                          >
                            Direct
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeProfile?.youtube_preferred_channel && (
              <p className="text-[11px] text-muted-foreground">
                Kênh ưu tiên:{' '}
                <strong className="text-foreground">
                  {activeProfile.youtube_preferred_channel}
                </strong>
              </p>
            )}
          </div>

          {/* Video File Path */}
          <div className="space-y-1.5">
            <Label htmlFor="u-video" className="text-xs font-medium">
              Tệp Video (.mp4 / .mkv / .webm) <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="u-video"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
                placeholder="D:\Downloads\video_reup.mp4"
                disabled={isUploading}
                className="text-xs h-9 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePickVideo}
                disabled={isUploading}
                className="h-9 gap-1.5 shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Chọn file
              </Button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="u-title" className="text-xs font-medium">
                Tiêu đề Video <span className="text-red-500">*</span>
              </Label>
              <span
                className={`text-[10px] ${title.length > 100 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}
              >
                {title.length}/100
              </span>
            </div>
            <Input
              id="u-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề video hấp dẫn..."
              disabled={isUploading}
              maxLength={100}
              className="text-xs h-9"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="u-desc" className="text-xs font-medium">
              Mô tả Video
            </Label>
            <Textarea
              id="u-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nội dung mô tả video, hashtags, nguồn video..."
              rows={3}
              disabled={isUploading}
              className="text-xs"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="u-tags" className="text-xs font-medium">
              Thẻ Tags (phân cách bằng dấu phẩy)
            </Label>
            <Input
              id="u-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="shorts, gaming, viral, highlight..."
              disabled={isUploading}
              className="text-xs h-9"
            />
          </div>

          {/* Thumbnail & Visibility Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Thumbnail */}
            <div className="space-y-1.5">
              <Label htmlFor="u-thumb" className="text-xs font-medium">
                Ảnh thu nhỏ Thumbnail (tùy chọn)
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="u-thumb"
                  value={thumbnailPath}
                  onChange={(e) => setThumbnailPath(e.target.value)}
                  placeholder="Ảnh thumbnail..."
                  disabled={isUploading}
                  className="text-xs h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePickThumbnail}
                  disabled={isUploading}
                  className="h-9 px-2.5 shrink-0"
                >
                  <Image className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <Label htmlFor="u-visibility" className="text-xs font-medium">
                Chế độ hiển thị
              </Label>
              <Select
                value={visibility}
                onValueChange={(val) =>
                  setVisibility(val as 'public' | 'unlisted' | 'private' | 'schedule')
                }
                disabled={isUploading}
              >
                <SelectTrigger className="w-full text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Công khai (Public)</SelectItem>
                  <SelectItem value="unlisted">Không công khai (Unlisted)</SelectItem>
                  <SelectItem value="private">Riêng tư (Private)</SelectItem>
                  <SelectItem value="schedule">Lên lịch công chiếu (Schedule)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Schedule fields if selected */}
          {visibility === 'schedule' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
              <div className="space-y-1">
                <Label htmlFor="u-sdate" className="text-xs font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Ngày công chiếu
                </Label>
                <Input
                  id="u-sdate"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  disabled={isUploading}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="u-stime" className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Giờ công chiếu
                </Label>
                <Input
                  id="u-stime"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  disabled={isUploading}
                  className="text-xs h-8"
                />
              </div>
            </div>
          )}

          {/* Pinned comment */}
          <div className="space-y-1.5">
            <Label htmlFor="u-pinned" className="text-xs font-medium flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              Bình luận ghim đầu video (tùy chọn)
            </Label>
            <Input
              id="u-pinned"
              value={pinnedComment}
              onChange={(e) => setPinnedComment(e.target.value)}
              placeholder="VD: Nhấn Đăng ký kênh để ủng hộ mình nhé! ❤️"
              disabled={isUploading}
              className="text-xs h-9"
            />
          </div>

          {/* Live Log Drawer */}
          {(isUploading || logs.length > 0) && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Terminal className="w-3.5 h-3.5 text-primary" />
                  Nhật ký quá trình tự động
                  {isUploading && <Loader2 className="w-3 h-3 animate-spin text-primary ml-1" />}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogs(!showLogs)}
                  className="h-6 text-[10px] px-2 text-muted-foreground"
                >
                  {showLogs ? 'Thu gọn' : 'Mở rộng'}
                </Button>
              </div>

              {showLogs && (
                <div className="h-32 rounded-xl bg-black/90 p-3 font-mono text-[11px] text-emerald-400 overflow-y-auto space-y-1 border border-border/40 select-text">
                  {logs.length === 0 ? (
                    <span className="text-muted-foreground italic">
                      Đang chờ khởi động tiến trình...
                    </span>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className="leading-relaxed break-all">
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border/40 flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="text-xs h-9"
          >
            Đóng
          </Button>

          <Button
            onClick={handleStartUpload}
            disabled={isUploading || !videoPath.trim() || !title.trim() || !selectedProfileId}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 font-medium shadow-md"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tự động đăng video...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                Bắt đầu đăng YouTube
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
