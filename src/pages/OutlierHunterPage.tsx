import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Compass,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Tv,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Page } from '@/components/layout';
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
import { useToast } from '@/components/ui/toast';
import { useDownload } from '@/contexts/download-context';
import {
  analyzeCompetitorChannel,
  type CompetitorVideo,
  clearAllOutlierVideos,
  deleteOutlierVideo,
  findKeywordGoldmines,
  getOutlierSettings,
  getOutlierVideos,
  type KeywordGoldmine,
  type OutlierHunterSettings,
  type OutlierVideo,
  triggerOutlierScan,
} from '@/contexts/outliers/outliers-client';
import { cn } from '@/lib/utils';

// Mô hình IKIGAI: 3 Nhóm ngách lớn theo chỉ dẫn chiến lược
export const IKIGAI_CATEGORIES = [
  {
    id: 'high_cpm',
    title: 'Nhóm 1: CPM Cao (Tài chính, Công nghệ, Kinh doanh, Giáo dục)',
    subtitle: 'CPM rất cao ($5-$30+) nhưng cạnh tranh khốc liệt, đòi hỏi kiến thức chuyên sâu.',
    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
    badge: 'CPM $5 - $30+',
    niches: [
      { name: 'Tài chính cá nhân', val: 'tài chính cá nhân quản lý tiền' },
      { name: 'Đầu tư chứng khoán/Crypto', val: 'đầu tư chứng khoán cho người mới' },
      { name: 'Công nghệ & AI Tools', val: 'công nghệ ai phần mềm tự động hóa' },
      { name: 'Kinh doanh & Khởi nghiệp', val: 'kinh doanh online khởi nghiệp vốn ít' },
      { name: 'Giáo dục & Kỹ năng số', val: 'kỹ năng tự học lập trình thiết kế' },
    ],
  },
  {
    id: 'massive_view',
    title: 'Nhóm 2: View Lớn (Giải trí, Nhạc, Gaming, ASMR, Động vật)',
    subtitle: 'CPM thấp hơn ($0.5-$2) nhưng lượng view bùng nổ khổng lồ, dễ tiếp cận số đông.',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
    badge: 'View Khổng Lồ',
    niches: [
      { name: 'Hài hước & Giải trí', val: 'hài hước tình huống vui nhộn' },
      { name: 'Nhạc Lofi Chill', val: 'nhạc lofi chill học bài thư giãn' },
      { name: 'Gaming Highlights', val: 'gaming highlight khoảnh khắc hài hước' },
      { name: 'ASMR & Satisfying', val: 'asmr satisfying âm thanh thư giãn ngủ ngon' },
      { name: 'Thú cưng & Động vật', val: 'mèo chó đáng yêu hài hước' },
    ],
  },
  {
    id: 'global_view',
    title: 'Nhóm 3: View Ngoại / Ít Phụ Thuộc Ngôn Ngữ (Nấu ăn, Nhạc nền, Timelapse)',
    subtitle: 'Rất hợp kéo view quốc tế (US, EU, JP), dễ mở rộng và làm đều đặn lâu dài.',
    color: 'from-sky-500/20 to-indigo-500/10 border-sky-500/30 text-sky-400',
    badge: 'View Ngoại Global',
    niches: [
      {
        name: 'Nấu ăn cho người ở 1 mình (Khuyên dùng)',
        val: 'nấu ăn cho người ở 1 mình',
        highlight: true,
      },
      { name: 'Món ăn sinh viên tiết kiệm', val: 'món ăn sinh viên nhanh gọn rẻ' },
      { name: 'Nấu ăn Eat Clean giảm cân', val: 'nấu ăn eat clean đơn giản tại nhà' },
      { name: 'Nhạc nền BGM không bản quyền', val: 'background music no copyright for vlog' },
      {
        name: 'Timelapse cảnh quan & nghệ thuật',
        val: 'timelapse drawing painting nature landscape',
      },
    ],
  },
];

interface OutlierHunterPageProps {
  onNavigate?: (page: Page) => void;
}

