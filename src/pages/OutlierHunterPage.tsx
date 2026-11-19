import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Check,
  Clock,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Film,
  Flame,
  Globe,
  Layers,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Tv,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Page } from '@/components/layout';
import { CompetitorAiStudioModal } from '@/components/outliers/CompetitorAiStudioModal';
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
  analyzeGoogleTrends,
  type CompetitorVideo,
  clearAllOutlierVideos,
  deleteOutlierVideo,
  extractVideoSeoTags,
  fetchLiveTrendingTopics,
  findKeywordGoldmines,
  type GoogleTrendsAnalysisResult,
  getOutlierSettings,
  getOutlierVideos,
  type KeywordGoldmine,
  type LiveTrendingTopic,
  type OutlierHunterSettings,
  type OutlierVideo,
  triggerOutlierScan,
  updateOutlierVideoStatus,
} from '@/contexts/outliers/outliers-client';
import { cn } from '@/lib/utils';
import { openExternalUrl } from '@/utils/open-url';

export type MarketType = 'viet' | 'foreign';

export interface ForeignCountry {
  code: string;
  name: string;
  nativeName: string;
}

export const FOREIGN_COUNTRIES: ForeignCountry[] = [
  { code: 'US', name: 'Hoa Kỳ / Toàn Cầu (US / Global)', nativeName: 'United States / Global' },
  { code: 'JP', name: 'Nhật Bản (JP)', nativeName: 'Japan' },
  { code: 'KR', name: 'Hàn Quốc (KR)', nativeName: 'Korea' },
  { code: 'TH', name: 'Thái Lan (TH)', nativeName: 'Thailand' },
  { code: 'UK', name: 'Vương Quốc Anh (UK)', nativeName: 'United Kingdom' },
  { code: 'DE', name: 'Đức (DE)', nativeName: 'Deutschland' },
  { code: 'FR', name: 'Pháp (FR)', nativeName: 'France' },
  { code: 'ID', name: 'Indonesia (ID)', nativeName: 'Indonesia' },
  { code: 'BR', name: 'Brazil (BR)', nativeName: 'Brasil' },
  { code: 'TW', name: 'Đài Loan (TW)', nativeName: 'Taiwan' },
];

export interface StandardNiche {
  id: string;
  nameViet: string;
  nameForeign: string;
  descViet: string;
  descForeign: string;
  defaultQueryViet: string;
  queriesForeign: Record<string, string>;
}

export const STANDARDIZED_NICHES: StandardNiche[] = [
  {
    id: 'review_phim',
    nameViet: 'Review Phim',
    nameForeign: 'Movie Recap / Film Explained',
    descViet: 'Tóm tắt phim, phân tích phim nhanh',
    descForeign: 'Fast film recaps, movie explained',
    defaultQueryViet: 'tóm tắt phim review phim hay',
    queriesForeign: {
      US: 'movie recap film explained',
      UK: 'movie recap film explained',
      JP: '映画 要約 あらすじ 解説',
      KR: '영화 요약 결말포함',
      TH: 'สปอยหนัง หนังเต็มเรื่อง',
      DE: 'filmzusammenfassung film erklärt',
      FR: 'résumé de film film expliqué',
      ID: 'alur cerita film review',
      BR: 'resumo do filme filme explicado',
      TW: '電影解說 幾分鐘看電影',
    },
  },
  {
    id: 'nhac',
    nameViet: 'Nhạc Remix & Lofi',
    nameForeign: 'Speed Up & Slowed Reverb / BGM',
    descViet: 'Speed up, remix, lofi không lời, 8D audio, nhạc nền edit',
    descForeign: 'Speed up songs, slowed reverb, no copyright bgm',
    defaultQueryViet: 'nhạc speed up remix lofi không lời 8d audio',
    queriesForeign: {
      US: 'speed up songs slowed reverb no copyright bgm',
      UK: 'speed up songs slowed reverb no copyright bgm',
      JP: '作業用bgm 著作権フリー speed up',
      KR: '플레이리스트 노동요 speed up',
      TH: 'เพลง speed up เพลงฮิต',
      DE: 'speed up songs lofi no copyright bgm',
      FR: 'speed up musique no copyright bgm',
      ID: 'lagu speed up remix no copyright bgm',
      BR: 'musica speed up remix no copyright bgm',
      TW: '無版權音樂 speed up bgm',
    },
  },
  {
    id: 'asmr',
    nameViet: 'ASMR & Satisfying',
    nameForeign: 'Oddly Satisfying / Deep Clean ASMR',
    descViet: 'Cắt xà phòng, phục hồi đồ cũ, làm sạch sâu, cát động lực',
    descForeign: 'Oddly satisfying, deep cleaning asmr, restoration',
    defaultQueryViet: 'asmr satisfying cắt xà phòng phục hồi đồ cũ làm sạch sâu',
    queriesForeign: {
      US: 'oddly satisfying deep cleaning asmr restoration',
      UK: 'oddly satisfying deep cleaning asmr restoration',
      JP: '音フェチ asmr 気持ちいい 掃除',
      KR: '마음이 편안해지는 영상 asmr 청소',
      TH: 'ฟินๆ asmr ทำความสะอาด',
      DE: 'oddly satisfying asmr tiefenreinigung',
      FR: 'oddly satisfying asmr nettoyage',
      ID: 'oddly satisfying pembersihan asmr',
      BR: 'oddly satisfying asmr limpeza',
      TW: '解壓 asmr 深度清潔 修復',
    },
  },
  {
    id: 'su_that',
    nameViet: 'Sự Thật & Bí Ẩn',
    nameForeign: 'Mind-blowing Facts & Mysteries',
    descViet: 'Top bí ẩn thế giới, khoa học vũ trụ, sự thật rùng mình, facts',
    descForeign: 'Mind-blowing facts, unexplained mysteries, space facts',
    defaultQueryViet: 'sự thật bí ẩn thế giới khoa học vũ trụ facts',
    queriesForeign: {
      US: 'mind blowing facts unexplained mysteries space',
      UK: 'mind blowing facts unexplained mysteries space',
      JP: '衝撃の事実 世界の謎 雑学',
      KR: '흥미로운 사실 충격적인 미스터리',
      TH: 'เรื่องแปลก ความจริงที่คุณไม่เคยรู้',
      DE: 'unglaubliche fakten mysterien weltall',
      FR: 'faits incroyables mystères univers',
      ID: 'fakta mengejutkan misteri dunia',
      BR: 'fatos incriveis misterios universo',
      TW: '不可思議的事實 未解之謎 宇宙',
    },
  },
  {
    id: 'dong_vat',
    nameViet: 'Động Vật Hài Hước',
    nameForeign: 'Funny Pets & Animal Reactions',
    descViet: 'Chó mèo hài, cứu hộ động vật, khoảnh khắc thú cưng',
    descForeign: 'Funny pets, cat dog clips, animal reactions',
    defaultQueryViet: 'chó mèo hài hước cứu hộ động vật thú cưng dễ thương',
    queriesForeign: {
      US: 'funny pets animals cats dogs moments',
      UK: 'funny pets animals cats dogs moments',
      JP: '面白い 動物 猫 犬 かわいい',
      KR: '웃긴 동물 강아지 고양이 힐링',
      TH: 'สัตว์เลี้ยงน่ารัก หมา แมว ฮาๆ',
      DE: 'lustige tiere hunde katzen momente',
      FR: 'animaux drôles chats chiens moments',
      ID: 'hewan lucu anjing kucing ngakak',
      BR: 'animais engracados caes gatos fofos',
      TW: '搞笑動物 萌寵 貓狗 療癒',
    },
  },
  {
    id: 'manga_recap',
    nameViet: 'AI Manga / Manhwa Recap',
    nameForeign: 'AI Manga Recap & Webtoon Summary',
    descViet: 'Tóm tắt truyện tranh voice AI, hoạt hình 2D',
    descForeign: 'Manga recap, webtoon manhwa summary',
    defaultQueryViet: 'tóm tắt truyện tranh manga manhwa anime recap',
    queriesForeign: {
      US: 'manga recap webtoon manhwa summary recap',
      UK: 'manga recap webtoon manhwa summary recap',
      JP: '漫画 要約 アニメ解説 マンガ',
      KR: '웹툰 요약 만화 줄거리',
      TH: 'สปอยมังงะ อนิเมะ ตอนเดียวจบ',
      DE: 'manga recap webtoon zusammenfassung',
      FR: 'manga recap résumé webtoon anime',
      ID: 'recap manga manhwa alur cerita',
      BR: 'recap manga manhwa resumo completo',
      TW: '漫畫解說 動漫推薦 一口氣看完全部',
    },
  },
  {
    id: 'meo_vat_tech',
    nameViet: 'Mẹo Vặt & Đồ Công Nghệ',
    nameForeign: 'Smart Life Hacks & Gadgets Showcase',
    descViet: 'Tech gadgets thông minh, mẹo vặt gia đình faceless',
    descForeign: 'Smart gadgets, amazon life hacks, kitchen tools faceless',
    defaultQueryViet: 'đồ công nghệ thông minh gadgets mẹo vặt cuộc sống',
    queriesForeign: {
      US: 'smart gadgets life hacks home appliances cool tech',
      UK: 'smart gadgets life hacks home appliances cool tech',
      JP: '便利グッズ ライフハック 家電',
      KR: '꿀템 신박한 아이템 생활 꿀팁',
      TH: 'ของใช้ในบ้าน อุปกรณ์ไอที เจ๋งๆ',
      DE: 'smarte gadgets life hacks haushaltsgeräte',
      FR: 'gadgets intelligents astuces maison high tech',
      ID: 'gadget pintar life hacks perabotan rumah',
      BR: 'gadgets inteligentes truques para casa',
      TW: '實用黑科技 居家好物 生活小妙招',
    },
  },
];

