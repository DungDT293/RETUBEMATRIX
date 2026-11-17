import { invoke } from '@tauri-apps/api/core';
import {
  Clock,
  Download,
  Filter,
  Layers,
  PlaySquare,
  Scissors,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  getMultibrowserProfiles,
  updateChannelBktConfig,
} from '@/contexts/channels/channels-client';
import type { FollowedChannel, MultiBrowserProfile, YoutubeChannelContentType } from '@/lib/types';
import { CompetitorSeoDialog } from './CompetitorSeoDialog';

interface ChannelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: FollowedChannel;
  initialTab?: 'reup' | 'download' | 'filename';
  onSave: (updated: {
    id: string;
    checkInterval: number;
    autoDownload: boolean;
    downloadQuality: string;
    downloadFormat: string;
    downloadVideoCodec: string;
    downloadPreferredFps: string;
    downloadAudioBitrate: string;
    filterMinDuration: number | null;
    filterMaxDuration: number | null;
    filterIncludeKeywords: string | null;
    filterExcludeKeywords: string | null;
    filterMaxVideos: number | null;
    downloadThreads: number;
    youtubeContentType: YoutubeChannelContentType;
    reupModEnabled: boolean;
    reupModSpeed: number;
    reupModPitch: number;
    reupModFlip: boolean;
    reupModCrop: number;
    customFilenameTemplate: string | null;
  }) => Promise<void>;
  onBktConfigSaved?: () => Promise<void> | void;
}

const TEMPLATE_TOKENS = [
  { label: '[Kênh]', token: '[Kênh]' },
  { label: '[Ngày đăng]', token: '[Ngày đăng]' },
  { label: '[Tiêu đề]', token: '[Tiêu đề]' },
  { label: '[ID]', token: '[ID]' },
  { label: '[Lượt xem]', token: '[Lượt xem]' },
  { label: '[Độ phân giải]', token: '[Độ phân giải]' },
];

