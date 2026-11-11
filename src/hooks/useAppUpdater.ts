import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useCallback, useState } from 'react';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  bodyVi?: string;
  bodyZhCN?: string;
  date?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'external'
  | 'up-to-date';

export function useAppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isExternalUpdateManaged = useCallback(async () => {
    try {
      return await invoke<boolean>('is_flatpak_environment');
    } catch {
      return false;
    }
  }, []);

  const checkForUpdate = useCallback(
    async (options?: { silent?: boolean }) => {
      setStatus('checking');
      setError(null);

      try {
        if (await isExternalUpdateManaged()) {
          setUpdateInfo(null);
          setStatus('external');
          return false;
        }

        const update = await check();

        if (update) {
          const raw = update.rawJson as Record<string, unknown>;
          setUpdateInfo({
            version: update.version,
            currentVersion: update.currentVersion,
            body: update.body ?? undefined,
            bodyVi: (raw.notes_vi as string) || undefined,
            bodyZhCN: (raw['notes_zh-CN'] as string) || undefined,
            date: update.date ?? undefined,
          });
          setStatus('available');
          return true;
        } else {
          setStatus('up-to-date');
          return false;
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err ?? '');
        const message = rawMessage || 'Failed to check for updates';
        const lower = message.toLowerCase();

        // 404, missing release or not found implies no newer release available or release assets not yet published -> up-to-date
        const isNotFoundOrUpToDate =
          lower.includes('404') ||
          lower.includes('not found') ||
          lower.includes('could not find') ||
          lower.includes('status 404') ||
          lower.includes('release');

        if (isNotFoundOrUpToDate) {
          setError(null);
          setStatus('up-to-date');
          return false;
        }

        if (options?.silent) {
          // Background checks must never set error status to avoid annoying users
          setError(null);
          setStatus('idle');
          return false;
        }

        setError(message);
        setStatus('error');
        return false;
      }
    },
    [isExternalUpdateManaged],
  );

  const downloadAndInstall = useCallback(async () => {
    setStatus('downloading');
    setProgress({ downloaded: 0, total: 0 });

    try {
      if (await isExternalUpdateManaged()) {
        setProgress(null);
        setUpdateInfo(null);
        setStatus('external');
        return;
      }

      const update = await check();

      if (!update) {
        setStatus('up-to-date');
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            setProgress({ downloaded: 0, total: contentLength });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setProgress({ downloaded, total: contentLength });
            break;
          case 'Finished':
            setProgress({ downloaded: contentLength, total: contentLength });
            break;
        }
      });

      setStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download update';
      setError(message);
      setStatus('error');
    }
  }, [isExternalUpdateManaged]);

  const restartApp = useCallback(async () => {
    await relaunch();
  }, []);

  const dismissUpdate = useCallback(() => {
    setStatus('idle');
    setUpdateInfo(null);
  }, []);

  return {
    status,
    updateInfo,
    progress,
    error,
    checkForUpdate,
    downloadAndInstall,
    restartApp,
    dismissUpdate,
  };
}
