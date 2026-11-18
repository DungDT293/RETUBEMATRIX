import { listen } from '@tauri-apps/api/event';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FlaskConical,
  Loader2,
  Scissors,
  Send,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatEta } from '@/lib/format-eta';
import type { BktTestJob } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ActiveTaskItem {
  id: string;
  type: 'download' | 'reup' | 'bkt_test' | 'publish';
  title: string;
  status: 'running' | 'completed' | 'error';
  progress?: number;
  speed?: string;
  eta?: string;
  detail?: string;
  timestamp: number;
}

export function GlobalActiveTasksDock() {
  const [tasksMap, setTasksMap] = useState<Record<string, ActiveTaskItem>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Helper đặt timeout tự động gỡ task sau khi xong / lỗi
  const scheduleCleanup = useCallback((taskId: string, delayMs = 7000) => {
    if (timersRef.current[taskId]) {
      clearTimeout(timersRef.current[taskId]);
    }
    timersRef.current[taskId] = setTimeout(() => {
      setTasksMap((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      delete timersRef.current[taskId];
    }, delayMs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    // 1. Lắng nghe tiến trình tải video từ yt-dlp
    listen<{
      id: string;
      title?: string;
      percent?: number;
      speed?: string;
      eta?: string;
      status: string;
      error_message?: string;
      downloaded_size?: string;
    }>('download-progress', (event) => {
      if (cancelled) return;
      const p = event.payload;
      if (!p?.id) return;
      const taskId = `dl-${p.id}`;

      if (p.status === 'downloading') {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: 'download',
            title: p.title || 'Đang tải video...',
            status: 'running',
            progress: p.percent ?? 0,
            speed: p.speed,
            eta: p.eta ? formatEta(p.eta) : undefined,
            detail: p.downloaded_size ? `${p.downloaded_size}` : undefined,
            timestamp: Date.now(),
          },
        }));
      } else if (p.status === 'finished') {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: 'download',
            title: p.title || prev[taskId]?.title || 'Tải video thành công',
            status: 'completed',
            progress: 100,
            detail: 'Đã tải xong',
            timestamp: Date.now(),
          },
        }));
        scheduleCleanup(taskId, 5000);
      } else if (p.status === 'error') {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: 'download',
            title: p.title || prev[taskId]?.title || 'Lỗi tải video',
            status: 'error',
            progress: 0,
            detail: p.error_message || 'Thất bại',
            timestamp: Date.now(),
          },
        }));
        scheduleCleanup(taskId, 9000);
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisteners.push(un);
    });

    // 2. Lắng nghe tiến trình Render / Reup FFmpeg
    listen<{
      percent: number;
      speed?: string;
      fps?: number;
      eta_seconds?: number;
      status: string;
    }>('reup-pipeline-progress', (event) => {
      if (cancelled) return;
      const p = event.payload;
      if (!p) return;
      const taskId = 'reup-pipeline-active';

      if (p.percent < 100 && !p.status.includes('hoàn tất')) {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: 'reup',
            title: p.status || 'Xử lý video (Reup Pipeline)...',
            status: 'running',
            progress: p.percent,
            speed: p.speed,
            eta: p.eta_seconds != null ? formatEta(p.eta_seconds) : undefined,
            detail: p.fps ? `${p.fps} fps` : undefined,
            timestamp: Date.now(),
          },
        }));
      } else {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: 'reup',
            title: p.status || 'Reup video hoàn tất',
            status: 'completed',
            progress: 100,
            detail: 'Sẵn sàng',
            timestamp: Date.now(),
          },
        }));
        scheduleCleanup(taskId, 5000);
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisteners.push(un);
    });

    // 3. Lắng nghe tiến trình BKT test & Publish Kênh Đích
    listen<BktTestJob>('bkt-test-job-updated', (event) => {
      if (cancelled) return;
      const job = event.payload;
      if (!job?.id) return;
      const taskId = `bkt-${job.id}`;

      const isRunning = ['queued', 'reuping', 'uploading', 'checking', 'publishing'].includes(
        job.status,
      );
      const isClean = job.status === 'green_clean' || job.status === 'published';
      const isFailed =
        job.status === 'failed' || job.status === 'publish_failed' || job.status === 'red_matched';

      const taskType =
        job.status === 'publishing' || job.status === 'published'
          ? 'publish'
          : job.status === 'reuping'
            ? 'reup'
            : 'bkt_test';

      let stageLabel = 'Đang xử lý...';
      if (job.status === 'queued') stageLabel = 'Chờ xử lý hàng đợi BKT';
      else if (job.status === 'reuping') stageLabel = 'Đang Reup khử bản quyền';
      else if (job.status === 'uploading')
        stageLabel = job.restriction || 'Đang tải lên YouTube Studio';
      else if (job.status === 'checking')
        stageLabel = job.restriction || 'Đang theo dõi Content ID';
      else if (job.status === 'publishing')
        stageLabel = job.restriction || 'Đang đăng lên Kênh Đích';
      else if (job.status === 'green_clean') stageLabel = 'BKT: Sạch Bản Quyền';
      else if (job.status === 'published') stageLabel = 'Đã xuất bản Kênh Đích thành công';
      else if (job.status === 'red_matched')
        stageLabel = job.restriction || 'Dính bản quyền Content ID';
      else if (job.status === 'publish_failed')
        stageLabel = job.restriction || 'Lỗi đăng Kênh Đích';
      else if (job.status === 'failed') stageLabel = job.restriction || 'Thất bại';

      if (isRunning) {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: taskType,
            title: job.targetTitle || job.videoTitle,
            status: 'running',
            detail: stageLabel,
            timestamp: Date.now(),
          },
        }));
      } else if (isClean) {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: taskType,
            title: job.targetTitle || job.videoTitle,
            status: 'completed',
            progress: 100,
            detail: stageLabel,
            timestamp: Date.now(),
          },
        }));
        scheduleCleanup(taskId, 6000);
      } else if (isFailed) {
        setTasksMap((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: taskType,
            title: job.targetTitle || job.videoTitle,
            status: 'error',
            progress: 0,
            detail: stageLabel,
            timestamp: Date.now(),
          },
        }));
        scheduleCleanup(taskId, 9000);
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisteners.push(un);
    });

    return () => {
      cancelled = true;
      for (const un of unlisteners) un();
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
    };
  }, [scheduleCleanup]);

  const taskList = useMemo(() => {
    return Object.values(tasksMap).sort((a, b) => b.timestamp - a.timestamp);
  }, [tasksMap]);

  const runningCount = useMemo(() => {
    return taskList.filter((t) => t.status === 'running').length;
  }, [taskList]);

  if (taskList.length === 0) return null;

  const dismissTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (timersRef.current[taskId]) {
      clearTimeout(timersRef.current[taskId]);
      delete timersRef.current[taskId];
    }
    setTasksMap((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const getTaskIcon = (type: ActiveTaskItem['type'], status: ActiveTaskItem['status']) => {
    if (status === 'completed')
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    if (type === 'download') return <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (type === 'reup') return <Scissors className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    if (type === 'publish') return <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    return <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  };

  // 1. Chế độ Thu Gọn: Hiển thị 1 task nổi bật nhất
  const topTask = taskList[0];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-w-[420px] select-none font-sans">
      {/* Drawer mở rộng khi có nhiều task */}
      {isExpanded && taskList.length > 1 && (
        <div className="w-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl p-3 space-y-2 max-h-[300px] overflow-y-auto">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs font-semibold text-slate-300">
            <span>Tác vụ đang xử lý ({taskList.length})</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px] text-slate-400 hover:text-white"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
          {taskList.map((task) => (
            <div
              key={task.id}
              className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col gap-1 text-[11px]"
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 truncate">
                  {task.status === 'running' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                  ) : (
                    getTaskIcon(task.type, task.status)
                  )}
                  <span
                    className="font-medium text-slate-200 truncate max-w-[240px]"
                    title={task.title}
                  >
                    {task.title}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => dismissTask(task.id, e)}
                  className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
                  title="Đóng thông báo này"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {task.progress !== undefined && task.status === 'running' && (
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.max(5, Math.min(100, task.progress))}%` }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate max-w-[200px]">
                  {task.detail || (task.progress ? `${Math.round(task.progress)}%` : 'Đang xử lý')}
                </span>
                <div className="flex items-center gap-1 shrink-0 font-mono text-[9px]">
                  {task.speed && <span>{task.speed}</span>}
                  {task.eta && <span className="text-primary font-medium">{task.eta}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Persistent Floating Badge / Pill */}
      {/* biome-ignore lint/a11y/useSemanticElements: container contains nested dismiss and expand action buttons */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex items-center gap-2.5 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-2xl transition-all cursor-pointer border',
          topTask.status === 'error'
            ? 'bg-rose-950/90 border-rose-800/80 text-rose-200'
            : topTask.status === 'completed'
              ? 'bg-emerald-950/90 border-emerald-800/80 text-emerald-200'
              : 'bg-slate-900/90 border-slate-700/80 text-slate-100 hover:border-primary/50',
        )}
        onClick={() => {
          if (taskList.length > 1) {
            setIsExpanded((prev) => !prev);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (taskList.length > 1) {
              setIsExpanded((prev) => !prev);
            }
          }
        }}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {topTask.status === 'running' ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            getTaskIcon(topTask.type, topTask.status)
          )}
        </div>

        <div className="flex flex-col min-w-[170px] max-w-[260px]">
          <div className="flex items-center justify-between gap-1 text-[11px] font-semibold">
            <span className="truncate" title={topTask.title}>
              {topTask.title}
            </span>
            {topTask.progress !== undefined && topTask.status === 'running' && (
              <span className="font-mono text-primary font-bold shrink-0 text-[10px]">
                {Math.round(topTask.progress)}%
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-300 font-mono">
            <span className="truncate max-w-[150px] font-sans text-slate-400">
              {topTask.detail || (topTask.status === 'running' ? 'Đang chạy ngầm...' : 'Hoàn tất')}
            </span>
            <div className="flex items-center gap-1 shrink-0 text-[9px]">
              {topTask.speed && <span>{topTask.speed}</span>}
              {topTask.eta && <span className="text-primary font-semibold">{topTask.eta}</span>}
            </div>
          </div>
        </div>

        {taskList.length > 1 && (
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 py-0 h-4 bg-primary/20 text-primary border border-primary/30 shrink-0 font-mono"
            title={`${runningCount} tác vụ đang chạy`}
          >
            +{taskList.length - 1}
          </Badge>
        )}

        {taskList.length > 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => dismissTask(topTask.id, e)}
            className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