export function ChannelSettingsDialog({
  open,
  onOpenChange,
  channel,
  initialTab = 'reup',
  onSave,
  onBktConfigSaved,
}: ChannelSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'reup' | 'download' | 'filename'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Reup Configuration States
  const [isTrustedClean, setIsTrustedClean] = useState<boolean>(
    Boolean(channel.is_trusted_clean ?? channel.isTrustedClean ?? false),
  );
  const [targetProfileId, setTargetProfileId] = useState<string>(
    channel.target_profile_id || channel.bkt_profile_id || '',
  );
  const [directUploadTarget, setDirectUploadTarget] = useState<boolean>(
    Boolean(channel.direct_upload_target ?? channel.directUploadTarget ?? false),
  );
  const [uploadIntervalMode, setUploadIntervalMode] = useState<string>(
    channel.upload_interval_mode || channel.uploadIntervalMode || 'auto_30_60',
  );
  const [uploadIntervalMinutes, setUploadIntervalMinutes] = useState<number>(
    channel.upload_interval_minutes || channel.uploadIntervalMinutes || 45,
  );
  const [downloadMode, setDownloadMode] = useState<'all' | 'selected'>(
    (channel.download_mode || channel.downloadMode || 'all') as 'all' | 'selected',
  );

  // Download & Filter settings
  const [autoDownload, setAutoDownload] = useState(channel.auto_download);
  const [checkInterval, setCheckInterval] = useState(channel.check_interval || 15);
  const [contentType, setContentType] = useState<YoutubeChannelContentType>(
    (channel.youtube_content_type as YoutubeChannelContentType) || 'all',
  );
  const [minDuration, setMinDuration] = useState<string>(
    channel.filter_min_duration != null ? String(channel.filter_min_duration) : '',
  );
  const [maxDuration, setMaxDuration] = useState<string>(
    channel.filter_max_duration != null ? String(channel.filter_max_duration) : '',
  );
  const [excludeKeywords] = useState(channel.filter_exclude_keywords || '');
  const [includeKeywords] = useState(channel.filter_include_keywords || '');

  // Filename template
  const [filenameTemplate, setFilenameTemplate] = useState<string>(
    channel.custom_filename_template || '[Kênh] - [Ngày đăng] - [Tiêu đề]',
  );

  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showSeoDialog, setShowSeoDialog] = useState(false);

  useEffect(() => {
    setIsTrustedClean(Boolean(channel.is_trusted_clean ?? channel.isTrustedClean ?? false));
    setTargetProfileId(channel.target_profile_id || channel.bkt_profile_id || '');
    setDirectUploadTarget(
      Boolean(channel.direct_upload_target ?? channel.directUploadTarget ?? false),
    );
    setUploadIntervalMode(
      channel.upload_interval_mode || channel.uploadIntervalMode || 'auto_30_60',
    );
    setUploadIntervalMinutes(
      channel.upload_interval_minutes || channel.uploadIntervalMinutes || 45,
    );
    setDownloadMode((channel.download_mode || channel.downloadMode || 'all') as 'all' | 'selected');
  }, [channel]);

  useEffect(() => {
    getMultibrowserProfiles()
      .then((data) => {
        if (Array.isArray(data)) {
          setProfiles(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load multibrowser profiles:', err);
      });
  }, []);

  const previewFilename = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let tmpl = filenameTemplate || '[Kênh] - [Ngày đăng] - [Tiêu đề]';
    tmpl = tmpl
      .replace(/\[Kênh\]|\{uploader\}|\[uploader\]/g, channel.name || 'Channel')
      .replace(/\[Ngày đăng\]|\{upload_date\}|\[upload_date\]/g, today)
      .replace(/\[Tiêu đề\]|\{title\}|\[title\]/g, 'Tieu_de_video_mau')
      .replace(/\[ID\]|\{id\}|\[id\]/g, 'dQw4w9WgXcQ')
      .replace(/\[Lượt xem\]|\{view_count\}|\[view_count\]/g, '125K')
      .replace(/\[Độ phân giải\]|\{resolution\}|\[resolution\]/g, '1080p');

    if (!tmpl.endsWith('.mp4') && !tmpl.endsWith('.%(ext)s')) {
      tmpl = `${tmpl}.mp4`;
    }
    return tmpl;
  }, [filenameTemplate, channel.name]);

  const handleApplyPreset = (type: 'all' | 'shorts' | 'no-live') => {
    if (type === 'all') {
      setMinDuration('');
      setMaxDuration('');
    } else if (type === 'shorts') {
      setMinDuration('0');
      setMaxDuration('60');
      setContentType('shorts');
    } else if (type === 'no-live') {
      setMaxDuration('3600');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Cập nhật cấu hình Reup Kiểu Mới qua lệnh IPC backend
      await invoke('update_channel_reup_config_cmd', {
        payload: {
          channel_id: channel.id,
          target_profile_id: targetProfileId.trim() || null,
          is_trusted_clean: isTrustedClean,
          enable_fast_track: isTrustedClean,
          direct_upload_target: directUploadTarget,
          upload_interval_mode: uploadIntervalMode,
          upload_interval_minutes: Number(uploadIntervalMinutes) || 45,
          download_mode: downloadMode,
        },
      });

      // 2. Đồng bộ cấu hình BKT / Target profile
      await updateChannelBktConfig({
        channelId: channel.id,
        bktTestMode: !isTrustedClean,
        bktProfileId: targetProfileId.trim() || null,
      });

      // 3. Cập nhật cài đặt tải & lọc cơ bản
      await onSave({
        id: channel.id,
        checkInterval: Number(checkInterval) || 15,
        autoDownload,
        downloadQuality: channel.download_quality || 'best',
        downloadFormat: channel.download_format || 'mp4',
        downloadVideoCodec: channel.download_video_codec || 'auto',
        downloadPreferredFps: channel.download_preferred_fps || 'original',
        downloadAudioBitrate: channel.download_audio_bitrate || '192',
        filterMinDuration: minDuration ? Number(minDuration) : null,
        filterMaxDuration: maxDuration ? Number(maxDuration) : null,
        filterIncludeKeywords: includeKeywords.trim() || null,
        filterExcludeKeywords: excludeKeywords.trim() || null,
        filterMaxVideos: channel.filter_max_videos || null,
        downloadThreads: channel.download_threads || 1,
        youtubeContentType: contentType,
        reupModEnabled: channel.reup_mod_enabled ?? false,
        reupModSpeed: channel.reup_mod_speed ?? 1.03,
        reupModPitch: channel.reup_mod_pitch ?? 1.02,
        reupModFlip: channel.reup_mod_flip ?? false,
        reupModCrop: channel.reup_mod_crop ?? 0.015,
        customFilenameTemplate: filenameTemplate.trim() || null,
      });

      if (onBktConfigSaved) {
        await onBktConfigSaved();
      }

      toast.success({
        title: 'Đã lưu cấu hình Reup',
        description: `Đã cập nhật cấu hình kênh ${channel.name} thành công.`,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save channel reup config:', err);
      toast.error({
        title: 'Lỗi lưu cấu hình',
        description: String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border-border/80 bg-background/95 backdrop-blur-md shadow-2xl p-5 sm:p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                Cấu hình Reup &amp; Kênh Đích
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate max-w-[380px]">
                {channel.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'reup' | 'download' | 'filename')}
          className="w-full mt-2"
        >
          <TabsList className="grid grid-cols-3 w-full bg-muted/60 p-1 border border-border/40 text-xs">
            <TabsTrigger value="reup" className="flex items-center gap-1.5 text-xs py-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Cấu hình Reup</span>
            </TabsTrigger>
            <TabsTrigger value="download" className="flex items-center gap-1.5 text-xs py-1.5">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Bộ Lọc &amp; Tải</span>
            </TabsTrigger>
            <TabsTrigger value="filename" className="flex items-center gap-1.5 text-xs py-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>Mẫu Tên Tệp</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: REUP CONFIGURATION & TARGET CHANNEL */}
          <TabsContent value="reup" className="space-y-4 pt-3">
            {/* Clean Channel Toggle */}
            <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="clean-channel-toggle"
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Kênh Sạch / Tin Cậy (Bỏ qua BKT - Tải &amp; Đăng Thẳng)
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Khi bật cờ này, video tải về sẽ bỏ qua bước upload kênh test và mở thẳng quy
                    trình xuất bản lên Kênh Đích đã liên kết.
                  </p>
                </div>
                <Switch
                  id="clean-channel-toggle"
                  checked={isTrustedClean}
                  onCheckedChange={setIsTrustedClean}
                />
              </div>
            </div>

            {/* Target Profile Selection */}
            <div className="space-y-2 p-3.5 rounded-lg border border-border/60 bg-card/60">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-primary" />
                  Hồ sơ Kênh Đích xuất bản (Target Profile)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Kho hồ sơ: {profiles.length} profile
                </span>
              </div>
              <Select
                value={targetProfileId || '__none__'}
                onValueChange={(val) => setTargetProfileId(val === '__none__' ? '' : val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Chọn hồ sơ trình duyệt Kênh Đích..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs text-amber-500 font-medium">
                    -- Chưa gán Kênh Đích (Chỉ tải về máy) --
                  </SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || '#10b981' }}
                        />
                        <span className="font-semibold text-foreground">{p.profile_name}</span>
                        {p.youtube_preferred_channel && (
                          <span className="text-[11px] text-primary font-mono">
                            ({p.youtube_preferred_channel})
                          </span>
                        )}
                        {p.group && p.group !== 'Default' && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {p.group}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Direct Auto-Publish & Upload Spacing */}
            <div className="space-y-3 p-3.5 rounded-lg border border-border/60 bg-card/60">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="direct-upload-toggle"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Tự động xuất bản lên Kênh Đích sau khi Edit
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sau khi video được xử lý Reup và trích xuất tiêu đề/mô tả gốc, hệ thống tự động
                    đẩy sang Kênh Đích.
                  </p>
                </div>
                <Switch
                  id="direct-upload-toggle"
                  checked={directUploadTarget}
                  onCheckedChange={setDirectUploadTarget}
                />
              </div>

              {directUploadTarget && (
                <div className="space-y-2.5 pt-2 border-t border-border/40">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Khoảng cách giãn cách giữa các video đăng (Chống Spam)
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button
                      type="button"
                      variant={uploadIntervalMode === 'auto_30_60' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setUploadIntervalMode('auto_30_60')}
                      className="h-8 text-xs font-medium"
                    >
                      Mặc định (Ngẫu nhiên 30 - 60 phút)
                    </Button>
                    <Button
                      type="button"
                      variant={uploadIntervalMode === 'fixed' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setUploadIntervalMode('fixed')}
                      className="h-8 text-xs font-medium"
                    >
                      Tùy chỉnh số phút cố định
                    </Button>
                  </div>

                  {uploadIntervalMode === 'fixed' && (
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="interval-input" className="text-[11px] text-muted-foreground">
                        Thời gian giãn cách (15 - 360 phút)
                      </Label>
                      <Input
                        id="interval-input"
                        type="number"
                        min="15"
                        max="360"
                        value={uploadIntervalMinutes}
                        onChange={(e) => setUploadIntervalMinutes(Number(e.target.value))}
                        className="h-8 text-xs w-36"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEO Competitor Action */}
            <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  Nuôi Kênh &amp; SEO Kênh Đích
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Trích xuất từ khóa kênh và thẻ mặc định từ đối thủ để cài đặt vào YouTube Studio.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSeoDialog(true)}
                className="h-7 text-xs border-purple-500/40 text-purple-600 dark:text-purple-400 shrink-0"
              >
                Cài đặt SEO
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: DOWNLOAD & FILTER OPTIONS */}
          <TabsContent value="download" className="space-y-3.5 pt-3">
            {/* Download Mode */}
            <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-card/60">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-primary" />
                Chế độ Tải Video
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={downloadMode === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDownloadMode('all')}
                  className="h-8 text-xs font-medium"
                >
                  Tải toàn bộ video mới
                </Button>
                <Button
                  type="button"
                  variant={downloadMode === 'selected' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDownloadMode('selected')}
                  className="h-8 text-xs font-medium"
                >
                  Chọn lọc từng video thủ công
                </Button>
              </div>
            </div>

            {/* Auto-download Toggle & Interval */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
              <div className="space-y-0.5">
                <Label htmlFor="auto-dl-toggle" className="text-xs font-medium cursor-pointer">
                  Tự động tải khi phát hiện video mới
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Quét RSS thời gian thực và nạp video vào hàng đợi
                </p>
              </div>
              <Switch
                id="auto-dl-toggle"
                checked={autoDownload}
                onCheckedChange={setAutoDownload}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Chu kỳ quét (phút)</Label>
                <Select
                  value={String(checkInterval)}
                  onValueChange={(val) => setCheckInterval(Number(val))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Mỗi 5 phút</SelectItem>
                    <SelectItem value="15">Mỗi 15 phút (Khuyên dùng)</SelectItem>
                    <SelectItem value="30">Mỗi 30 phút</SelectItem>
                    <SelectItem value="60">Mỗi 1 giờ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Loại nội dung quét</Label>
                <Select
                  value={contentType}
                  onValueChange={(val) => setContentType(val as YoutubeChannelContentType)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả (Video, Shorts, Trực tiếp)</SelectItem>
                    <SelectItem value="videos">Chỉ Video dài</SelectItem>
                    <SelectItem value="shorts">Chỉ Shorts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium">Cấu hình thời lượng nhanh</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset('shorts')}
                  className="h-7 text-xs gap-1 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <PlaySquare className="w-3 h-3" />
                  Chỉ tải Shorts (&lt; 60 giây)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset('no-live')}
                  className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <Scissors className="w-3 h-3" />
                  Bỏ qua Livestream (&gt; 60 phút)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleApplyPreset('all')}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Đặt lại
                </Button>
              </div>
            </div>

            {/* Duration Range Custom */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-dur" className="text-xs font-medium">
                  Thời lượng tối thiểu (giây)
                </Label>
                <Input
                  id="min-dur"
                  type="number"
                  placeholder="0"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-dur" className="text-xs font-medium">
                  Thời lượng tối đa (giây)
                </Label>
                <Input
                  id="max-dur"
                  type="number"
                  placeholder="3600"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: FILENAME TEMPLATE */}
          <TabsContent value="filename" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label htmlFor="filename-tmpl" className="text-xs font-medium">
                Mẫu định dạng tên tệp
              </Label>
              <Input
                id="filename-tmpl"
                value={filenameTemplate}
                onChange={(e) => setFilenameTemplate(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Chèn thẻ:</span>
                {TEMPLATE_TOKENS.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => setFilenameTemplate((prev) => `${prev} ${item.token}`.trim())}
                    className="text-[10px] bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/40 font-mono transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1">
              <span className="text-[11px] font-medium text-foreground">Xem trước tên tệp:</span>
              <p className="text-xs font-mono text-primary truncate">{previewFilename}</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Hủy
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 text-xs font-medium"
          >
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {showSeoDialog && (
        <CompetitorSeoDialog
          isOpen={showSeoDialog}
          onClose={() => setShowSeoDialog(false)}
          channel={channel}
          profiles={profiles}
        />
      )}
    </Dialog>
  );
}
