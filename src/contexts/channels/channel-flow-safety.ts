export type ChannelDownloadFlowContext = {
  kind: 'manual' | 'auto-pilot';
  bktOwner?: 'download' | 'caller';
};

export function shouldDispatchAfterDownload(
  context: ChannelDownloadFlowContext['kind'] | ChannelDownloadFlowContext,
  stopped = false,
): boolean {
  if (stopped) return false;
  const resolved = typeof context === 'string' ? { kind: context } : context;
  return resolved.kind === 'auto-pilot' && (resolved.bktOwner ?? 'download') === 'download';
}

export function shouldUpdateAutoDownloadStatus(isActive: boolean): boolean {
  return isActive;
}

export function nextSequentialRedCount(
  current: number,
  result: 'green_clean' | 'published' | 'red_matched' | 'failed',
): number {
  return result === 'green_clean' || result === 'published'
    ? 0
    : result === 'red_matched'
      ? current + 1
      : current;
}

export function isSequentialSuccessStatus(status: string): status is 'green_clean' | 'published' {
  return status === 'green_clean' || status === 'published';
}

export type BktVideoJobRef = {
  id: string;
  sourceRefId?: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
};

export function findLatestBktJobForVideo<T extends BktVideoJobRef>(
  jobs: T[],
  videoIds: string[],
): T | undefined {
  const ids = new Set(videoIds.filter(Boolean));
  return jobs
    .filter((job) => Boolean(job.sourceRefId && ids.has(job.sourceRefId)))
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const right = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return right - left;
    })[0];
}

export function canPublishBktStatus(status: string): boolean {
  return status === 'green_clean' || status === 'publish_failed';
}

export function canRetryBktTest(status: string): boolean {
  return status === 'failed';
}

export function canContinueBktPublish(status: string): boolean {
  return status === 'publish_failed';
}

export function createDownloadRunGuard() {
  let nextId = 0;
  let activeId: number | null = null;
  const ids = new Set<string>();

  const start = (): number => {
    const id = ++nextId;
    activeId = id;
    ids.clear();
    return id;
  };

  return {
    start,
    tryStart: () => (activeId === null ? start() : null),
    isActive: (id: number) => activeId === id,
    track: (id: string) => ids.add(id),
    trackedIds: () => [...ids],
    stop: () => {
      activeId = null;
      ids.clear();
    },
    finish: (id: number) => {
      if (activeId === id) {
        activeId = null;
        ids.clear();
      }
    },
  };
}
