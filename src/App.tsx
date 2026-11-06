import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DenoDialog } from '@/components/DenoDialog';
import { DuplicateDownloadReviewHost } from '@/components/download';
import { MeteorTransition } from '@/components/effects/MeteorTransition';
import { FFmpegDialog } from '@/components/FFmpegDialog';
import type { Page } from '@/components/layout';
import { MainLayout } from '@/components/layout';
import { MusicPlayer } from '@/components/player';
import type { SettingsSectionId } from '@/components/settings';
import { UpdateDialog } from '@/components/UpdateDialog';
import { ToastProvider } from '@/components/ui/toast';
import { AIProvider } from '@/contexts/AIContext';
import { ChannelsProvider } from '@/contexts/ChannelsContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider } from '@/contexts/DownloadContext';
import { useDownload } from '@/contexts/download-context';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
import { ProcessingProvider } from '@/contexts/ProcessingContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { UniversalProvider } from '@/contexts/UniversalContext';
import { UpdaterProvider, useUpdater } from '@/contexts/UpdaterContext';
import { useExternalDownloadLinks } from '@/hooks/useExternalDownloadLinks';
import { usePluginExecutionToasts } from '@/hooks/usePluginExecutionToasts';
import { useTelegramRemoteCommands } from '@/hooks/useTelegramRemoteCommands';
import { useTrayDownloadStatus } from '@/hooks/useTrayDownloadStatus';
import { useTrayEvents } from '@/hooks/useTrayEvents';
import { useYtdlpAutoUpdateToast } from '@/hooks/useYtdlpAutoUpdateToast';
import {
  ChannelsPage,
  DashboardPage,
  HistoryPage,
  LogsPage,
  OutlierHunterPage,
  ProfilesPage,
  ReupBktPage,
  SettingsPage,
  UniversalPage,
} from '@/pages';
import { openExternalUrl } from '@/utils/open-url';

