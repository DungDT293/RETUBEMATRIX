import {
  AlertTriangle,
  Check,
  Copy,
  Flame,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
  Tv,
  Type,
  Video,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  type AiTitleVariants,
  analyzeHookDeep,
  generateSmartDescription,
  type HookAnalysisResult,
  rewriteViralTitles,
  type SmartDescriptionResult,
} from '@/contexts/outliers/outliers-client';
import { cn } from '@/lib/utils';
import { detectGenre, detectTitleLanguage, generateAllHookTitles } from '@/utils/reup-auto-pilot';

const EMPTY_STRING_ARRAY: string[] = [];

function buildInstantVariants(
  cleanTitle: string,
  competitorKeywords: string[] = [],
  competitorTags: string[] = [],
): AiTitleVariants {
  const lang = detectTitleLanguage(cleanTitle);
  const genre = detectGenre(cleanTitle);
  const titles = generateAllHookTitles(
    cleanTitle,
    'all',
    0,
    competitorKeywords,
    competitorTags,
    genre,
    lang,
  );

  const getTriggerForVariant = (idx: number): string => {
    if (lang === 'en') {
      if (genre === 'music') {
        const triggers = [
          'Acoustic Immersion & Aesthetic Enhancement (Deep atmosphere for repeat streaming)',
          'Bass Resonance & Adrenaline Surge (Frequency boost tailored for high sensory impact)',
          'Extended Focus & Seamless Loop (Curated for continuous background listening)',
          'Official Studio Authenticity (Certified high-fidelity audio presence)',
          'Viral Audio Edit & Trend Resonance (Social media optimized pacing and tone)',
        ];
        return triggers[idx % triggers.length];
      }
      if (genre === 'gaming') {
        const triggers = [
          'Peak Skill & Climax Anticipation (Highlights impossible reaction speed and victory)',
          'Full Immersion & Mastery Gameplay (Uncut pro level execution and strategy)',
          'Unexpected Highlight & Clutch Moment (Subverting viewer expectations with miraculous plays)',
          'Pure Ambient Focus (Distraction-free high level gameplay experience)',
          'Competitive Dominance & Pro Meta (Industry standard competitive excellence)',
        ];
        return triggers[idx % triggers.length];
      }
      if (genre === 'howto') {
        const triggers = [
          'Cognitive Ease & Step-by-Step Clarity (Reduces learning friction instantly)',
          'Authority & Expert Secrets (Reveals proven techniques backed by real results)',
          'Rapid Execution & Efficiency (Saves time with direct, actionable shortcuts)',
          'Mistake Avoidance & High Value (Protects beginners from common pitfalls)',
          'Comprehensive Blueprint (Full A-to-Z mastery framework)',
        ];
        return triggers[idx % triggers.length];
      }
      const triggers = [
        'Exclusive Perspective (Offers fresh angle and unique insights)',
        '2026 Fresh Update (Establishes immediate timeliness and relevance)',
        'Field Tested Experience (Builds trust through practical evaluation)',
        'Essential Takeaway (Highlights critical points audience needs to know)',
        'Complete Master Edition (Ensures comprehensive and definitive quality)',
      ];
      return triggers[idx % triggers.length];
    }

    // Tiếng Việt
    if (genre === 'music') {
      const triggers = [
        'Trải nghiệm âm thanh chìm đắm (Giai điệu sâu lắng kích thích nghe lặp lại)',
        'Bùng nổ năng lượng Bass (Tăng cường dải tần cực căng cho tập luyện và lái xe)',
        'Thư giãn và tập trung tối đa (Bản lặp mượt mà không ngắt quãng cảm xúc)',
        'Chất lượng âm thanh chuẩn gốc (Khẳng định độ chân thực và hoàn hảo của bản nhạc)',
        'Giai điệu bắt trend xu hướng (Tối ưu nhịp điệu cho Short/TikTok/Reels)',
      ];
      return triggers[idx % triggers.length];
    }
    if (genre === 'gaming') {
      const triggers = [
        'Kỹ năng đỉnh cao (Khai thác khoảnh khắc xuất thần và phản xạ thần tốc)',
        'Chiến thuật chuyên nghiệp (Phân tích toàn diện lối chơi đẳng cấp pro)',
        'Tình huống lật kèo không tưởng (Gây phấn khích tột độ với pha xử lý clutch)',
        'Trải nghiệm thuần khiết (Tập trung hoàn toàn vào diễn biến chân thực của game)',
        'Highlights tổng hợp mùa giải (Độ kịch tính dồn dập kích thích thị giác)',
      ];
      return triggers[idx % triggers.length];
    }
    if (genre === 'howto') {
      const triggers = [
        'Học nhanh không áp lực (Giảm độ phức tạp, hướng dẫn từng bước trực quan)',
        'Bí quyết chuẩn chuyên gia (Tiết lộ kinh nghiệm thực chiến ít ai chia sẻ)',
        'Tối ưu hóa thời gian (Cách làm nhanh gọn hiệu quả gấp nhiều lần)',
        'Tránh sai lầm tốn kém (Cảnh báo các bẫy thường gặp của người mới bắt đầu)',
        'Hệ thống hóa toàn diện (Lộ trình rõ ràng từ cơ bản đến nâng cao)',
      ];
      return triggers[idx % triggers.length];
    }
    const triggers = [
      'Góc nhìn độc quyền (Đem lại góc nhìn mới mẻ và khác biệt cho người xem)',
      'Cập nhật mới nhất 2026 (Khẳng định tính mới và giá trị tức thời)',
      'Trải nghiệm thực tế (Tăng độ tin cậy với phân tích chi tiết từ thực tế)',
      'Lưu ý then chốt (Cung cấp các điểm mấu chốt người xem không thể bỏ qua)',
      'Tổng hợp trọn vẹn (Đảm bảo giá trị đầy đủ không thiếu sót)',
    ];
    return triggers[idx % triggers.length];
  };

  return {
    originalTitle: cleanTitle,
    variants: titles.map((item, idx) => ({
      formula: item.type,
      title: item.title,
      estimatedCtr: item.score.replace(/^CTR\s*/i, ''),
      psychologicalTrigger: getTriggerForVariant(idx),
    })),
    source: 'local_nlp_instant',
  };
}

