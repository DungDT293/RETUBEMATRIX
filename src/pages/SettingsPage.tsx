import { getVersion } from '@tauri-apps/api/app';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AISection,
  DependenciesSection,
  DownloadSection,
  ExtensionSection,
  GeneralSection,
  NetworkSection,
  PluginStoreSection,
  PluginsSection,
  RemoteDownloadSection,
  SettingsRow,
  SettingsSearch,
  SettingsSection,
  type SettingsSectionId,
  SettingsSidebar,
} from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useDownload } from '@/contexts/download-context';
import { useUpdater } from '@/contexts/UpdaterContext';
import { cn } from '@/lib/utils';

export function SettingsPage({
  initialSection = 'general',
}: {
  initialSection?: SettingsSectionId;
}) {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const updater = useUpdater();

  // Load app version
  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // Handle search navigation
  const handleSearchNavigate = useCallback((section: SettingsSectionId, settingId: string) => {
    setActiveSection(section);
    setHighlightId(settingId);

    // Scroll to element after section change
    setTimeout(() => {
      const element = document.getElementById(settingId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after animation
      setTimeout(() => setHighlightId(null), 2000);
    }, 100);
  }, []);

  const handleOpenPluginsFromStore = useCallback(
    (_pluginId?: string) => {
      handleSearchNavigate('plugins', 'plugins-manager');
    },
    [handleSearchNavigate],
  );

  // Updater state helpers
  const isAppChecking = updater.status === 'checking';
  const isAppUpdateAvailable = updater.status === 'available';
  const isAppUpToDate = updater.status === 'up-to-date';
  const isAppError = updater.status === 'error';
  const isAppExternalUpdater = updater.status === 'external';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{t('title')}</h1>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <SettingsSearch onNavigate={handleSearchNavigate} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div ref={contentRef} className="mx-auto w-full max-w-6xl py-6">
              {/* Animated section transitions */}
              <div
                className={cn(
                  'transition-all duration-300 ease-out',
                  'animate-in fade-in-0 slide-in-from-right-4',
                )}
                key={activeSection}
              >
                {activeSection === 'general' && <GeneralSection highlightId={highlightId} />}

                {activeSection === 'dependencies' && (
                  <DependenciesSection highlightId={highlightId} />
                )}

                {activeSection === 'download' && <DownloadSection highlightId={highlightId} />}

                {activeSection === 'remote-download' && (
                  <RemoteDownloadSection highlightId={highlightId} />
                )}

                {activeSection === 'plugins' && <PluginsSection highlightId={highlightId} />}

                {activeSection === 'plugin-store' && (
                  <PluginStoreSection onOpenPlugins={handleOpenPluginsFromStore} />
                )}

                {activeSection === 'extension' && <ExtensionSection highlightId={highlightId} />}

                {activeSection === 'ai' && <AISection highlightId={highlightId} />}

                {activeSection === 'network' && <NetworkSection highlightId={highlightId} />}

                {activeSection === 'about' && (
                  <AboutSettingsContent
                    appVersion={appVersion}
                    updater={updater}
                    isAppChecking={isAppChecking}
                    isAppUpdateAvailable={isAppUpdateAvailable}
                    isAppUpToDate={isAppUpToDate}
                    isAppError={isAppError}
                    isAppExternalUpdater={isAppExternalUpdater}
                    highlightId={highlightId}
                  />
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// About Settings Content
function AboutSettingsContent({
  appVersion,
  updater,
  isAppChecking,
  isAppUpdateAvailable,
  isAppUpToDate,
  isAppError,
  isAppExternalUpdater,
  highlightId,
}: {
  appVersion: string;
  updater: ReturnType<typeof useUpdater>;
  isAppChecking: boolean;
  isAppUpdateAvailable: boolean;
  isAppUpToDate: boolean;
  isAppError: boolean;
  isAppExternalUpdater: boolean;
  highlightId: string | null;
}) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { settings, updateAutoCheckUpdate } = useDownload();

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('about.title')}
        description={t('about.description')}
        icon={<Info className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-pink-500 to-rose-600 shadow-pink-500/20"
      >
        {/* ── Hero App Info Card ── */}
        <div
          id="app-version"
          className={cn(
            'relative overflow-hidden rounded-[1.4rem] transition-all duration-500',
            'bg-background/78 shadow-[0_16px_40px_rgba(0,0,0,0.08)] backdrop-blur-2xl',
            'dark:shadow-[0_22px_50px_rgba(0,0,0,0.25)]',
            highlightId === 'app-version' &&
              'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--gradient-via)/0.16),_transparent_34%)]" />
          <div className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden">
                  <img
                    src="/logo-128.png"
                    alt="RETubeMatrix"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl font-bold tracking-tight gradient-text">
                      RETubeMatrix
                    </span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-xs bg-primary/10 text-primary border-0"
                    >
                      v{appVersion}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Hệ thống Quản trị &amp; Tái cấu trúc Video Đa Kênh Tự Động (AI Reup &amp; BKT
                    Matrix)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAppChecking ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        {t('about.checkingUpdates')}
                      </span>
                    ) : isAppUpdateAvailable && updater.updateInfo ? (
                      <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                        <Download className="w-3 h-3" />
                        {t('about.versionAvailable', { version: updater.updateInfo.version })}
                      </span>
                    ) : isAppUpToDate ? (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('about.upToDate')}
                      </span>
                    ) : isAppExternalUpdater ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Info className="w-3 h-3" />
                        {t('about.flatpakUpdates')}
                      </span>
                    ) : isAppError ? (
                      <span className="text-destructive">
                        {updater.error || t('about.checkFailed')}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAppUpdateAvailable && (
                  <Button
                    size="sm"
                    onClick={updater.downloadAndInstall}
                    disabled={updater.status === 'downloading' || updater.status === 'ready'}
                    className="gap-1.5 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                  >
                    {updater.status === 'downloading' || updater.status === 'ready' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {updater.status === 'downloading'
                          ? `${updater.progress && updater.progress.total > 0 ? Math.round((updater.progress.downloaded / updater.progress.total) * 100) : 0}%`
                          : t('about.restarting')}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {t('about.update')}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void updater.checkForUpdate()}
                  disabled={isAppChecking}
                  className="gap-1.5 h-8 text-xs border-border/60 hover:bg-muted/60"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isAppChecking && 'animate-spin')} />
                  <span>
                    {isAppChecking ? t('about.checkingUpdates') : t('about.checkForUpdates')}
                  </span>
                </Button>
              </div>
            </div>

            {/* Progress bar when downloading */}
            {updater.status === 'downloading' && updater.progress && updater.progress.total > 0 && (
              <div className="mt-4 pt-3 border-t border-border/30 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    Đang tải bản cập nhật...
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {Math.round((updater.progress.downloaded / updater.progress.total) * 100)}% (
                    {(updater.progress.downloaded / (1024 * 1024)).toFixed(1)} MB /{' '}
                    {(updater.progress.total / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
                <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-indigo-500 transition-all duration-300"
                    style={{
                      width: `${Math.round((updater.progress.downloaded / updater.progress.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Release Notes Preview when update is available */}
            {isAppUpdateAvailable && updater.updateInfo && (
              <div className="mt-4 p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Bản cập nhật mới: v{updater.updateInfo.version}
                  </span>
                  {updater.updateInfo.date && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(updater.updateInfo.date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {(updater.updateInfo.bodyVi || updater.updateInfo.body) && (
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">
                    {updater.updateInfo.bodyVi || updater.updateInfo.body}
                  </p>
                )}
              </div>
            )}

            {/* Quick Links */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/30">
              <span className="text-xs text-muted-foreground font-medium">
                RETubeMatrix System:
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-xs font-medium">
                Outlier Hunter (Ikigai)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-500 text-xs font-medium">
                Reup Pipeline Lv.1 &amp; Lv.2
              </span>
              <span className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-500 text-xs font-medium">
                BKT Channels Pool (15 Quota)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-500 text-xs font-medium">
                AI Title 95/5% &amp; Thumbnail
              </span>
            </div>
          </div>
        </div>

        {/* ── Responsible Use Notice ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/5 via-amber-500/5 to-orange-500/5 p-5">
          <div className="flex flex-col space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-[15px] font-bold text-foreground tracking-tight">
                {tCommon('legalDisclaimer.title')}
              </h3>
            </div>

            <div className="space-y-3.5 text-[13px] leading-relaxed text-muted-foreground mt-1">
              <p>{tCommon('legalDisclaimer.description')}</p>
              <div className="relative overflow-hidden rounded-xl bg-background/60 p-4 shadow-sm backdrop-blur-sm">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />
                <p className="font-medium text-foreground/90">
                  {tCommon('legalDisclaimer.notice')}
                </p>
              </div>
              <p>{tCommon('legalDisclaimer.responsibility')}</p>
            </div>
          </div>
        </div>

        {/* ── Core Features Matrix Architecture ── */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/40 border border-border/40">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold">Bảo Vệ Kênh &amp; Phân Luồng 1-1</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mỗi kênh đối thủ được cào dữ liệu được ánh xạ 1-1 với hồ sơ trình duyệt / kênh đích hệ
              thống. Hệ thống Traffic Light tự động khóa quét và ngừng tải khi phát hiện 2 video
              liên tiếp dính bản quyền để bảo toàn an toàn cho kênh.
            </p>
          </div>

          <div className="rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/40 border border-border/40">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold">Tự Động Hóa Kiểm Tra BKT Studio</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cơ chế cô lập phiên đa luồng với browser pool độc lập. Kiểm tra bản quyền Content ID ở
              chế độ Unlisted với hạn ngạch nghiêm ngặt 15 video/24h và tự động luân chuyển kênh
              test dự phòng.
            </p>
          </div>
        </div>

        {/* ── App Brand Footer ── */}
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-xs text-muted-foreground">RETubeMatrix System</span>
          <span className="text-xs text-muted-foreground font-mono">• All Engines Active</span>
        </div>

        {/* Auto Update Toggle */}
        <SettingsRow
          id="auto-update"
          label={t('about.autoUpdate')}
          description={t('about.autoUpdateDesc')}
          highlight={highlightId === 'auto-update'}
        >
          <Switch checked={settings.autoCheckUpdate} onCheckedChange={updateAutoCheckUpdate} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
