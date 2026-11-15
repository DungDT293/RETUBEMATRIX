import { describe, expect, test } from 'bun:test';
import {
  canContinueBktPublish,
  canPublishBktStatus,
  canRetryBktTest,
  createDownloadRunGuard,
  findLatestBktJobForVideo,
  isSequentialSuccessStatus,
  nextSequentialRedCount,
  shouldDispatchAfterDownload,
  shouldUpdateAutoDownloadStatus,
} from '../src/contexts/channels/channel-flow-safety';

describe('channel flow safety', () => {
  test('manual channel downloads never dispatch BKT, while explicit Auto-Pilot may', () => {
    expect(shouldDispatchAfterDownload('manual')).toBe(false);
    expect(shouldDispatchAfterDownload('auto-pilot')).toBe(true);
  });

  test('sequential Auto Reup resets consecutive red count after a clean result', () => {
    expect(nextSequentialRedCount(1, 'green_clean')).toBe(0);
    expect(nextSequentialRedCount(0, 'red_matched')).toBe(1);
    expect(nextSequentialRedCount(1, 'failed')).toBe(1);
  });

  test('published Auto-Pilot jobs count as successful completion', () => {
    expect(isSequentialSuccessStatus('published')).toBe(true);
    expect(nextSequentialRedCount(1, 'published')).toBe(0);
    expect(isSequentialSuccessStatus('publish_failed')).toBe(false);
  });

  test('green-only publish gate allows only clean or failed-publish continuation', () => {
    expect(canPublishBktStatus('green_clean')).toBe(true);
    expect(canPublishBktStatus('publish_failed')).toBe(true);
    expect(canPublishBktStatus('failed')).toBe(false);
    expect(canPublishBktStatus('pending')).toBe(false);
    expect(canPublishBktStatus('published')).toBe(false);
    expect(canRetryBktTest('failed')).toBe(true);
    expect(canRetryBktTest('publish_failed')).toBe(false);
    expect(canRetryBktTest('green_clean')).toBe(false);
    expect(canContinueBktPublish('publish_failed')).toBe(true);
    expect(canContinueBktPublish('failed')).toBe(false);
  });

  test('channel video UI never rechecks pending jobs or claims green_clean was published', async () => {
    const bunRuntime = (
      globalThis as unknown as {
        Bun: { file: (path: URL) => { text: () => Promise<string> } };
      }
    ).Bun;
    const source = await bunRuntime
      .file(new URL('../src/pages/channels/ChannelVideoAccordion.tsx', import.meta.url))
      .text();
    expect(source).not.toContain('Quét kết quả');
    expect(source).toContain('Sạch Bản Quyền; chờ thao tác đăng Kênh Đích.');
    expect(source).not.toContain('đã đăng Kênh Đích!');
  });

  test('latest BKT job maps by source video id and ignores unrelated jobs', () => {
    const latest = findLatestBktJobForVideo(
      [
        { id: 'old', sourceRefId: 'video-1', status: 'failed', updatedAt: '2026-11-13T10:00:00Z' },
        {
          id: 'other',
          sourceRefId: 'video-2',
          status: 'green_clean',
          updatedAt: '2026-11-13T12:00:00Z',
        },
        {
          id: 'new',
          sourceRefId: 'video-1',
          status: 'publish_failed',
          updatedAt: '2026-11-13T11:00:00Z',
        },
      ],
      ['db-video-1', 'video-1'],
    );
    expect(latest?.id).toBe('new');
  });

  test('video without source-linked BKT job has no continuation action', () => {
    expect(findLatestBktJobForVideo([], ['video-1'])).toBeUndefined();
  });

  test('stopping a run invalidates it and clears its tracked download ids', () => {
    const guard = createDownloadRunGuard();
    const run = guard.start();
    guard.track('download-1');

    expect(guard.isActive(run)).toBe(true);
    expect(guard.trackedIds()).toEqual(['download-1']);

    guard.stop();

    expect(guard.isActive(run)).toBe(false);
    expect(guard.trackedIds()).toEqual([]);
    expect(guard.isActive(guard.start())).toBe(true);
  });

  test('single-flight guard rejects overlapping runs without invalidating the owner', () => {
    const guard = createDownloadRunGuard();
    const first = guard.start();

    expect(guard.tryStart()).toBeNull();
    expect(guard.isActive(first)).toBe(true);

    guard.finish(first);
    const second = guard.tryStart();
    expect(second).not.toBeNull();
    expect(guard.isActive(second!)).toBe(true);
  });

  test('stopped sequential Auto Reup cannot dispatch BKT for a late download completion', () => {
    expect(shouldDispatchAfterDownload('auto-pilot', true)).toBe(false);
    expect(shouldDispatchAfterDownload('auto-pilot', false)).toBe(true);
  });

  test('stopped auto-download ignores late status updates', () => {
    expect(shouldUpdateAutoDownloadStatus(false)).toBe(false);
    expect(shouldUpdateAutoDownloadStatus(true)).toBe(true);
  });
});
