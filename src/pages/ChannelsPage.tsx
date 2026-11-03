import { FolderDown, Globe, Loader2, Plus, RefreshCw, Search, Tv } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAllChannelStats,
  getSavedChannelVideos,
  toggleChannelAutoDownload,
} from '@/contexts/channels/channels-client';
import { isSupportedPlatform } from '@/contexts/channels/useChannelsController';
import { useChannels } from '@/contexts/channels-context';
import type {
  ChannelStats,
  ChannelVideo,
  FollowedChannel,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelCard } from '@/pages/channels/ChannelCard';
import { ChannelVideoAccordion } from '@/pages/channels/ChannelVideoAccordion';

export function ChannelsPage() {
  const {
    followedChannels,
    refreshChannels,
    followChannel,
    unfollowChannel,
    checkingChannelIds,
    checkChannelNow,
    isDownloading,
    outputPath,
    selectOutputFolder,
    downloadSelectedVideos,
    updateChannelSettings,
  } = useChannels();

  // Search & Add new channel state
  const [urlInput, setUrlInput] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Stats for all channels
  const [statsMap, setStatsMap] = useState<Record<string, ChannelStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  // Expanded channel id (accordion)
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  // Videos of expanded channel
  const [channelVideosMap, setChannelVideosMap] = useState<Record<string, ChannelVideo[]>>({});
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Selected videos for batch download
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Load stats for all channels
  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const statsList = await getAllChannelStats();
      const map: Record<string, ChannelStats> = {};
      for (const item of statsList) {
        map[item.channel_id] = item;
      }
      setStatsMap(map);
    } catch (e) {
      console.error('Failed to load channel stats:', e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Load videos when a channel is expanded
  const handleToggleExpand = useCallback(
    async (channelId: string) => {
      if (expandedChannelId === channelId) {
        setExpandedChannelId(null);
        setSelectedVideoIds(new Set());
        return;
      }

      setExpandedChannelId(channelId);
      setSelectedVideoIds(new Set());

      // If not yet fetched or want fresh
      setLoadingVideos(true);
      try {
        const videos = await getSavedChannelVideos({
          channelId,
          status: null,
          limit: 0, // 0 = lấy toàn bộ video đã quét
        });
        setChannelVideosMap((prev) => ({ ...prev, [channelId]: videos }));
      } catch (err) {
        console.error('Failed to get saved channel videos:', err);
      } finally {
        setLoadingVideos(false);
      }
    },
    [expandedChannelId],
  );

  // Handle Add channel
  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url || !isSupportedPlatform(url)) return;

    setAddingChannel(true);
    try {
      const contentType: YoutubeChannelContentType = 'all';
      await followChannel(url, url, undefined, undefined, contentType);
      setUrlInput('');
      await refreshChannels();
      await refreshStats();
    } catch (err) {
      console.error('Add channel failed:', err);
    } finally {
      setAddingChannel(false);
    }
  };

  // Handle Check now for single channel
  const handleCheckNow = async (channel: FollowedChannel) => {
    try {
      await checkChannelNow(channel);
      await refreshStats();
      // Refresh video list
      const videos = await getSavedChannelVideos({
        channelId: channel.id,
        status: null,
        limit: 0, // 0 = lấy toàn bộ video
      });
      setChannelVideosMap((prev) => ({ ...prev, [channel.id]: videos }));
    } catch (err) {
      console.error('Check channel failed:', err);
    }
  };

  // Handle Toggle Auto Download
  const handleToggleAutoDownload = async (channelId: string, enabled: boolean) => {
    try {
      await toggleChannelAutoDownload(channelId, enabled);
      await refreshChannels();
    } catch (err) {
      console.error('Toggle auto download failed:', err);
    }
  };

  // Video selection helpers
  const handleToggleVideoSelection = (videoId: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const handleSelectAllVideos = (videoIds: string[]) => {
    setSelectedVideoIds(new Set(videoIds));
  };

  const handleDeselectAllVideos = () => {
    setSelectedVideoIds(new Set());
  };

  // Batch download selected videos
  const handleDownloadSelected = async (videosToDownload: ChannelVideo[]) => {
    if (videosToDownload.length === 0) return;
    const channel = followedChannels.find((c) => c.id === expandedChannelId);
    const entries = videosToDownload.map((v) => ({
      id: v.video_id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail || undefined,
      duration: v.duration || undefined,
    }));
    try {
      await downloadSelectedVideos(
        channel?.download_quality || 'best',
        channel?.download_format || 'mp4',
        channel?.download_video_codec || 'auto',
        channel?.download_preferred_fps || 'original',
        entries,
        channel?.url,
        channel?.name,
      );
    } catch (err) {
      console.error('Failed to download selected videos:', err);
    }
  };

  // Filter channels by search
  const filteredChannels = followedChannels.filter(
    (c) =>
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.url.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex-shrink-0 border-b border-border/50 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm shadow-primary/10">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg leading-tight">
              Theo dõi Kênh & Phân tích Đăng Video
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                Theo dõi kênh, nhận biết khung giờ thường đăng & tự động tải video sạch
              </p>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-time RSS • Chạy ngầm Khay hệ thống
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {outputPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={selectOutputFolder}
              className="hidden md:inline-flex h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <FolderDown className="w-3.5 h-3.5 text-primary" />
              <span className="max-w-[140px] truncate">{outputPath}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await refreshChannels();
              await refreshStats();
            }}
            disabled={loadingStats}
            className="h-8 gap-1 text-xs"
            title="Làm mới thống kê"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loadingStats && 'animate-spin')} />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>

          <ThemePicker />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Add Channel & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Add Channel Form */}
          <form onSubmit={handleAddChannel} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Dán link kênh YouTube (ví dụ: https://www.youtube.com/@ChannelName)..."
                className="pl-9 h-10 text-sm bg-card/60 border-border/60 focus-visible:ring-primary"
              />
            </div>
            <Button
              type="submit"
              disabled={addingChannel || !urlInput.trim()}
              className="h-10 px-4 gap-1.5 font-medium text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
            >
              {addingChannel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Thêm kênh theo dõi</span>
            </Button>
          </form>

          {/* Quick Filter Search */}
          {followedChannels.length > 3 && (
            <div className="relative w-full sm:w-60 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Tìm kênh trong danh sách..."
                className="pl-9 h-10 text-xs bg-card/40 border-border/50"
              />
            </div>
          )}
        </div>

        {/* Channels List */}
        {followedChannels.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-border/70 bg-card/20 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Tv className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              Chưa có kênh nào được theo dõi
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Hãy dán URL kênh YouTube bạn muốn theo dõi vào ô trên để phân tích khung giờ đăng,
              quét video và tự động tải video sạch về máy.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Đang theo dõi {followedChannels.length} kênh</span>
              <span>Bấm 'Xem video' trên từng card để xổ danh sách & tải video</span>
            </div>

            {filteredChannels.map((channel) => {
              const isExpanded = expandedChannelId === channel.id;
              const stats = statsMap[channel.id];
              const videos = channelVideosMap[channel.id] || [];
              const isChecking = checkingChannelIds.has(channel.id);

              return (
                <div key={channel.id} className="flex flex-col">
                  {/* Channel Main Card */}
                  <ChannelCard
                    channel={channel}
                    stats={stats}
                    isExpanded={isExpanded}
                    onToggleExpand={() => handleToggleExpand(channel.id)}
                    onCheckNow={() => handleCheckNow(channel)}
                    isChecking={isChecking}
                    onUnfollow={() => unfollowChannel(channel.id)}
                    onToggleAutoDownload={(enabled) =>
                      handleToggleAutoDownload(channel.id, enabled)
                    }
                    onUpdateSettings={updateChannelSettings}
                  />

                  {/* Accordion Video List */}
                  {isExpanded && (
                    <div className="mt-1">
                      <ChannelVideoAccordion
                        channelName={channel.name}
                        videos={videos}
                        isLoading={loadingVideos}
                        selectedVideoIds={selectedVideoIds}
                        onToggleVideoSelection={handleToggleVideoSelection}
                        onSelectAll={handleSelectAllVideos}
                        onDeselectAll={handleDeselectAllVideos}
                        onDownloadSelected={handleDownloadSelected}
                        isDownloading={isDownloading}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