export function OutlierHunterPage({ onNavigate }: OutlierHunterPageProps = {}) {
  const toast = useToast();
  const { enqueueExternalUrl } = useDownload();

  const [videos, setVideos] = useState<OutlierVideo[]>([]);
  const [_settings, setSettings] = useState<OutlierHunterSettings | null>(null);
  const [_loading, setLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Từ khóa ngách đang chọn (Mặc định: ngách mẫu của người dùng)
  const [currentNiche, setCurrentNiche] = useState<string>('nấu ăn cho người ở 1 mình');
  const [nicheInput, setNicheInput] = useState<string>('nấu ăn cho người ở 1 mình');

  // 4 Công cụ kiểm chứng
  const [activeTool, setActiveTool] = useState<
    'none' | 'alphabet' | 'trends' | 'gap' | 'competitor'
  >('none');

  // Tool 1: YouTube Alphabet Autosuggest (a-z)
  const [alphabetSeed, setAlphabetSeed] = useState<string>('nấu ăn cho người ở 1 mình');
  const [isSearchingAlphabet, setIsSearchingAlphabet] = useState<boolean>(false);
  const [alphabetResults, setAlphabetResults] = useState<KeywordGoldmine[]>([]);

  // Tool 2: Google Trends
  const [trendsKeyword, setTrendsKeyword] = useState<string>('nấu ăn cho người ở 1 mình');
  const [trendsCompareKeyword, setTrendsCompareKeyword] = useState<string>('nấu ăn');
  const [trendsGeo, setTrendsGeo] = useState<string>('VN');

  // Tool 4: Kênh đối thủ & VPH
  const [competitorUrl, setCompetitorUrl] = useState<string>('');
  const [competitorSort, setCompetitorSort] = useState<'popular' | 'latest'>('popular');
  const [isAnalyzingCompetitor, setIsAnalyzingCompetitor] = useState<boolean>(false);
  const [competitorVideos, setCompetitorVideos] = useState<CompetitorVideo[]>([]);

  // Tải dữ liệu ban đầu
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sets, vids] = await Promise.all([getOutlierSettings(), getOutlierVideos()]);
      setSettings(sets);
      setVideos(vids);
    } catch (err) {
      console.error('Failed to load outlier data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Xóa toàn bộ dữ liệu săn đề xuất cũ
  const handleClearAllOldData = async () => {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn xóa sạch toàn bộ dữ liệu săn đề xuất cũ để bắt đầu phương pháp mới?',
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await clearAllOutlierVideos();
      setVideos([]);
      toast.success({
        title: 'Đã xóa sạch dữ liệu cũ',
        description:
          'Cơ sở dữ liệu video đề xuất cũ đã được làm trống 100%. Bạn có thể chọn ngách Ikigai và bắt đầu quét mới.',
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi xóa dữ liệu',
        description: String(err),
      });
    } finally {
      setIsClearing(false);
    }
  };

  // Quét video đề xuất theo ngách
  const handleScanNiche = async (targetNiche?: string) => {
    const nicheToScan = (targetNiche || currentNiche).trim();
    if (!nicheToScan) {
      toast.warning({
        title: 'Chưa nhập từ khóa ngách',
        description: 'Vui lòng chọn hoặc nhập từ khóa ngách trước khi quét đề xuất.',
      });
      return;
    }

    setIsScanning(true);
    toast.info({
      title: 'Đang quét đề xuất YouTube...',
      description: `Hệ thống đang truy quét các video bứt phá trong ngách: "${nicheToScan}".`,
    });

    try {
      const updated = await triggerOutlierScan(nicheToScan);
      setVideos(updated);
      if (updated.length > 0) {
        toast.success({
          title: 'Quét hoàn tất!',
          description: `Tìm thấy ${updated.length} video tiềm năng trong ngách "${nicheToScan}".`,
        });
      } else {
        toast.info({
          title: 'Kết quả quét ngách',
          description: `Chưa tìm thấy video đạt ngưỡng bứt phá cao trong ngách "${nicheToScan}". Thử mở rộng từ khóa hoặc kiểm tra với YouTube A-Z.`,
        });
      }
    } catch (err) {
      toast.error({
        title: 'Lỗi quét đề xuất',
        description: String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Chạy Tool 1: YouTube Alphabet Autosuggest (a-z)
  const handleSearchAlphabet = async () => {
    const seed = alphabetSeed.trim();
    if (!seed) return;
    setIsSearchingAlphabet(true);
    try {
      const res = await findKeywordGoldmines(seed);
      setAlphabetResults(res);
      if (res.length > 0) {
        toast.success({
          title: 'Đào từ khóa thành công',
          description: `Tìm thấy ${res.length} gợi ý từ khóa đuôi dài qua thuật toán Alphabet (A-Z).`,
        });
      }
    } catch (err) {
      toast.error({
        title: 'Lỗi gợi ý Alphabet',
        description: String(err),
      });
    } finally {
      setIsSearchingAlphabet(false);
    }
  };

  // Mở Tool 2: Google Trends (YouTube Search 12 tháng)
  const handleOpenGoogleTrends = async () => {
    const q1 = encodeURIComponent(trendsKeyword.trim() || currentNiche);
    const q2 = trendsCompareKeyword.trim() ? encodeURIComponent(trendsCompareKeyword.trim()) : '';
    const queryPart = q2 ? `${q1},${q2}` : q1;
    const geo = trendsGeo === 'GLOBAL' ? '' : `&geo=${trendsGeo}`;
    const url = `https://trends.google.com/trends/explore?date=today%2012-m&gprop=youtube${geo}&q=${queryPart}`;

    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
    toast.info({
      title: 'Đã mở Google Trends',
      description: 'Xem xu hướng tìm kiếm YouTube 12 tháng qua để đánh giá nhu cầu khán giả.',
    });
  };

  // Chạy Tool 4: Phân tích kênh đối thủ & VPH
  const handleAnalyzeCompetitor = async () => {
    const url = competitorUrl.trim();
    if (!url) {
      toast.warning({
        title: 'Chưa nhập kênh đối thủ',
        description:
          'Vui lòng dán link kênh YouTube đối thủ (ví dụ: https://youtube.com/@channel).',
      });
      return;
    }
    setIsAnalyzingCompetitor(true);
    try {
      const vids = await analyzeCompetitorChannel(url, competitorSort);
      setCompetitorVideos(vids);
      toast.success({
        title: 'Phân tích kênh đối thủ hoàn tất',
        description: `Đã trích xuất ${vids.length} video ${competitorSort === 'popular' ? 'phổ biến nhất' : 'mới nhất'} kèm chỉ số VPH.`,
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi phân tích kênh',
        description: String(err),
      });
    } finally {
      setIsAnalyzingCompetitor(false);
    }
  };

  // Xóa 1 video đề xuất khỏi danh sách
  const handleDeleteVideo = async (id: string) => {
    try {
      await deleteOutlierVideo(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
      toast.info({
        title: 'Đã xóa video',
        description: 'Đã loại bỏ video khỏi danh sách đề xuất.',
      });
    } catch (err) {
      toast.error({ title: 'Lỗi xóa', description: String(err) });
    }
  };

  // Mở video trên YouTube
  const handleOpenYouTube = async (id: string) => {
    const url = `https://www.youtube.com/watch?v=${id}`;
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  // Chuyển video sang Tải video sạch
  const handleQuickDownload = async (vid: OutlierVideo) => {
    const url = `https://www.youtube.com/watch?v=${vid.id}`;
    try {
      await enqueueExternalUrl(url, { mediaType: 'video' });
      toast.success({
        title: 'Đã đưa vào hàng đợi tải video sạch',
        description: `Video "${vid.title.slice(0, 45)}..." sẽ được tải sạch và xóa bỏ metadata gốc.`,
      });
      if (onNavigate) {
        onNavigate('universal');
      }
    } catch (err) {
      toast.error({ title: 'Lỗi tải video', description: String(err) });
    }
  };

  // Chuyển video sang Test BKT
  const handleSendToBkt = (vid: OutlierVideo) => {
    toast.info({
      title: 'Chuyển sang luồng Test BKT',
      description: `Chuẩn bị kênh test bản quyền (Quota 15 video/24h) cho video: "${vid.title.slice(0, 40)}...".`,
    });
    if (onNavigate) {
      onNavigate('reup');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-card/40 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 via-orange-500/20 to-rose-500/20 text-orange-400 border border-orange-500/30">
              <Compass className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text">
                Săn Đề Xuất & Nghiên Cứu Ngách (Mô Hình Ikigai)
              </h1>
              <p className="text-xs text-muted-foreground">
                Định vị ngách ít cạnh tranh qua 3 giao điểm Ikigai & Kiểm chứng bằng 4 công cụ thực
                chiến
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAllOldData}
            disabled={isClearing}
            className="text-xs gap-1.5 border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Xóa Sạch Dữ Liệu Cũ
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => handleScanNiche(currentNiche)}
            disabled={isScanning}
            className="text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium shadow-sm shadow-orange-500/20"
          >
            <Flame className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
            {isScanning ? 'Đang Quét...' : 'Quét Video Đề Xuất'}
          </Button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KHỐI 1: TƯ DUY NGÁCH THEO MÔ HÌNH IKIGAI NHẬT BẢN */}
        <Card className="p-5 border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Tư Duy Ngách Theo Mô Hình Ikigai (3 Giao Điểm Chiến Lược)
              </h2>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">
              Triết Lý Nhật Bản
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs mb-4">
            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center gap-2 font-bold text-blue-400 mb-1">
                <Users className="w-4 h-4" />
                1. Nhu Cầu Người Xem
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Lượng tìm kiếm đủ lớn, khán giả có nỗi đau hoặc nhu cầu giải trí, học hỏi thực tế.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-2 font-bold text-emerald-400 mb-1">
                <Layers className="w-4 h-4" />
                2. Khả Năng Làm Đều Lâu Dài
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Khả thi trong khâu sản xuất, không cạn kiệt ý tưởng, có thể sản xuất video đều đặn
                mỗi tuần.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 font-bold text-amber-400 mb-1">
                <Zap className="w-4 h-4" />
                3. Đường Kiếm Tiền (Monetization)
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Rõ ràng về nguồn thu: CPM quảng cáo YouTube cao, tiếp thị liên kết (Affiliate), hoặc
                bán dịch vụ.
              </p>
            </div>
          </div>

          {/* Phân tích 3 nhóm ngách lớn */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-muted-foreground">
              Chọn nhanh ngách gợi ý theo 3 phân nhóm chiến lược:
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {IKIGAI_CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  className={cn(
                    'p-3.5 rounded-xl border bg-card/40 transition-all flex flex-col justify-between',
                    cat.color,
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-xs">{cat.title.split(':')[0]}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-current">
                        {cat.badge}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
                      {cat.subtitle}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                    {cat.niches.map((n) => {
                      const isSelected = currentNiche.toLowerCase() === n.val.toLowerCase();
                      return (
                        <button
                          key={n.val}
                          type="button"
                          onClick={() => {
                            setCurrentNiche(n.val);
                            setNicheInput(n.val);
                            setAlphabetSeed(n.val);
                            setTrendsKeyword(n.val);
                            handleScanNiche(n.val);
                          }}
                          className={cn(
                            'text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left',
                            isSelected
                              ? 'bg-primary text-primary-foreground font-semibold border-primary shadow-sm'
                              : n.highlight
                                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-medium hover:bg-amber-500/20'
                                : 'border-border/60 bg-background/50 hover:bg-muted text-foreground',
                          )}
                        >
                          {n.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* KHỐI 2: TÌM KIẾM NGÁCH & THANH 4 CÔNG CỤ KIỂM CHỨNG KEYWORD */}
        <Card className="p-5 border-border/50 bg-card/60 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 justify-between pb-4 border-b border-border/40 mb-4">
            {/* Input ngách tùy ý */}
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={nicheInput}
                  onChange={(e) => setNicheInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCurrentNiche(nicheInput);
                      setAlphabetSeed(nicheInput);
                      setTrendsKeyword(nicheInput);
                      handleScanNiche(nicheInput);
                    }
                  }}
                  placeholder="Nhập ngách bé muốn kiểm chứng (Ví dụ: nấu ăn cho người ở 1 mình)..."
                  className="pl-9 h-10 text-xs bg-background/60"
                />
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setCurrentNiche(nicheInput);
                  setAlphabetSeed(nicheInput);
                  setTrendsKeyword(nicheInput);
                  handleScanNiche(nicheInput);
                }}
                disabled={isScanning}
                className="h-10 text-xs px-4"
              >
                Đặt Ngách
              </Button>
            </div>

            {/* Đang nghiên cứu ngách nào */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ngách hiện tại:</span>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-semibold px-2.5 py-1">
                {currentNiche}
              </Badge>
            </div>
          </div>

          {/* 4 Công cụ kiểm chứng theo mô tả của người dùng */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                4 Công Cụ Kiểm Chứng Keyword & Nghiên Cứu Ngách (Thực Chiến):
              </span>
              <span className="text-[11px] text-muted-foreground">
                Bấm vào từng công cụ để mở bảng phân tích chi tiết
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Button
                type="button"
                variant={activeTool === 'alphabet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'alphabet' ? 'none' : 'alphabet');
                  setAlphabetSeed(currentNiche);
                  if (alphabetResults.length === 0) {
                    handleSearchAlphabet();
                  }
                }}
                className="text-xs justify-start gap-2 h-auto py-2.5"
              >
                <Tag className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">1. YouTube A-Z</div>
                  <div className="text-[10px] opacity-70">Gợi ý từ khóa đuôi dài</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'trends' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'trends' ? 'none' : 'trends');
                  setTrendsKeyword(currentNiche);
                }}
                className="text-xs justify-start gap-2 h-auto py-2.5"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">2. Google Trends</div>
                  <div className="text-[10px] opacity-70">YouTube Search 12T</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'gap' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'gap' ? 'none' : 'gap');
                  setAlphabetSeed(currentNiche);
                  if (alphabetResults.length === 0) {
                    handleSearchAlphabet();
                  }
                }}
                className="text-xs justify-start gap-2 h-auto py-2.5"
              >
                <Target className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">3. Content Gap</div>
                  <div className="text-[10px] opacity-70">Cầu cao - Ít video đáp ứng</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'competitor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'competitor' ? 'none' : 'competitor');
                }}
                className="text-xs justify-start gap-2 h-auto py-2.5"
              >
                <Tv className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">4. Kênh Đối Thủ & VPH</div>
                  <div className="text-[10px] opacity-70">Đo view mỗi giờ (VPH)</div>
                </div>
              </Button>
            </div>
          </div>

          {/* VÙNG HIỂN THỊ NỘI DUNG 4 CÔNG CỤ KHI ĐƯỢC CHỌN */}
          {activeTool !== 'none' && (
            <div className="mt-4 pt-4 border-t border-border/50 bg-background/40 rounded-xl p-4">
              {/* TOOL 1: YOUTUBE ALPHABET AUTOSUGGEST (A-Z) */}
              {activeTool === 'alphabet' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-400" />
                        1. Thanh Gợi Ý YouTube Alphabet (Autosuggest A-Z)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Tự động thêm từng chữ cái (a, b, c... z) vào từ khóa để tìm các ngách nhỏ
                        đuôi dài ít cạnh tranh.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTool('none')}
                      className="h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={alphabetSeed}
                      onChange={(e) => setAlphabetSeed(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchAlphabet()}
                      placeholder="Nhập từ khóa hạt giống (Ví dụ: nấu ăn)..."
                      className="text-xs h-9"
                    />
                    <Button
                      size="sm"
                      onClick={handleSearchAlphabet}
                      disabled={isSearchingAlphabet}
                      className="text-xs h-9 px-4 gap-1.5"
                    >
                      <RefreshCw
                        className={cn('w-3.5 h-3.5', isSearchingAlphabet && 'animate-spin')}
                      />
                      Đào Từ Khóa A-Z
                    </Button>
                  </div>

                  {alphabetResults.length > 0 && (
                    <div className="border border-border/50 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 text-muted-foreground border-b border-border/40">
                          <tr>
                            <th className="py-2 px-3">Từ khóa đuôi dài (Ngách nhỏ)</th>
                            <th className="py-2 px-3 text-center">Số từ</th>
                            <th className="py-2 px-3">Mức độ cạnh tranh</th>
                            <th className="py-2 px-3 text-right">Tác vụ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {alphabetResults.map((kw, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="py-2 px-3 font-medium text-foreground">
                                {kw.keyword}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge variant="outline" className="text-[10px]">
                                  {kw.word_count} từ
                                </Badge>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={cn(
                                    'text-[11px] font-medium',
                                    kw.word_count >= 5
                                      ? 'text-emerald-400'
                                      : kw.word_count >= 3
                                        ? 'text-amber-400'
                                        : 'text-rose-400',
                                  )}
                                >
                                  {kw.competition ||
                                    (kw.word_count >= 5
                                      ? 'Ít cạnh tranh (Ngách rất nhỏ)'
                                      : 'Cạnh tranh vừa')}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      navigator.clipboard.writeText(kw.keyword);
                                      toast.success({
                                        title: 'Đã sao chép từ khóa',
                                        description: kw.keyword,
                                      });
                                    }}
                                    className="h-7 px-2 text-[10px] gap-1"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Chép
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setCurrentNiche(kw.keyword);
                                      setNicheInput(kw.keyword);
                                      handleScanNiche(kw.keyword);
                                    }}
                                    className="h-7 px-2 text-[10px] gap-1"
                                  >
                                    Săn Ngách Này
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TOOL 2: GOOGLE TRENDS YOUTUBE SEARCH 12 THÁNG */}
              {activeTool === 'trends' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        2. Google Trends (YouTube Search 12 Tháng)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Kiểm tra xu hướng tìm kiếm trên YouTube theo quốc gia để xác nhận ngách đang
                        tăng trưởng (Breakout) hay suy thoái.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTool('none')}
                      className="h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Từ khóa chính:</Label>
                      <Input
                        value={trendsKeyword}
                        onChange={(e) => setTrendsKeyword(e.target.value)}
                        className="text-xs h-9 mt-1"
                        placeholder="Ví dụ: nấu ăn cho người ở 1 mình"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        So sánh với từ khóa gốc:
                      </Label>
                      <Input
                        value={trendsCompareKeyword}
                        onChange={(e) => setTrendsCompareKeyword(e.target.value)}
                        className="text-xs h-9 mt-1"
                        placeholder="Ví dụ: nấu ăn"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        Quốc gia phân tích:
                      </Label>
                      <Select value={trendsGeo} onValueChange={setTrendsGeo}>
                        <SelectTrigger className="text-xs h-9 mt-1">
                          <SelectValue placeholder="Chọn quốc gia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VN">Việt Nam (VN)</SelectItem>
                          <SelectItem value="US">Hoa Kỳ / Quốc tế (US)</SelectItem>
                          <SelectItem value="GLOBAL">Toàn cầu (Worldwide)</SelectItem>
                          <SelectItem value="JP">Nhật Bản (JP)</SelectItem>
                          <SelectItem value="KR">Hàn Quốc (KR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-muted-foreground">
                      Tham số tra cứu:{' '}
                      <code className="text-emerald-400">gprop=youtube & date=today 12-m</code>
                    </span>
                    <Button
                      size="sm"
                      onClick={handleOpenGoogleTrends}
                      className="text-xs h-9 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Mở Google Trends (YouTube Search)
                    </Button>
                  </div>
                </div>
              )}

              {/* TOOL 3: CONTENT GAP (CẦU CAO - ÍT VIDEO ĐÁP ỨNG) */}
              {activeTool === 'gap' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-sky-400" />
                        3. Đo Lường Content Gap (Nhu Cầu Cao - Thiếu Video Phục Vụ)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Mô phỏng tính năng "Research" trong YouTube Studio: Phát hiện các từ khóa
                        người xem tìm kiếm nhiều nhưng nguồn cung video hiện có còn trống.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTool('none')}
                      className="h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs">
                      <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />🔥 Content Gap Rất Cao
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Lượng tìm kiếm tăng vọt, các video hiện có chất lượng thấp hoặc đã quá cũ
                        (2-3 năm trước). <strong>Khuyên làm ngay!</strong>
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs">
                      <div className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        ⚖️ Content Gap Trung Bình
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Có sự cạnh tranh vừa phải từ các kênh nhỏ. Cần góc nhìn mới lạ hoặc cải tiến
                        Thumbnail để thắng.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs">
                      <div className="font-bold text-rose-400 mb-1 flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5" />
                        ⚠️ Bão Hòa Nội Dung
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Quá nhiều kênh lớn thống trị từ khóa chung chung (ví dụ "nấu ăn"). Phải thu
                        hẹp về ngách bé hơn nữa.
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-muted/40 p-3 rounded-lg flex items-center justify-between">
                    <span>
                      Đang đánh giá Content Gap cho ngách:{' '}
                      <strong className="text-foreground">{currentNiche}</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveTool('alphabet');
                        setAlphabetSeed(currentNiche);
                        handleSearchAlphabet();
                      }}
                      className="text-xs h-7 px-3 gap-1"
                    >
                      Đào Ngách Bé Hơn Nữa (A-Z)
                    </Button>
                  </div>
                </div>
              )}

              {/* TOOL 4: KÊNH ĐỐI THỦ & VPH */}
              {activeTool === 'competitor' && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Tv className="w-4 h-4 text-rose-400" />
                        4. Phân Tích Kênh Đối Thủ & VPH (Views Per Hour)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Vào kênh đối thủ, quét tab video sắp xếp theo "Phổ biến nhất" hoặc "Mới
                        nhất", đo lượng view theo giờ (VPH) và điểm từ khóa.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTool('none')}
                      className="h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input
                      value={competitorUrl}
                      onChange={(e) => setCompetitorUrl(e.target.value)}
                      placeholder="Dán link kênh YouTube đối thủ (Ví dụ: https://youtube.com/@channel)..."
                      className="text-xs h-9 flex-1"
                    />

                    <Select
                      value={competitorSort}
                      onValueChange={(v) => setCompetitorSort(v as 'popular' | 'latest')}
                    >
                      <SelectTrigger className="w-36 text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="popular">Phổ biến nhất</SelectItem>
                        <SelectItem value="latest">Mới nhất</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      size="sm"
                      onClick={handleAnalyzeCompetitor}
                      disabled={isAnalyzingCompetitor}
                      className="text-xs h-9 px-4 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      <RefreshCw
                        className={cn('w-3.5 h-3.5', isAnalyzingCompetitor && 'animate-spin')}
                      />
                      Phân Tích Đối Thủ
                    </Button>
                  </div>

                  {competitorVideos.length > 0 && (
                    <div className="border border-border/50 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 text-muted-foreground border-b border-border/40">
                          <tr>
                            <th className="py-2 px-3">Video đối thủ</th>
                            <th className="py-2 px-3 text-center">Lượt xem</th>
                            <th className="py-2 px-3 text-center">Vận tốc (VPH)</th>
                            <th className="py-2 px-3 text-center">Điểm SEO</th>
                            <th className="py-2 px-3 text-right">Tác vụ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {competitorVideos.map((cv) => (
                            <tr key={cv.id} className="hover:bg-muted/30">
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={cv.thumbnail_url}
                                    alt={cv.title}
                                    className="w-10 h-6 object-cover rounded"
                                  />
                                  <span className="font-medium text-foreground line-clamp-1">
                                    {cv.title}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center font-mono">
                                {cv.views.toLocaleString()}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 text-emerald-400 font-mono"
                                >
                                  {cv.vph.toLocaleString()}/h
                                </Badge>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="text-amber-400 font-bold">
                                  {cv.keyword_score}/100
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenYouTube(cv.id)}
                                  className="h-7 px-2 text-[10px] gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Xem
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* KHỐI 3: DANH SÁCH VIDEO ĐỀ XUẤT ĐỘT BIẾN TRONG NGÁCH */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Danh Sách Video Đột Biến Trong Ngách:
              </h2>
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
                {currentNiche} ({videos.length} video)
              </Badge>
            </div>

            <span className="text-xs text-muted-foreground">
              Tự động tính toán VPH & Đột biến View/Sub
            </span>
          </div>

          {videos.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/60 bg-card/30 flex flex-col items-center justify-center">
              <Compass className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Chưa có dữ liệu video đề xuất cho ngách này
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mb-4 leading-relaxed">
                Dữ liệu cũ đã được xóa sạch. Hãy chọn một ngách theo mô hình Ikigai hoặc nhập từ
                khóa ngách bé ở trên, sau đó bấm <strong>"Quét Video Đề Xuất"</strong> để hệ thống
                tiến hành cào dữ liệu mới 100%.
              </p>
              <Button
                size="sm"
                onClick={() => handleScanNiche(currentNiche)}
                disabled={isScanning}
                className="text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white"
              >
                <Flame className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
                Quét Ngay: "{currentNiche}"
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videos.map((vid) => {
                const subRatio =
                  vid.sub_outlier_ratio || (vid.subscribers > 0 ? vid.views / vid.subscribers : 1);
                const vph =
                  vid.avg_vph || (vid.hours_published > 0 ? vid.views / vid.hours_published : 0);

                return (
                  <Card
                    key={vid.id}
                    className="p-4 border-border/50 bg-card/60 backdrop-blur-sm flex flex-col justify-between hover:border-border transition-all"
                  >
                    <div>
                      {/* Channel info & Niche tag */}
                      <div className="flex items-center justify-between text-xs mb-2.5 pb-2 border-b border-border/40">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Tv className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{vid.channel_name}</span>
                          <span className="text-muted-foreground font-normal">
                            ({vid.subscribers.toLocaleString()} subs)
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-500/40 text-amber-400"
                        >
                          {vid.niche}
                        </Badge>
                      </div>

                      {/* Video Media Info */}
                      <div className="flex gap-3 mb-3">
                        <div className="relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-black/40">
                          <img
                            src={vid.thumbnail_url}
                            alt={vid.title}
                            className="w-full h-full object-cover"
                          />
                          {vid.duration > 0 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-black/80 text-white font-mono">
                              {Math.floor(vid.duration / 60)}:
                              {(vid.duration % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-foreground line-clamp-2 mb-1.5 leading-snug">
                            {vid.title}
                          </h4>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              Lượt xem:{' '}
                              <strong className="text-foreground">
                                {vid.views.toLocaleString()}
                              </strong>
                            </span>
                            <span>
                              Đăng:{' '}
                              <strong className="text-foreground">
                                {vid.hours_published
                                  ? `${Math.round(vid.hours_published)}h trước`
                                  : 'Mới'}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Metrics: VPH & Outlier Multiplier */}
                      <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-background/50 text-center mb-3">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Vận Tốc (VPH)</div>
                          <div className="text-xs font-bold text-emerald-400 font-mono">
                            {Math.round(vph).toLocaleString()}/h
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-muted-foreground">Đột Biến Sub</div>
                          <div className="text-xs font-bold text-amber-400 font-mono">
                            {subRatio.toFixed(1)}x
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-muted-foreground">Content Gap</div>
                          <div className="text-xs font-bold text-sky-400">
                            {vid.opportunity_score ? `${vid.opportunity_score}/100` : 'Rất Cao'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenYouTube(vid.id)}
                          className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          title="Mở trên YouTube"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Xem
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVideo(vid.id)}
                          className="h-8 px-2 text-xs gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          title="Xóa khỏi danh sách"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendToBkt(vid)}
                          className="h-8 px-2.5 text-xs gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          Test BKT
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleQuickDownload(vid)}
                          className="h-8 px-3 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Tải Video Sạch
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
