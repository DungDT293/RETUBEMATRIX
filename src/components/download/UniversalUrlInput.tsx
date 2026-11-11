import {
  CheckSquare,
  ClipboardPaste,
  Clock,
  Download,
  FileText,
  Film,
  Globe,
  List,
  Loader2,
  Plus,
  Search,
  Square,
  Tv,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VideoPreview } from '@/components/download/VideoPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { getChannelVideos } from '@/contexts/channels/channels-client';
import { extractUrls } from '@/lib/sources';
import type { PlaylistVideoEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

interface UniversalUrlInputProps {
  disabled?: boolean;
  onAddUrls: (text: string) => Promise<number>;
  onImportFile: () => Promise<number>;
  onImportClipboard: () => Promise<number>;
}

type InputMode = 'single' | 'multiple' | 'channel';

function countUrls(text: string): number {
  return extractUrls(text).length;
}

function formatDuration(sec?: number): string {
  if (!sec || Number.isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function UniversalUrlInput({
  disabled,
  onAddUrls,
  onImportFile,
  onImportClipboard,
}: UniversalUrlInputProps) {
  const { t } = useTranslation('universal');
  const toast = useToast();
  const [mode, setMode] = useState<InputMode>('single');
  const [value, setValue] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [isScanningChannel, setIsScanningChannel] = useState(false);
  const [scannedVideos, setScannedVideos] = useState<PlaylistVideoEntry[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [channelError, setChannelError] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const channelInputRef = useRef<HTMLInputElement>(null);

  const urlCount = countUrls(value);
  const hasMultipleLines = value.includes('\n');

  // Auto-expand to multiple when multiple lines detected in text input
  useEffect(() => {
    if (hasMultipleLines && mode === 'single') {
      setMode('multiple');
    }
  }, [hasMultipleLines, mode]);

  // Auto-show preview when single URL is entered (500ms debounce)
  useEffect(() => {
    if (mode !== 'single') {
      setShowPreview(false);
      setPreviewUrl(null);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const lines = value
      .trim()
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'));

    if (lines.length === 1) {
      const urls = extractUrls(value);
      const url = urls.length === 1 ? urls[0] : null;
      if (url && url !== previewUrl && !url.includes('/playlist?list=')) {
        debounceRef.current = window.setTimeout(() => {
          setPreviewUrl(url);
          setShowPreview(true);
        }, 500);
      } else if (!url || url.includes('/playlist?list=')) {
        setShowPreview(false);
        setPreviewUrl(null);
      }
    } else {
      setShowPreview(false);
      setPreviewUrl(null);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, previewUrl, mode]);

  const handleAdd = useCallback(async () => {
    setIsAdding(true);
    try {
      const count = await onAddUrls(value);
      if (count > 0) {
        setValue('');
        setShowPreview(false);
        setPreviewUrl(null);
        if (mode === 'multiple') {
          setMode('single');
        }
      }
    } finally {
      setIsAdding(false);
    }
  }, [value, onAddUrls, mode]);

  const handleImportFile = async () => {
    setIsImporting(true);
    try {
      await onImportFile();
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClipboard = async () => {
    setIsImporting(true);
    try {
      const count = await onImportClipboard();
      if (count === 0) {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            setValue((prev) => (prev ? `${prev}\n${text}` : text));
          }
        } catch {
          // Clipboard access denied
        }
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Enter' && mode === 'single') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleClearSingleInput = () => {
    setValue('');
    inputRef.current?.focus();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setValue((prev) => (prev ? `${prev}\n${text}` : text));
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find((f) => f.name.endsWith('.txt'));
    if (txtFile) {
      const content = await txtFile.text();
      setValue((prev) => (prev ? `${prev}\n${content}` : content));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const switchMode = (newMode: InputMode) => {
    setMode(newMode);
    setTimeout(() => {
      if (newMode === 'multiple') {
        textareaRef.current?.focus();
      } else if (newMode === 'channel') {
        channelInputRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 50);
  };

  // Quét toàn bộ video từ kênh YouTube
  const handleScanChannel = async () => {
    const trimmed = channelUrl.trim();
    if (!trimmed) return;
    setIsScanningChannel(true);
    setChannelError(null);
    try {
      const list = await getChannelVideos({
        url: trimmed,
        limit: null,
        start: 1,
        requestId: Date.now(),
        youtubeContentType: 'all',
      });
      if (!list || list.length === 0) {
        setChannelError('Không tìm thấy video nào trên kênh này hoặc định dạng URL chưa đúng.');
        setScannedVideos([]);
        setSelectedVideoIds(new Set());
      } else {
        setScannedVideos(list);
        setSelectedVideoIds(new Set(list.map((v) => v.id || v.url)));
        toast.success({ title: `Đã quét thấy ${list.length} video từ kênh!` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Lỗi quét kênh');
      setChannelError(msg);
      toast.error({ title: 'Quét kênh thất bại', description: msg });
    } finally {
      setIsScanningChannel(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedVideoIds.size === scannedVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(scannedVideos.map((v) => v.id || v.url)));
    }
  };

  const handleToggleSingleVideo = (id: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddScannedToQueue = async () => {
    const selectedEntries = scannedVideos.filter((v) => selectedVideoIds.has(v.id || v.url));
    if (selectedEntries.length === 0) {
      toast.warning({ title: 'Vui lòng chọn ít nhất 1 video để tải' });
      return;
    }
    setIsAdding(true);
    try {
      const urls = selectedEntries.map((v) => v.url || `https://www.youtube.com/watch?v=${v.id}`);
      const count = await onAddUrls(urls.join('\n'));
      toast.success({ title: `Đã thêm ${count} video vào hàng đợi tải!` });
      setScannedVideos([]);
      setSelectedVideoIds(new Set());
      setChannelUrl('');
      setMode('single');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error({ title: 'Lỗi thêm video', description: msg });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section
      className={cn(
        'space-y-3 transition-all duration-200',
        isDragOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="URL drop zone"
    >
      {/* Mode Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => switchMode('single')}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              mode === 'single'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('urlInput.singleHint')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('urlInput.single')}</span>
          </button>
          <button
            type="button"
            onClick={() => switchMode('multiple')}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              mode === 'multiple'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('urlInput.multipleHint')}
          >
            <List className="w-3.5 h-3.5" />
            <span>{t('urlInput.multiple')}</span>
          </button>
          <button
            type="button"
            onClick={() => switchMode('channel')}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              mode === 'channel'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('urlInput.channelHint')}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{t('urlInput.channel')}</span>
          </button>
        </div>

        {mode !== 'channel' && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleImportClipboard}
              disabled={disabled || isImporting}
              className="h-8 gap-1.5 text-xs"
              title={t('urlInput.paste')}
            >
              {isImporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ClipboardPaste className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{t('urlInput.paste')}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleImportFile}
              disabled={disabled || isImporting}
              className="h-8 gap-1.5 text-xs"
              title={t('urlInput.import')}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('urlInput.import')}</span>
            </Button>
          </div>
        )}
      </div>

      {mode !== 'channel' && value.trim() && urlCount > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-1.5">
          <div className="min-w-0 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
              <List className="h-3 w-3" />
              {t('urlInput.detectedMultiple', { count: urlCount })}
            </span>
          </div>
        </div>
      )}

      {/* Main Input Area */}
      <div className="relative">
        {mode === 'single' && (
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder={t('urlInput.placeholder')}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={cn(
                  'pl-10 pr-11 h-11 text-sm',
                  'bg-background/50 border-border/50',
                  'focus:bg-background transition-colors',
                  'placeholder:text-muted-foreground/50',
                )}
              />
              {value && (
                <button
                  type="button"
                  onClick={handleClearSingleInput}
                  disabled={disabled}
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  title={t('urlInput.clearInput')}
                  aria-label={t('urlInput.clearInput')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="h-11 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAdd}
              disabled={disabled || !value.trim() || isAdding}
              title={t('urlInput.add')}
            >
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{t('urlInput.add')}</span>
            </button>
          </div>
        )}

        {mode === 'multiple' && (
          <div className="relative space-y-2">
            <Textarea
              ref={textareaRef}
              placeholder={t('urlInput.placeholderMultiple')}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              className={cn(
                'min-h-[110px] resize-none font-mono text-sm',
                'bg-background/50 border-border/50',
                'focus:bg-background transition-colors',
                'placeholder:text-muted-foreground/50',
              )}
            />
            <div className="flex items-center justify-between">
              {urlCount > 0 ? (
                <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {urlCount !== 1
                    ? t('urlInput.urlCount_plural', { count: urlCount })
                    : t('urlInput.urlCount', { count: urlCount })}
                </span>
              ) : (
                <div />
              )}
              <button
                type="button"
                className="h-9 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAdd}
                disabled={disabled || !value.trim() || isAdding}
                title={t('urlInput.addToQueue')}
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {t('urlInput.addToQueue')} {urlCount > 0 ? `(${urlCount})` : ''}
              </button>
            </div>
          </div>
        )}

        {mode === 'channel' && (
          <div className="space-y-3">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Tv className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={channelInputRef}
                  placeholder={t('urlInput.placeholderChannel')}
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleScanChannel();
                    }
                  }}
                  disabled={disabled || isScanningChannel}
                  className={cn(
                    'pl-10 pr-11 h-11 text-sm',
                    'bg-background/50 border-border/50',
                    'focus:bg-background transition-colors',
                    'placeholder:text-muted-foreground/50',
                  )}
                />
                {channelUrl && (
                  <button
                    type="button"
                    onClick={() => setChannelUrl('')}
                    disabled={disabled || isScanningChannel}
                    className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                onClick={handleScanChannel}
                disabled={disabled || !channelUrl.trim() || isScanningChannel}
                className="h-11 px-4 text-sm font-medium gap-2 btn-gradient"
              >
                {isScanningChannel ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('urlInput.scanningChannel')}</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>{t('urlInput.scanChannel')}</span>
                  </>
                )}
              </Button>
            </div>

            {channelError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {channelError}
              </div>
            )}

            {scannedVideos.length > 0 && (
              <div className="space-y-2 p-3 rounded-xl bg-background/60 border border-border/60 shadow-sm">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleToggleSelectAll}
                      className="h-7 text-xs gap-1.5 px-2"
                    >
                      {selectedVideoIds.size === scannedVideos.length ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          <span>Bỏ chọn</span>
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span>Chọn tất cả ({scannedVideos.length})</span>
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Đã chọn {selectedVideoIds.size} / {scannedVideos.length} video
                    </span>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleAddScannedToQueue}
                    disabled={selectedVideoIds.size === 0 || isAdding}
                    className="h-7 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isAdding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Tải {selectedVideoIds.size} video vào hàng đợi</span>
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {scannedVideos.map((vid, idx) => {
                    const idKey = vid.id || vid.url || String(idx);
                    const isChecked = selectedVideoIds.has(idKey);
                    return (
                      <label
                        key={idKey}
                        className={cn(
                          'flex items-center gap-2.5 p-1.5 rounded-lg text-xs cursor-pointer transition-colors',
                          isChecked
                            ? 'bg-primary/10 border border-primary/20 text-foreground'
                            : 'hover:bg-muted/40 text-muted-foreground',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSingleVideo(idKey)}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                        />
                        <div className="w-12 h-7 rounded bg-muted/60 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {vid.thumbnail ? (
                            <img
                              src={vid.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Film className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="flex-1 font-medium truncate" title={vid.title}>
                          {vid.title || vid.url}
                        </span>
                        {vid.duration ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(vid.duration)}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Preview */}
      {showPreview && previewUrl && (
        <VideoPreview
          url={previewUrl}
          onClose={() => {
            setValue('');
            setShowPreview(false);
            setPreviewUrl(null);
            setMode('single');
          }}
        />
      )}

      {/* Drag Drop Hint */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="text-center">
            <List className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">{t('urlInput.dropHint')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
