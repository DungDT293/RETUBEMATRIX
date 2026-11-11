import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  FlaskConical,
  Layers,
  Loader2,
  PlaySquare,
  Scissors,
  Settings2,
  ShieldAlert,
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
  initialTab?: 'filter' | 'bkt' | 'filename';
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

const COMMON_EXCLUDE_TAGS = [
  'Livestream',
  'Trực tiếp',
  'Thông báo',
  'Q&A',
  'Hỏi đáp',
  'Trailer',
  'Teaser',
  'Highlight',
];

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
  initialTab = 'filter',
  onSave,
  onBktConfigSaved,
}: ChannelSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'filter' | 'bkt' | 'filename'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Filter & Download settings
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
  const [excludeKeywords, setExcludeKeywords] = useState(channel.filter_exclude_keywords || '');
  const [includeKeywords, setIncludeKeywords] = useState(channel.filter_include_keywords || '');

  // Reup Mod Pipeline settings
  const [reupEnabled, _setReupEnabled] = useState(channel.reup_mod_enabled ?? false);
  const [reupSpeed, _setReupSpeed] = useState<number>(channel.reup_mod_speed ?? 1.03);
  const [reupPitch, _setReupPitch] = useState<boolean>((channel.reup_mod_pitch ?? 1.0) !== 1.0);
  const [reupFlip, _setReupFlip] = useState<boolean>(channel.reup_mod_flip ?? false);
  const [reupCrop, _setReupCrop] = useState<boolean>((channel.reup_mod_crop ?? 0) > 0);

  // Filename template
  const [filenameTemplate, setFilenameTemplate] = useState<string>(
    channel.custom_filename_template || '[Kênh] - [Ngày đăng] - [Tiêu đề]',
  );

  // BKT Test & Upload settings
  const [bktTestMode, setBktTestMode] = useState<boolean>(Boolean(channel.bkt_test_mode));
  const [bktProfileId, setBktProfileId] = useState<string>(channel.bkt_profile_id || '');
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>([]);

  useEffect(() => {
    setBktProfileId(channel.bkt_profile_id || '');
    setBktTestMode(Boolean(channel.bkt_test_mode));
  }, [channel.bkt_profile_id, channel.bkt_test_mode]);

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

  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showSeoDialog, setShowSeoDialog] = useState(false);
  const [extractingKeywords, setExtractingKeywords] = useState(false);

  const handleAutoFillKeywordsFromCompetitor = async () => {
    setExtractingKeywords(true);
    try {
      const res = await invoke<{
        success: boolean;
        channel_keywords?: string[];
        default_tags?: string[];
        error?: string;
      }>('extract_competitor_channel_seo_cmd', {
        channelUrl: channel.url,
        channel_url: channel.url,
      });

      if (res.success && res.channel_keywords && res.channel_keywords.length > 0) {
        const topKeywords = res.channel_keywords.slice(0, 10).join(', ');
        setIncludeKeywords((prev) => (prev ? `${prev}, ${topKeywords}` : topKeywords));
        toast.success({
          title: 'Đã tự động điền từ khóa đối thủ',
          description: `Đã bổ sung ${Math.min(res.channel_keywords.length, 10)} từ khóa nhận diện của đối thủ vào bộ lọc.`,
        });
      } else {
        toast.error({
          title: 'Không tìm thấy từ khóa',
          description: res.error || 'Đối thủ chưa thiết lập từ khóa kênh hoặc không thể bóc tách.',
        });
      }
    } catch (err) {
      console.error('Lỗi tự động điền từ khóa:', err);
      toast.error({
        title: 'Lỗi bóc tách từ khóa',
        description: String(err),
      });
    } finally {
      setExtractingKeywords(false);
    }
  };

  // Live preview of filename
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
      setMaxDuration('3600'); // skip videos > 60m
      if (!excludeKeywords.includes('Livestream')) {
        setExcludeKeywords((prev) =>
          prev ? `${prev}, Livestream, Trực tiếp` : 'Livestream, Trực tiếp',
        );
      }
    }
  };

  const handleAddExcludeTag = (tag: string) => {
    const tags = excludeKeywords
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tags.includes(tag)) {
      tags.push(tag);
      setExcludeKeywords(tags.join(', '));
    }
  };

  const handleInsertToken = (token: string) => {
    setFilenameTemplate((prev) => `${prev} ${token}`.trim());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Cập nhật cấu hình BKT / Hồ sơ đối chiếu 1-1 trước
      await updateChannelBktConfig({
        channelId: channel.id,
        bktTestMode: bktTestMode,
        bktProfileId: bktProfileId.trim() || null,
      });

      // 2. Cập nhật các cài đặt lọc & tải của kênh
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
        reupModEnabled: reupEnabled,
        reupModSpeed: reupSpeed,
        reupModPitch: reupPitch ? 1.02 : 1.0,
        reupModFlip: reupFlip,
        reupModCrop: reupCrop ? 0.015 : 0.0,
        customFilenameTemplate: filenameTemplate.trim() || null,
      });

      if (onBktConfigSaved) {
        await onBktConfigSaved();
      }

      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save channel settings:', err);
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
                Cài đặt Kênh Đối Thủ &amp; Bộ Lọc Tải
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate max-w-[380px]">
                {channel.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'filter' | 'bkt' | 'filename')}
          className="w-full mt-2"
        >
          <TabsList className="grid grid-cols-3 w-full bg-muted/60 p-1 border border-border/40 text-xs">
            <TabsTrigger value="filter" className="flex items-center gap-1 text-xs py-1.5">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Lọc Tự Động</span>
            </TabsTrigger>
            <TabsTrigger value="bkt" className="flex items-center gap-1 text-xs py-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Gán Hồ Sơ (1-1)</span>
              {bktProfileId ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-0.5" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-0.5" />
              )}
            </TabsTrigger>
            <TabsTrigger value="filename" className="flex items-center gap-1 text-xs py-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>Mẫu Tên Tệp</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SMART AUTO-DOWNLOAD FILTER */}
          <TabsContent value="filter" className="space-y-4 pt-3">
            {/* Auto-download Toggle & Interval */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
              <div className="space-y-0.5">
                <Label htmlFor="auto-dl-toggle" className="text-sm font-medium cursor-pointer">
                  Tự động tải video mới
                </Label>
                <p className="text-xs text-muted-foreground">
                  Hệ thống tự động phát hiện qua RSS & tải về khi có video mới
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
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Mỗi 5 phút (Siêu tốc)</SelectItem>
                    <SelectItem value="15">Mỗi 15 phút (Khuyên dùng)</SelectItem>
                    <SelectItem value="30">Mỗi 30 phút</SelectItem>
                    <SelectItem value="60">Mỗi 1 giờ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tab quét nội dung</Label>
                <Select
                  value={contentType}
                  onValueChange={(val) => setContentType(val as YoutubeChannelContentType)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả (Video, Shorts, Trực tiếp)</SelectItem>
                    <SelectItem value="videos">Chỉ Video dài</SelectItem>
                    <SelectItem value="shorts">Chỉ Shorts</SelectItem>
                    <SelectItem value="streams">Chỉ Trực tiếp / Livestream</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Cấu hình thời lượng nhanh</Label>
                <span className="text-[11px] text-muted-foreground">Chọn để điền tự động</span>
              </div>
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
                  Đặt lại (Tất cả)
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
                  placeholder="Ví dụ: 0"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-dur" className="text-xs font-medium">
                  Thời lượng tối đa (giây)
                </Label>
                <Input
                  id="max-dur"
                  type="number"
                  placeholder="Ví dụ: 3600 (1 tiếng)"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Keyword Exclude & Include */}
            <div className="space-y-2 pt-1">
              <div className="space-y-1.5">
                <Label
                  htmlFor="exclude-kw"
                  className="text-xs font-medium flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  Từ khóa loại trừ (Bỏ qua video chứa từ khóa này)
                </Label>
                <Input
                  id="exclude-kw"
                  placeholder="Ví dụ: Livestream, Thông báo, Q&A, Trực tiếp"
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  className="h-9 text-xs"
                />
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] text-muted-foreground mr-1">Thêm nhanh:</span>
                  {COMMON_EXCLUDE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddExcludeTag(tag)}
                      className="text-[10px] bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/40 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="include-kw"
                    className="text-xs font-medium flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Từ khóa bắt buộc (Chỉ tải nếu tiêu đề chứa từ khóa này)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoFillKeywordsFromCompetitor}
                    disabled={extractingKeywords}
                    className="h-6 px-1.5 text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10 gap-1 font-medium"
                    title="Tự động trích xuất từ khóa kênh đối thủ và điền vào ô này"
                  >
                    {extractingKeywords ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-purple-500" />
                    )}
                    <span>Tự điền từ đối thủ</span>
                  </Button>
                </div>
                <Input
                  id="include-kw"
                  placeholder="Để trống để tải tất cả, hoặc nhập: Tập, Review, Highlight"
                  value={includeKeywords}
                  onChange={(e) => setIncludeKeywords(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Tự động cấu hình theo đối thủ */}
              <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>Tự động Cài Đặt Kênh (Studio) theo đối thủ</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Trích xuất bộ từ khóa kênh và thẻ video mặc định từ đối thủ để tự động cài đặt
                    vào YouTube Studio.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSeoDialog(true)}
                  className="h-8 px-3 text-xs gap-1.5 border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium shrink-0 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Tự động cấu hình theo đối thủ</span>
                </Button>
              </div>

              {/* Thông báo phân tách tính năng */}
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-2.5 mt-2">
                <FlaskConical className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <span className="font-semibold text-foreground">
                    Chức năng Reup &amp; Test BKT đã được tách riêng:
                  </span>
                  <p className="leading-relaxed">
                    Sau khi video được tải về máy, bạn hãy truy cập trực tiếp vào mục{' '}
                    <b>"Reup &amp; Test BKT"</b> trên thanh menu bên trái để chọn video, áp dụng
                    Reup Pipeline (Lv.1 / Lv.2) và tải lên kênh BKT để kiểm tra bản quyền.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: PROFILE MAPPING & BKT TEST */}
          <TabsContent value="bkt" className="space-y-4 pt-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                <span>Gán Hồ Sơ Trình Duyệt &amp; Kênh Đích (Đối Chiếu 1-1)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Liên kết kênh đối thủ này với một Hồ Sơ Chromium nuôi kênh cụ thể. Giúp ngăn ngừa
                100% rủi ro lấy video của ngách này đăng nhầm sang kênh ngách khác.
              </p>
            </div>

            {/* Profile Selection Dropdown */}
            <div className="space-y-2 p-3.5 rounded-lg border border-border/60 bg-card/60">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  Hồ sơ Chromium hệ thống (Target Profile)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Kho hồ sơ: {profiles.length} profile
                </span>
              </div>
              <Select
                value={bktProfileId || '__none__'}
                onValueChange={(val) => setBktProfileId(val === '__none__' ? '' : val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Chọn hồ sơ trình duyệt nuôi kênh..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs text-amber-500 font-medium">
                    ⚠️ -- Chưa gán hồ sơ (Dễ nhầm lẫn) --
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
                        {p.proxy && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            (Proxy)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status banner */}
              {bktProfileId ? (
                <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                  <div className="space-y-0.5">
                    <span className="font-semibold">
                      ✓ Đã khớp 1-1 với hồ sơ:{' '}
                      {profiles.find((p) => p.id === bktProfileId)?.profile_name || bktProfileId}
                    </span>
                    <p className="text-[11px] opacity-90">
                      Mọi video cào và tải từ kênh đối thủ này được chỉ định xuất bản hoặc test bản
                      quyền trên profile này.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <div className="space-y-0.5">
                    <span className="font-semibold">Cảnh báo: Chưa gán kênh đích 1-1!</span>
                    <p className="text-[11px] opacity-90">
                      Dashboard sẽ gắn nhãn cảnh báo màu hổ phách để nhắc nhở tránh nhầm lẫn giữa
                      các kênh đối thủ và kênh nuôi.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action box: Studio Auto Setting */}
            <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Tự động Cài Đặt Kênh (Studio) theo đối thủ</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Tự động đồng bộ Từ khóa kênh, Thẻ video mặc định và chuẩn COPPA vào hồ sơ Studio
                  đã gán.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSeoDialog(true)}
                className="h-8 px-3 text-xs gap-1.5 border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium shrink-0 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <span>Cài đặt Kênh Studio</span>
              </Button>
            </div>

            {/* BKT Shadow Check Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
              <div className="space-y-0.5 pr-3">
                <Label
                  htmlFor="bkt-toggle"
                  className="text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  Bật chế độ Shadow Check (Test BKT ngầm)
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Video nghi vấn dính bản quyền sẽ tự động được gửi sang Kênh Test BKT của hồ sơ này
                  để quét Content ID trên YouTube Studio trước khi xuất bản.
                </p>
              </div>
              <Switch id="bkt-toggle" checked={bktTestMode} onCheckedChange={setBktTestMode} />
            </div>
          </TabsContent>

          {/* TAB 2: FILENAME TEMPLATE */}
          <TabsContent value="filename" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label htmlFor="template-input" className="text-xs font-medium">
                Mẫu đặt tên tệp tải về
              </Label>
              <Input
                id="template-input"
                value={filenameTemplate}
                onChange={(e) => setFilenameTemplate(e.target.value)}
                placeholder="[Kênh] - [Ngày đăng] - [Tiêu đề]"
                className="h-9 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Tệp tải về sẽ tự động thay thế các biến bằng thông tin thực tế của video.
              </p>
            </div>

            {/* Quick token insert buttons */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Chèn biến nhanh:</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {TEMPLATE_TOKENS.map((item) => (
                  <Button
                    key={item.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleInsertToken(item.token)}
                    className="h-7 text-xs font-mono px-2 border-border/60 hover:border-primary/50"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="p-3 rounded-lg border border-border/50 bg-muted/40 space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium block">
                Xem trước tên tệp thực tế:
              </span>
              <p className="text-xs font-mono text-primary font-semibold break-all">
                {previewFilename}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-xs"
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {showSeoDialog && (
        <CompetitorSeoDialog
          isOpen={showSeoDialog}
          onClose={() => setShowSeoDialog(false)}
          channel={{
            ...channel,
            bkt_profile_id: bktProfileId || channel.bkt_profile_id,
          }}
          profiles={profiles}
        />
      )}
    </Dialog>
  );
}
