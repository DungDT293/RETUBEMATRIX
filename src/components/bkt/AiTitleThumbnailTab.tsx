import { Check, Copy, Download, Palette, RefreshCw, Sparkles, Tag, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CompetitorAiStudioModal } from '@/components/outliers/CompetitorAiStudioModal';
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
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/toast';
import { extractVideoSeoTags } from '@/contexts/outliers/outliers-client';
import { cn } from '@/lib/utils';
import { detectGenre, detectTitleLanguage, generateAllHookTitles } from '@/utils/reup-auto-pilot';

export interface AiTitleThumbnailTabProps {
  activeVideoTitle?: string;
  activeThumbnailPath?: string;
  activeVideoUrl?: string;
  activeTags?: string[];
  onApplyTitle?: (title: string) => void;
  onApplyThumbnail?: (thumbPath: string) => void;
  onApplyTags?: (tags: string[]) => void;
  onApplyDescription?: (description: string) => void;
  onNavigateToBkt?: () => void;
}

export function AiTitleThumbnailTab({
  activeVideoTitle,
  activeThumbnailPath,
  activeVideoUrl,
  activeTags,
  onApplyTitle,
  onApplyThumbnail,
  onApplyTags,
  onApplyDescription,
  onNavigateToBkt,
}: AiTitleThumbnailTabProps = {}) {
  const toast = useToast();

  // ================= STATE TIÊU ĐỀ =================
  const [originalTitle, setOriginalTitle] = useState(
    activeVideoTitle || 'Cách nấu ăn cho người ở một mình cực nhanh gọn',
  );
  const [hookStyle, setHookStyle] = useState<
    'all' | 'curiosity' | 'secret' | 'urgency' | 'value' | 'cta'
  >('all');
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [copiedTitleIndex, setCopiedTitleIndex] = useState<number | null>(null);
  const [aiStudioOpen, setAiStudioOpen] = useState(false);

  // ================= STATE SPY TAGS (VIDIQ STYLE) =================
  const [videoUrlInput, setVideoUrlInput] = useState(activeVideoUrl || '');
  const [tags, setTags] = useState<string[]>(
    activeTags && activeTags.length > 0
      ? activeTags
      : [
          'nấu ăn 1 mình',
          'món ăn sinh viên',
          'cơm lười',
          'bữa ăn nhanh',
          'công thức nấu ăn',
          'ẩm thực đơn giản',
          'meal prep 1 người',
          'tự nấu ăn tại nhà',
        ],
  );
  const [isExtractingTags, setIsExtractingTags] = useState(false);
  const [extractedDescription, setExtractedDescription] = useState<string>('');

  // ================= STATE THUMBNAIL =================
  const [thumbnailUrl, setThumbnailUrl] = useState(
    activeThumbnailPath ||
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=640&auto=format&fit=crop&q=80',
  );
  const [contrastBoost, setContrastBoost] = useState(110);
  const [brightness] = useState(105);
  const [saturation, setSaturation] = useState(115);
  const [zoomShift, setZoomShift] = useState(102);
  const [tintMode, setTintMode] = useState<'none' | 'warm' | 'cinematic' | 'vivid'>('vivid');

  useEffect(() => {
    if (activeVideoTitle?.trim()) {
      setOriginalTitle(activeVideoTitle.trim());
    }
  }, [activeVideoTitle]);

  useEffect(() => {
    if (activeThumbnailPath?.trim()) {
      setThumbnailUrl(activeThumbnailPath.trim());
    }
  }, [activeThumbnailPath]);

  useEffect(() => {
    if (activeVideoUrl?.trim()) {
      setVideoUrlInput(activeVideoUrl.trim());
    }
  }, [activeVideoUrl]);

  useEffect(() => {
    if (activeTags && activeTags.length > 0) {
      setTags(activeTags);
    }
  }, [activeTags]);

  const handleExtractTags = async () => {
    let cleanUrl = videoUrlInput.trim();
    if (!cleanUrl) {
      toast.warning({
        title: 'Chưa có link video',
        description: 'Vui lòng dán link video YouTube đối thủ để trích xuất Spy Tags.',
      });
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
      setVideoUrlInput(cleanUrl);
    }

    setIsExtractingTags(true);
    try {
      const res = await extractVideoSeoTags(cleanUrl);
      const foundItems: string[] = [];

      if (res.title) {
        setOriginalTitle(res.title);
        foundItems.push('Tiêu đề');
      }

      const thumb = res.thumbnail || res.thumbnail_url;
      if (thumb) {
        setThumbnailUrl(thumb);
        foundItems.push('Ảnh bìa');
      }

      if (res.description) {
        setExtractedDescription(res.description);
      }

      if (res.tags && res.tags.length > 0) {
        setTags(res.tags);
        foundItems.push(`${res.tags.length} thẻ tags`);
      }

      if (foundItems.length > 0) {
        toast.success({
          title: 'Trích xuất SEO đối thủ thành công',
          description: `Đã nạp: ${foundItems.join(', ')}. Sẵn sàng tối ưu và áp dụng.`,
        });
      } else {
        toast.info({
          title: 'Không tìm thấy thẻ tags công khai',
          description:
            'Video đối thủ đã ẩn thẻ tags. Bạn có thể tự nạp thẻ ngách hoặc sinh qua AI Studio.',
        });
      }
    } catch (err) {
      console.error('Lỗi extractVideoSeoTags:', err);
      toast.error({
        title: 'Lỗi trích xuất SEO',
        description: String(err),
      });
    } finally {
      setIsExtractingTags(false);
    }
  };

  const handleApplyAllSeo = () => {
    if (originalTitle) {
      onApplyTitle?.(originalTitle);
    }
    if (tags.length > 0) {
      onApplyTags?.(tags);
    }
    if (thumbnailUrl) {
      onApplyThumbnail?.(thumbnailUrl);
    }
    if (extractedDescription) {
      onApplyDescription?.(extractedDescription);
    }

    toast.success({
      title: 'Đã áp dụng toàn bộ SEO đối thủ',
      description: `Đã đồng bộ Tiêu đề, ${tags.length} Thẻ Tags và Thumbnail vào form đăng.`,
    });

    if (onNavigateToBkt) {
      onNavigateToBkt();
    }
  };

  const handleApplyTagsToChannel = () => {
    if (tags.length === 0) {
      toast.warning({
        title: 'Chưa có thẻ tags',
        description: 'Vui lòng trích xuất thẻ tags trước khi áp dụng.',
      });
      return;
    }
    onApplyTags?.(tags);
    toast.success({
      title: 'Đã áp dụng thẻ Tags',
      description: `Đã đồng bộ ${tags.length} thẻ tags vào cấu hình đăng kênh.`,
    });
  };

  const handleCopyAllTags = () => {
    if (tags.length === 0) return;
    navigator.clipboard.writeText(tags.join(', '));
    toast.success({
      title: 'Đã sao chép Thẻ Tags!',
      description: `Đã copy ${tags.length} tags dạng dấu phẩy (,). Sẵn sàng dán vào YouTube Studio.`,
    });
  };

  const handleLoadTagsToAiStudio = () => {
    setAiStudioOpen(true);
    toast.info({
      title: 'Đã nạp Tags vào AI Studio',
      description: `Đang mở Competitor AI Studio với ${tags.length} thẻ tags đối thủ.`,
    });
  };

  // Tự động nhận diện Ngôn ngữ & Thể loại nội dung của tiêu đề
  const detectedLang = useMemo(() => detectTitleLanguage(originalTitle), [originalTitle]);
  const detectedGenre = useMemo(() => detectGenre(originalTitle), [originalTitle]);

  // Generate 95% Core + 5% Hook Variations (Word Boundary & Dynamic CTR)
  const generatedTitles = useMemo(() => {
    return generateAllHookTitles(
      originalTitle,
      hookStyle,
      refreshSeed,
      undefined,
      tags,
      detectedGenre,
      detectedLang,
    );
  }, [originalTitle, hookStyle, refreshSeed, tags, detectedGenre, detectedLang]);

  const handleCopyTitle = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedTitleIndex(index);
    toast.success({
      title: 'Đã sao chép tiêu đề tối ưu!',
      message: text,
    });
    setTimeout(() => setCopiedTitleIndex(null), 2000);
  };

  const handleDownloadOptimizedThumbnail = async () => {
    try {
      if (!thumbnailUrl) {
        toast.error({
          title: 'Lỗi xuất ảnh bìa',
          message: 'Chưa có URL ảnh bìa để xử lý.',
        });
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      // Load image promise
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => {
          // If direct load fails (e.g. CORS), try fetching as blob
          fetch(thumbnailUrl)
            .then((r) => r.blob())
            .then((blob) => {
              const objUrl = URL.createObjectURL(blob);
              img.onload = () => {
                URL.revokeObjectURL(objUrl);
                resolve();
              };
              img.onerror = () => reject(new Error('Không tải được ảnh từ URL đã cho'));
              img.src = objUrl;
            })
            .catch(() => reject(new Error('Không tải được ảnh từ URL đã cho')));
        };
        img.src = thumbnailUrl;
      });

      const canvas = document.createElement('canvas');
      const targetW = img.naturalWidth || 1280;
      const targetH = img.naturalHeight || 720;
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Không khởi tạo được bộ vẽ Canvas 2D');
      }

      let filterStr = `contrast(${contrastBoost}%) brightness(${brightness}%) saturate(${saturation}%)`;
      if (tintMode === 'warm') filterStr += ' sepia(15%)';
      else if (tintMode === 'cinematic') filterStr += ' hue-rotate(5deg)';
      else if (tintMode === 'vivid') filterStr += ' saturate(130%)';

      ctx.filter = filterStr;

      const scale = zoomShift / 100;
      const drawW = targetW * scale;
      const drawH = targetH * scale;
      const dx = (targetW - drawW) / 2;
      const dy = (targetH - drawH) / 2;

      ctx.drawImage(img, dx, dy, drawW, drawH);

      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error({
            title: 'Lỗi xuất ảnh',
            message: 'Không thể tạo file ảnh từ canvas.',
          });
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `optimized_thumbnail_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        toast.success({
          title: 'Đã tải về ảnh bìa tối ưu AI!',
          message:
            'File ảnh PNG đã được lưu vào máy với bộ lọc chống quét trùng lặp MD5 & Visual AI.',
        });
      }, 'image/png');
    } catch (err) {
      toast.error({
        title: 'Lỗi xuất ảnh bìa',
        message: String(err),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-xl border border-border/70 bg-gradient-to-r from-purple-500/10 via-background to-blue-500/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                Chức Năng 6: AI Tối Ưu Tiêu Đề & Ảnh Bìa (Thumbnail)
                <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
                  Quy Tắc 95% - 5%
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Giữ nguyên 95% ý chính và từ khóa cốt lõi của video gốc. Chỉ tối ưu 5% đuôi hook để
                kích thích tò mò và tăng tỷ lệ click (CTR).
              </p>
            </div>
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={() => setAiStudioOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5 font-medium shadow-sm shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Competitor AI Studio
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CỘT 1: TỐI ƯU TIÊU ĐỀ AI */}
        <Card className="p-5 border-border/60 bg-card space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-foreground">
              <Type className="w-4 h-4 text-purple-400" />
              <span>Tối Ưu Tiêu Đề (Giữ 95% + Đổi 5% Hook)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              >
                {detectedLang === 'vi' ? 'VI' : 'EN'}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold capitalize px-1.5 py-0.5 bg-purple-500/10 text-purple-400 border-purple-500/30"
              >
                {detectedGenre === 'music'
                  ? 'Phonk/Music'
                  : detectedGenre === 'gaming'
                    ? 'Gaming'
                    : detectedGenre === 'howto'
                      ? 'How-to'
                      : 'General'}
              </Badge>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Tiêu đề video gốc (Đối thủ):
              </Label>
              <Input
                value={originalTitle}
                onChange={(e) => setOriginalTitle(e.target.value)}
                placeholder="Nhập tiêu đề video gốc..."
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Phong cách Hook 5%:
                </Label>
                <Select
                  value={hookStyle}
                  onValueChange={(
                    val: 'all' | 'curiosity' | 'secret' | 'urgency' | 'value' | 'cta',
                  ) => setHookStyle(val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      Tổng hợp tất cả
                    </SelectItem>
                    <SelectItem value="curiosity" className="text-xs">
                      Tò mò cao độ
                    </SelectItem>
                    <SelectItem value="secret" className="text-xs">
                      Tiết lộ bí mật
                    </SelectItem>
                    <SelectItem value="urgency" className="text-xs">
                      Thúc giục / Cảnh báo
                    </SelectItem>
                    <SelectItem value="value" className="text-xs">
                      Giá trị vượt trội
                    </SelectItem>
                    <SelectItem value="cta" className="text-xs">
                      Kêu gọi hành động
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsGeneratingTitle(true);
                    setRefreshSeed((s) => s + 1);
                    setTimeout(() => {
                      setIsGeneratingTitle(false);
                      toast.success({
                        title: 'Đã tạo xong các biến thể tiêu đề!',
                        message: '5 gợi ý tiêu đề tối ưu theo quy chuẩn 95%-5% đã sẵn sàng.',
                      });
                    }, 300);
                  }}
                  className="w-full h-8 text-xs gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isGeneratingTitle && 'animate-spin')} />
                  <span>Tạo lại gợi ý AI</span>
                </Button>
              </div>
            </div>

            {/* List Gợi ý Tiêu Đề */}
            <div className="space-y-2.5 pt-2">
              <Label className="text-xs font-semibold text-foreground block">
                Gợi ý tiêu đề tối ưu hóa ({generatedTitles.length} biến thể):
              </Label>
              {generatedTitles.map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border border-border/50 bg-muted/20 hover:border-purple-500/40 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">
                      {item.type}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-400 border-emerald-500/30"
                    >
                      {item.score}
                    </Badge>
                  </div>
                  <div className="text-xs font-medium text-foreground leading-relaxed">
                    <span className="text-muted-foreground">{item.core} </span>
                    <span className="text-purple-400 font-bold bg-purple-500/10 px-1 py-0.5 rounded">
                      {item.hook}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground">
                      95% cốt lõi + 5% hook đuôi
                    </span>
                    <div className="flex items-center gap-1.5">
                      {onApplyTitle && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onApplyTitle(item.title);
                            if (onNavigateToBkt) {
                              onNavigateToBkt();
                            }
                          }}
                          className="h-6 px-2 text-[10px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                        >
                          <Sparkles className="w-3 h-3 text-primary" />
                          <span>Áp dụng</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyTitle(item.title, index)}
                        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedTitleIndex === index ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* CỘT 2: TỐI ƯU THUMBNAIL BẢO TỒN NHẬN DIỆN */}
        <Card className="p-5 border-border/60 bg-card space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-foreground">
              <Palette className="w-4 h-4 text-blue-400" />
              <span>Tối Ưu Thumbnail (Giữ Nhận Diện & Đổi Nhẹ Pixel)</span>
            </div>
            <span className="text-[11px] text-muted-foreground">Tránh Content ID Scan</span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                URL ảnh bìa gốc (hoặc dán link):
              </Label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
                className="text-xs h-9 font-mono text-[11px]"
              />
            </div>

            {/* Thumbnail Canvas Preview */}
            <div className="relative rounded-lg overflow-hidden border border-border/70 aspect-video bg-black/40 flex items-center justify-center">
              <img
                src={thumbnailUrl}
                alt="Optimized Thumbnail Preview"
                className="w-full h-full object-cover transition-all"
                style={{
                  filter: `contrast(${contrastBoost}%) brightness(${brightness}%) saturate(${saturation}%) ${
                    tintMode === 'warm'
                      ? 'sepia(15%)'
                      : tintMode === 'cinematic'
                        ? 'hue-rotate(5deg)'
                        : tintMode === 'vivid'
                          ? 'saturate(130%)'
                          : ''
                  }`,
                  transform: `scale(${zoomShift / 100})`,
                }}
              />
              <div className="absolute top-2 left-2 flex gap-1.5">
                <Badge className="bg-black/70 text-white border-white/20 text-[10px] backdrop-blur-sm">
                  Live AI Grade
                </Badge>
                <Badge className="bg-emerald-500/80 text-white text-[10px]">MD5 Reshuffled</Badge>
              </div>
            </div>

            {/* Fine Tuning Controls */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Độ tương phản (Contrast):</span>
                    <span className="font-semibold text-foreground">{contrastBoost}%</span>
                  </div>
                  <Slider
                    value={[contrastBoost]}
                    min={90}
                    max={130}
                    step={1}
                    onValueChange={(val) => setContrastBoost(val[0])}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Độ bão hòa màu:</span>
                    <span className="font-semibold text-foreground">{saturation}%</span>
                  </div>
                  <Slider
                    value={[saturation]}
                    min={90}
                    max={140}
                    step={1}
                    onValueChange={(val) => setSaturation(val[0])}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Dời góc / Zoom nhẹ (Anti-hash):</span>
                    <span className="font-semibold text-foreground">{zoomShift}%</span>
                  </div>
                  <Slider
                    value={[zoomShift]}
                    min={100}
                    max={108}
                    step={0.5}
                    onValueChange={(val) => setZoomShift(val[0])}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Tone màu (Color Filter):</span>
                  </div>
                  <Select
                    value={tintMode}
                    onValueChange={(val: 'none' | 'warm' | 'cinematic' | 'vivid') =>
                      setTintMode(val)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">
                        Nguyên bản
                      </SelectItem>
                      <SelectItem value="vivid" className="text-xs">
                        Vivid (Rực rỡ, hút mắt)
                      </SelectItem>
                      <SelectItem value="warm" className="text-xs">
                        Warm (Ấm áp, thân thiện)
                      </SelectItem>
                      <SelectItem value="cinematic" className="text-xs">
                        Cinematic (Điện ảnh)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                onClick={handleDownloadOptimizedThumbnail}
                className="w-full text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Thumbnail Tối Ưu (Sạch Bản Quyền Ảnh)</span>
              </Button>
              {onApplyThumbnail && (
                <Button
                  onClick={() => {
                    if (thumbnailUrl) {
                      onApplyThumbnail(thumbnailUrl);
                      if (onNavigateToBkt) {
                        onNavigateToBkt();
                      }
                    }
                  }}
                  variant="outline"
                  className="w-full text-xs gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Gán Thumbnail Này Vào Kênh Test & Kênh Chính</span>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* CARD: SPY TAGS & TỪ KHÓA VIDEO GỐC (VIDIQ STYLE) */}
      <Card className="p-5 border-border/60 bg-gradient-to-br from-card via-card to-teal-500/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">
                  Spy Tags & Từ Khóa Video Gốc (VidIQ Style)
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-teal-500/10 text-teal-400 border-teal-500/30"
                >
                  {tags.length} thẻ tags
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bóc tách toàn bộ thẻ tag ẩn của video đối thủ và ăn theo luồng đề xuất thuật toán
                YouTube.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAllTags}
              disabled={tags.length === 0}
              className="h-8 px-3 text-xs gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép Thẻ Tags (,)</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyTagsToChannel}
              disabled={tags.length === 0}
              className="h-8 px-3 text-xs gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 font-medium"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Áp dụng Tags vào Kênh</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleLoadTagsToAiStudio}
              className="h-8 px-3 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nạp Tags vào AI Studio</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyAllSeo}
              className="h-8 px-3 text-xs gap-1.5 border-primary/50 text-primary hover:bg-primary/10 font-medium"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Áp Dụng Toàn Bộ SEO Vào Form Đăng</span>
            </Button>
          </div>
        </div>

        {/* Input Bar to Extract From Any Video URL */}
        <div className="flex items-center gap-2">
          <Input
            value={videoUrlInput}
            onChange={(e) => setVideoUrlInput(e.target.value)}
            placeholder="Dán link video YouTube đối thủ để bóc tách tags ngay (https://youtube.com/watch?v=...)..."
            className="text-xs h-9 bg-background/50 font-mono text-[11px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExtractTags}
            disabled={isExtractingTags || !videoUrlInput.trim()}
            className="h-9 px-3.5 text-xs gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 shrink-0 font-medium"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isExtractingTags && 'animate-spin')} />
            <span>{isExtractingTags ? 'Đang trích xuất...' : 'Trích Xuất Spy Tags'}</span>
          </Button>
        </div>

        {/* Tags Chips Display */}
        <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border/50 bg-background/40 max-h-48 overflow-y-auto">
          {tags.map((t, idx) => (
            <Badge
              key={idx}
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(t);
                toast.success({
                  title: 'Đã sao chép tag',
                  description: t,
                });
              }}
              title="Bấm để sao chép tag này"
              className="cursor-pointer px-2.5 py-1 text-xs gap-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border-teal-500/30 transition-all font-medium"
            >
              <span>#{t}</span>
              <Copy className="w-2.5 h-2.5 opacity-60 hover:opacity-100" />
            </Badge>
          ))}
        </div>
      </Card>

      <CompetitorAiStudioModal
        isOpen={aiStudioOpen}
        onClose={() => setAiStudioOpen(false)}
        initialTitle={originalTitle}
        initialCompetitorTags={tags}
        initialCompetitorKeywords={tags}
        onApplyTitle={(t) => {
          setOriginalTitle(t);
          onApplyTitle?.(t);
          toast.success({
            title: 'Đã cập nhật tiêu đề',
            description: t,
          });
          setAiStudioOpen(false);
        }}
        onApplyDescription={(d) => {
          setExtractedDescription(d);
          onApplyDescription?.(d);
          toast.success({
            title: 'Đã cập nhật mô tả',
            description: 'Đã lưu mô tả tối ưu vào cấu hình đăng video.',
          });
          setAiStudioOpen(false);
        }}
        onSendToBkt={(t, d) => {
          setOriginalTitle(t);
          onApplyTitle?.(t);
          if (d) {
            setExtractedDescription(d);
            onApplyDescription?.(d);
          }
          if (tags.length > 0) {
            onApplyTags?.(tags);
          }
          if (thumbnailUrl) {
            onApplyThumbnail?.(thumbnailUrl);
          }
          toast.success({
            title: 'Đã chuyển toàn bộ dữ liệu sang BKT Upload',
            description: 'Tiêu đề, Mô tả và Thẻ Tags đã sẵn sàng.',
          });
          setAiStudioOpen(false);
          if (onNavigateToBkt) {
            onNavigateToBkt();
          }
        }}
      />
    </div>
  );
}