/**
 * Định dạng thời gian đăng video tự nhiên chuẩn YouTube (ngày, tuần, tháng, năm trước)
 */
function formatPublishedTime(hours?: number, uploadTs?: number): string {
  if (uploadTs && uploadTs > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = Math.max(0, nowSec - uploadTs);
    const mins = Math.floor(diffSec / 60);
    const hrs = Math.floor(diffSec / 3600);
    const days = Math.floor(diffSec / 86400);

    if (mins < 60) {
      return mins <= 1 ? 'Vừa xong' : `${mins} phút trước`;
    }
    if (hrs < 24) {
      return `${hrs} giờ trước`;
    }
    if (days < 7) {
      return `${days} ngày trước`;
    }
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} tuần trước`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} tháng trước`;
    }
    const years = Math.floor(days / 365);
    return `${years} năm trước`;
  }

  if (!hours || hours <= 0) return 'Mới đăng';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} phút trước`;
  }
  if (hours < 24) {
    return `${Math.round(hours)} giờ trước`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} ngày trước`;
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} tuần trước`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} tháng trước`;
  }
  const years = Math.floor(days / 365);
  return `${years} năm trước`;
}

/**
 * Định dạng số subscribers kênh rút gọn, an toàn (340K, 1.2M, hoặc Ẩn nếu <= 0)
 */
