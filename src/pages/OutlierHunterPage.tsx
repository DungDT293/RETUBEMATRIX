import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Activity,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Page } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { useToast } from '@/components/ui/toast';
import { useDownload } from '@/contexts/download-context';
import {
  analyzeVideoHook,
  deleteOutlierVideo,
  findKeywordGoldmines,
  getOutlierSettings,
  getOutlierVideos,
  type HookAnatomyResult,
  type KeywordGoldmine,
  type OutlierHunterSettings,
  type OutlierVideo,
  triggerOutlierPing,
  triggerOutlierScan,
  updateOutlierSettings,
  updateOutlierVideoStatus,
} from '@/contexts/outliers/outliers-client';
import { cn } from '@/lib/utils';

// Thư viện các chủ đề MMO & Reup thịnh hành được phân loại chuyên sâu
const NICHE_CATALOG = [
  {
    category: '🎬 Phim & Hoạt hình (Recap & Breakdown)',
    badge: '🇺🇸 US/Global',
    items: [
      { label: 'Movie Recap', val: 'movie recap' },
      { label: 'Anime Recap', val: 'anime recap' },
      { label: 'Series Breakdown', val: 'series breakdown' },
      { label: 'Ending Explained', val: 'ending explained' },
      { label: 'Horror Movie Recap', val: 'horror movie recap' },
    ],
  },
  {
    category: '💀 Kinh dị & Bí ẩn (Horror & Creepypasta)',
    badge: '🇺🇸 US/Global',
    items: [
      { label: 'Scary Stories Animated', val: 'scary stories animated' },
      { label: 'Disturbing Rabbit Holes', val: 'disturbing rabbit holes' },
      { label: 'Internet Mysteries Iceberg', val: 'internet mysteries iceberg' },
      { label: 'Analog Horror ARG', val: 'analog horror' },
      { label: 'Paranormal Mysteries', val: 'paranormal mysteries' },
    ],
  },
  {
    category: '⚖️ Vụ án & Tâm lý học (True Crime & Dark Psychology)',
    badge: '🇺🇸 US/Global',
    items: [
      { label: 'True Crime Documentary', val: 'true crime documentary' },
      { label: 'Interrogation Breakdown', val: 'police interrogation breakdown' },
      { label: 'Dark Psychology Facts', val: 'dark psychology facts' },
      { label: 'Unsolved Disappearances', val: 'unsolved disappearances' },
      { label: 'Courtroom Drama Moments', val: 'courtroom drama moments' },
    ],
  },
  {
    category: '🚀 Khoa học, Vũ trụ & Lịch sử (Science & History)',
    badge: '🇺🇸 US/Global',
    items: [
      { label: 'Deep Sea Mysteries', val: 'deep sea mysteries' },
      { label: 'Mind Blowing Facts', val: 'mind blowing science facts' },
      { label: 'Ancient Civilizations', val: 'ancient civilizations mysteries' },
      { label: 'Dark History Documentary', val: 'dark history documentary' },
      { label: 'Futuristic AI Tech', val: 'futuristic ai technology' },
    ],
  },
  {
    category: '💰 Tài chính & Kinh doanh (Finance & Empire)',
    badge: '🇺🇸 US/Global',
    items: [
      { label: 'Business Empire Breakdown', val: 'business empire breakdown' },
      { label: 'Financial Scams Exposed', val: 'financial scams exposed' },
      { label: 'Luxury Lifestyle Secrets', val: 'luxury lifestyle secrets' },
      { label: 'Economy Crisis Documentary', val: 'economy crisis documentary' },
    ],
  },
  {
    category: '🇻🇳 Chủ Đề Hot Việt Nam (Kể chuyện, Vụ án, Manhwa...)',
    badge: '🇻🇳 Việt Nam',
    items: [
      { label: 'Kể Chuyện Ma Rùng Rợn', val: 'kể chuyện ma' },
      { label: 'Vụ Án Bí Ẩn Có Thật', val: 'vụ án bí ẩn có thật việt nam' },
      { label: 'Review Phim Tóm Tắt', val: 'review phim tóm tắt' },
      { label: 'Tóm Tắt Truyện Tranh Manhwa', val: 'tóm tắt truyện tranh hay' },
      { label: 'Kiến Thức Thú Vị Kỳ Lạ', val: 'kiến thức thú vị' },
      { label: 'Sự Thật Về Vũ Trụ', val: 'sự thật lạ lùng về vũ trụ' },
      { label: 'Giải Mã Lịch Sử Việt Nam', val: 'giải mã bí ẩn lịch sử việt nam' },
      { label: 'Podcast Tư Duy & Chữa Lành', val: 'podcast tư duy phát triển' },
    ],
  },
];