export interface CompetitorAiStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTitle?: string;
  initialNiche?: string;
  initialCompetitorChannel?: string;
  initialCompetitorKeywords?: string[];
  initialCompetitorTags?: string[];
  initialTranscriptPreview?: string;
  onApplyTitle?: (title: string) => void;
  onApplyDescription?: (description: string) => void;
  onSendToBkt?: (title: string, description?: string) => void;
}

export function CompetitorAiStudioModal({
  isOpen,
  onClose,
  initialTitle = '',
  initialNiche = '',
  initialCompetitorChannel = '',
  initialCompetitorKeywords = EMPTY_STRING_ARRAY,
  initialCompetitorTags = EMPTY_STRING_ARRAY,
  initialTranscriptPreview = '',
  onApplyTitle,
  onApplyDescription,
  onSendToBkt,
}: CompetitorAiStudioModalProps) {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'titles' | 'description' | 'hook'>('titles');
  const [currentTitle, setCurrentTitle] = useState(initialTitle);
  const [currentNiche, setCurrentNiche] = useState(initialNiche);
  const [competitorTags, setCompetitorTags] = useState<string[]>(
    initialCompetitorTags || EMPTY_STRING_ARRAY,
  );
  const [slmMode, setSlmMode] = useState<boolean>(false);
  const hasRunOnOpenRef = useRef<boolean>(false);

  // Data states
  const [titleVariants, setTitleVariants] = useState<AiTitleVariants | null>(null);
  const [smartDescription, setSmartDescription] = useState<SmartDescriptionResult | null>(null);
  const [hookAnalysis, setHookAnalysis] = useState<HookAnalysisResult | null>(null);

  // Loading states
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [loadingDescription, setLoadingDescription] = useState(false);
  const [loadingHook, setLoadingHook] = useState(false);

  // Copy tracking states
  const [copiedTitleIndex, setCopiedTitleIndex] = useState<number | null>(null);
  const [copiedDescriptionTier, setCopiedDescriptionTier] = useState<string | null>(null);
  const [copiedHookIndex, setCopiedHookIndex] = useState<number | null>(null);

  // Update internal states when initial props change
  useEffect(() => {
    if (isOpen) {
      setCurrentTitle(initialTitle);
      setCurrentNiche(initialNiche);
      setCompetitorTags(initialCompetitorTags || []);
    }
  }, [isOpen, initialTitle, initialNiche, initialCompetitorTags]);

  // Fetch Viral Titles (Instant Local Fallback + Background AI Refinement)
  const handleFetchTitles = useCallback(
    async (titleToUse = currentTitle) => {
      const cleanTitle = titleToUse.trim();
      if (!cleanTitle) return;

      // Kích hoạt Instant Heuristic Fallback (<0.1ms) ngay lập tức theo đúng Ngôn ngữ & Thể loại
      const instantVariants = buildInstantVariants(
        cleanTitle,
        initialCompetitorKeywords,
        competitorTags,
      );

      setTitleVariants((prev) => prev ?? instantVariants);
      setLoadingTitles(true);
      try {
        const res = await rewriteViralTitles(
          cleanTitle,
          currentNiche || null,
          initialCompetitorKeywords.length > 0 ? initialCompetitorKeywords : null,
          slmMode,
        );
        if (res?.variants && res.variants.length > 0) {
          setTitleVariants(res);
        }
      } catch (err) {
        console.warn('Lỗi rewriteViralTitles, giữ nguyên local fallback:', err);
      } finally {
        setLoadingTitles(false);
      }
    },
    [currentTitle, currentNiche, initialCompetitorKeywords, competitorTags, slmMode],
  );

  // Fetch Smart Description
  const handleFetchDescription = useCallback(
    async (titleToUse = currentTitle) => {
      if (!titleToUse.trim()) return;
      setLoadingDescription(true);
      try {
        const res = await generateSmartDescription(
          titleToUse,
          currentNiche || null,
          competitorTags.length > 0 ? competitorTags : null,
          initialCompetitorChannel || null,
          slmMode,
        );
        setSmartDescription(res);
      } catch (err) {
        console.error('Lỗi generateSmartDescription:', err);
        toast.error({
          title: 'Lỗi tạo mô tả chuẩn SEO',
          description: String(err),
        });
      } finally {
        setLoadingDescription(false);
      }
    },
    [currentTitle, currentNiche, competitorTags, initialCompetitorChannel, slmMode, toast],
  );

  // Fetch Deep Hook Analysis
  const handleFetchHookAnalysis = useCallback(
    async (titleToUse = currentTitle) => {
      if (!titleToUse.trim()) return;
      setLoadingHook(true);
      try {
        const res = await analyzeHookDeep(
          titleToUse,
          initialTranscriptPreview || null,
          currentNiche || null,
        );
        setHookAnalysis(res);
      } catch (err) {
        console.error('Lỗi analyzeHookDeep:', err);
        toast.error({
          title: 'Lỗi phân tích kịch bản hook',
          description: String(err),
        });
      } finally {
        setLoadingHook(false);
      }
    },
    [currentTitle, initialTranscriptPreview, currentNiche, toast],
  );

  // Generate All AI Features on Open or Manual Trigger
  const handleRunAllAi = useCallback(
    async (titleToUse = currentTitle) => {
      if (!titleToUse.trim()) return;
      await Promise.all([
        handleFetchTitles(titleToUse),
        handleFetchDescription(titleToUse),
        handleFetchHookAnalysis(titleToUse),
      ]);
      toast.success({
        title: 'Đã hoàn tất Tối Ưu AI!',
        description: 'Đã sinh 5 công thức tiêu đề, mô tả 4 tầng SEO và kịch bản hook >70% AVD.',
      });
    },
    [currentTitle, handleFetchTitles, handleFetchDescription, handleFetchHookAnalysis, toast],
  );

  // Initial trigger when modal opens (guarded against re-render loop)
  useEffect(() => {
    if (isOpen) {
      if (!hasRunOnOpenRef.current && currentTitle.trim()) {
        hasRunOnOpenRef.current = true;
        void handleRunAllAi(currentTitle);
      }
    } else {
      hasRunOnOpenRef.current = false;
    }
  }, [isOpen, currentTitle, handleRunAllAi]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success({
      title: 'Đã sao chép vào bộ nhớ đệm!',
      description: label,
    });
  };

  const handleCopyTitle = (text: string, index: number) => {
    copyToClipboard(text, text);
    setCopiedTitleIndex(index);
    setTimeout(() => setCopiedTitleIndex(null), 2000);
  };

  const handleCopyTier = (text: string, tierName: string) => {
    copyToClipboard(text, `Đã sao chép ${tierName}`);
    setCopiedDescriptionTier(tierName);
    setTimeout(() => setCopiedDescriptionTier(null), 2000);
  };

  const handleCopyHook = (script: string, index: number) => {
    copyToClipboard(script, `Đã sao chép kịch bản hook #${index + 1}`);
    setCopiedHookIndex(index);
    setTimeout(() => setCopiedHookIndex(null), 2000);
  };

  const aiEngineBadge = (source?: string) => {
    if (slmMode || source?.includes('0.5b')) {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-mono px-2 py-0.5 gap-1 border-amber-500/50 text-amber-300 bg-amber-500/10"
        >
          <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse bg-amber-400" />
          AI Mode: Qwen-0.5B (Siêu Nhẹ 2GB RAM)
        </Badge>
      );
    }
    const isLlm = source === 'llm';
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-[10px] font-mono px-2 py-0.5 gap-1',
          isLlm
            ? 'border-purple-500/40 text-purple-400 bg-purple-500/10'
            : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
        )}
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full inline-block animate-pulse',
            isLlm ? 'bg-purple-400' : 'bg-emerald-400',
          )}
        />
        {isLlm ? 'AI Mode: LLM Cloud' : 'AI Mode: Local NLP Rule-based'}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0 border-border/70 bg-card">
        {/* MODAL HEADER */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border/50 bg-gradient-to-r from-purple-500/10 via-background to-amber-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  Competitor AI Studio: Tối Ưu Nội Dung Theo Đối Thủ
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Tự động hoá: 5 Công thức Tiêu đề Viral, Mô tả 4 Tầng SEO, & Kịch bản Remake Hook
                  &gt;70% AVD.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {currentNiche && (
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
                  {currentNiche}
                </Badge>
              )}
              {initialCompetitorChannel && (
                <Badge variant="outline" className="text-xs border-sky-500/40 text-sky-400 gap-1">
                  <Tv className="w-3 h-3" />
                  {initialCompetitorChannel}
                </Badge>
              )}
              {aiEngineBadge(
                titleVariants?.source || smartDescription?.source || hookAnalysis?.source,
              )}
              <Button
                variant={slmMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = !slmMode;
                  setSlmMode(next);
                  toast.info({
                    title: next ? 'Đã kích hoạt Chế độ AI Siêu Nhẹ (0.5B)' : 'Đã tắt AI Siêu Nhẹ',
                    description: next
                      ? 'Tối ưu cho máy yếu (2 Core 2GB RAM), độ trễ cực thấp, tiết kiệm tài nguyên.'
                      : 'Quay lại chế độ AI mặc định.',
                  });
                }}
                className={cn(
                  'text-xs h-7 px-2.5 gap-1.5 font-medium transition-all',
                  slmMode
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500 shadow-sm'
                    : 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10',
                )}
              >
                <Zap className={cn('w-3.5 h-3.5', slmMode && 'fill-amber-200 animate-pulse')} />
                <span>Chế độ AI Siêu Nhẹ (0.5B)</span>
              </Button>
            </div>
          </div>

          {/* Title Editor & Trigger Bar */}
          <div className="mt-3 pt-3 border-t border-border/40 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <Input
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                placeholder="Nhập tiêu đề video đối thủ cần tối ưu..."
                className="text-xs h-9 bg-background/60"
              />
            </div>
            <Button
              onClick={() => handleRunAllAi(currentTitle)}
              disabled={loadingTitles || loadingDescription || loadingHook || !currentTitle.trim()}
              className="text-xs h-9 px-4 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium shrink-0"
            >
              <RefreshCw
                className={cn(
                  'w-3.5 h-3.5',
                  (loadingTitles || loadingDescription || loadingHook) && 'animate-spin',
                )}
              />
              Tối Ưu Toàn Diện AI
            </Button>
          </div>
        </DialogHeader>

        {/* SPY TAGS ĐỐI THỦ (CHUẨN VIDIQ) BANNER */}
        {competitorTags.length > 0 && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl border border-teal-500/30 bg-gradient-to-r from-teal-500/10 via-cyan-500/5 to-transparent space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-foreground">
                  Thẻ Tags Đối Thủ (Spy Tags VidIQ)
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-teal-500/15 text-teal-300 border-teal-500/40"
                >
                  {competitorTags.length} tags
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tagString = competitorTags.join(', ');
                    navigator.clipboard.writeText(tagString);
                    toast.success({
                      title: 'Đã sao chép tất cả Tags (,)',
                      description: `Đã copy ${competitorTags.length} tags. Sẵn sàng dán thẳng vào ô Tags của YouTube Studio!`,
                    });
                  }}
                  className="h-7 px-2.5 text-xs gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/20 font-medium"
                >
                  <Copy className="w-3 h-3" />
                  <span>Sao chép tất cả Tags (,)</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {competitorTags.map((tag, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    navigator.clipboard.writeText(tag);
                    toast.success({
                      title: 'Đã sao chép thẻ tag',
                      description: tag,
                    });
                  }}
                  title="Bấm để sao chép tag này"
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-500/10 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 transition-colors"
                >
                  <span>#{tag}</span>
                  <Copy className="w-2.5 h-2.5 opacity-60 hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODAL TABS BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'titles' | 'description' | 'hook')}
            className="w-full space-y-4"
          >
            <TabsList className="grid grid-cols-3 w-full h-10 p-1 bg-muted/60 border border-border/50">
              <TabsTrigger
                value="titles"
                className="text-xs gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
              >
                <Type className="w-3.5 h-3.5" />
                <span>5 Công Thức Tiêu Đề</span>
              </TabsTrigger>
              <TabsTrigger
                value="description"
                className="text-xs gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Mô Tả 4 Tầng SEO</span>
              </TabsTrigger>
              <TabsTrigger
                value="hook"
                className="text-xs gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Kịch Bản Hook &gt;70% AVD</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: 5 CÔNG THỨC TIÊU ĐỀ VIRAL */}
            <TabsContent value="titles" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    5 Công Thức Tiêu Đề YouTube Viral Đỉnh Cao
                    <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
                      Quy Tắc 95% Core - 5% Hook
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Giữ trọn 95% ý chính video gốc, tái cấu trúc 5% điểm kích thích cảm xúc để tăng
                    vọt CTR.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFetchTitles()}
                  disabled={loadingTitles}
                  className="text-xs h-8 px-2.5 gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={cn('w-3 h-3', loadingTitles && 'animate-spin')} />
                  Tạo lại tiêu đề
                </Button>
              </div>

              {loadingTitles && !titleVariants ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-xs">
                    Đang giải thuật n-gram &amp; kích hoạt 5 công thức viral...
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {titleVariants?.variants.map((item, idx) => (
                    <Card
                      key={item.formula}
                      className="p-3.5 border-border/60 bg-background/50 hover:bg-muted/30 transition-all space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 text-[11px] font-bold flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-foreground">{item.formula}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        >
                          CTR {item.estimatedCtr}
                        </Badge>
                      </div>

                      <div className="p-2.5 rounded-lg bg-card border border-border/50 font-medium text-xs sm:text-sm text-foreground leading-snug">
                        {item.title}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 italic">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{item.psychologicalTrigger}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyTitle(item.title, idx)}
                            className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          >
                            {copiedTitleIndex === idx ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedTitleIndex === idx ? 'Đã chép' : 'Sao chép'}
                          </Button>

                          {onApplyTitle && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onApplyTitle(item.title);
                                toast.success({
                                  title: 'Đã áp dụng tiêu đề!',
                                  description: item.title,
                                });
                              }}
                              className="h-7 px-2.5 text-xs gap-1 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Áp dụng
                            </Button>
                          )}

                          {onSendToBkt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onSendToBkt(item.title, smartDescription?.fullDescription);
                                onClose();
                              }}
                              className="h-7 px-2.5 text-xs gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            >
                              <Flame className="w-3.5 h-3.5" />
                              BKT
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: MÔ TẢ 4 TẦNG CHUẨN SEO */}
            <TabsContent value="description" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Mô Tả YouTube 4 Tầng Tối Ưu SEO &amp; Đề Xuất
                    <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[10px]">
                      Full SEO Matrix 2026
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cấu trúc 4 tầng chuẩn: Hook 150 ký tự đầu, Tóm tắt &amp; Chapters, CTA &amp;
                    Fair Use, Bộ Hashtag.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFetchDescription()}
                    disabled={loadingDescription}
                    className="text-xs h-8 px-2.5 gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={cn('w-3 h-3', loadingDescription && 'animate-spin')} />
                    Tạo lại mô tả
                  </Button>

                  {smartDescription && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(smartDescription.fullDescription, 'Toàn bộ mô tả 4 tầng')
                      }
                      className="text-xs h-8 px-3 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Sao chép tất cả
                    </Button>
                  )}
                </div>
              </div>

              {loadingDescription && !smartDescription ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-xs">Đang phân tích cấu trúc mô tả 4 tầng SEO...</span>
                </div>
              ) : smartDescription ? (
                <div className="space-y-4">
                  {/* TIER 1: HOOK SEO */}
                  <Card className="p-3.5 border-border/60 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Tầng 1: Hook SEO (&lt;150 ký tự)
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Ăn trọn đoạn preview trước nút "Xem thêm"
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyTier(smartDescription.tier1HookSeo, 'Tầng 1')}
                        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedDescriptionTier === 'Tầng 1' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Chép Tầng 1
                      </Button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-card border border-border/50 text-xs text-foreground leading-relaxed">
                      {smartDescription.tier1HookSeo}
                    </div>
                  </Card>

                  {/* TIER 2: TÓM TẮT & CHAPTERS */}
                  <Card className="p-3.5 border-border/60 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[10px]">
                          Tầng 2: Tóm Tắt &amp; Timestamps Chapters
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Giữ chân người xem &amp; phân đoạn Google Search
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopyTier(smartDescription.tier2SummaryChapters, 'Tầng 2')
                        }
                        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedDescriptionTier === 'Tầng 2' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Chép Tầng 2
                      </Button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-card border border-border/50 text-xs text-foreground font-sans whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                      {smartDescription.tier2SummaryChapters}
                    </pre>
                  </Card>

                  {/* TIER 3: CTA & FAIR USE */}
                  <Card className="p-3.5 border-border/60 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                          Tầng 3: Kêu Gọi (CTA) &amp; Bản Quyền Fair Use
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Disclaimer bản quyền Mục 107 &amp; Credit nhạc sạch
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyTier(smartDescription.tier3CtaCredits, 'Tầng 3')}
                        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedDescriptionTier === 'Tầng 3' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Chép Tầng 3
                      </Button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-card border border-border/50 text-xs text-foreground font-sans whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                      {smartDescription.tier3CtaCredits}
                    </pre>
                  </Card>

                  {/* TIER 4: HASHTAGS */}
                  <Card className="p-3.5 border-border/60 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
                          Tầng 4: Bộ Hashtag Tối Ưu (3 Hiển Thị + 10 Ngầm)
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Ăn đề xuất từ khóa đối thủ
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopyTier(smartDescription.tier4Hashtags.join(' '), 'Tầng 4')
                        }
                        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedDescriptionTier === 'Tầng 4' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Chép Bộ Hashtag
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-card border border-border/50">
                      {smartDescription.tier4Hashtags.map((ht: string, i: number) => (
                        <span
                          key={ht}
                          className={cn(
                            'px-2 py-0.5 rounded text-[11px] font-mono border',
                            i < 3
                              ? 'bg-purple-500/15 text-purple-400 border-purple-500/30 font-semibold'
                              : 'bg-muted/40 text-muted-foreground border-border/40',
                          )}
                        >
                          {ht}
                        </span>
                      ))}
                    </div>
                  </Card>

                  {/* PREVIEW TOÀN BỘ & ÁP DỤNG */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    {onApplyDescription && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          onApplyDescription(smartDescription.fullDescription);
                          toast.success({
                            title: 'Đã áp dụng mô tả!',
                            description: 'Đã cập nhật nội dung mô tả 4 tầng vào form chuẩn bị.',
                          });
                        }}
                        className="text-xs h-9 px-4 gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                      >
                        <Check className="w-4 h-4" />
                        Áp Dụng Mô Tả Vào Kênh
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* TAB 3: PHÂN TÍCH & KỊCH BẢN HOOK >70% AVD */}
            <TabsContent value="hook" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Phân Tích 5-10 Giây Đầu &amp; 3 Kịch Bản Remake Hook
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                      Mục Tiêu &gt;70% AVD
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Đập tan quán tính lướt màn hình vô thức (Pattern Interrupt) và xoá bỏ điểm tụt
                    retention 0:03 - 0:06.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFetchHookAnalysis()}
                  disabled={loadingHook}
                  className="text-xs h-8 px-2.5 gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={cn('w-3 h-3', loadingHook && 'animate-spin')} />
                  Phân tích lại
                </Button>
              </div>

              {loadingHook && !hookAnalysis ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-xs">
                    Đang giải phẫu 10 giây đầu tiên và thiết lập 3 kịch bản remake...
                  </span>
                </div>
              ) : hookAnalysis ? (
                <div className="space-y-4">
                  {/* DIAGNOSIS & RETENTION RISK BANNER */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Card className="p-3.5 border-amber-500/30 bg-amber-500/5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Chẩn Đoán Đoạn Mở Đầu Video Đối Thủ</span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed">
                        {hookAnalysis.hookDiagnosis}
                      </p>
                    </Card>

                    <Card className="p-3.5 border-rose-500/30 bg-rose-500/5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold">
                        <Flame className="w-4 h-4 shrink-0" />
                        <span>Rủi Ro Tụt Xem (Retention Leak Risk)</span>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed">
                        {hookAnalysis.predictedRetentionRisk}
                      </p>
                    </Card>
                  </div>

                  {/* 3 REMAKE HOOK SCRIPTS */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-foreground">
                      3 Kịch Bản Remake Hook Thay Thế Để Giữ Chân Người Xem:
                    </div>

                    {hookAnalysis.remakeHooks.map((h, i: number) => (
                      <Card
                        key={h.hookType}
                        className="p-4 border-border/60 bg-background/50 hover:bg-muted/30 transition-all space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold flex items-center justify-center">
                              #{i + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground">
                                {h.hookType}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono border-purple-500/40 text-purple-400"
                              >
                                0 - {h.durationSeconds} Giây
                              </Badge>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyHook(h.script, i)}
                            className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          >
                            {copiedHookIndex === i ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedHookIndex === i ? 'Đã chép' : 'Sao chép kịch bản'}
                          </Button>
                        </div>

                        {/* SCRIPT BOX */}
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground block">
                            Lời thoại / Text hiển thị:
                          </Label>
                          <div className="p-2.5 rounded-lg bg-card border border-border/50 text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                            {h.script}
                          </div>
                        </div>

                        {/* VISUAL & STRATEGY */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1">
                            <div className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5">
                              <Video className="w-3.5 h-3.5" />
                              <span>Hành động thị giác (Visual Action):</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-normal">
                              {h.visualAction}
                            </p>
                          </div>

                          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1">
                            <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              <span>Chiến lược giữ chân (Retention Strategy):</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-normal">
                              {h.retentionStrategy}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
