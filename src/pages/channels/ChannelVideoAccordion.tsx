import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChannelVideo } from '@/lib/types';
import { parseVideoUploadEpoch } from '@/pages/channels/channelUtils';
import { ChannelVideoFilterBar } from './accordion/ChannelVideoFilterBar';
import { ChannelVideoRow } from './accordion/ChannelVideoRow';
import { ChannelVideoToolbar } from './accordion/ChannelVideoToolbar';
import type {
  ChannelVideoAccordionProps,
  FilterType,
  SortOption,
  TimeFilterOption,
} from './accordion/types';
import { useChannelVideoWorkflows } from './accordion/useChannelVideoWorkflows';

export type { ChannelVideoAccordionProps } from './accordion/types';

/**
 * ChannelVideoAccordion:
 * Flow Safety Guarantee: Sạch Bản Quyền; chờ thao tác đăng Kênh Đích.
 */
export function ChannelVideoAccordion({
  channelName,
  videos,
  isLoading,
  selectedVideoIds,
  onToggleVideoSelection,
  onSelectAll,
  onDeselectAll,
  onDownloadSelected,
  isDownloading,
  downloadingVideoIds,
  videoStates,
  onDownloadSingleVideo,
  channel,
}: ChannelVideoAccordionProps) {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Video counts for category tabs
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

  // Intermediate filtered and sorted videos (used by workflows hook and render list)
  const filteredAndSortedVideos = useMemo(() => {
    // 1. Tab filter
    let list = videos.filter((v) => {
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
        return parseVideoUploadEpoch(b) - parseVideoUploadEpoch(a);
      }
      if (sortBy === 'oldest') {
        return parseVideoUploadEpoch(a) - parseVideoUploadEpoch(b);
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
  }, [videos, filterType, searchQuery, sortBy, timeFilter]);

  // Decoupled automation workflows & background listeners
  const {
    latestBktJobMap,
    videoOverrides,
    activeJobPhases,
    testingVideoId,
    jobActionId,
    isBatchTestingBkt,
    isSequentialTop5Running,
    sequentialProgressText,
    isBatchReupPublishing,
    batchReupProgressText,
    handleBktJobAction,
    handleRunSequentialTop5AutoPilot,
    handleStopSequentialTop5,
    handleDirectEditAndPublishSingle,
    handleBatchEditAndPublishSelected,
    handleStopBatchReupPublish,
    handleBatchBktSelected,
    handleTriggerBktTest,
  } = useChannelVideoWorkflows({
    channelName,
    videos,
    filteredAndSortedVideos,
    selectedVideoIds,
    onDownloadSelected,
    channel,
  });

  // Videos merged with live videoOverrides
  const mergedVideos = useMemo(() => {
    return filteredAndSortedVideos.map((v) => {
      const override = (v.id && videoOverrides[v.id]) || videoOverrides[v.video_id];
      return override ? { ...v, ...override } : v;
    });
  }, [filteredAndSortedVideos, videoOverrides]);

  // Chunked rendering pagination
  const [visibleCount, setVisibleCount] = useState<number>(30);
  const filterKey = `${searchQuery}:${filterType}:${timeFilter}:${sortBy}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(30);
  }

  const visibleVideos = useMemo(() => {
    return mergedVideos.slice(0, visibleCount);
  }, [mergedVideos, visibleCount]);

  const allFilteredSelected = useMemo(() => {
    if (mergedVideos.length === 0) return false;
    return mergedVideos.every((v) => selectedVideoIds.has(v.video_id));
  }, [mergedVideos, selectedVideoIds]);

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      onDeselectAll();
    } else {
      onSelectAll(mergedVideos.map((v) => v.video_id));
    }
  };

  const handleQuickSelectTop = (num: number) => {
    const slice = mergedVideos.slice(0, num);
    onDeselectAll();
    for (const v of slice) {
      onToggleVideoSelection(v.video_id);
    }
  };

  const selectedCount = useMemo(() => {
    return mergedVideos.filter((v) => selectedVideoIds.has(v.video_id)).length;
  }, [mergedVideos, selectedVideoIds]);

  const handleDownloadSingle = useCallback(
    (video: ChannelVideo) => {
      if (onDownloadSingleVideo) {
        onDownloadSingleVideo(video);
      } else {
        onDownloadSelected([video]);
      }
    },
    [onDownloadSingleVideo, onDownloadSelected],
  );

  return (
    <div className="border-t border-border/50 bg-background/50 p-4 sm:p-5 flex flex-col gap-3.5">
      {/* 1. Top Search & Filter Toolbar */}
      <ChannelVideoToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAll={handleToggleSelectAll}
        disabledSelectAll={mergedVideos.length === 0}
        selectedCount={selectedCount}
        isDownloading={isDownloading}
        onDownloadSelected={() => {
          const selectedList = mergedVideos.filter((v) => selectedVideoIds.has(v.video_id));
          onDownloadSelected(selectedList);
        }}
        isBatchTestingBkt={isBatchTestingBkt}
        onBatchBktSelected={handleBatchBktSelected}
        isBatchReupPublishing={isBatchReupPublishing}
        batchReupProgressText={batchReupProgressText}
        onBatchEditAndPublishSelected={handleBatchEditAndPublishSelected}
        onStopBatchReupPublish={handleStopBatchReupPublish}
        isSequentialTop5Running={isSequentialTop5Running}
        sequentialProgressText={sequentialProgressText}
        onRunSequentialTop5={handleRunSequentialTop5AutoPilot}
        onStopSequentialTop5={handleStopSequentialTop5}
        hasVideos={mergedVideos.length > 0}
      />

      {/* 2. Filter Tabs, Time Window & Quick Selection */}
      <ChannelVideoFilterBar
        totalCount={videos.length}
        videoCounts={videoCounts}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        onQuickSelectTop={handleQuickSelectTop}
      />

      {/* 3. Video List Container */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Đang tải danh sách video...
        </div>
      ) : mergedVideos.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border/60">
          {searchQuery
            ? 'Không tìm thấy video nào khớp với từ khóa tìm kiếm.'
            : 'Chưa có video nào thuộc danh mục này trong cơ sở dữ liệu.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-border/40 rounded-lg border border-border/40 bg-card overflow-hidden max-h-[460px] overflow-y-auto">
          {visibleVideos.map((video) => {
            const isSelected = selectedVideoIds.has(video.video_id);
            const linkedJob =
              (video.id ? latestBktJobMap.get(video.id) : undefined) ||
              (video.video_id ? latestBktJobMap.get(video.video_id) : undefined);
            const activePhase = activeJobPhases[video.id] || activeJobPhases[video.video_id];
            const isTestingThisVideo = testingVideoId === (video.id || video.video_id);
            const isJobActionBusy = linkedJob ? jobActionId === linkedJob.id : false;
            const downloadState =
              videoStates?.get(video.video_id) ||
              (video.id ? videoStates?.get(video.id) : undefined);
            const isDownloadingThisVideo = Boolean(
              (downloadingVideoIds &&
                (downloadingVideoIds.has(video.video_id) ||
                  (video.id ? downloadingVideoIds.has(video.id) : false))) ||
                downloadState?.status === 'downloading' ||
                video.status === 'downloading',
            );

            return (
              <ChannelVideoRow
                key={video.id || video.video_id}
                video={video}
                isSelected={isSelected}
                onToggleSelect={onToggleVideoSelection}
                onDownloadSingle={handleDownloadSingle}
                isDownloadingSingle={isDownloadingThisVideo}
                downloadState={downloadState}
                linkedJob={linkedJob}
                activePhase={activePhase}
                isTestingThisVideo={isTestingThisVideo}
                isJobActionBusy={isJobActionBusy}
                onTriggerBktTest={handleTriggerBktTest}
                onBktJobAction={handleBktJobAction}
                onDirectEditAndPublish={handleDirectEditAndPublishSingle}
              />
            );
          })}

          {mergedVideos.length > visibleCount && (
            <div className="flex items-center justify-between p-3 bg-muted/20 border-t border-border/40 text-xs text-muted-foreground">
              <span>
                Đang hiển thị {visibleCount} / {mergedVideos.length} video
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((prev) => Math.min(prev + 30, mergedVideos.length))
                  }
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Tải thêm (+30)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(mergedVideos.length)}
                  className="h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Hiển thị tất cả
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