// Sparkline SVG Component for rendering 24-point view trajectory
function SparklineChart({
  historyJson,
  momentumScore,
}: {
  historyJson: string;
  momentumScore: number;
}) {
  const points: { ts: number; views: number; vph: number }[] = useMemo(() => {
    try {
      const parsed = JSON.parse(historyJson || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [historyJson]);

  if (points.length < 2) {
    return (
      <div className="h-9 flex items-center justify-center text-[10px] text-muted-foreground/60 italic border border-border/20 rounded bg-muted/20 px-2">
        <Clock className="w-3 h-3 mr-1" />
        Đang chờ tích lũy dữ liệu gia tốc (Ping mỗi 2h-6h)
      </div>
    );
  }

  const viewsArr = points.map((p) => p.views);
  const minV = Math.min(...viewsArr);
  const maxV = Math.max(...viewsArr);
  const range = maxV - minV || 1;

  const width = 180;
  const height = 36;
  const padding = 4;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((p.views - minV) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const isSurging = momentumScore >= 1.15;

  return (
    <div className="flex items-center gap-2 bg-muted/30 border border-border/30 rounded-lg p-1.5 px-2.5">
      <div className="flex-1">
        <div className="flex items-center justify-between text-[10px] mb-0.5">
          <span className="text-muted-foreground flex items-center gap-1 font-mono">
            <Activity className="w-2.5 h-2.5 text-primary" />
            Đường cong gia tốc:
          </span>
          <span
            className={cn(
              'font-semibold font-mono',
              isSurging ? 'text-emerald-400' : 'text-muted-foreground',
            )}
          >
            {isSurging ? '📈 Đang Dựng Đứng' : 'Ổn định'}
          </span>
        </div>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        >
          <title>Biểu đồ gia tốc view</title>
          <path
            d={pathD}
            fill="none"
            stroke={isSurging ? '#10b981' : '#8b5cf6'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.length > 0 && (
            <circle
              cx={coords[coords.length - 1].split(',')[0]}
              cy={coords[coords.length - 1].split(',')[1]}
              r="3.5"
              fill={isSurging ? '#10b981' : '#8b5cf6'}
              className="animate-pulse"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

interface OutlierHunterPageProps {
  onNavigate?: (page: Page) => void;
}

export function OutlierHunterPage({ onNavigate }: OutlierHunterPageProps = {}) {
  const toast = useToast();
  const { enqueueExternalUrl, startDownload } = useDownload();
  const [videos, setVideos] = useState<OutlierVideo[]>([]);
  const [settings, setSettings] = useState<OutlierHunterSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'all' | 'surging' | 'extreme' | 'watchlist'>('all');
  const [selectedNiche, setSelectedNiche] = useState<string>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Settings form local state
  const [settingsForm, setSettingsForm] = useState<Partial<OutlierHunterSettings>>({});
  const [newNicheInput, setNewNicheInput] = useState<string>('');

  // Goldmine Autocomplete State (Aurora & Open-Tube-SEO)
  const [isGoldmineOpen, setIsGoldmineOpen] = useState<boolean>(false);
  const [goldmineSeed, setGoldmineSeed] = useState<string>('kể chuyện bí ẩn');
  const [isSearchingGoldmines, setIsSearchingGoldmines] = useState<boolean>(false);
  const [goldmineKeywords, setGoldmineKeywords] = useState<KeywordGoldmine[]>([]);

  // Hook & Transcript Modal State (ViralMint & Open-Tube-SEO)
  const [isHookModalOpen, setIsHookModalOpen] = useState<boolean>(false);
  const [hookTargetTitle, setHookTargetTitle] = useState<string>('');
  const [hookData, setHookData] = useState<HookAnatomyResult | null>(null);
  const [isLoadingHook, setIsLoadingHook] = useState<boolean>(false);

  // Fetch initial data on mount (no infinite re-render loop)
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [sets, vids] = await Promise.all([getOutlierSettings(), getOutlierVideos()]);
        if (isMounted) {
          setSettings(sets);
          setSettingsForm(sets);
          setVideos(vids);
        }
      } catch (err) {
        console.error('Failed to load outlier data:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Niches list parsed from settings
  const nichesList: string[] = useMemo(() => {
    try {
      return JSON.parse(settings?.niches || '[]');
    } catch {
      return ['review phim', 'tin tức', 'công nghệ', 'giải trí'];
    }
  }, [settings?.niches]);

  // Filtered videos based on activeTab & selectedNiche
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (selectedNiche !== 'all' && v.niche !== selectedNiche) {
        return false;
      }
      if (activeTab === 'surging') {
        return v.momentum_score >= 1.15;
      }
      if (activeTab === 'extreme') {
        return v.baseline_outlier_ratio >= 15.0 || v.sub_outlier_ratio >= 15.0;
      }
      if (activeTab === 'watchlist') {
        return v.status === 'watchlist';
      }
      return true;
    });
  }, [videos, selectedNiche, activeTab]);

  // Trigger Outlier Scan
  const handleTriggerScan = async () => {
    setIsScanning(true);
    toast.info({
      title: 'Đang quét đề xuất...',
      description: 'Hệ thống đang rà quét các video mới và lọc theo bộ tiêu chuẩn Outlier Kép.',
    });
    try {
      const nicheToScan = selectedNiche !== 'all' ? selectedNiche : null;
      const updated = await triggerOutlierScan(nicheToScan);
      setVideos(updated);
      if (updated.length > 0) {
        toast.success({
          title: 'Quét hoàn tất!',
          description: `Tìm thấy ${updated.length} video đột biến thuật toán trong cơ sở dữ liệu.`,
        });
      } else {
        toast.info({
          title: 'Quét hoàn tất',
          description:
            'Chưa phát hiện video mới đạt đủ toàn bộ tiêu chuẩn Outlier Kép khắt khe. Bạn có thể hạ bớt ngưỡng lọc trong Cấu Hình Bộ Lọc.',
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

  // Trigger Ping Momentum
  const handleTriggerPing = async () => {
    setIsPinging(true);
    toast.info({
      title: 'Đang ping gia tốc 6h...',
      description:
        'Đo lường vận tốc view hiện tại để xác định video đang trong pha tăng tốc dựng đứng.',
    });
    try {
      const updated = await triggerOutlierPing();
      setVideos(updated);
      toast.success({
        title: 'Cập nhật gia tốc thành công!',
        description: 'Đã tính toán lại Momentum Score và lưu vết Sparkline.',
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi ping gia tốc',
        description: String(err),
      });
    } finally {
      setIsPinging(false);
    }
  };

  // Handle Save Settings
  const handleSaveSettings = async () => {
    if (!settingsForm) return;
    try {
      await updateOutlierSettings(settingsForm as OutlierHunterSettings);
      setSettings(settingsForm as OutlierHunterSettings);
      setIsSettingsOpen(false);
      toast.success({
        title: 'Đã lưu cấu hình',
        description: 'Bộ tham số săn video đề xuất sẽ được áp dụng cho các chu kỳ tiếp theo.',
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi lưu cấu hình',
        description: String(err),
      });
    }
  };

  // Add a niche
  const handleAddNiche = () => {
    const val = newNicheInput.trim();
    if (!val) return;
    try {
      const curr = JSON.parse(settingsForm.niches || '[]');
      if (!curr.includes(val)) {
        curr.push(val);
        setSettingsForm({ ...settingsForm, niches: JSON.stringify(curr) });
      }
      setNewNicheInput('');
    } catch {
      setSettingsForm({ ...settingsForm, niches: JSON.stringify([val]) });
      setNewNicheInput('');
    }
  };

  // Remove a niche
  const handleRemoveNiche = (n: string) => {
    try {
      const curr = JSON.parse(settingsForm.niches || '[]');
      const filtered = curr.filter((item: string) => item !== n);
      setSettingsForm({ ...settingsForm, niches: JSON.stringify(filtered) });
    } catch {
      // ignore
    }
  };

  // Delete Video
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

  // Open YouTube Video in external browser
  const handleOpenYouTube = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const url = `https://www.youtube.com/watch?v=${id}`;
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  // Download Video to local download queue
  const handleDownloadVideo = async (video: OutlierVideo) => {
    try {
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      await enqueueExternalUrl(url);
      await startDownload();
      await updateOutlierVideoStatus({
        id: video.id,
        status: 'downloading',
      });
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, status: 'downloading' } : v)),
      );
      toast.success({
        title: 'Bắt đầu tải video',
        description: `Đang nạp "${video.title}" vào hàng đợi tải xuống.`,
      });
    } catch (err) {
      toast.error({
        title: 'Lỗi tải video',
        description: String(err),
      });
    }
  };

  // Navigate to Reup & Test BKT
  const handleReupVideo = (video: OutlierVideo) => {
    sessionStorage.setItem('reup_input_video_url', `https://www.youtube.com/watch?v=${video.id}`);
    sessionStorage.setItem('reup_input_video_title', video.title);
    if (onNavigate) {
      onNavigate('reup');
    } else {
      window.location.hash = '#/reup';
    }
  };

  // Search Goldmine Keywords (Aurora & Open-Tube-SEO)
  const handleSearchGoldmines = async (seedToSearch?: string) => {
    const s = (seedToSearch || goldmineSeed).trim();
    if (!s) return;
    setIsSearchingGoldmines(true);
    try {
      const res = await findKeywordGoldmines(s);
      setGoldmineKeywords(res);
      if (res.length > 0) {
        toast.success({
          title: 'Đào mỏ vàng hoàn tất!',
          description: `Tìm thấy ${res.length} từ khóa ngách tiềm năng cao trên YouTube.`,
        });
      }
    } catch (err) {
      toast.error({ title: 'Lỗi tìm mỏ vàng từ khóa', description: String(err) });
    } finally {
      setIsSearchingGoldmines(false);
    }
  };

  // Add keyword from goldmine to hunter niches
  const handleAddGoldmineToNiches = async (kw: string) => {
    try {
      const curr: string[] = JSON.parse(settingsForm.niches || '[]');
      if (!curr.includes(kw)) {
        curr.push(kw);
        const updated = { ...settingsForm, niches: JSON.stringify(curr) };
        setSettingsForm(updated);
        await updateOutlierSettings(updated as OutlierHunterSettings);
        setSettings(updated as OutlierHunterSettings);
        toast.success({
          title: 'Đã thêm vào ngách săn',
          description: `Từ khóa "${kw}" đã được nạp vào danh sách ngách tự động quét.`,
        });
      } else {
        toast.info({ title: 'Đã tồn tại', description: `Ngách "${kw}" đã có trong danh sách.` });
      }
    } catch (err) {
      toast.error({ title: 'Lỗi thêm ngách', description: String(err) });
    }
  };

  // Open Hook & Transcript Anatomy Modal (ViralMint & Open-Tube-SEO)
  const handleOpenHookModal = async (videoId: string, title: string) => {
    setHookTargetTitle(title);
    setIsHookModalOpen(true);
    setIsLoadingHook(true);
    setHookData(null);
    try {
      const data = await analyzeVideoHook(videoId);
      setHookData(data);
    } catch (err) {
      toast.error({ title: 'Lỗi bóc tách kịch bản', description: String(err) });
    } finally {
      setIsLoadingHook(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-card/40 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 via-orange-500/20 to-rose-500/20 text-orange-400 border border-orange-500/30">
              <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text">
                Săn Video Đề Xuất (Outlier Breakout Hunter)
              </h1>
              <p className="text-xs text-muted-foreground">
                Tự động phát hiện video kênh nhỏ view khủng, bứt phá thuật toán YouTube & Auto-Pilot
                Reup
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsGoldmineOpen(true);
              if (goldmineKeywords.length === 0) {
                handleSearchGoldmines(goldmineSeed);
              }
            }}
            className="text-xs gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Mỏ Vàng Từ Khóa (SEO)</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerPing}
            disabled={isPinging || loading}
            className="text-xs gap-1.5 border-border/60 hover:bg-muted/60"
          >
            <Activity className={cn('w-3.5 h-3.5', isPinging && 'animate-spin text-primary')} />
            <span>Ping Gia Tốc (6h)</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs gap-1.5 border-border/60 hover:bg-muted/60"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Cài Đặt Bộ Lọc</span>
          </Button>

          <Button
            size="sm"
            onClick={handleTriggerScan}
            disabled={isScanning || loading}
            className="text-xs gap-1.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md shadow-orange-500/20"
          >
            <Flame className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
            <span>Quét Đề Xuất Ngay</span>
          </Button>
        </div>
      </header>

      {/* Auto-Pilot Status Ribbon */}
      <div className="px-6 py-2.5 bg-muted/30 border-b border-border/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Chế độ Auto-Pilot 100%:</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[11px] font-semibold px-2 py-0.5',
                settings?.enabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-muted/50 text-muted-foreground border-border/40',
              )}
            >
              {settings?.enabled ? 'ĐANG BẬT' : 'TẮT'}
            </Badge>
          </div>

          <div className="hidden md:flex items-center gap-2 text-muted-foreground">
            <span>•</span>
            <span>
              Tự tải:{' '}
              <strong className="text-foreground">
                {settings?.auto_download ? 'Bật (Khi Outlier >= 15x hoặc Momentum >= 1.15)' : 'Tắt'}
              </strong>
            </span>
            <span>•</span>
            <span>
              Reup Pipeline:{' '}
              <strong className="text-foreground uppercase">
                Cấp độ {settings?.auto_reup_level === 'v2' ? '2 (Lách sâu)' : '1 (Chuẩn)'}
              </strong>
            </span>
            <span>•</span>
            <span>
              Test Kênh BKT:{' '}
              <strong className="text-foreground">
                {settings?.auto_bkt_test ? 'Bật (Polling 45p)' : 'Tắt'}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
          <span>Chu kỳ quét:</span>
          <span className="text-foreground font-semibold">
            {settings?.scan_interval_minutes || 60} phút
          </span>
        </div>
      </div>

      {/* Filter Tabs & Niches */}
      <div className="p-6 pb-2 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Status Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/40">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeTab === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Tất cả ({videos.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('surging')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                activeTab === 'surging'
                  ? 'bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>Đang Dựng Đứng ({videos.filter((v) => v.momentum_score >= 1.15).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('extreme')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                activeTab === 'extreme'
                  ? 'bg-orange-500/20 text-orange-300 shadow-sm border border-orange-500/30'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Flame className="w-3 h-3 text-orange-400" />
              <span>
                Siêu Đột Biến (
                {
                  videos.filter((v) => v.baseline_outlier_ratio >= 15 || v.sub_outlier_ratio >= 15)
                    .length
                }
                )
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('watchlist')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeTab === 'watchlist'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Watchlist 6h ({videos.filter((v) => v.status === 'watchlist').length})
            </button>
          </div>

          {/* Niche Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ngách:</span>
            <Select value={selectedNiche} onValueChange={setSelectedNiche}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-muted/40 border-border/40">
                <SelectValue placeholder="Tất cả ngách" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả các ngách</SelectItem>
                {nichesList.map((nc) => (
                  <SelectItem key={nc} value={nc}>
                    {nc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 pt-2">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Đang nạp dữ liệu Outlier...</span>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/30 w-fit mx-auto text-muted-foreground">
              <Flame className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Chưa có video đột biến nào đạt ngưỡng
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Bấm nút &quot;Quét Đề Xuất Ngay&quot; ở trên để bot chạy rà soát hàng loạt video theo
              các ngách bạn đã chọn.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerScan}
              disabled={isScanning}
              className="text-xs gap-1.5 mt-2"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Bắt đầu quét ngay</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredVideos.map((video) => {
              const isSurging = video.momentum_score >= 1.15;
              const isExtreme =
                video.baseline_outlier_ratio >= 15.0 || video.sub_outlier_ratio >= 15.0;

              return (
                <Card
                  key={video.id}
                  className="p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-3.5 hover:border-border transition-all shadow-sm"
                >
                  {/* Top Bar: Channel & Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-xs font-bold text-muted-foreground border border-border/40 shrink-0">
                        {video.channel_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-foreground truncate max-w-[200px]">
                            {video.channel_name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 bg-muted/60 font-mono text-muted-foreground border border-border/40"
                          >
                            {video.subscribers.toLocaleString()} subs
                          </Badge>
                          {(() => {
                            const isVN =
                              /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i.test(
                                `${video.title} ${video.niche} ${video.channel_name}`,
                              );
                            return (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] px-1.5 py-0 h-4 font-semibold',
                                  isVN
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                                )}
                              >
                                {isVN ? '🇻🇳 VN' : '🇺🇸 US/Global'}
                              </Badge>
                            );
                          })()}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Ngách: <strong className="text-foreground">{video.niche}</strong> • Đăng{' '}
                          {video.hours_published.toFixed(1)}h trước
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {video.opportunity_score != null && video.opportunity_score > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-2 py-0.5 font-bold',
                            video.opportunity_score >= 80
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                          )}
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {video.opportunity_score >= 80 ? 'GEM' : 'HOT'} {video.opportunity_score}
                          /100
                        </Badge>
                      )}
                      {isExtreme && (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[10px] px-2 py-0.5"
                        >
                          <Flame className="w-3 h-3 mr-1" />
                          Siêu Đột Biến
                        </Badge>
                      )}
                      {isSurging && (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5 animate-pulse"
                        >
                          <TrendingUp className="w-3 h-3 mr-1" />
                          Gia Tốc Cao
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteVideo(video.id)}
                        className="w-7 h-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Body: Thumbnail & Video Details */}
                  <div className="flex gap-3.5">
                    <div className="relative w-36 aspect-video rounded-xl overflow-hidden bg-muted/40 shrink-0 border border-border/30 group">
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                        {Math.floor(video.duration / 60)}:
                        {(video.duration % 60).toString().padStart(2, '0')}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleOpenYouTube(video.id, e)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Mở trên YouTube"
                      >
                        <ExternalLink className="w-5 h-5 text-white" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleOpenYouTube(video.id, e)}
                        className="text-xs font-semibold text-foreground line-clamp-2 leading-relaxed hover:text-primary block text-left"
                        title={video.title}
                      >
                        {video.title}
                      </button>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                          <Eye className="w-3 h-3 text-muted-foreground" />
                          {video.views.toLocaleString()} views
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono">
                          <ThumbsUp className="w-3 h-3 text-muted-foreground" />
                          {video.likes.toLocaleString()}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono">
                          <MessageSquare className="w-3 h-3 text-muted-foreground" />
                          {video.comments.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Golden Indicator Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {/* 1. Sub Outlier */}
                    <div className="p-2 rounded-xl bg-muted/40 border border-border/30 text-center">
                      <span className="text-[10px] text-muted-foreground block">Đột Biến Kênh</span>
                      <span className="text-xs font-bold font-mono text-orange-400">
                        🔥 {video.sub_outlier_ratio.toFixed(1)}x
                      </span>
                    </div>

                    {/* 2. Baseline Outlier */}
                    <div className="p-2 rounded-xl bg-muted/40 border border-border/30 text-center">
                      <span className="text-[10px] text-muted-foreground block">
                        Đột Biến Baseline
                      </span>
                      <span className="text-xs font-bold font-mono text-purple-400">
                        ⭐ {video.baseline_outlier_ratio.toFixed(1)}x
                      </span>
                    </div>

                    {/* 3. View Velocity */}
                    <div className="p-2 rounded-xl bg-muted/40 border border-border/30 text-center">
                      <span className="text-[10px] text-muted-foreground block">Vận Tốc View</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        ⚡ {Math.round(video.avg_vph).toLocaleString()}/h
                      </span>
                    </div>

                    {/* 4. Anti-Ads Organic Check */}
                    <div className="p-2 rounded-xl bg-muted/40 border border-border/30 text-center">
                      <span className="text-[10px] text-muted-foreground block">
                        Tương Tác Thật
                      </span>
                      <span className="text-xs font-bold font-mono text-blue-400">
                        🛡️ {(video.engagement_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Audience Demand Signal (phillipmex/yt-outlier-mcp) */}
                  {(() => {
                    try {
                      const dem = JSON.parse(video.demand_signal || '{}');
                      if (dem?.demand_score) {
                        return (
                          <div className="p-2 rounded-xl bg-gradient-to-r from-rose-500/10 via-purple-500/10 to-transparent border border-rose-500/20 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span className="text-[11px] text-foreground font-medium truncate">
                                Tín hiệu khán giả cầu xin:{' '}
                                <strong className="text-rose-400">
                                  {dem.demand_score}% ({dem.demand_level})
                                </strong>
                              </span>
                            </div>
                            {dem.triggers_found && dem.triggers_found.length > 0 && (
                              <div className="flex gap-1 shrink-0">
                                {dem.triggers_found.slice(0, 2).map((tr: string) => (
                                  <Badge
                                    key={tr}
                                    variant="secondary"
                                    className="text-[9px] px-1.5 py-0 bg-rose-500/20 text-rose-300 border-0"
                                  >
                                    &quot;{tr}&quot;
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    } catch {
                      return null;
                    }
                  })()}

                  {/* Sparkline Chart */}
                  <SparklineChart
                    historyJson={video.view_history}
                    momentumScore={video.momentum_score}
                  />

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/30">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>Trạng thái:</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        {video.status}
                      </Badge>
                      {video.bkt_status !== 'none' && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-mono px-1.5 py-0',
                            video.bkt_status === 'green_clean'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                          )}
                        >
                          BKT: {video.bkt_status}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenHookModal(video.id, video.title)}
                        className="h-7 text-xs gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Bóc Tách Hook (30s)</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReupVideo(video)}
                        className="h-7 text-xs gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Reup & Test BKT</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDownloadVideo(video)}
                        className="h-7 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="w-3 h-3" />
                        <span>Tải Ngay</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span>Cấu Hình Bộ Lọc Săn Đề Xuất (Outlier Engine)</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Tùy chỉnh các ngưỡng định lượng để bot chỉ trả về các video đột biến chuẩn xác nhất.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Auto-Pilot Switches */}
            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Kích hoạt Săn Tự Động (Auto-Pilot)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Bot sẽ chạy nền định kỳ theo chu kỳ quét.
                  </p>
                </div>
                <Switch
                  checked={settingsForm.enabled ?? true}
                  onCheckedChange={(c) => setSettingsForm({ ...settingsForm, enabled: c })}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Tự động tải khi video Bùng Nổ
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Chỉ tải khi Momentum &gt;= 1.15 hoặc Baseline Outlier &gt;= 15x.
                  </p>
                </div>
                <Switch
                  checked={settingsForm.auto_download ?? false}
                  onCheckedChange={(c) => setSettingsForm({ ...settingsForm, auto_download: c })}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Tự động đẩy sang Kênh BKT Test
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Đăng ngầm Unlisted và chờ 45 phút kiểm tra bản quyền.
                  </p>
                </div>
                <Switch
                  checked={settingsForm.auto_bkt_test ?? false}
                  onCheckedChange={(c) => setSettingsForm({ ...settingsForm, auto_bkt_test: c })}
                />
              </div>
            </div>

            {/* Threshold Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Số View tối thiểu (Min Views)
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_views ?? 25000}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, min_views: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Số Sub tối đa của kênh (Max Subs)
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.max_subscribers ?? 25000}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, max_subscribers: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Tỷ lệ Đột biến Sub (Min Sub Outlier)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_sub_outlier ?? 5.0}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, min_sub_outlier: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Tỷ lệ Đột biến Baseline (Min Baseline Outlier)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_baseline_outlier ?? 5.0}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      min_baseline_outlier: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Vận tốc View tối thiểu (VPH)
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_vph ?? 300}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, min_vph: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Độ dài tối thiểu (Giây)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_duration ?? 180}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, min_duration: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Tỷ lệ Like/View tối thiểu (Anti-Ads)
                </Label>
                <Input
                  type="number"
                  step="0.005"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_engagement_rate ?? 0.012}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      min_engagement_rate: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Số Comment tối thiểu</Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono"
                  value={settingsForm.min_comments ?? 15}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, min_comments: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            {/* Niches List Editor */}
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Danh Sách Ngách Săn Video
                </Label>
                <span className="text-[10px] text-muted-foreground italic">
                  (Để trống = Tự động quét toàn bộ YouTube)
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nhập ngách mới (ví dụ: creepypasta, podcast, review xe...)"
                  className="h-8 text-xs"
                  value={newNicheInput}
                  onChange={(e) => setNewNicheInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNiche();
                    }
                  }}
                />
                <Button size="sm" onClick={handleAddNiche} className="h-8 text-xs gap-1 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </Button>
              </div>

              {/* Batch Action Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2.5 gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  onClick={() => {
                    const foreignNiches = NICHE_CATALOG.filter((c) =>
                      c.badge.includes('US'),
                    ).flatMap((c) => c.items.map((i) => i.val));
                    try {
                      const cur: string[] = JSON.parse(settingsForm.niches || '[]');
                      const merged = Array.from(new Set([...cur, ...foreignNiches]));
                      setSettingsForm((prev) => ({ ...prev, niches: JSON.stringify(merged) }));
                    } catch {}
                  }}
                >
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  <span>+ Chọn Tất Cả View Ngoại (US/Global)</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2.5 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={() => {
                    const vnNiches = NICHE_CATALOG.filter((c) => c.badge.includes('Việt')).flatMap(
                      (c) => c.items.map((i) => i.val),
                    );
                    try {
                      const cur: string[] = JSON.parse(settingsForm.niches || '[]');
                      const merged = Array.from(new Set([...cur, ...vnNiches]));
                      setSettingsForm((prev) => ({ ...prev, niches: JSON.stringify(merged) }));
                    } catch {}
                  }}
                >
                  <Flame className="w-3 h-3 text-red-400" />
                  <span>+ Chọn Tất Cả View Việt (Hot)</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSettingsForm((prev) => ({ ...prev, niches: '[]' }));
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  <span>Xóa Trắng (Quét Toàn Hệ Thống)</span>
                </Button>
              </div>

              {/* Categorized Niche Catalog Grid */}
              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-semibold text-foreground/80 flex items-center justify-between">
                  <span>Kho Chủ Đề Thịnh Hành (Bấm vào thẻ để bật/tắt):</span>
                  {(() => {
                    try {
                      const list: string[] = JSON.parse(settingsForm.niches || '[]');
                      return (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Đã chọn: <strong className="text-primary">{list.length}</strong> ngách
                        </span>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {NICHE_CATALOG.map((cat) => {
                    let curList: string[] = [];
                    try {
                      curList = JSON.parse(settingsForm.niches || '[]');
                    } catch {
                      curList = [];
                    }

                    return (
                      <div
                        key={cat.category}
                        className="p-2.5 rounded-lg border border-border/40 bg-card/40 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                          <span className="flex items-center gap-1.5">{cat.category}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1.5 py-0 h-3.5',
                              cat.badge.includes('US')
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20',
                            )}
                          >
                            {cat.badge}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {cat.items.map((item) => {
                            const isSelected = curList.includes(item.val);
                            return (
                              <button
                                key={item.val}
                                type="button"
                                onClick={() => {
                                  try {
                                    let cur: string[] = JSON.parse(settingsForm.niches || '[]');
                                    if (cur.includes(item.val)) {
                                      cur = cur.filter((x) => x !== item.val);
                                    } else {
                                      cur.push(item.val);
                                    }
                                    setSettingsForm((prev) => ({
                                      ...prev,
                                      niches: JSON.stringify(cur),
                                    }));
                                  } catch {}
                                }}
                                className={cn(
                                  'px-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border flex items-center gap-1',
                                  isSelected
                                    ? 'bg-primary/15 text-primary border-primary/40 shadow-xs font-semibold'
                                    : 'bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/30',
                                )}
                              >
                                {isSelected ? (
                                  <Check className="w-2.5 h-2.5 text-primary" />
                                ) : (
                                  <Plus className="w-2.5 h-2.5 opacity-40" />
                                )}
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Niches Pills */}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/20">
                {(() => {
                  try {
                    const list: string[] = JSON.parse(settingsForm.niches || '[]');
                    if (list.length === 0) {
                      return (
                        <div className="text-[11px] text-primary/80 bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5 flex items-center gap-1.5 w-full">
                          <Flame className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>
                            Đang bật <strong>Quét Song Song Toàn Hệ Thống</strong>: Mỗi lần quét bot
                            sẽ xoay tua ngẫu nhiên cân bằng giữa các ngách triệu view US/Global và
                            Việt Nam.
                          </span>
                        </div>
                      );
                    }
                    return list.map((n) => (
                      <Badge
                        key={n}
                        variant="secondary"
                        className="text-xs px-2.5 py-1 gap-1.5 bg-muted/60 border border-border/40"
                      >
                        <span>{n}</span>
                        <X
                          className="w-3 h-3 cursor-pointer text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveNiche(n)}
                        />
                      </Badge>
                    ));
                  } catch {
                    return null;
                  }
                })()}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsOpen(false)}
              className="text-xs"
            >
              Hủy
            </Button>
            <Button size="sm" onClick={handleSaveSettings} className="text-xs gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Lưu Cấu Hình</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goldmine Keywords Autocomplete Dialog (Aurora & Open-Tube-SEO) */}
      <Dialog open={isGoldmineOpen} onOpenChange={setIsGoldmineOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Đào Mỏ Vàng Từ Khóa & Phân Tích Ngách Ikigai (YouTube SEO)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Ứng dụng mô hình Ikigai Nhật Bản: Giao thoa giữa (1) Nhu cầu người xem, (2) Khả năng
              làm đều dài hạn và (3) Khả năng kiếm tiền (CPM/Affiliate).
            </DialogDescription>
          </DialogHeader>

          {/* 4 Công Cụ Thẩm Định Ngách */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 pb-1 text-[11px]">
            <div className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <span className="font-bold text-amber-400 block">1. Alphabet Suggest</span>
              <span className="text-muted-foreground text-[10px]">
                Gõ + [a, b, c...] tìm từ khóa đuôi dài
              </span>
            </div>
            <a
              href={`https://trends.google.com/trends/explore?gprop=youtube&q=${encodeURIComponent(goldmineSeed || 'nấu ăn')}`}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors block"
              title="Mở Google Trends phạm vi YouTube Search 12 tháng"
            >
              <span className="font-bold text-blue-400 flex items-center gap-1">
                2. Google Trends <ExternalLink className="w-2.5 h-2.5" />
              </span>
              <span className="text-muted-foreground text-[10px]">Xu hướng YouTube 12 tháng</span>
            </a>
            <div className="p-2 rounded-lg border border-purple-500/30 bg-purple-500/5">
              <span className="font-bold text-purple-400 block">3. Content Gap</span>
              <span className="text-muted-foreground text-[10px]">
                Người xem tìm nhưng thiếu video
              </span>
            </div>
            <div className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
              <span className="font-bold text-emerald-400 block">4. VPH & Đối Thủ</span>
              <span className="text-muted-foreground text-[10px]">
                View Per Hour & Video Viral cũ
              </span>
            </div>
          </div>

          {/* Quick Alphabet Suggest Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none text-[10px]">
            <span className="text-muted-foreground shrink-0 font-medium">Gợi ý a-z:</span>
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k', 'm', 'n', 'p', 's', 't', 'v'].map(
              (ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => {
                    const base = goldmineSeed.trim();
                    const nextQuery = base ? `${base} ${ch}` : ch;
                    setGoldmineSeed(nextQuery);
                    handleSearchGoldmines(nextQuery);
                  }}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 border border-border/40 font-mono font-bold"
                >
                  +{ch}
                </button>
              ),
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nhập từ khóa hạt giống (ví dụ: review phim, podcast, kể chuyện...)"
                className="h-9 text-xs pl-8 font-medium"
                value={goldmineSeed}
                onChange={(e) => setGoldmineSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchGoldmines();
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={() => handleSearchGoldmines()}
              disabled={isSearchingGoldmines || !goldmineSeed.trim()}
              className="h-9 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow"
            >
              <Sparkles className={cn('w-3.5 h-3.5', isSearchingGoldmines && 'animate-spin')} />
              <span>{isSearchingGoldmines ? 'Đang đào...' : 'Đào Mỏ Vàng'}</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[420px] space-y-1.5 pr-1 pt-2">
            {isSearchingGoldmines ? (
              <div className="py-20 text-center space-y-2 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                <p className="text-xs">Đang vét cạn các gợi ý tìm kiếm ngách từ YouTube...</p>
              </div>
            ) : goldmineKeywords.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-muted-foreground">
                <Search className="w-8 h-8 opacity-40 mx-auto" />
                <p className="text-xs">
                  Nhập từ khóa và bấm &quot;Đào Mỏ Vàng&quot; để tìm các cụm từ khóa có lượng tìm
                  kiếm bùng nổ.
                </p>
              </div>
            ) : (
              goldmineKeywords.map((item) => (
                <div
                  key={item.keyword}
                  className="p-2.5 rounded-xl bg-card border border-border/50 hover:border-border flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-mono px-1.5 py-0 font-bold shrink-0',
                        item.badge === 'GEM'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : item.badge === 'HOT'
                            ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                            : 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                      )}
                    >
                      {item.badge} {item.opportunity_score}/100
                    </Badge>
                    <span className="font-medium text-foreground truncate">{item.keyword}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.keyword);
                        toast.success({
                          title: 'Đã sao chép từ khóa',
                          description: item.keyword,
                        });
                      }}
                      className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      title="Sao chép từ khóa"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Sao chép</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddGoldmineToNiches(item.keyword)}
                      className="h-6 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm vào ngách</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsGoldmineOpen(false)}
              className="text-xs"
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hook & Transcript Anatomy Dialog (ViralMint & Open-Tube-SEO) */}
      <Dialog open={isHookModalOpen} onOpenChange={setIsHookModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <FileText className="w-4 h-4 text-purple-400" />
              <span>Bóc Tách Cấu Trúc Hook 30s & Dàn Ý Kịch Bản</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground line-clamp-1">
              {hookTargetTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-2">
            {isLoadingHook ? (
              <div className="py-20 text-center space-y-2 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                <p className="text-xs">
                  Đang trích xuất phụ đề và giải phẫu câu Hook giữ chân khán giả...
                </p>
              </div>
            ) : !hookData?.has_transcript ? (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Video này không có phụ đề công khai (CC/Transcript) từ YouTube.
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  Bạn có thể tải video xuống và dùng mô hình Whisper cục bộ trong ứng dụng để bóc
                  tách âm thanh tự động.
                </p>
              </div>
            ) : (
              <>
                {/* 1. Retention Hook (30s) */}
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                      🎣 Câu Hook 30 Giây Đầu (Retention Hook):
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (hookData?.hook_30s) {
                          navigator.clipboard.writeText(hookData.hook_30s);
                          toast.success({ title: 'Đã sao chép câu Hook' });
                        }
                      }}
                      className="h-6 text-[10px] gap-1 text-purple-300 hover:bg-purple-500/20"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Sao chép</span>
                    </Button>
                  </div>
                  <blockquote className="text-xs text-foreground italic border-l-2 border-purple-400 pl-2.5 leading-relaxed">
                    &quot;{hookData.hook_30s}&quot;
                  </blockquote>
                </div>

                {/* 2. Key Points / Outline */}
                {hookData.key_points && hookData.key_points.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      📑 Dàn Ý & Mốc Thời Gian Cốt Lõi:
                    </span>
                    <div className="space-y-1">
                      {hookData.key_points.map((pt, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-card/60 border border-border/40 text-xs flex items-start gap-2"
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono px-1.5 py-0 bg-muted/40 shrink-0"
                          >
                            {pt.timestamp}
                          </Badge>
                          <span className="text-muted-foreground line-clamp-2">{pt.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Full Transcript Preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      📄 Toàn Bộ Kịch Bản ({hookData.total_words?.toLocaleString()} từ):
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (hookData?.full_transcript_preview) {
                          navigator.clipboard.writeText(hookData.full_transcript_preview);
                          toast.success({ title: 'Đã sao chép kịch bản' });
                        }
                      }}
                      className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Sao chép</span>
                    </Button>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/30 text-xs text-muted-foreground max-h-40 overflow-y-auto leading-relaxed">
                    {hookData.full_transcript_preview}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHookModalOpen(false)}
              className="text-xs"
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
