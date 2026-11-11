import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AlertCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthModal } from '@/components/auth/AuthModal';
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
import { AuthProvider, isOwnerEmail, useAuth } from '@/contexts/AuthContext';
import { ChannelsProvider } from '@/contexts/ChannelsContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider } from '@/contexts/DownloadContext';
import { useDownload } from '@/contexts/download-context';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
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
import { AdminPortalDispatcher } from '@/pages/admin/AdminPortalDispatcher';
import { openExternalUrl } from '@/utils/open-url';

function AppContent() {
  const { i18n } = useTranslation('settings');
  const { user, isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
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

  // 3. MASTER OWNER & TÀI KHOẢN CHỜ PHÂN BỔ CÔNG TY (Gọi hooks ở top-level tuân thủ React Rules of Hooks)
  const isMasterOwner = Boolean(user && (isOwnerEmail(user.email) || user.role === 'owner'));

  // Nếu là Master Owner (role === 'owner' hoặc isOwnerEmail), đăng nhập thành công là vào ngay lập tức mọi tính năng và trang SaasMasterHubPage
  const ownerNavigatedRef = useRef(false);
  useEffect(() => {
    if (isMasterOwner && !ownerNavigatedRef.current) {
      ownerNavigatedRef.current = true;
      setCurrentPage('saas');
    }
  }, [isMasterOwner]);

  // 1. Loading phiên làm việc ban đầu
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-lg shadow-indigo-500/10 animate-pulse">
            <img src="/logo-128.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Đang đồng bộ hồ sơ và xác thực phiên làm việc...</span>
        </div>
      </div>
    );
  }

  // 2. BẮT BUỘC ĐĂNG NHẬP HOẶC ĐĂNG KÝ (GATEWAY CHÀO ĐÓN CHO MÁY MỚI CÀI)
  if (!isAuthenticated || !user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-4 select-none">
        <AuthModal
          isOpen={true}
          onClose={() => {}}
          canClose={false}
          closable={false}
          onOpenSaasHub={() => setCurrentPage('saas')}
        />
      </div>
    );
  }

  // 3. MASTER OWNER & TÀI KHOẢN CHỜ PHÂN BỔ CÔNG TY
  // Nếu đăng nhập bằng tài khoản chưa được Owner gán công ty (hoặc role 'pending', hoặc isActive === false)
  const isPendingApproval =
    !isMasterOwner &&
    Boolean(
      !user.companyId ||
        user.companyId === '' ||
        user.companyId === 'pending' ||
        (user.role as string) === 'pending' ||
        user.isActive === false,
    );

  if (isPendingApproval) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-4 select-none">
        <div className="w-full max-w-md p-8 bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-2xl text-center space-y-5 backdrop-blur-xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white">
              Tài khoản đang chờ duyệt phân công ty bởi Master Owner
            </h2>
            <p className="text-xs text-slate-400">
              Xin chào <span className="font-semibold text-white">{user.fullName}</span> (
              {user.email})
            </p>
          </div>
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed text-left space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chưa được gán vào Công ty</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tài khoản của bạn đã được ghi nhận trên hệ thống nhưng hiện tại đang chờ duyệt phân
              công ty bởi Master Owner (hoặc Quản lý).
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Vui lòng thông báo cho{' '}
              <strong className="text-purple-300 font-bold">Master Owner</strong> hoặc Quản trị viên
              để được duyệt và phân bổ vào công ty làm việc.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Kiểm tra lại
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
            >
              Đăng xuất để đổi tài khoản khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
        {currentPage === 'dashboard' && <DashboardPage onNavigate={setCurrentPage} />}
        {currentPage === 'saas' && (
          <AdminPortalDispatcher onNavigateHome={() => setCurrentPage('dashboard')} />
        )}
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
        onRetry={() => void updater.checkForUpdate()}
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
        <ToastProvider>
          <DownloadProvider>
            <UniversalProvider>
              <ChannelsProvider>
                <LogProvider>
                  <HistoryProvider>
                    <PlayerProvider>
                      <AIProvider>
                        <AuthProvider>
                          <UpdaterWrapper>
                            <AppContent />
                          </UpdaterWrapper>
                        </AuthProvider>
                      </AIProvider>
                    </PlayerProvider>
                  </HistoryProvider>
                </LogProvider>
              </ChannelsProvider>
            </UniversalProvider>
          </DownloadProvider>
        </ToastProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}
