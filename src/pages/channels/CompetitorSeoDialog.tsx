import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { useToast } from '@/components/ui/toast';
import type { FollowedChannel, MultiBrowserProfile } from '@/lib/types';

interface CompetitorSeoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channel: FollowedChannel;
  profiles: MultiBrowserProfile[];
}

interface SeoExtractionResult {
  success: boolean;
  channel_name?: string;
  channel_url?: string;
  channel_keywords?: string[];
  default_tags?: string[];
  hashtags?: string[];
  made_for_kids?: boolean;
  error?: string;
}

export function CompetitorSeoDialog({
  isOpen,
  onClose,
  channel,
  profiles,
}: CompetitorSeoDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [channelKeywords, setChannelKeywords] = useState<string[]>([]);
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTag, setNewTag] = useState('');
  const [channelName, setChannelName] = useState(channel.name || 'Đối thủ');

  const fetchSeoData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<SeoExtractionResult>('extract_competitor_channel_seo_cmd', {
        channelUrl: channel.url,
        channel_url: channel.url,
      });

      if (res.success) {
        if (res.channel_name) setChannelName(res.channel_name);
        setChannelKeywords(res.channel_keywords || []);
        setDefaultTags(res.default_tags || []);
        toast.success({
          title: 'Đã trích xuất SEO đối thủ thành công',
          description: `Tìm thấy ${res.channel_keywords?.length || 0} từ khóa kênh và ${res.default_tags?.length || 0} thẻ video.`,
        });
      } else {
        toast.error({
          title: 'Không thể trích xuất',
          description: res.error || 'Vui lòng kiểm tra lại kết nối mạng hoặc URL kênh.',
        });
      }
    } catch (err) {
      console.error('Lỗi extract_competitor_channel_seo_cmd:', err);
      toast.error({
        title: 'Lỗi trích xuất SEO',
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [channel.url, toast]);

  // Khởi tạo profile mặc định
  useEffect(() => {
    if (!isOpen) return;
    const initialProfile = channel.bkt_profile_id || (profiles.length > 0 ? profiles[0].id : '');
    setSelectedProfileId(initialProfile);
    fetchSeoData();
  }, [isOpen, channel.bkt_profile_id, profiles, fetchSeoData]);

  const handleApplySeo = async () => {
    if (!selectedProfileId) {
      toast.error({
        title: 'Chưa chọn hồ sơ',
        description: 'Vui lòng chọn hồ sơ trình duyệt YouTube Studio muốn cấu hình.',
      });
      return;
    }

    setApplying(true);
    try {
      const res = await invoke<{ success: boolean; error?: string }>(
        'apply_competitor_seo_to_profile_cmd',
        {
          profileId: selectedProfileId,
          profile_id: selectedProfileId,
          channelKeywords,
          channel_keywords: channelKeywords,
          defaultTags,
          default_tags: defaultTags,
          madeForKids: false,
          made_for_kids: false,
        },
      );

      if (res.success) {
        toast.success({
          title: 'Cấu hình Kênh Studio thành công!',
          description:
            'Đã tự động điền Từ khóa kênh, thiết lập Không dành cho trẻ em và điền Thẻ video mặc định.',
        });
        onClose();
      } else {
        toast.error({
          title: 'Cấu hình thất bại',
          description: res.error || 'Không thể lưu cài đặt trong YouTube Studio.',
        });
      }
    } catch (err) {
      console.error('Lỗi apply_competitor_seo_to_profile_cmd:', err);
      toast.error({
        title: 'Lỗi Playwright Automation',
        description: String(err),
      });
    } finally {
      setApplying(false);
    }
  };

  const handleCopyKeywords = () => {
    if (channelKeywords.length === 0) return;
    navigator.clipboard.writeText(channelKeywords.join(', '));
    toast.success({
      title: 'Đã sao chép từ khóa',
      description: `Đã sao chép ${channelKeywords.length} từ khóa kênh vào clipboard.`,
    });
  };

  const handleCopyTags = () => {
    if (defaultTags.length === 0) return;
    navigator.clipboard.writeText(defaultTags.join(', '));
    toast.success({
      title: 'Đã sao chép thẻ mặc định',
      description: `Đã sao chép ${defaultTags.length} thẻ video vào clipboard.`,
    });
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;
    if (!channelKeywords.includes(trimmed)) {
      setChannelKeywords([...channelKeywords, trimmed]);
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (index: number) => {
    setChannelKeywords(channelKeywords.filter((_, i) => i !== index));
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;
    if (!defaultTags.includes(trimmed)) {
      setDefaultTags([...defaultTags, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (index: number) => {
    setDefaultTags(defaultTags.filter((_, i) => i !== index));
  };

  const calcTotalChars = (items: string[]) => {
    return items.reduce((acc, it) => {
      const clean = it.trim().replace(/^["',]+|["',]+$/g, '');
      if (!clean) return acc;
      const quotePenalty = clean.includes(' ') ? 2 : 0;
      return acc + clean.length + quotePenalty + 1;
    }, 0);
  };

  const keywordsChars = calcTotalChars(channelKeywords);
  const defaultTagsChars = calcTotalChars(defaultTags);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <DialogTitle className="text-lg">
              Cài đặt Kênh theo Đối thủ (Ăn theo thuật toán YouTube)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Tự động trích xuất bộ từ khóa kênh, thẻ video thịnh hành từ kênh đối thủ và dùng
            Playwright cấu hình 100% tự động vào YouTube Studio của hồ sơ đích.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Thông tin đối thủ & Hồ sơ đích */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Kênh đối thủ (Nguồn SEO)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-medium text-sm text-foreground truncate">{channelName}</span>
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Hồ sơ Kênh Studio đích
                </Label>
                {channel.bkt_profile_id && selectedProfileId === channel.bkt_profile_id && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-500 border-emerald-500/30 py-0"
                  >
                    Đã gán 1-1
                  </Badge>
                )}
              </div>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="mt-1 w-full h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {profiles.length === 0 ? (
                  <option value="">-- Chưa có hồ sơ nào --</option>
                ) : (
                  profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.profile_name} {p.id === channel.bkt_profile_id ? '(Đã gán kênh này)' : ''}{' '}
                      {p.proxy ? `(${p.proxy})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">
                Đang quét mã nguồn và trích xuất siêu dữ liệu SEO từ đối thủ...
              </p>
            </div>
          ) : (
            <>
              {/* Mục 1: Kênh -> Thông tin cơ bản -> Từ khóa kênh */}
              <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-500" />
                    <Label className="text-xs font-semibold">
                      1. Kênh &rarr; Thông tin cơ bản &rarr; Từ khóa ({channelKeywords.length})
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyKeywords}
                      disabled={channelKeywords.length === 0}
                      className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                      title="Sao chép toàn bộ từ khóa"
                    >
                      <Copy className="w-3 h-3" />
                      Sao chép
                    </Button>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${keywordsChars <= 450 ? 'text-emerald-500 border-emerald-500/30' : 'text-amber-500 border-amber-500/30'}`}
                    >
                      {keywordsChars}/450 ký tự ({keywordsChars <= 450 ? 'An toàn' : 'Tự động cắt'})
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-500 border-emerald-500/30"
                    >
                      Kênh &rarr; Basic Info
                    </Badge>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Các từ khóa nhận diện kênh được đối thủ cài đặt trong YouTube Studio giúp thuật
                  toán xếp hạng và phân phối video.
                </p>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-md bg-muted/30 border border-border/40">
                  {channelKeywords.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      Chưa có từ khóa nào được tìm thấy.
                    </span>
                  ) : (
                    channelKeywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary border border-primary/20"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(idx)}
                          className="hover:text-destructive focus:outline-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Thêm từ khóa thủ công (nhấn Enter)..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddKeyword}
                    className="h-8 px-2 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Mục 2: Kênh -> Cài đặt nâng cao -> Không dành cho trẻ em */}
              <div className="border border-border/50 rounded-lg p-3 bg-background flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <Label className="text-xs font-semibold">
                      2. Kênh &rarr; Cài đặt nâng cao &rarr; Đối tượng người xem
                    </Label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Luôn chọn: "Không, đặt kênh này là không dành cho trẻ em" (Chuẩn COPPA).
                  </p>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs">
                  ✓ Không dành cho trẻ em
                </Badge>
              </div>

              {/* Mục 3: Chế độ mặc định cho video tải lên -> Thẻ (tags) */}
              <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <Label className="text-xs font-semibold">
                      3. Chế độ mặc định cho video &rarr; Thẻ (từ khóa) ({defaultTags.length})
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyTags}
                      disabled={defaultTags.length === 0}
                      className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                      title="Sao chép toàn bộ thẻ video"
                    >
                      <Copy className="w-3 h-3" />
                      Sao chép
                    </Button>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${defaultTagsChars <= 450 ? 'text-blue-500 border-blue-500/30' : 'text-amber-500 border-amber-500/30'}`}
                    >
                      {defaultTagsChars}/450 ký tự (
                      {defaultTagsChars <= 450 ? 'An toàn' : 'Tự động cắt'})
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-500 border-amber-500/30"
                    >
                      Upload Defaults &rarr; Tags
                    </Badge>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Bộ thẻ mặc định sẽ tự động gắn vào mọi video tải lên mới, giúp video ăn đề xuất
                  trực tiếp từ các chủ đề hot của đối thủ.
                </p>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-md bg-muted/30 border border-border/40">
                  {defaultTags.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      Chưa có thẻ mặc định nào.
                    </span>
                  ) : (
                    defaultTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(idx)}
                          className="hover:text-destructive focus:outline-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Thêm thẻ mặc định (nhấn Enter)..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTag}
                    className="h-8 px-2 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchSeoData}
            disabled={loading || applying}
            className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Quét lại đối thủ
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={applying}
              className="text-xs"
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplySeo}
              disabled={loading || applying || !selectedProfileId}
              className="text-xs gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md transition-all"
            >
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang tự động cấu hình Studio...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  Áp Dụng Ngay Vào YouTube Studio (Tự động 100%)
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
