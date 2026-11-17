import {
  ArrowDownUp,
  CheckSquare,
  Download,
  FlaskConical,
  Loader2,
  PlaySquare,
  Search,
  Send,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SortOption } from './types';

interface ChannelVideoToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  disabledSelectAll: boolean;
  selectedCount: number;
  isDownloading: boolean;
  onDownloadSelected: () => void;
  isBatchTestingBkt: boolean;
  onBatchBktSelected: () => void;
  isBatchReupPublishing: boolean;
  batchReupProgressText: string;
  onBatchEditAndPublishSelected: () => void;
  onStopBatchReupPublish: () => void;
  isSequentialTop5Running: boolean;
  sequentialProgressText: string;
  onRunSequentialTop5: () => void;
  onStopSequentialTop5: () => void;
  hasVideos: boolean;
}

export function ChannelVideoToolbar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  allFilteredSelected,
  onToggleSelectAll,
  disabledSelectAll,
  selectedCount,
  isDownloading,
  onDownloadSelected,
  isBatchTestingBkt,
  onBatchBktSelected,
  isBatchReupPublishing,
  batchReupProgressText,
  onBatchEditAndPublishSelected,
  onStopBatchReupPublish,
  isSequentialTop5Running,
  sequentialProgressText,
  onRunSequentialTop5,
  onStopSequentialTop5,
  hasVideos,
}: ChannelVideoToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
      {/* Search Box */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm kiếm tiêu đề video đối thủ..."
          className="pl-8 pr-8 h-8 text-xs bg-muted/40 border-border/50"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
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
          <Select value={sortBy} onValueChange={(val) => onSortChange(val as SortOption)}>
            <SelectTrigger className="h-8 text-xs min-w-[145px] bg-muted/40 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">
                Mới nhất
              </SelectItem>
              <SelectItem value="views_desc" className="text-xs">
                Xem nhiều nhất (Viral)
              </SelectItem>
              <SelectItem value="duration_desc" className="text-xs">
                Dài nhất (Thời lượng)
              </SelectItem>
              <SelectItem value="duration_asc" className="text-xs">
                Ngắn nhất (Thời lượng)
              </SelectItem>
              <SelectItem value="oldest" className="text-xs">
                Cũ nhất
              </SelectItem>
              <SelectItem value="title_asc" className="text-xs">
                Tiêu đề A-Z
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Batch download action */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSelectAll}
            className="h-8 text-xs gap-1.5"
            disabled={disabledSelectAll}
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
            onClick={onDownloadSelected}
            disabled={selectedCount === 0 || isDownloading}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải {selectedCount} video</span>
          </Button>

          {selectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBatchBktSelected}
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

          {selectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBatchEditAndPublishSelected}
              disabled={isBatchReupPublishing || isSequentialTop5Running}
              className="h-8 text-xs gap-1.5 border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 font-semibold"
              title="Tự động trích xuất tiêu đề, thumbnail, Reup và đăng lần lượt lên Kênh Đích với khoảng cách thời gian theo cấu hình"
            >
              {isBatchReupPublishing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
              ) : (
                <Send className="w-3.5 h-3.5 text-purple-500" />
              )}
              <span>
                {isBatchReupPublishing
                  ? batchReupProgressText
                  : `Chỉnh sửa & Đăng ngay (${selectedCount})`}
              </span>
            </Button>
          )}

          {isBatchReupPublishing && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopBatchReupPublish}
              className="h-8 text-xs gap-1.5 font-semibold bg-red-600 hover:bg-red-700 text-white"
              title="Dừng chu trình đăng hàng loạt"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Dừng lại</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRunSequentialTop5}
            disabled={isSequentialTop5Running || !hasVideos}
            className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
            title="Tự động lấy 5 video mới nhất, tải lần lượt 1-by-1 -> Reup Lv.1 -> Test BKT Studio -> Đăng Kênh Đích -> Tự động xóa file giải phóng ổ cứng sau mỗi video -> Kích hoạt Real-time Polling"
          >
            {isSequentialTop5Running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            ) : (
              <PlaySquare className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span>
              {isSequentialTop5Running ? sequentialProgressText : 'Reup Tuần Tự Top 5 (Tối Ưu Đĩa)'}
            </span>
          </Button>

          {isSequentialTop5Running && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopSequentialTop5}
              className="h-8 text-xs gap-1.5 font-semibold bg-red-600 hover:bg-red-700 text-white"
              title="Dừng chu trình tuần tự ngay lập tức"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Dừng lại</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
