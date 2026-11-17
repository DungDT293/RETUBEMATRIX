import type { ChannelVideo, FollowedChannel } from '@/lib/types';

export type FilterType = 'all' | 'video' | 'shorts' | 'stream';
export type TimeFilterOption = 'all' | '3d' | '7d';
export type SortOption =
  | 'newest'
  | 'oldest'
  | 'views_desc'
  | 'duration_desc'
  | 'duration_asc'
  | 'title_asc';

export interface VideoCounts {
  regular: number;
  shorts: number;
  stream: number;
}

export type VideoOverridesMap = Record<string, Partial<ChannelVideo>>;
export type ActiveJobPhasesMap = Record<string, string>;

export interface ChannelVideoAccordionProps {
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
  channel?: FollowedChannel;
}