function formatSubscribers(subs?: number | null): string {
  if (subs === undefined || subs === null || subs <= 0) {
    return 'Ẩn';
  }
  if (subs >= 1_000_000) {
    return `${(subs / 1_000_000).toFixed(1)}M`;
  }
  if (subs >= 1_000) {
    return `${(subs / 1_000).toFixed(1)}K`;
  }
  return subs.toLocaleString('vi-VN');
}

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

  // Phân luồng Thị Trường: View Việt vs View Ngoại
  const [market, setMarket] = useState<MarketType>('viet');
  const [selectedForeignCountry, setSelectedForeignCountry] = useState<string>('US');

  // Ngách chuẩn & Tìm kiếm
  const [selectedNicheId, setSelectedNicheId] = useState<string | null>('review_phim');
  const [currentNiche, setCurrentNiche] = useState<string>('Review Phim');
  const [nicheInput, setNicheInput] = useState<string>('tóm tắt phim review phim hay');
  const [selectedFilterNiche, setSelectedFilterNiche] = useState<string>('all');

  // Bộ lọc nhanh (Toolbar)
  const [timeFilter, setTimeFilter] = useState<'24h' | '48h' | '7d' | 'all'>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | 'shorts' | 'long'>('all');
  const [sortBy, setSortBy] = useState<'vph' | 'sub_ratio' | 'views'>('vph');

  // Real-time Trending Topics từ Google Trends RSS
  const [liveTopics, setLiveTopics] = useState<LiveTrendingTopic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState<boolean>(false);

  // 4 Công cụ kiểm chứng
  const [activeTool, setActiveTool] = useState<
    'none' | 'alphabet' | 'trends' | 'gap' | 'competitor'
  >('none');

  // Tool 1: YouTube Alphabet Autosuggest (a-z)
  const [alphabetSeed, setAlphabetSeed] = useState<string>('tóm tắt phim');
  const [isSearchingAlphabet, setIsSearchingAlphabet] = useState<boolean>(false);
  const [alphabetResults, setAlphabetResults] = useState<KeywordGoldmine[]>([]);

  // Tool 2: Google Trends YouTube Search
  const [trendsKeyword, setTrendsKeyword] = useState<string>('tóm tắt phim');
  const [trendsCompareKeyword, setTrendsCompareKeyword] = useState<string>('');
  const [trendsGeo, setTrendsGeo] = useState<string>('VN');
  const [trendsTimeRange, setTrendsTimeRange] = useState<string>('today 12-m');
  const [isAnalyzingTrends, setIsAnalyzingTrends] = useState<boolean>(false);
  const [trendsResult, setTrendsResult] = useState<GoogleTrendsAnalysisResult | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  // Tool 4: Kênh đối thủ & VPH
  const [competitorUrl, setCompetitorUrl] = useState<string>('');
  const [competitorSort, setCompetitorSort] = useState<'popular' | 'latest'>('popular');
  const [isAnalyzingCompetitor, setIsAnalyzingCompetitor] = useState<boolean>(false);
  const [competitorVideos, setCompetitorVideos] = useState<CompetitorVideo[]>([]);

  // AI Studio State
  const [aiStudioOpen, setAiStudioOpen] = useState(false);
  const [aiStudioPayload, setAiStudioPayload] = useState<{
    title: string;
    niche?: string;
    competitorChannel?: string;
    competitorKeywords?: string[];
    competitorTags?: string[];
    transcriptPreview?: string;
  }>({ title: '' });

  // Spy Tags State
  const [videoTagsMap, setVideoTagsMap] = useState<Record<string, string[]>>({});
  const [loadingTagsId, setLoadingTagsId] = useState<string | null>(null);
  const [spyTagsModal, setSpyTagsModal] = useState<{
    isOpen: boolean;
    videoTitle: string;
    videoId: string;
    tags: string[];
  }>({
    isOpen: false,
    videoTitle: '',
    videoId: '',
    tags: [],
  });

  const handleInspectTags = async (vid: OutlierVideo) => {
    if (videoTagsMap[vid.id] && videoTagsMap[vid.id].length > 0) {
      setSpyTagsModal({
        isOpen: true,
        videoTitle: vid.title,
        videoId: vid.id,
        tags: videoTagsMap[vid.id],
      });
      return;
    }

    setLoadingTagsId(vid.id);
    try {
      const url = `https://www.youtube.com/watch?v=${vid.id}`;
      const res = await extractVideoSeoTags(url);
      const extracted =
        res.tags && res.tags.length > 0
          ? res.tags
          : [vid.niche, 'youtube viral', 'trending', vid.channel_name].filter(Boolean);

      setVideoTagsMap((prev) => ({ ...prev, [vid.id]: extracted }));
      setSpyTagsModal({
        isOpen: true,
        videoTitle: vid.title,
        videoId: vid.id,
        tags: extracted,
      });
    } catch (err) {
      console.error('Lỗi extractVideoSeoTags:', err);
      const fallback = [vid.niche, vid.channel_name, 'trending'].filter(Boolean);
      setVideoTagsMap((prev) => ({ ...prev, [vid.id]: fallback }));
      setSpyTagsModal({
        isOpen: true,
        videoTitle: vid.title,
        videoId: vid.id,
        tags: fallback,
      });
    } finally {
      setLoadingTagsId(null);
    }
  };

  const handleOpenAiStudio = (data: {
    title: string;
    niche?: string;
    competitorChannel?: string;
    competitorKeywords?: string[];
    competitorTags?: string[];
    transcriptPreview?: string;
  }) => {
    setAiStudioPayload(data);
    setAiStudioOpen(true);
  };

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

  // Tải Real-time Trending Topics từ Google Trends RSS
  const loadLiveTrendingTopics = useCallback(async (geo: string) => {
    setLoadingTopics(true);
    try {
      const topics = await fetchLiveTrendingTopics(geo, 14);
      setLiveTopics(topics);
    } catch (err) {
      console.warn('Lỗi tải live trending topics:', err);
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const geo = market === 'viet' ? 'VN' : selectedForeignCountry;
    loadLiveTrendingTopics(geo);
    setTrendsGeo(geo);
  }, [market, selectedForeignCountry, loadLiveTrendingTopics]);

  // Xóa toàn bộ dữ liệu video cũ
  const handleClearAllOldData = async () => {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn xóa sạch toàn bộ danh sách video đề xuất để làm mới dữ liệu?',
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await clearAllOutlierVideos();
      setVideos([]);
      toast.success({
        title: 'Đã xóa dữ liệu cũ',
        description:
          'Bảng dữ liệu video đề xuất đã được làm trống. Bạn có thể chọn ngách và quét mới.',
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

  // Quét video đề xuất theo ngách & thời gian thực
  const handleScanNiche = async (
    targetNiche?: string,
    overrideTime?: '24h' | '48h' | '7d' | 'all',
  ) => {
    const isScanAll =
      !targetNiche ||
      targetNiche === 'all' ||
      targetNiche === 'toàn bộ ngách' ||
      targetNiche === 'toàn bộ ngách ngon';
    const timeToUse = overrideTime || timeFilter;
    const geoToUse = market === 'viet' ? 'VN' : selectedForeignCountry;
    const nicheToScan = isScanAll ? 'all' : (targetNiche || nicheInput).trim();

    if (!isScanAll && !nicheToScan) {
      toast.warning({
        title: 'Chưa nhập từ khóa ngách',
        description: 'Vui lòng chọn ngách chuẩn hoặc nhập từ khóa trước khi quét.',
      });
      return;
    }

    setIsScanning(true);
    toast.info({
      title: isScanAll ? 'Đang quét toàn bộ ngách faceless...' : 'Đang quét video đột biến...',
      description: isScanAll
        ? `Hệ thống đang rà soát 7 ngách bùng nổ theo thị trường [${market === 'viet' ? 'Việt Nam' : geoToUse}] (${timeToUse})...`
        : `Truy quét ngách "${nicheToScan}" (${timeToUse}, geo: ${geoToUse})...`,
    });

    try {
      const updated = await triggerOutlierScan(nicheToScan, timeToUse, geoToUse);
      setVideos(updated);

      if (!isScanAll) {
        const matchedNiche = STANDARDIZED_NICHES.find(
          (sn) =>
            sn.id.toLowerCase() === nicheToScan.toLowerCase() ||
            sn.nameViet.toLowerCase() === nicheToScan.toLowerCase() ||
            sn.defaultQueryViet.toLowerCase() === nicheToScan.toLowerCase() ||
            nicheToScan.toLowerCase().includes(sn.defaultQueryViet.toLowerCase()) ||
            sn.defaultQueryViet.toLowerCase().includes(nicheToScan.toLowerCase()),
        );
        if (matchedNiche) {
          setSelectedFilterNiche(
            market === 'viet' ? matchedNiche.nameViet : matchedNiche.nameForeign,
          );
        } else if (updated.length > 0 && updated[0].niche) {
          setSelectedFilterNiche(updated[0].niche);
        } else {
          setSelectedFilterNiche('all');
        }
      } else {
        setSelectedFilterNiche('all');
      }

      if (updated.length > 0) {
        toast.success({
          title: 'Quét hoàn tất!',
          description: `Tìm thấy ${updated.length} video đột biến tiềm năng trong thị trường ${geoToUse}!`,
        });
      } else {
        toast.info({
          title: 'Kết quả quét ngách',
          description: `Chưa tìm thấy video đạt chuẩn bùng nổ (VPH > 50, View/Sub > 3x) trong khung giờ này. Thử nới rộng mốc thời gian hoặc chọn ngách khác.`,
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

  // Chọn ngách chuẩn hóa
  const handleSelectStandardNiche = (niche: StandardNiche) => {
    setSelectedNicheId(niche.id);
    let queryToUse = niche.defaultQueryViet;
    let labelToUse = niche.nameViet;

    if (market === 'foreign') {
      labelToUse = niche.nameForeign;
      queryToUse =
        niche.queriesForeign[selectedForeignCountry] ||
        niche.queriesForeign.US ||
        niche.nameForeign;
    }

    setNicheInput(queryToUse);
    setCurrentNiche(labelToUse);
    setAlphabetSeed(queryToUse);
    setTrendsKeyword(queryToUse);
    handleScanNiche(niche.id);
  };

  // Bấm vào chủ đề Live Trends (Google Trends RSS)
  const handleSelectLiveTopic = (topicTitle: string) => {
    setNicheInput(topicTitle);
    setCurrentNiche(topicTitle);
    setSelectedNicheId(null);
    setAlphabetSeed(topicTitle);
    setTrendsKeyword(topicTitle);
    handleScanNiche(topicTitle);
  };

  // Theo dõi / Bỏ theo dõi kênh (Watchlist Toggle)
  const handleToggleWatchlist = async (vid: OutlierVideo) => {
    const isWatch = vid.status === 'watchlist';
    const newStatus = isWatch ? 'discovered' : 'watchlist';
    try {
      await updateOutlierVideoStatus({ id: vid.id, status: newStatus });
      setVideos((prev) => prev.map((v) => (v.id === vid.id ? { ...v, status: newStatus } : v)));
      toast.success({
        title: newStatus === 'watchlist' ? 'Đã thêm vào Watchlist' : 'Đã bỏ theo dõi kênh',
        description:
          newStatus === 'watchlist'
            ? `Video và kênh "${vid.channel_name}" sẽ được Radar theo dõi và cập nhật gia tốc VPH định kỳ.`
            : `Đã đưa video về danh sách bình thường.`,
      });
    } catch (err) {
      toast.error({ title: 'Lỗi cập nhật', description: String(err) });
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
          description: `Tìm thấy ${res.length} gợi ý từ khóa đuôi dài qua thuật toán Alphabet A-Z.`,
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

  // Mở Tool 2: Google Trends (YouTube Search trên web)
  const handleOpenGoogleTrends = async () => {
    const q1 = encodeURIComponent(trendsKeyword.trim() || currentNiche);
    const q2 = trendsCompareKeyword.trim() ? encodeURIComponent(trendsCompareKeyword.trim()) : '';
    const queryPart = q2 ? `${q1},${q2}` : q1;
    const geo = trendsGeo === 'GLOBAL' ? '' : `&geo=${trendsGeo}`;
    const dateParam = encodeURIComponent(trendsTimeRange || 'today 12-m');
    const url = `https://trends.google.com/trends/explore?date=${dateParam}&gprop=youtube${geo}&q=${queryPart}`;

    await openExternalUrl(url);
    toast.info({
      title: 'Đã mở Google Trends trên web',
      description: 'Đang xem biểu đồ trực tiếp trên giao diện Google Trends chính thức.',
    });
  };

  // Kích hoạt phân tích Google Trends YouTube Search
  const handleAnalyzeGoogleTrends = async (overrideKeyword?: string) => {
    const kw = (overrideKeyword ?? trendsKeyword).trim() || currentNiche;
    if (!kw) {
      toast.warning({
        title: 'Chưa nhập từ khóa',
        description: 'Vui lòng nhập từ khóa để phân tích xu hướng tìm kiếm YouTube.',
      });
      return;
    }

    setIsAnalyzingTrends(true);
    try {
      const res = await analyzeGoogleTrends(
        kw,
        trendsCompareKeyword.trim() || undefined,
        trendsGeo,
        trendsTimeRange,
      );
      setTrendsResult(res);
      if (res.isLowVolume) {
        toast.info({
          title: 'Lượng tìm kiếm thấp',
          description: `Từ khóa "${kw}" có lượng tìm kiếm YouTube ít hoặc chưa có dữ liệu biến động rõ rệt.`,
        });
      } else if (!res.success && res.error) {
        toast.warning({
          title: 'Cảnh báo Google Trends',
          description: res.error,
        });
      } else {
        toast.success({
          title: 'Phân tích xu hướng thành công',
          description: `Đã cập nhật động lượng tìm kiếm YouTube cho "${kw}".`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error({
        title: 'Lỗi phân tích Google Trends',
        description: msg,
      });
    } finally {
      setIsAnalyzingTrends(false);
    }
  };

  const handleCopyQuery = (queryText: string) => {
    navigator.clipboard.writeText(queryText);
    setCopiedQuery(queryText);
    setTimeout(() => setCopiedQuery(null), 2000);
    toast.success({
      title: 'Đã sao chép từ khóa',
      description: queryText,
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
    await openExternalUrl(url);
  };

  // Chuyển video sang Tải video sạch
  const handleQuickDownload = async (vid: OutlierVideo) => {
    const url = `https://www.youtube.com/watch?v=${vid.id}`;
    try {
      await enqueueExternalUrl(url, { mediaType: 'video' });
      toast.success({
        title: 'Đã đưa vào hàng đợi tải video',
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
    const videoUrl = vid.id?.startsWith('http')
      ? vid.id
      : vid.id
        ? `https://www.youtube.com/watch?v=${vid.id}`
        : '';
    sessionStorage.setItem('reup_input_video_title', vid.title);
    if (videoUrl) {
      sessionStorage.setItem('reup_input_video_path', videoUrl);
    }
    let tags: string[] = [];
    if (videoTagsMap[vid.id] && videoTagsMap[vid.id].length > 0) {
      tags = videoTagsMap[vid.id];
    } else if (vid.competitorTags && vid.competitorTags.length > 0) {
      tags = vid.competitorTags;
    } else if (vid.tags) {
      try {
        const parsed = JSON.parse(vid.tags);
        if (Array.isArray(parsed)) tags = parsed;
        else tags = [vid.tags];
      } catch {
        tags = vid.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }
    if (tags && tags.length > 0) {
      sessionStorage.setItem('reup_input_video_tags', tags.join(', '));
    }
    toast.info({
      title: 'Chuyển sang luồng Test BKT',
      description: `Đã đưa thông tin video "${vid.title.slice(0, 40)}..." sang Reup & Test BKT.`,
    });
    if (onNavigate) {
      onNavigate('reup');
    }
  };

  // Bộ lọc và sắp xếp video kết quả
  const filteredAndSortedVideos = useMemo(() => {
    let result = [...videos];

    // 1. Lọc theo Niche tag nếu có chọn filter pill
    if (selectedFilterNiche !== 'all') {
      result = result.filter(
        (v) => v.niche && v.niche.toLowerCase() === selectedFilterNiche.toLowerCase(),
      );
    }

    // 2. Lọc theo Khung Giờ (Time Range)
    if (timeFilter === '24h') {
      result = result.filter((v) => (v.hours_published || 0) <= 28);
    } else if (timeFilter === '48h') {
      result = result.filter((v) => (v.hours_published || 0) <= 52);
    } else if (timeFilter === '7d') {
      result = result.filter((v) => (v.hours_published || 0) <= 172);
    }

    // 3. Lọc theo Định dạng (Format)
    if (formatFilter === 'shorts') {
      result = result.filter((v) => v.duration > 0 && v.duration <= 60);
    } else if (formatFilter === 'long') {
      result = result.filter((v) => v.duration > 60 || v.duration === 0);
    }

    // 4. Sắp xếp (Sort)
    if (sortBy === 'vph') {
      result.sort((a, b) => {
        const vphA = a.avg_vph || (a.hours_published > 0 ? a.views / a.hours_published : 0);
        const vphB = b.avg_vph || (b.hours_published > 0 ? b.views / b.hours_published : 0);
        return vphB - vphA;
      });
    } else if (sortBy === 'sub_ratio') {
      result.sort((a, b) => {
        const ratioA = a.sub_outlier_ratio || (a.subscribers > 0 ? a.views / a.subscribers : 1);
        const ratioB = b.sub_outlier_ratio || (b.subscribers > 0 ? b.views / b.subscribers : 1);
        return ratioB - ratioA;
      });
    } else if (sortBy === 'views') {
      result.sort((a, b) => b.views - a.views);
    }

    return result;
  }, [videos, selectedFilterNiche, timeFilter, formatFilter, sortBy]);

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
                Săn Đề Xuất & Video Đột Biến (Outlier Hunter)
              </h1>
              <p className="text-xs text-muted-foreground">
                Radar phát hiện video bùng nổ VPH & đề xuất tự nhiên phân luồng View Việt / View
                Ngoại
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAllOldData}
            disabled={isClearing}
            className="text-xs gap-1.5 border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Xóa Dữ Liệu Cũ
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => handleScanNiche('all')}
            disabled={isScanning}
            className="text-xs gap-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 hover:from-violet-700 hover:to-amber-600 text-white font-bold shadow-md shadow-violet-500/20 px-3.5"
          >
            <Sparkles className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
            {isScanning ? 'Đang Quét Ngách...' : 'Quét Toàn Bộ Ngách'}
          </Button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KHỐI 1: CỤM CHUYỂN ĐỔI THỊ TRƯỜNG & CHỌN NGÁCH CPM/RPM CAO */}
        <Card className="p-5 border-border/50 bg-card/60 backdrop-blur-sm space-y-4">
          {/* Cụm Chuyển Đổi Thị Trường: View Việt vs View Ngoại */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Thị Trường Mục Tiêu:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-lg bg-muted/60 border border-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setMarket('viet');
                    setSelectedNicheId('review_phim');
                    setCurrentNiche('Review Phim');
                    setNicheInput('tóm tắt phim review phim hay');
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    market === 'viet'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  View Việt (Việt Nam)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMarket('foreign');
                    setSelectedNicheId('review_phim');
                    setCurrentNiche('Movie Recap / Film Explained');
                    const targetQ =
                      STANDARDIZED_NICHES[0].queriesForeign[selectedForeignCountry] ||
                      'movie recap film explained';
                    setNicheInput(targetQ);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    market === 'foreign'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  View Ngoại (Quốc Tế)
                </button>
              </div>

              {market === 'foreign' && (
                <div className="flex items-center gap-1.5">
                  <Select
                    value={selectedForeignCountry}
                    onValueChange={(val) => {
                      setSelectedForeignCountry(val);
                      if (selectedNicheId) {
                        const n = STANDARDIZED_NICHES.find((item) => item.id === selectedNicheId);
                        if (n) {
                          const q = n.queriesForeign[val] || n.queriesForeign.US || n.nameForeign;
                          setNicheInput(q);
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="text-xs h-8 w-56 bg-background/80 border-primary/40 font-medium">
                      <SelectValue placeholder="Chọn quốc gia mục tiêu" />
                    </SelectTrigger>
                    <SelectContent>
                      {FOREIGN_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Cụm Chọn Ngách CPM/RPM Cao (Faceless / Dễ Nổ View) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Ngách Chuẩn Hóa CPM/RPM Cao (Faceless / Bùng Nổ View):
              </span>
              <span className="text-[11px] text-muted-foreground">
                Bấm vào ngách để nạp từ khóa & tự động quét
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {STANDARDIZED_NICHES.map((n) => {
                const isSelected = selectedNicheId === n.id;
                const displayName = market === 'viet' ? n.nameViet : n.nameForeign;
                const displayDesc = market === 'viet' ? n.descViet : n.descForeign;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleSelectStandardNiche(n)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/60 bg-background/40 hover:bg-muted/50 hover:border-border',
                    )}
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {displayName}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-tight">
                        {displayDesc}
                      </p>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-border/30 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-amber-400">Faceless</span>
                      <Flame className="w-3 h-3 text-muted-foreground group-hover:text-amber-400 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time Trending Topics (Google Trends RSS) */}
          <div className="pt-2 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-foreground">
                  Chủ Đề Thịnh Hành Hôm Nay (Live Trends -{' '}
                  {market === 'viet' ? 'Việt Nam' : selectedForeignCountry}):
                </span>
                {loadingTopics && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const geo = market === 'viet' ? 'VN' : selectedForeignCountry;
                  loadLiveTrendingTopics(geo);
                }}
                disabled={loadingTopics}
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn('w-2.5 h-2.5', loadingTopics && 'animate-spin')} />
                Làm mới xu hướng
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {liveTopics.length === 0 && !loadingTopics ? (
                <span className="text-[11px] text-muted-foreground italic">
                  Chưa có dữ liệu xu hướng tức thời cho quốc gia này.
                </span>
              ) : (
                liveTopics.map((topic, i) => (
                  <button
                    key={`${topic.geo}-${topic.title}-${i}`}
                    type="button"
                    onClick={() => handleSelectLiveTopic(topic.title)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition-all cursor-pointer group"
                    title={`Lưu lượng tìm kiếm: ${topic.traffic}. Bấm để quét ngay video bứt phá!`}
                  >
                    <span>{topic.title}</span>
                    {topic.traffic && (
                      <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-500/20 px-1.5 py-0.2 rounded-full">
                        {topic.traffic}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* KHỐI 2: THANH TÌM KIẾM, BỘ LỌC THỜI GIAN THỰC & 4 CÔNG CỤ KIỂM CHỨNG */}
        <Card className="p-5 border-border/50 bg-card/60 backdrop-blur-sm space-y-4">
          {/* Hàng 1: Ô nhập từ khóa tùy ý */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={nicheInput}
                onChange={(e) => setNicheInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCurrentNiche(nicheInput);
                    handleScanNiche(nicheInput);
                  }
                }}
                placeholder="Nhập từ khóa ngách hoặc chủ đề tùy chỉnh muốn truy quét..."
                className="pl-9 h-10 text-xs bg-background/60"
              />
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setCurrentNiche(nicheInput);
                handleScanNiche(nicheInput);
              }}
              disabled={isScanning}
              className="h-10 text-xs px-5 font-semibold gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              Săn Video Đột Biến
            </Button>
          </div>

          {/* Hàng 2: Thanh Công Cụ Lọc Nhanh (Thời Gian, Định Dạng, Sắp Xếp) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40 text-xs">
            {/* Lọc Thời Gian */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Thời gian:</span>
              <div className="inline-flex p-0.5 rounded-lg bg-muted/60 border border-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('24h');
                    if (videos.length === 0) {
                      handleScanNiche(nicheInput, '24h');
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    timeFilter === '24h'
                      ? 'bg-amber-500 text-white shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  24 Giờ Qua (Bùng Nổ)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('48h');
                    if (videos.length === 0) {
                      handleScanNiche(nicheInput, '48h');
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    timeFilter === '48h'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  48 Giờ Qua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('7d');
                    if (videos.length === 0) {
                      handleScanNiche(nicheInput, '7d');
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    timeFilter === '7d'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  7 Ngày Qua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('all');
                    if (videos.length === 0) {
                      handleScanNiche(nicheInput, 'all');
                    }
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    timeFilter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Tất Cả
                </button>
              </div>
            </div>

            {/* Lọc Định Dạng */}
            <div className="flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Định dạng:</span>
              <div className="inline-flex p-0.5 rounded-lg bg-muted/60 border border-border/50">
                <button
                  type="button"
                  onClick={() => setFormatFilter('all')}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                    formatFilter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Tất Cả
                </button>
                <button
                  type="button"
                  onClick={() => setFormatFilter('shorts')}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                    formatFilter === 'shorts'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Shorts
                </button>
                <button
                  type="button"
                  onClick={() => setFormatFilter('long')}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                    formatFilter === 'long'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Video Dài
                </button>
              </div>
            </div>

            {/* Sắp Xếp */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Sắp xếp:</span>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as 'vph' | 'sub_ratio' | 'views')}
              >
                <SelectTrigger className="text-xs h-7 w-44 bg-background/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vph" className="text-xs">
                    VPH cao nhất
                  </SelectItem>
                  <SelectItem value="sub_ratio" className="text-xs">
                    View/Sub đột biến nhất
                  </SelectItem>
                  <SelectItem value="views" className="text-xs">
                    Lượt xem nhiều nhất
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hàng 3: 4 Công Cụ Kiểm Chứng Chuyên Sâu */}
          <div className="pt-3 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />4 Công Cụ Kiểm Chứng Keyword & Nghiên
                Cứu Ngách:
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
                  setAlphabetSeed(nicheInput || currentNiche);
                  if (alphabetResults.length === 0) {
                    handleSearchAlphabet();
                  }
                }}
                className="text-xs justify-start gap-2 h-auto py-2"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight text-xs">1. YouTube A-Z</div>
                  <div className="text-[10px] opacity-70">Gợi ý từ khóa đuôi dài</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'trends' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = activeTool === 'trends' ? 'none' : 'trends';
                  setActiveTool(next);
                  if (next === 'trends') {
                    const kw = nicheInput || currentNiche;
                    setTrendsKeyword(kw);
                    if (!trendsResult || trendsResult.keyword !== kw) {
                      handleAnalyzeGoogleTrends(kw);
                    }
                  }
                }}
                className="text-xs justify-start gap-2 h-auto py-2"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight text-xs">2. Google Trends</div>
                  <div className="text-[10px] opacity-70">YouTube Search Phân Tích</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'gap' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'gap' ? 'none' : 'gap');
                  setAlphabetSeed(nicheInput || currentNiche);
                  if (alphabetResults.length === 0) {
                    handleSearchAlphabet();
                  }
                }}
                className="text-xs justify-start gap-2 h-auto py-2"
              >
                <Target className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight text-xs">3. Content Gap</div>
                  <div className="text-[10px] opacity-70">Cầu cao - Ít video</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={activeTool === 'competitor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTool(activeTool === 'competitor' ? 'none' : 'competitor');
                }}
                className="text-xs justify-start gap-2 h-auto py-2"
              >
                <Tv className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight text-xs">4. Đối Thủ & VPH</div>
                  <div className="text-[10px] opacity-70">Đo view mỗi giờ (VPH)</div>
                </div>
              </Button>
            </div>
          </div>

          {/* VÙNG HIỂN THỊ NỘI DUNG 4 CÔNG CỤ KHI ĐƯỢC MỞ */}
          {activeTool !== 'none' && (
            <div className="mt-3 pt-3 border-t border-border/50 bg-background/40 rounded-xl p-4">
              {/* TOOL 1: YOUTUBE ALPHABET AUTOSUGGEST (A-Z) */}
              {activeTool === 'alphabet' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-400" />
                        1. Thanh Gợi Ý YouTube Alphabet (Autosuggest A-Z)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Tự động ghép nối từng chữ cái (a, b, c... z) để tìm các ngách nhỏ đuôi dài
                        ít cạnh tranh.
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
                      placeholder="Nhập từ khóa hạt giống (Ví dụ: review phim hay, tech gadgets)..."
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
                    <div className="border border-border/50 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
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
                                      ? 'Ít cạnh tranh (Ngách siêu nhỏ)'
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

              {/* TOOL 2: GOOGLE TRENDS */}
              {activeTool === 'trends' && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        2. Phân Tích Google Trends YouTube Search Thông Minh
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Đánh giá gia tốc tìm kiếm, chu kỳ đạt đỉnh và từ khóa bùng nổ (Breakout)
                        trực tiếp từ dữ liệu YouTube Search.
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

                  {/* Thanh điều khiển (Control bar) */}
                  <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Từ khóa chính:</Label>
                        <Input
                          value={trendsKeyword}
                          onChange={(e) => setTrendsKeyword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAnalyzeGoogleTrends();
                          }}
                          className="text-xs h-9 mt-1"
                          placeholder="Ví dụ: tóm tắt phim"
                        />
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          So sánh với từ khóa khác (Tùy chọn):
                        </Label>
                        <Input
                          value={trendsCompareKeyword}
                          onChange={(e) => setTrendsCompareKeyword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAnalyzeGoogleTrends();
                          }}
                          className="text-xs h-9 mt-1"
                          placeholder="Ví dụ: review phim"
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
                            <SelectItem value="US">Hoa Kỳ (US)</SelectItem>
                            <SelectItem value="GLOBAL">Toàn cầu (Worldwide)</SelectItem>
                            <SelectItem value="JP">Nhật Bản (JP)</SelectItem>
                            <SelectItem value="KR">Hàn Quốc (KR)</SelectItem>
                            <SelectItem value="TH">Thái Lan (TH)</SelectItem>
                            <SelectItem value="GB">Vương Quốc Anh (GB)</SelectItem>
                            <SelectItem value="DE">Đức (DE)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          Khung thời gian:
                        </Label>
                        <div className="grid grid-cols-4 gap-1 mt-1 bg-muted/40 p-1 rounded-md border border-border/50">
                          {[
                            { id: 'today 12-m', label: '12T' },
                            { id: 'today 3-m', label: '3T' },
                            { id: 'today 1-m', label: '30N' },
                            { id: 'now 7-d', label: '7N' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setTrendsTimeRange(opt.id)}
                              className={cn(
                                'py-1 text-[11px] font-medium rounded transition-all text-center',
                                trendsTimeRange === opt.id
                                  ? 'bg-background text-foreground shadow-sm font-semibold'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-[10px]">
                          gprop=youtube & {trendsTimeRange} & geo={trendsGeo}
                        </span>
                        {trendsResult?.source && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            Nguồn:{' '}
                            {trendsResult.source === 'pytrends'
                              ? 'Google Trends API'
                              : trendsResult.source}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleOpenGoogleTrends}
                          className="text-xs h-8 px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
                          title="Mở Google Trends chính thức trên trình duyệt"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Mở trên web
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleAnalyzeGoogleTrends()}
                          disabled={isAnalyzingTrends}
                          className="text-xs h-8 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                        >
                          {isAnalyzingTrends ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Đang phân tích...
                            </>
                          ) : (
                            <>
                              <Search className="w-3.5 h-3.5" />
                              Phân Tích Xu Hướng
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Khi đang tải: Skeleton Loader */}
                  {isAnalyzingTrends && (
                    <div className="space-y-3 animate-pulse">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-20 rounded-lg bg-muted/40 border border-border/40"
                          />
                        ))}
                      </div>
                      <div className="h-56 rounded-lg bg-muted/30 border border-border/40" />
                      <div className="h-24 rounded-lg bg-muted/30 border border-border/40" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="h-44 rounded-lg bg-muted/30 border border-border/40" />
                        <div className="h-44 rounded-lg bg-muted/30 border border-border/40" />
                      </div>
                    </div>
                  )}

                  {/* Khi chưa phân tích và không loading */}
                  {!isAnalyzingTrends && !trendsResult && (
                    <div className="py-8 px-4 text-center border border-dashed border-border/60 rounded-lg bg-muted/10 space-y-2">
                      <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-1">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-semibold text-foreground">
                        Sẵn Sàng Phân Tích Động Lượng YouTube Search
                      </h4>
                      <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                        Nhấn nút <strong>Phân Tích Xu Hướng</strong> để tải biểu đồ gia tốc, các cụm
                        từ tăng đột biến (Breakout) và khuyến nghị chiến lược làm video.
                      </p>
                    </div>
                  )}

                  {/* Khi có kết quả phân tích */}
                  {!isAnalyzingTrends && trendsResult && (
                    <div className="space-y-3.5">
                      {/* Cảnh báo hoặc Informative Empty State nếu Low Search Volume */}
                      {trendsResult.isLowVolume ? (
                        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-center space-y-2.5">
                          <div className="inline-flex p-2 rounded-full bg-amber-500/10 text-amber-500">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-foreground">
                              Lượng Tìm Kiếm Quá Thấp (Low Search Volume)
                            </h4>
                            <p className="text-[11px] text-muted-foreground mt-1 max-w-lg mx-auto">
                              Từ khóa{' '}
                              <strong className="text-foreground">"{trendsResult.keyword}"</strong>{' '}
                              có lượng tìm kiếm YouTube trong khung thời gian này chưa đủ ngưỡng để
                              thống kê đồ thị chi tiết.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setActiveTool('alphabet');
                                setAlphabetSeed(trendsResult.keyword);
                              }}
                              className="text-xs h-7 gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                            >
                              <Search className="w-3.5 h-3.5" />
                              Chuyển Sang YouTube A-Z Autosuggest
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setTrendsTimeRange('today 12-m');
                                handleAnalyzeGoogleTrends(trendsResult.keyword);
                              }}
                              className="text-xs h-7 gap-1.5"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              Thử Lại Khung 12 Tháng
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleOpenGoogleTrends}
                              className="text-xs h-7 gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Xem Trên Web
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* 4 Thẻ Chỉ Số Động Lượng */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                            {/* Card 1: Điểm Quan Tâm Hiện Tại */}
                            <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Điểm Quan Tâm Hiện Tại</span>
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold font-mono text-foreground">
                                  {trendsResult.metrics.currentScore}
                                </span>
                                <span className="text-[11px] text-muted-foreground">/ 100</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, trendsResult.metrics.currentScore))}%`,
                                  }}
                                />
                              </div>
                              <div className="text-[10px] text-muted-foreground pt-0.5">
                                Trung bình kỳ:{' '}
                                <strong className="text-foreground font-mono">
                                  {trendsResult.metrics.averageScore}
                                </strong>
                                /100
                              </div>
                            </div>

                            {/* Card 2: Gia Tốc Biến Thiên */}
                            <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Gia Tốc Biến Thiên</span>
                                {trendsResult.metrics.deltaPercent > 0 ? (
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                ) : trendsResult.metrics.deltaPercent < 0 ? (
                                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                                ) : (
                                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  className={cn(
                                    'text-2xl font-bold font-mono',
                                    trendsResult.metrics.deltaPercent > 0
                                      ? 'text-emerald-500'
                                      : trendsResult.metrics.deltaPercent < 0
                                        ? 'text-rose-500'
                                        : 'text-foreground',
                                  )}
                                >
                                  {trendsResult.metrics.deltaPercent > 0
                                    ? `+${trendsResult.metrics.deltaPercent}%`
                                    : `${trendsResult.metrics.deltaPercent}%`}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                So với mốc cơ sở:{' '}
                                <strong className="text-foreground font-mono">
                                  {trendsResult.metrics.previousScore}
                                </strong>
                                đ
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {trendsResult.metrics.deltaPercent > 20
                                  ? 'Gia tốc tăng mạnh'
                                  : trendsResult.metrics.deltaPercent > 0
                                    ? 'Đang có đà tăng'
                                    : trendsResult.metrics.deltaPercent < -20
                                      ? 'Sụt giảm đáng kể'
                                      : 'Xu hướng đi ngang'}
                              </div>
                            </div>

                            {/* Card 3: Đánh Giá Xu Hướng */}
                            <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Đánh Giá Xu Hướng</span>
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                              </div>
                              <div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[11px] font-semibold gap-1',
                                    trendsResult.momentumVerdict.status === 'exploding'
                                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                                      : trendsResult.momentumVerdict.status === 'breakout'
                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                        : trendsResult.momentumVerdict.status === 'growing'
                                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                          : trendsResult.momentumVerdict.status === 'stable'
                                            ? 'border-sky-500/40 bg-sky-500/10 text-sky-500'
                                            : 'border-border bg-muted text-muted-foreground',
                                  )}
                                >
                                  {trendsResult.momentumVerdict.status === 'exploding' && (
                                    <Zap className="w-3 h-3" />
                                  )}
                                  {trendsResult.momentumVerdict.status === 'breakout' && (
                                    <Activity className="w-3 h-3" />
                                  )}
                                  {trendsResult.momentumVerdict.status === 'growing' && (
                                    <TrendingUp className="w-3 h-3" />
                                  )}
                                  {trendsResult.momentumVerdict.status === 'stable' && (
                                    <Minus className="w-3 h-3" />
                                  )}
                                  {trendsResult.momentumVerdict.status === 'declining' && (
                                    <TrendingDown className="w-3 h-3" />
                                  )}
                                  {trendsResult.momentumVerdict.label}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {trendsResult.momentumVerdict.description}
                              </p>
                            </div>

                            {/* Card 4: Chu Kỳ Đỉnh */}
                            <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Chu Kỳ Đỉnh</span>
                                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold font-mono text-foreground">
                                  {trendsResult.metrics.peakScore}
                                </span>
                                <span className="text-[11px] text-muted-foreground">/ 100</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                Mốc đạt đỉnh:{' '}
                                <strong className="text-foreground">
                                  {trendsResult.metrics.peakDate || 'N/A'}
                                </strong>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                Đỉnh cao nhất trong chu kỳ
                              </div>
                            </div>
                          </div>

                          {/* Biểu Đồ Sóng Nước Vector (Interactive SVG Area Chart) */}
                          <div className="rounded-lg border border-border/60 bg-card p-3.5 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                                  Biểu Đồ Xu Hướng Tìm Kiếm YouTube
                                </span>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                                    <span className="font-medium text-foreground">
                                      {trendsResult.keyword}
                                    </span>
                                  </div>
                                  {trendsResult.compareKeyword && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2.5 h-1 border-t-2 border-purple-500 border-dashed" />
                                      <span className="font-medium text-purple-400">
                                        {trendsResult.compareKeyword}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <span className="text-[10px] text-muted-foreground">
                                Rê chuột vào biểu đồ để xem điểm chi tiết từng mốc
                              </span>
                            </div>

                            {/* SVG Chart Wrapper */}
                            {trendsResult.timeline && trendsResult.timeline.length > 0 ? (
                              <div className="relative w-full overflow-hidden select-none">
                                {(() => {
                                  const svgWidth = 760;
                                  const svgHeight = 220;
                                  const padding = { top: 16, right: 24, bottom: 28, left: 32 };
                                  const innerWidth = svgWidth - padding.left - padding.right;
                                  const innerHeight = svgHeight - padding.top - padding.bottom;
                                  const timeline = trendsResult.timeline;

                                  const points = timeline.map((pt, i) => {
                                    const x =
                                      padding.left +
                                      (timeline.length > 1
                                        ? (i / (timeline.length - 1)) * innerWidth
                                        : innerWidth / 2);
                                    const val = Math.max(0, Math.min(100, pt.value ?? 0));
                                    const y = padding.top + innerHeight - (val / 100) * innerHeight;
                                    return { x, y, pt, i };
                                  });

                                  const hasCompare = Boolean(
                                    trendsResult.compareKeyword &&
                                      timeline.some((p) => p.compareValue !== undefined),
                                  );

                                  const comparePoints = hasCompare
                                    ? timeline.map((pt, i) => {
                                        const x =
                                          padding.left +
                                          (timeline.length > 1
                                            ? (i / (timeline.length - 1)) * innerWidth
                                            : innerWidth / 2);
                                        const val = Math.max(
                                          0,
                                          Math.min(100, pt.compareValue ?? 0),
                                        );
                                        const y =
                                          padding.top + innerHeight - (val / 100) * innerHeight;
                                        return { x, y, pt, i };
                                      })
                                    : [];

                                  const buildSmoothPath = (
                                    pts: { x: number; y: number }[],
                                  ): string => {
                                    if (pts.length === 0) return '';
                                    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
                                    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
                                    for (let i = 0; i < pts.length - 1; i++) {
                                      const p0 = pts[i === 0 ? 0 : i - 1];
                                      const p1 = pts[i];
                                      const p2 = pts[i + 1];
                                      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
                                      const cp1x = p1.x + (p2.x - p0.x) / 6;
                                      const cp1y = p1.y + (p2.y - p0.y) / 6;
                                      const cp2x = p2.x - (p3.x - p1.x) / 6;
                                      const cp2y = p2.y - (p3.y - p1.y) / 6;
                                      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
                                    }
                                    return d;
                                  };

                                  const buildAreaPath = (
                                    pts: { x: number; y: number }[],
                                    baseY: number,
                                  ): string => {
                                    if (pts.length === 0) return '';
                                    const linePath = buildSmoothPath(pts);
                                    const first = pts[0];
                                    const last = pts[pts.length - 1];
                                    return `${linePath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
                                  };

                                  const primaryLineD = buildSmoothPath(points);
                                  const primaryAreaD = buildAreaPath(
                                    points,
                                    padding.top + innerHeight,
                                  );
                                  const compareLineD = hasCompare
                                    ? buildSmoothPath(comparePoints)
                                    : '';
                                  const compareAreaD = hasCompare
                                    ? buildAreaPath(comparePoints, padding.top + innerHeight)
                                    : '';

                                  const hoveredPt =
                                    hoveredPointIndex !== null && points[hoveredPointIndex]
                                      ? points[hoveredPointIndex]
                                      : null;
                                  const hoveredCompPt =
                                    hoveredPointIndex !== null && comparePoints[hoveredPointIndex]
                                      ? comparePoints[hoveredPointIndex]
                                      : null;

                                  // Các mốc hiển thị trục hoành
                                  const axisTicksCount = Math.min(6, timeline.length);
                                  const axisIndices: number[] = [];
                                  if (axisTicksCount > 1) {
                                    for (let k = 0; k < axisTicksCount; k++) {
                                      axisIndices.push(
                                        Math.round(
                                          (k / (axisTicksCount - 1)) * (timeline.length - 1),
                                        ),
                                      );
                                    }
                                  } else {
                                    axisIndices.push(0);
                                  }

                                  return (
                                    <div className="relative">
                                      <svg
                                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                        className="w-full h-auto overflow-visible cursor-crosshair"
                                        onMouseMove={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const mouseX = e.clientX - rect.left;
                                          const svgX = (mouseX / rect.width) * svgWidth;
                                          if (
                                            svgX < padding.left ||
                                            svgX > svgWidth - padding.right
                                          ) {
                                            setHoveredPointIndex(null);
                                            return;
                                          }
                                          const ratio = (svgX - padding.left) / innerWidth;
                                          const idx = Math.max(
                                            0,
                                            Math.min(
                                              timeline.length - 1,
                                              Math.round(ratio * (timeline.length - 1)),
                                            ),
                                          );
                                          setHoveredPointIndex(idx);
                                        }}
                                        onMouseLeave={() => setHoveredPointIndex(null)}
                                      >
                                        <title>Biểu đồ xu hướng tìm kiếm YouTube</title>
                                        <defs>
                                          <linearGradient
                                            id="trendGradPrimary"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                          >
                                            <stop
                                              offset="0%"
                                              stopColor="#10b981"
                                              stopOpacity="0.32"
                                            />
                                            <stop
                                              offset="100%"
                                              stopColor="#10b981"
                                              stopOpacity="0.0"
                                            />
                                          </linearGradient>
                                          <linearGradient
                                            id="trendGradCompare"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                          >
                                            <stop
                                              offset="0%"
                                              stopColor="#8b5cf6"
                                              stopOpacity="0.22"
                                            />
                                            <stop
                                              offset="100%"
                                              stopColor="#8b5cf6"
                                              stopOpacity="0.0"
                                            />
                                          </linearGradient>
                                        </defs>

                                        {/* Grid lines ngang */}
                                        {[100, 75, 50, 25, 0].map((val) => {
                                          const y =
                                            padding.top + innerHeight - (val / 100) * innerHeight;
                                          return (
                                            <g key={val}>
                                              <line
                                                x1={padding.left}
                                                y1={y}
                                                x2={svgWidth - padding.right}
                                                y2={y}
                                                stroke="currentColor"
                                                strokeDasharray="2 2"
                                                className="text-border/40"
                                                strokeWidth="1"
                                              />
                                              <text
                                                x={padding.left - 6}
                                                y={y + 3}
                                                textAnchor="end"
                                                className="fill-muted-foreground text-[9px] font-mono"
                                              >
                                                {val}
                                              </text>
                                            </g>
                                          );
                                        })}

                                        {/* Trục hoành labels */}
                                        {axisIndices.map((idx) => {
                                          const pt = points[idx];
                                          if (!pt) return null;
                                          const label =
                                            pt.pt.formattedAxisTime || pt.pt.formattedTime;
                                          return (
                                            <text
                                              key={idx}
                                              x={pt.x}
                                              y={padding.top + innerHeight + 18}
                                              textAnchor="middle"
                                              className="fill-muted-foreground text-[9px] font-mono"
                                            >
                                              {label}
                                            </text>
                                          );
                                        })}

                                        {/* Area fill Compare (nếu có) */}
                                        {hasCompare && compareAreaD && (
                                          <path d={compareAreaD} fill="url(#trendGradCompare)" />
                                        )}

                                        {/* Area fill Primary */}
                                        {primaryAreaD && (
                                          <path d={primaryAreaD} fill="url(#trendGradPrimary)" />
                                        )}

                                        {/* Đường Stroke Compare (nếu có) */}
                                        {hasCompare && compareLineD && (
                                          <path
                                            d={compareLineD}
                                            fill="none"
                                            stroke="#8b5cf6"
                                            strokeWidth="2"
                                            strokeDasharray="4 4"
                                            strokeLinecap="round"
                                          />
                                        )}

                                        {/* Đường Stroke Primary */}
                                        {primaryLineD && (
                                          <path
                                            d={primaryLineD}
                                            fill="none"
                                            stroke="#10b981"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                          />
                                        )}

                                        {/* Hover Line & Marker */}
                                        {hoveredPt && (
                                          <g>
                                            <line
                                              x1={hoveredPt.x}
                                              y1={padding.top}
                                              x2={hoveredPt.x}
                                              y2={padding.top + innerHeight}
                                              stroke="currentColor"
                                              strokeDasharray="3 3"
                                              className="text-foreground/50"
                                              strokeWidth="1.5"
                                            />
                                            {hoveredCompPt && (
                                              <circle
                                                cx={hoveredCompPt.x}
                                                cy={hoveredCompPt.y}
                                                r="4.5"
                                                fill="#8b5cf6"
                                                stroke="currentColor"
                                                className="stroke-background"
                                                strokeWidth="2"
                                              />
                                            )}
                                            <circle
                                              cx={hoveredPt.x}
                                              cy={hoveredPt.y}
                                              r="5"
                                              fill="#10b981"
                                              stroke="currentColor"
                                              className="stroke-background"
                                              strokeWidth="2"
                                            />
                                          </g>
                                        )}
                                      </svg>

                                      {/* Hover Interactive Tooltip Box */}
                                      {hoveredPt && (
                                        <div
                                          className={cn(
                                            'absolute top-2 pointer-events-none p-2 rounded-md bg-popover/95 border border-border shadow-lg text-[11px] space-y-1 transition-transform z-10 backdrop-blur-sm',
                                            hoveredPt.x > svgWidth * 0.7 ? 'right-2' : 'left-2',
                                          )}
                                        >
                                          <div className="font-semibold text-foreground flex items-center gap-1.5 pb-0.5 border-b border-border/40">
                                            <Calendar className="w-3 h-3 text-muted-foreground" />
                                            {hoveredPt.pt.formattedTime}
                                            {hoveredPt.pt.isPartial && (
                                              <span className="text-[9px] px-1 rounded bg-amber-500/10 text-amber-500">
                                                Dữ liệu chưa hoàn tất
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-1.5">
                                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                              <span className="text-muted-foreground">
                                                {trendsResult.keyword}:
                                              </span>
                                            </div>
                                            <span className="font-mono font-bold text-emerald-400">
                                              {hoveredPt.pt.value}
                                            </span>
                                          </div>
                                          {hasCompare && hoveredCompPt && (
                                            <div className="flex items-center justify-between gap-4">
                                              <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                <span className="text-muted-foreground">
                                                  {trendsResult.compareKeyword}:
                                                </span>
                                              </div>
                                              <span className="font-mono font-bold text-purple-400">
                                                {hoveredCompPt.pt.compareValue ?? 0}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="py-8 text-center text-xs text-muted-foreground">
                                Không có dữ liệu timeline chi tiết cho từ khóa này.
                              </div>
                            )}
                          </div>

                          {/* Khối Khuyến Nghị Chiến Lược Cho Creator */}
                          {trendsResult.recommendation && (
                            <div className="rounded-lg border border-border/60 bg-card p-3.5 space-y-2.5">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
                                    <Target className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-semibold text-foreground">
                                      Chiến Lược Xuất Bản Đề Xuất Cho Creator
                                    </h4>
                                    <p className="text-[11px] text-muted-foreground">
                                      Định hướng thời điểm xuất bản và góc tiếp cận nội dung theo
                                      động lượng xu hướng
                                    </p>
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] font-medium capitalize',
                                    trendsResult.recommendation.urgency === 'high'
                                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                                      : trendsResult.recommendation.urgency === 'medium'
                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                        : 'border-border bg-muted text-muted-foreground',
                                  )}
                                >
                                  Mức ưu tiên:{' '}
                                  {trendsResult.recommendation.urgency === 'high'
                                    ? 'Khẩn cấp'
                                    : trendsResult.recommendation.urgency === 'medium'
                                      ? 'Trung bình'
                                      : 'Theo dõi'}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-xs">
                                <div className="p-2.5 rounded-md bg-muted/20 border border-border/40 space-y-1">
                                  <div className="font-semibold text-foreground text-[11px] flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                                    Thời Điểm & Hành Động
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {trendsResult.recommendation.actionText}
                                  </p>
                                </div>

                                <div className="p-2.5 rounded-md bg-muted/20 border border-border/40 space-y-1">
                                  <div className="font-semibold text-foreground text-[11px] flex items-center gap-1.5">
                                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                                    Góc Tiếp Cận Nội Dung (Content Angle)
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {trendsResult.recommendation.contentAngle}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Bảng Từ Khóa Tăng Đột Biến (Breakout Queries) & Top Queries */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {/* Cột Trái: Rising / Breakout Queries */}
                            <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="w-4 h-4 text-amber-400" />
                                  <h4 className="text-xs font-semibold text-foreground">
                                    Từ Khóa Tăng Đột Biến (Breakout)
                                  </h4>
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                  {trendsResult.risingQueries?.length || 0} từ khóa
                                </Badge>
                              </div>

                              {trendsResult.risingQueries &&
                              trendsResult.risingQueries.length > 0 ? (
                                <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5 divide-y divide-border/20">
                                  {trendsResult.risingQueries.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 hover:bg-muted/20 px-1 py-1 rounded"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium text-foreground truncate">
                                          {item.query}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {item.isBreakout ? (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-500 font-semibold"
                                          >
                                            Đột phá
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 font-mono text-emerald-400 border-emerald-500/30"
                                          >
                                            +{item.value}%
                                          </Badge>
                                        )}

                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleCopyQuery(item.query)}
                                          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                          title="Sao chép từ khóa"
                                        >
                                          {copiedQuery === item.query ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="default"
                                          size="sm"
                                          onClick={() => {
                                            setCurrentNiche(item.query);
                                            setNicheInput(item.query);
                                            setSelectedNicheId(null);
                                            handleScanNiche(item.query);
                                            toast.success({
                                              title: 'Đã kích hoạt quét ngách',
                                              description: `Bắt đầu săn video triệu view cho: ${item.query}`,
                                            });
                                          }}
                                          className="h-6 px-2 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                          <ArrowRight className="w-3 h-3" />
                                          Săn Ngách Này
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-6 text-center text-xs text-muted-foreground">
                                  Chưa ghi nhận từ khóa tăng đột biến trong kỳ phân tích này.
                                </div>
                              )}
                            </div>

                            {/* Cột Phải: Top Queries */}
                            <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                                  <h4 className="text-xs font-semibold text-foreground">
                                    Từ Khóa Tìm Kiếm Hàng Đầu (Top Queries)
                                  </h4>
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                  {trendsResult.topQueries?.length || 0} từ khóa
                                </Badge>
                              </div>

                              {trendsResult.topQueries && trendsResult.topQueries.length > 0 ? (
                                <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5 divide-y divide-border/20">
                                  {trendsResult.topQueries.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 hover:bg-muted/20 px-1 py-1 rounded"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium text-foreground truncate">
                                          {item.query}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                                          <div className="w-12 bg-muted rounded-full h-1 overflow-hidden">
                                            <div
                                              className="bg-emerald-500 h-full rounded-full"
                                              style={{
                                                width: `${Math.max(0, Math.min(100, item.value))}%`,
                                              }}
                                            />
                                          </div>
                                          <span>{item.value}</span>
                                        </div>

                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleCopyQuery(item.query)}
                                          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                          title="Sao chép từ khóa"
                                        >
                                          {copiedQuery === item.query ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="default"
                                          size="sm"
                                          onClick={() => {
                                            setCurrentNiche(item.query);
                                            setNicheInput(item.query);
                                            setSelectedNicheId(null);
                                            handleScanNiche(item.query);
                                            toast.success({
                                              title: 'Đã kích hoạt quét ngách',
                                              description: `Bắt đầu săn video triệu view cho: ${item.query}`,
                                            });
                                          }}
                                          className="h-6 px-2 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                          <ArrowRight className="w-3 h-3" />
                                          Săn Ngách Này
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-6 text-center text-xs text-muted-foreground">
                                  Không có dữ liệu từ khóa tìm kiếm hàng đầu.
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TOOL 3: CONTENT GAP */}
              {activeTool === 'gap' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-sky-400" />
                        3. Đo Lường Content Gap (Nhu Cầu Cao - Thiếu Video Phục Vụ)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Phát hiện các từ khóa người xem tìm kiếm nhiều nhưng nguồn cung video hiện
                        có còn ít hoặc cũ.
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
                        <Sparkles className="w-3.5 h-3.5" />
                        Content Gap Rất Cao
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Lượng tìm kiếm tăng vọt, các video hiện có chất lượng thấp hoặc đã quá cũ
                        (2-3 năm trước). Khuyên làm ngay!
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs">
                      <div className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Content Gap Trung Bình
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Có sự cạnh tranh vừa phải từ các kênh nhỏ. Cần góc nhìn mới lạ hoặc cải tiến
                        Thumbnail để thắng.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs">
                      <div className="font-bold text-rose-400 mb-1 flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5" />
                        Bão Hòa Nội Dung
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Quá nhiều kênh lớn thống trị từ khóa chung chung. Phải thu hẹp về ngách bé
                        hơn nữa bằng YouTube A-Z.
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg flex items-center justify-between">
                    <span>
                      Đang đánh giá Content Gap cho ngách:{' '}
                      <strong className="text-foreground">{currentNiche}</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveTool('alphabet');
                        setAlphabetSeed(nicheInput || currentNiche);
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Tv className="w-4 h-4 text-rose-400" />
                        4. Phân Tích Kênh Đối Thủ & VPH (Views Per Hour)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Truy cập kênh đối thủ, quét tab video phổ biến hoặc mới nhất, đo lượng view
                        theo giờ (VPH) và điểm từ khóa.
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
                    <div className="border border-border/50 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
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
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleOpenAiStudio({
                                        title: cv.title,
                                        niche:
                                          selectedFilterNiche !== 'all'
                                            ? selectedFilterNiche
                                            : undefined,
                                        competitorChannel: cv.uploader,
                                      })
                                    }
                                    className="h-7 px-2 text-[10px] gap-1 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                                    title="Tối ưu AI theo đối thủ"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    AI Studio
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenYouTube(cv.id)}
                                    className="h-7 px-2 text-[10px] gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Xem
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
            </div>
          )}
        </Card>

        {/* KHỐI 3: DANH SÁCH VIDEO ĐỀ XUẤT ĐỘT BIẾN */}
        <div className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Danh Sách Video Đột Biến:</h2>
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
                {selectedFilterNiche === 'all' ? 'Tất cả các ngách' : selectedFilterNiche} (
                {filteredAndSortedVideos.length} video)
              </Badge>
            </div>

            <span className="text-xs text-muted-foreground">
              Tự động tính toán VPH & Đột biến View/Sub theo thời gian thực
            </span>
          </div>

          {/* Filter Pills khi có nhiều ngách */}
          {videos.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedFilterNiche('all')}
                className={cn(
                  'px-3 py-1 rounded-full border transition-all text-xs font-medium whitespace-nowrap',
                  selectedFilterNiche === 'all'
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'border-border/60 bg-background/50 hover:bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                Tất cả ({videos.length})
              </button>
              {Array.from(new Set(videos.map((v) => v.niche).filter(Boolean))).map((niche) => {
                const count = videos.filter((v) => v.niche === niche).length;
                const isSelected = selectedFilterNiche.toLowerCase() === niche.toLowerCase();
                return (
                  <button
                    key={niche}
                    type="button"
                    onClick={() => setSelectedFilterNiche(niche)}
                    className={cn(
                      'px-3 py-1 rounded-full border transition-all text-xs font-medium whitespace-nowrap',
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'border-border/60 bg-background/50 hover:bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {niche} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {filteredAndSortedVideos.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/60 bg-card/30 flex flex-col items-center justify-center">
              <Compass className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Chưa có dữ liệu video đề xuất cho bộ lọc hiện tại
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mb-5 leading-relaxed">
                Hệ thống sẵn sàng săn video bùng nổ theo chuẩn thời gian thực (VPH &gt; 50, View/Sub
                &gt; 3x). Hãy bấm nút quét dưới đây hoặc chọn một ngách chuẩn.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <Button
                  size="sm"
                  onClick={() => handleScanNiche('all')}
                  disabled={isScanning}
                  className="text-xs gap-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 hover:from-violet-700 hover:to-amber-600 text-white font-bold shadow-md shadow-violet-500/20 px-4"
                >
                  <Sparkles className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
                  Quét Toàn Bộ Ngách ({market === 'viet' ? 'View Việt' : selectedForeignCountry})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleScanNiche(nicheInput)}
                  disabled={isScanning}
                  className="text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-medium"
                >
                  <Flame className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
                  Quét ngách: "{currentNiche}"
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAndSortedVideos.map((vid) => {
                const subRatio =
                  vid.sub_outlier_ratio || (vid.subscribers > 0 ? vid.views / vid.subscribers : 1);
                const vph =
                  vid.avg_vph || (vid.hours_published > 0 ? vid.views / vid.hours_published : 0);
                const isWatch = vid.status === 'watchlist';

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
                            ({formatSubscribers(vid.subscribers)} subs)
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
                            <span
                              title={
                                vid.upload_timestamp
                                  ? new Date(vid.upload_timestamp * 1000).toLocaleString('vi-VN')
                                  : undefined
                              }
                            >
                              Đăng:{' '}
                              <strong className="text-foreground">
                                {formatPublishedTime(vid.hours_published, vid.upload_timestamp)}
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
                            Đột biến {subRatio.toFixed(1)}x View/Sub
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-muted-foreground">Content Gap</div>
                          <div className="text-xs font-bold text-sky-400">
                            {vid.opportunity_score ? `${vid.opportunity_score}/100` : 'Rất Cao'}
                          </div>
                        </div>
                      </div>

                      {/* Spy Tags (VidIQ) Pill & Quick Actions */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        <button
                          type="button"
                          onClick={() => handleInspectTags(vid)}
                          disabled={loadingTagsId === vid.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition-all cursor-pointer group"
                          title="Bấm để xem nhanh danh sách thẻ Tags hoặc sao chép"
                        >
                          <Tag className="w-3 h-3 text-teal-400 group-hover:scale-110 transition-transform" />
                          {loadingTagsId === vid.id ? (
                            <span className="flex items-center gap-1 text-[10px] text-teal-300">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Đang bóc tách...
                            </span>
                          ) : (
                            <span>
                              {videoTagsMap[vid.id]
                                ? `${videoTagsMap[vid.id].length} tags`
                                : 'Bóc tách Tags (VidIQ)'}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const tagsToCopy = videoTagsMap[vid.id] || [
                              vid.niche,
                              vid.channel_name,
                              'trending',
                            ];
                            navigator.clipboard.writeText(tagsToCopy.join(', '));
                            toast.success({
                              title: 'Đã sao chép thẻ tags',
                              description: `${tagsToCopy.length} tags đã được copy dạng dấu phẩy (,).`,
                            });
                          }}
                          className="text-[10px] text-muted-foreground hover:text-teal-300 flex items-center gap-1 transition-colors"
                          title="Sao chép nhanh tất cả tags dạng dấu phẩy"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Chép nhanh</span>
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons: 5 Nút Tác Vụ 1-Click Chuẩn Hóa */}
                    <div className="flex flex-wrap items-center justify-between pt-2 border-t border-border/40 gap-1.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenYouTube(vid.id)}
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          title="Mở trên YouTube"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Xem
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVideo(vid.id)}
                          className="h-7 px-2 text-xs gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          title="Xóa khỏi danh sách"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Nút 1: Theo dõi kênh này */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleWatchlist(vid)}
                          className={cn(
                            'h-7 px-2 text-xs gap-1 transition-all',
                            isWatch
                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                              : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                          title={
                            isWatch
                              ? 'Đang theo dõi trong Watchlist'
                              : 'Thêm kênh này vào Watchlist theo dõi'
                          }
                        >
                          {isWatch ? (
                            <BookmarkCheck className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Bookmark className="w-3 h-3" />
                          )}
                          <span>{isWatch ? 'Đang theo dõi' : 'Theo dõi kênh'}</span>
                        </Button>

                        {/* Nút 2: Bóc SEO Tags */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInspectTags(vid)}
                          className="h-7 px-2 text-xs gap-1 border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
                          title="Bóc tách thẻ Tags của video"
                        >
                          <Tag className="w-3 h-3 text-teal-400" />
                          <span>Bóc SEO Tags</span>
                        </Button>

                        {/* Nút 3: AI Studio */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleOpenAiStudio({
                              title: vid.title,
                              niche: vid.niche,
                              competitorChannel: vid.channel_name,
                              competitorTags: videoTagsMap[vid.id] || [],
                            })
                          }
                          className="h-7 px-2 text-xs gap-1 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                          title="Tối ưu AI theo đối thủ (Tiêu đề, Mô tả 4 tầng, Hook)"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>AI Studio</span>
                        </Button>

                        {/* Nút 4: Reup & Test BKT */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendToBkt(vid)}
                          className="h-7 px-2 text-xs gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-medium"
                          title="Chuyển video sang luồng Reup & Test BKT"
                        >
                          <Flame className="w-3 h-3" />
                          <span>Reup & Test BKT</span>
                        </Button>

                        {/* Nút 5: Tải video */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleQuickDownload(vid)}
                          className="h-7 px-2.5 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                          title="Đưa video vào hàng đợi tải video sạch"
                        >
                          <Download className="w-3 h-3" />
                          <span>Tải video</span>
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

      {/* MODAL AI STUDIO TỐI ƯU THEO ĐỐI THỦ */}
      <CompetitorAiStudioModal
        isOpen={aiStudioOpen}
        onClose={() => setAiStudioOpen(false)}
        initialTitle={aiStudioPayload.title}
        initialNiche={aiStudioPayload.niche}
        initialCompetitorChannel={aiStudioPayload.competitorChannel}
        initialCompetitorKeywords={aiStudioPayload.competitorKeywords}
        initialCompetitorTags={aiStudioPayload.competitorTags}
        initialTranscriptPreview={aiStudioPayload.transcriptPreview}
        onSendToBkt={(title, desc) => {
          sessionStorage.setItem('reup_input_video_title', title);
          if (desc) {
            sessionStorage.setItem('reup_input_video_description', desc);
          }
          if (aiStudioPayload.competitorTags && aiStudioPayload.competitorTags.length > 0) {
            sessionStorage.setItem(
              'reup_input_video_tags',
              aiStudioPayload.competitorTags.join(', '),
            );
          }
          toast.info({
            title: 'Chuyển sang luồng Test BKT',
            description: `Đã đưa thông tin video "${title.slice(0, 40)}..." sang Reup & Test BKT.`,
          });
          if (onNavigate) {
            onNavigate('reup');
          }
        }}
      />

      {/* DIALOG XEM NHANH SPY TAGS ĐỐI THỦ (VIDIQ STYLE) */}
      <Dialog
        open={spyTagsModal.isOpen}
        onOpenChange={(open) => !open && setSpyTagsModal((prev) => ({ ...prev, isOpen: false }))}
      >
        <DialogContent className="max-w-lg border-teal-500/40 bg-card p-5 space-y-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  Thẻ Tags Đối Thủ (Chuẩn VidIQ)
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-teal-500/15 text-teal-300 border-teal-500/40"
                  >
                    {spyTagsModal.tags.length} tags
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {spyTagsModal.videoTitle}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border/50 bg-background/50 max-h-60 overflow-y-auto">
            {(spyTagsModal.tags || []).map((tag, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => {
                  navigator.clipboard.writeText(tag);
                  toast.success({
                    title: 'Đã sao chép tag',
                    description: tag,
                  });
                }}
                title="Bấm để sao chép tag này"
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-teal-500/10 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 transition-all"
              >
                <span>#{tag}</span>
                <Copy className="w-2.5 h-2.5 opacity-60 hover:opacity-100" />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(spyTagsModal.tags.join(', '));
                toast.success({
                  title: 'Đã sao chép tất cả Tags (,)',
                  description: `Đã copy ${spyTagsModal.tags.length} thẻ tags. Dán trực tiếp vào ô Tags của YouTube Studio!`,
                });
              }}
              className="text-xs h-8 px-3 gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/20 font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép tất cả Tags (,)</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                handleOpenAiStudio({
                  title: spyTagsModal.videoTitle,
                  competitorTags: spyTagsModal.tags,
                });
                setSpyTagsModal((prev) => ({ ...prev, isOpen: false }));
              }}
              className="text-xs h-8 px-3 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nạp vào AI Studio</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
