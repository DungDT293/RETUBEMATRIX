import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Download,
  ExternalLink,
  Film,
  Flame,
  FlaskConical,
  Loader2,
  PlaySquare,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { checkBktCopyrightStatus, triggerBktTestVideo } from '@/contexts/channels/channels-client';
import type { ChannelVideo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDuration, formatUploadDateTime } from '@/pages/channels/channelUtils';

interface ChannelVideoAccordionProps {
  channelName: string;
  videos: ChannelVideo[];
  isLoading: boolean;
  selectedVideoIds: Set<string>;
  onToggleVideoSelection: (videoId: string) => void;
  onSelectAll: (videoIds: string[]) => void;
  onDeselectAll: () => void;
  onDownloadSelected: (videos: ChannelVideo[]) => void;
  isDownloading: boolean;
  onDeleteVideo?: (videoId: string) => void;
}

type FilterType = 'all' | 'video' | 'shorts' | 'stream';
type TimeFilterOption = 'all' | '3d' | '7d';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'views_desc'
  | 'duration_desc'
  | 'duration_asc'
  | 'title_asc';

function formatCompactViews(count?: number): string | null {
  if (count == null) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M xem`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K xem`;
  return `${count} xem`;
}

export function ChannelVideoAccordion({
  videos,
  isLoading,
  selectedVideoIds,
  onToggleVideoSelection,
  onSelectAll,
  onDeselectAll,
  onDownloadSelected,
  isDownloading,
}: ChannelVideoAccordionProps) {
  const toast = useToast();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [testingVideoId, setTestingVideoId] = useState<string | null>(null);
  const [checkingVideoId, setCheckingVideoId] = useState<string | null>(null);
  const [isBatchTestingBkt, setIsBatchTestingBkt] = useState<boolean>(false);
  const [videoOverrides, setVideoOverrides] = useState<Record<string, Partial<ChannelVideo>>>({});

  const handleBatchBktSelected = async () => {
    const selectedList = filteredAndSortedVideos.filter((v) => selectedVideoIds.has(v.video_id));
    if (selectedList.length === 0) return;

    setIsBatchTestingBkt(true);
    let successCount = 0;
    const newOverrides: Record<string, Partial<ChannelVideo>> = {};

    for (const v of selectedList) {
      try {
        await triggerBktTestVideo({
          channelVideoId: v.id || v.video_id,
          channelId: v.channel_id || null,
        });
        successCount++;
        newOverrides[v.id || v.video_id] = {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang xếp hàng test kênh BKT...',
        };
        newOverrides[v.video_id] = {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang xếp hàng test kênh BKT...',
        };
      } catch (err) {
        console.error('Batch BKT test item failed:', err);
      }
    }

    setVideoOverrides((prev) => ({ ...prev, ...newOverrides }));
    setIsBatchTestingBkt(false);

    if (successCount > 0) {
      toast.success({
        title: 'Đã gửi sang Kênh Test Bản Quyền',
        description: `Đã đưa ${successCount}/${selectedList.length} video vào hàng đợi Reup & Test BKT.`,
      });
    } else {
      toast.error({
        title: 'Lỗi gửi test BKT',
        description: 'Không thể kích hoạt test bản quyền cho các video đã chọn.',
      });
    }
  };

  const handleTriggerBktTest = async (videoId: string, dbId?: string, channelId?: string) => {
    const targetId = dbId || videoId;
    setTestingVideoId(targetId);
    try {
      await triggerBktTestVideo({
        channelVideoId: targetId,
        channelId: channelId || null,
      });
      setVideoOverrides((prev) => ({
        ...prev,
        [targetId]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang xếp hàng test kênh BKT...',
        },
        [videoId]: {
          is_bkt_test: true,
          bkt_check_status: 'pending',
          bkt_restriction: 'Đang xếp hàng test kênh BKT...',
        },
      }));
      toast.success({
        title: 'Kích hoạt Test BKT thành công',
        message: 'Đã đưa video vào hàng đợi Reup Pipeline v1 & kiểm tra kênh BKT.',
      });
    } catch (e) {
      console.error('Trigger BKT test failed:', e);
      toast.error({
        title: 'Lỗi kích hoạt Test BKT',
        message: String(e),
      });
    } finally {
      setTestingVideoId(null);
    }
  };

  const handleCheckBktStatus = async (videoId: string, dbId?: string) => {
    const targetId = dbId || videoId;
    setCheckingVideoId(targetId);
    try {
      const res = await checkBktCopyrightStatus({ channelVideoId: targetId });
      const itemResult = res?.results?.[videoId] || res?.results?.[targetId];
      if (itemResult) {
        const resolvedStatus =
          itemResult.bkt_check_status === 'green_clean' ||
          itemResult.bkt_check_status === 'red_matched' ||
          itemResult.bkt_check_status === 'pending'
            ? itemResult.bkt_check_status
            : 'pending';

        setVideoOverrides((prev) => ({
          ...prev,
          [targetId]: {
            bkt_check_status: resolvedStatus,
            bkt_restriction: itemResult.bkt_restriction,
          },
          [videoId]: {
            bkt_check_status: resolvedStatus,
            bkt_restriction: itemResult.bkt_restriction,
          },
        }));
        if (resolvedStatus === 'green_clean') {
          toast.success({
            title: 'Sạch Bản Quyền (Clean)',
            message: 'YouTube Studio không phát hiện bất kỳ hạn chế nào.',
          });
        } else if (resolvedStatus === 'red_matched') {
          toast.error({
            title: 'Dính Bản Quyền (Content ID)',
            message: itemResult.bkt_restriction || 'Đã tự động kích hoạt Reup Lv.2.',
          });
        } else {
          toast.info({
            title: 'Đang kiểm tra...',
            message: 'YouTube Studio vẫn đang xử lý kiểm tra video.',
          });
        }
      } else if (res?.error) {
        toast.warning({
          title: 'Thông báo quét BKT',
          message: res.error,
        });
      } else {
        toast.info({
          title: 'Quét hoàn tất',
          message: 'Đã hoàn thành kiểm tra trạng thái trên YouTube Studio.',
        });
      }
    } catch (e) {
      console.error('Check BKT status failed:', e);
      toast.error({
        title: 'Lỗi quét trạng thái BKT',
        message: String(e),
      });
    } finally {
      setCheckingVideoId(null);
    }
  };

  const videoCounts = useMemo(() => {
    let regular = 0;
    let shorts = 0;
    let stream = 0;
    for (const v of videos) {
      const vt = v.video_type || '';
      if (vt === 'stream' || vt === 'live' || v.url.includes('/live/')) {
        stream++;
      } else if (vt === 'shorts' || vt === 'short' || v.url.includes('/shorts/')) {
        shorts++;
      } else {
        regular++;
      }
    }
    return { regular, shorts, stream };
  }, [videos]);

  const filteredAndSortedVideos = useMemo(() => {
    // 0. Merge state overrides
    const listMerged = videos.map((v) => {
      const override = (v.id && videoOverrides[v.id]) || videoOverrides[v.video_id];
      return override ? { ...v, ...override } : v;
    });

    // 1. Tab filter
    let list = listMerged.filter((v) => {
      if (filterType === 'all') return true;
      const vt = v.video_type || '';
      const resolvedType =
        vt === 'stream' || vt === 'live' || v.url.includes('/live/')
          ? 'stream'
          : vt === 'shorts' || vt === 'short' || v.url.includes('/shorts/')
            ? 'shorts'
            : 'video';
      return resolvedType === filterType;
    });

    // 2. Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((v) => (v.title || '').toLowerCase().includes(query));
    }

    // 2.5 Time filter (3 days, 7 days)
    if (timeFilter === '3d') {
      const limitSec = Math.floor(Date.now() / 1000) - 3 * 86400;
      list = list.filter((v) => (v.upload_timestamp ?? 0) >= limitSec);
    } else if (timeFilter === '7d') {
      const limitSec = Math.floor(Date.now() / 1000) - 7 * 86400;
      list = list.filter((v) => (v.upload_timestamp ?? 0) >= limitSec);
    }

    // 3. Sorting
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') {
        const timeA = a.upload_timestamp ?? (a.upload_date ? parseInt(a.upload_date, 10) : 0) ?? 0;
        const timeB = b.upload_timestamp ?? (b.upload_date ? parseInt(b.upload_date, 10) : 0) ?? 0;
        return timeB - timeA;
      }
      if (sortBy === 'oldest') {
        const timeA = a.upload_timestamp ?? (a.upload_date ? parseInt(a.upload_date, 10) : 0) ?? 0;
        const timeB = b.upload_timestamp ?? (b.upload_date ? parseInt(b.upload_date, 10) : 0) ?? 0;
        return timeA - timeB;
      }
      if (sortBy === 'views_desc') {
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      }
      if (sortBy === 'duration_desc') {
        return (b.duration ?? 0) - (a.duration ?? 0);
      }
      if (sortBy === 'duration_asc') {
        return (a.duration ?? 0) - (b.duration ?? 0);
      }
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });
  }, [videos, filterType, searchQuery, sortBy, videoOverrides, timeFilter]);

  const allFilteredSelected = useMemo(() => {
    if (filteredAndSortedVideos.length === 0) return false;
    return filteredAndSortedVideos.every((v) => selectedVideoIds.has(v.video_id));
  }, [filteredAndSortedVideos, selectedVideoIds]);

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      onDeselectAll();
    } else {
      onSelectAll(filteredAndSortedVideos.map((v) => v.video_id));
    }
  };

  const selectedCount = useMemo(() => {
    return filteredAndSortedVideos.filter((v) => selectedVideoIds.has(v.video_id)).length;
  }, [filteredAndSortedVideos, selectedVideoIds]);

  return (
    <div className="border-t border-border/50 bg-background/50 p-4 sm:p-5 flex flex-col gap-3.5">
      {/* Top Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm tiêu đề video đối thủ..."
            className="pl-8 pr-8 h-8 text-xs bg-muted/40 border-border/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Selector & Batch Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Sắp xếp Viral / Lượt xem / Thời lượng */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline flex items-center gap-1">
              <ArrowDownUp className="w-3 h-3" />
              Sắp xếp:
            </span>
            <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
              <SelectTrigger className="h-8 text-xs min-w-[145px] bg-muted/40 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="text-xs">
                  🕒 Mới nhất
                </SelectItem>
                <SelectItem value="views_desc" className="text-xs">
                  ⚡ Xem nhiều nhất (Viral)
                </SelectItem>
                <SelectItem value="duration_desc" className="text-xs">
                  ⌛ Dài nhất (Thời lượng)
                </SelectItem>
                <SelectItem value="duration_asc" className="text-xs">
                  ⏱️ Ngắn nhất (Thời lượng)
                </SelectItem>
                <SelectItem value="oldest" className="text-xs">
                  ⏳ Cũ nhất
                </SelectItem>
                <SelectItem value="title_asc" className="text-xs">
                  🔤 Tiêu đề A-Z
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Batch download action */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleSelectAll}
              className="h-8 text-xs gap-1.5"
              disabled={filteredAndSortedVideos.length === 0}
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>{allFilteredSelected ? 'Bỏ chọn' : 'Chọn tất cả'}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const selectedList = filteredAndSortedVideos.filter((v) =>
                  selectedVideoIds.has(v.video_id),
                );
                onDownloadSelected(selectedList);
              }}
              disabled={selectedCount === 0 || isDownloading}
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải {selectedCount} video sạch</span>
            </Button>

            {selectedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchBktSelected}
                disabled={isBatchTestingBkt}
                className="h-8 text-xs gap-1.5 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-medium"
                title="Gửi các video đã chọn vào hàng đợi Kênh Test Bản Quyền"
              >
                {isBatchTestingBkt ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                ) : (
                  <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Test BKT ({selectedCount})</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs, Time Window & Quick Selection */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Filter Tabs (All / Video / Shorts / Stream) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs w-fit">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors',
              filterType === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tất cả ({videos.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('video')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'video'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Film className="w-3 h-3 text-primary" />
            Video dài ({videoCounts.regular})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('shorts')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'shorts'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <PlaySquare className="w-3 h-3 text-rose-500" />
            Shorts ({videoCounts.shorts})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('stream')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              filterType === 'stream'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Radio className="w-3 h-3 text-red-500" />
            Trực tiếp ({videoCounts.stream})
          </button>
        </div>

        {/* Time Window (All / 3 Days / 7 Days) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
          <span className="text-[10px] text-muted-foreground px-1.5 font-medium flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Khung giờ:
          </span>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('3d')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === '3d'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            3 ngày qua
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('7d')}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              timeFilter === '7d'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            7 ngày qua
          </button>
        </div>

        {/* Quick Pick (Top 5 / Top 10 / Top 20) */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>Chọn nhanh:</span>
          {[5, 10, 20].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                const slice = filteredAndSortedVideos.slice(0, num);
                onDeselectAll();
                for (const v of slice) {
                  onToggleVideoSelection(v.video_id);
                }
              }}
              className="px-2 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground border border-border/40 text-[10px] font-semibold transition-colors"
            >
              Top {num}
            </button>
          ))}
        </div>
      </div>

      {/* Video List */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Đang tải danh sách video...
        </div>
      ) : filteredAndSortedVideos.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/60">
          {searchQuery
            ? 'Không tìm thấy video nào khớp với từ khóa tìm kiếm.'
            : 'Chưa có video nào thuộc danh mục này trong cơ sở dữ liệu.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-border/40 rounded-lg border border-border/40 bg-card overflow-hidden max-h-[460px] overflow-y-auto">
          {filteredAndSortedVideos.map((video) => {
            const isSelected = selectedVideoIds.has(video.video_id);
            const isDownloaded = video.status === 'downloaded';
            const viewsStr = formatCompactViews(video.view_count);

            return (
              <div
                key={video.id || video.video_id}
                className={cn(
                  'flex items-center gap-3 p-3 transition-colors hover:bg-muted/40',
                  isSelected && 'bg-primary/5',
                )}
              >
                {/* Select Checkbox */}
                <button
                  type="button"
                  onClick={() => onToggleVideoSelection(video.video_id)}
                  className="p-1 text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                {/* Thumbnail & duration */}
                <div className="relative w-24 sm:w-28 h-14 sm:h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Film className="w-5 h-5" />
                    </div>
                  )}
                  {video.duration ? (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded font-mono">
                      {formatDuration(video.duration)}
                    </span>
                  ) : null}
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className="text-xs sm:text-sm font-medium leading-snug line-clamp-2 text-foreground"
                      title={video.title}
                    >
                      {video.title}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                    {/* KHÂU 1: Risk Status Badge (Xanh / Đỏ) */}
                    {video.risk_status === 'red' ? (
                      <Badge
                        variant="outline"
                        className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                        title={video.risk_reason || 'Rủi ro bản quyền cao hoặc trùng lặp lịch sử'}
                      >
                        <ShieldAlert className="w-3 h-3 text-red-400" />
                        <span>Đỏ - Rủi ro / Chặn</span>
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
                        title={video.risk_reason || 'Kênh ngách an toàn / Nội dung sạch'}
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Xanh - Sạch & An toàn</span>
                      </Badge>
                    )}

                    {/* KHÂU 3: Pipeline Reup Level */}
                    {video.reup_pipeline_level === 1 && (
                      <Badge
                        variant="outline"
                        className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
                        title="Đã qua Reup Pipeline Lv.1 (95% gốc - 5% lách nhẹ, đổi Hash MD5/SHA256)"
                      >
                        <Wand2 className="w-3 h-3 text-blue-400" />
                        <span>Pipeline Lv.1 (5%)</span>
                      </Badge>
                    )}
                    {video.reup_pipeline_level === 2 && (
                      <Badge
                        variant="outline"
                        className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
                        title="Đã qua Reup Pipeline Lv.2 (Lách sâu Deep Evasion)"
                      >
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>Pipeline Lv.2 (Deep)</span>
                      </Badge>
                    )}

                    {/* KHÂU 4: BKT Shadow Check Status */}
                    {(Boolean(video.is_bkt_test) || video.bkt_check_status) && (
                      <>
                        {video.bkt_check_status === 'green_clean' && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>BKT: Sạch Bản Quyền</span>
                          </Badge>
                        )}
                        {video.bkt_check_status === 'red_matched' && (
                          <Badge
                            variant="outline"
                            className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 cursor-help"
                            title={video.bkt_restriction || 'YouTube phát hiện bản quyền'}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>
                              BKT: Dính ({video.bkt_restriction || 'Bản quyền'}) -&gt; Lv.2
                            </span>
                          </Badge>
                        )}
                        {(!video.bkt_check_status || video.bkt_check_status === 'pending') && (
                          <div className="inline-flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 animate-pulse"
                            >
                              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                              <span>BKT: Chờ YouTube Check</span>
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCheckBktStatus(video.video_id, video.id)}
                              disabled={checkingVideoId === (video.id || video.video_id)}
                              className="h-5 px-1.5 text-[10px] gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              title="Quét trạng thái hạn chế trên YouTube Studio ngay"
                            >
                              <RefreshCw
                                className={cn(
                                  'w-2.5 h-2.5',
                                  checkingVideoId === (video.id || video.video_id) &&
                                    'animate-spin',
                                )}
                              />
                              <span>Quét kết quả</span>
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    {(() => {
                      const uploadTimeStr = formatUploadDateTime(
                        video.upload_date,
                        video.upload_timestamp,
                        video.created_at,
                      );
                      if (!uploadTimeStr) return null;
                      return (
                        <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/60 px-2 py-0.5 rounded font-mono text-[10px] border border-border/40">
                          <Calendar className="w-3 h-3 text-primary/80" />
                          <span>{uploadTimeStr}</span>
                        </span>
                      );
                    })()}

                    {viewsStr && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium text-[10px] border border-amber-500/20">
                        <Flame className="w-3 h-3" />
                        <span>{viewsStr}</span>
                      </span>
                    )}

                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary transition-colors inline-flex items-center gap-0.5 text-[10px]"
                    >
                      <span>Xem link</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* Status Badge & Action */}
                <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                  {/* Nút bấm Test trên kênh BKT cho video Màu Đỏ */}
                  {video.risk_status === 'red' && !video.is_bkt_test && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleTriggerBktTest(video.video_id, video.id, video.channel_id)
                      }
                      disabled={testingVideoId === (video.id || video.video_id)}
                      className="h-7 px-2 text-[11px] gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
                      title="Tải về, chạy Reup Pipeline v1 và tải lên kênh BKT để test nhận diện"
                    >
                      <FlaskConical
                        className={cn(
                          'w-3 h-3 text-amber-500',
                          testingVideoId === (video.id || video.video_id) && 'animate-spin',
                        )}
                      />
                      <span>Test BKT</span>
                    </Button>
                  )}

                  {isDownloaded ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs"
                    >
                      Đã tải về
                    </Badge>
                  ) : video.status === 'skipped' ? (
                    <Badge
                      variant="outline"
                      className="text-xs text-muted-foreground/70 border-dashed"
                    >
                      Đã bỏ qua
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs text-muted-foreground">
                      Chưa tải
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