function AppContent() {
  const { i18n } = useTranslation('settings');
  const [currentPage, setCurrentPage] = useState<Page>('universal');
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSectionId>('general');
  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);
  const [showDenoDialog, setShowDenoDialog] = useState(false);
  const [ffmpegChecked, setFfmpegChecked] = useState(false);
  const updater = useUpdater();
  const { ffmpegStatus, ffmpegLoading, isAutoDownloadingDeno, denoStatus, denoSuccess } =
    useDependencies();
  const { isTransitioning, oldMode, applyPendingTheme, onTransitionComplete } = useTheme();
  const externalStartLockRef = useRef({ youtube: false, universal: false });

  const openSettingsPage = useCallback((section: SettingsSectionId = 'general') => {
    setSettingsInitialSection(section);
    setCurrentPage('settings');
  }, []);

  const openDependenciesSettings = useCallback(() => {
    openSettingsPage('dependencies');
  }, [openSettingsPage]);

  useExternalDownloadLinks(setCurrentPage, externalStartLockRef);
  useTelegramRemoteCommands(setCurrentPage, externalStartLockRef);
  useTrayDownloadStatus();
  useTrayEvents(setCurrentPage, openSettingsPage, updater.checkForUpdate);
  usePluginExecutionToasts();
  useYtdlpAutoUpdateToast({
    onOpenDependencies: openDependenciesSettings,
  });

  useEffect(() => {
    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    const direction =
      typeof document !== 'undefined' ? document.documentElement.dir || 'ltr' : 'ltr';

    void invoke('set_plugin_runtime_locale', {
      input: {
        locale,
        fallbackLocale: 'en',
        direction,
      },
    }).catch((error) => {
      console.error('Failed to sync plugin runtime locale:', error);
    });
  }, [i18n.language, i18n.resolvedLanguage]);

  // Điều hướng toàn bộ link ngoài hoặc thẻ a target="_blank" ra trình duyệt mặc định hệ thống (Chrome/Edge)
  useEffect(() => {
    const handleGlobalLinkClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href) return;

      if (
        (href.startsWith('http://') || href.startsWith('https://')) &&
        (target.target === '_blank' || !href.startsWith(window.location.origin))
      ) {
        e.preventDefault();
        e.stopPropagation();
        void openExternalUrl(href);
      }
    };

    document.addEventListener('click', handleGlobalLinkClick, true);
    return () => {
      document.removeEventListener('click', handleGlobalLinkClick, true);
    };
  }, []);

  // Show FFmpeg dialog on startup if not installed
  useEffect(() => {
    if (!ffmpegLoading && !ffmpegChecked) {
      setFfmpegChecked(true);
      if (ffmpegStatus && !ffmpegStatus.installed) {
        // Small delay to let the app render first
        const timer = setTimeout(() => {
          setShowFfmpegDialog(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [ffmpegStatus, ffmpegLoading, ffmpegChecked]);

  // Close FFmpeg dialog when FFmpeg gets installed
  useEffect(() => {
    if (ffmpegStatus?.installed && showFfmpegDialog) {
      setShowFfmpegDialog(false);
    }
  }, [ffmpegStatus, showFfmpegDialog]);

  // Show Deno dialog when auto-downloading on first launch
  useEffect(() => {
    if (isAutoDownloadingDeno && !showDenoDialog) {
      setShowDenoDialog(true);
    }
  }, [isAutoDownloadingDeno, showDenoDialog]);

  // Close Deno dialog when Deno gets installed successfully
  useEffect(() => {
    if ((denoStatus?.installed || denoSuccess) && showDenoDialog) {
      // Small delay to show success state
      const timer = setTimeout(() => {
        setShowDenoDialog(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [denoStatus, denoSuccess, showDenoDialog]);

  // Sync UI language to system tray on mount
  useEffect(() => {
    invoke('bring_main_window_to_front').catch(() => {});
    const win = getCurrentWindow();
    win.show().catch(() => {});
    win.unminimize().catch(() => {});
    win.setFocus().catch(() => {});

    const lang = localStorage.getItem('i18nextLng') || 'en';
    invoke('rebuild_tray_menu_cmd', { lang }).catch(() => {});

    // Sync hideDockOnClose preference to Rust on startup
    const hideDock =
      (localStorage.getItem('retubematrix_hide_dock_on_close') ??
        localStorage.getItem('youwee_hide_dock_on_close')) === 'true';
    if (hideDock) {
      invoke('set_hide_dock_on_close', { hide: true }).catch(() => {});
    }
  }, []);

  return (
    <>
      <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
        {currentPage === 'dashboard' && <DashboardPage onNavigate={setCurrentPage} />}
        {currentPage === 'profiles' && <ProfilesPage />}
        {currentPage === 'universal' && (
          <UniversalPage onNavigateToSettings={() => openSettingsPage('general')} />
        )}
        {currentPage === 'channels' && <ChannelsPage />}
        {currentPage === 'outliers' && <OutlierHunterPage onNavigate={setCurrentPage} />}
        {currentPage === 'reup' && <ReupBktPage onNavigate={setCurrentPage} />}
        {currentPage === 'library' && <HistoryPage onNavigate={setCurrentPage} />}
        {currentPage === 'logs' && <LogsPage />}
        {currentPage === 'settings' && <SettingsPage initialSection={settingsInitialSection} />}
        <MusicPlayer />
      </MainLayout>

      <UpdateDialog
        status={updater.status}
        updateInfo={updater.updateInfo}
        progress={updater.progress}
        error={updater.error}
        onDownload={updater.downloadAndInstall}
        onRestart={updater.restartApp}
        onDismiss={updater.dismissUpdate}
        onRetry={updater.checkForUpdate}
      />

      {showFfmpegDialog && <FFmpegDialog onDismiss={() => setShowFfmpegDialog(false)} />}

      {showDenoDialog && <DenoDialog onDismiss={() => setShowDenoDialog(false)} />}
      <DuplicateDownloadReviewHost />
      <MeteorTransition
        isActive={isTransitioning}
        oldMode={oldMode}
        onRevealStart={applyPendingTheme}
        onComplete={onTransitionComplete}
      />
    </>
  );
}

// Wrapper to get settings and pass to UpdaterProvider
function UpdaterWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useDownload();

  return <UpdaterProvider autoCheck={settings.autoCheckUpdate}>{children}</UpdaterProvider>;
}

export function App() {
  return (
    <ThemeProvider>
      <DependenciesProvider>
        <DownloadProvider>
          <UniversalProvider>
            <ChannelsProvider>
              <LogProvider>
                <HistoryProvider>
                  <PlayerProvider>
                    <AIProvider>
                      <ProcessingProvider>
                        <ToastProvider>
                          <UpdaterWrapper>
                            <AppContent />
                          </UpdaterWrapper>
                        </ToastProvider>
                      </ProcessingProvider>
                    </AIProvider>
                  </PlayerProvider>
                </HistoryProvider>
              </LogProvider>
            </ChannelsProvider>
          </UniversalProvider>
        </DownloadProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}
