import { Calendar, Film, PlaySquare, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterType, TimeFilterOption, VideoCounts } from './types';

interface ChannelVideoFilterBarProps {
  totalCount: number;
  videoCounts: VideoCounts;
  filterType: FilterType;
  onFilterTypeChange: (type: FilterType) => void;
  timeFilter: TimeFilterOption;
  onTimeFilterChange: (time: TimeFilterOption) => void;
  onQuickSelectTop: (num: number) => void;
}

export function ChannelVideoFilterBar({
  totalCount,
  videoCounts,
  filterType,
  onFilterTypeChange,
  timeFilter,
  onTimeFilterChange,
  onQuickSelectTop,
}: ChannelVideoFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* Filter Tabs (All / Video / Shorts / Stream) */}
      <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs w-fit">
        <button
          type="button"
          onClick={() => onFilterTypeChange('all')}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-colors',
            filterType === 'all'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Tất cả ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => onFilterTypeChange('video')}
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
          onClick={() => onFilterTypeChange('shorts')}
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
          onClick={() => onFilterTypeChange('stream')}
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
          onClick={() => onTimeFilterChange('all')}
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
          onClick={() => onTimeFilterChange('3d')}
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
          onClick={() => onTimeFilterChange('7d')}
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
            onClick={() => onQuickSelectTop(num)}
            className="px-2 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground border border-border/40 text-[10px] font-semibold transition-colors"
          >
            Top {num}
          </button>
        ))}
      </div>
    </div>
  );
}
