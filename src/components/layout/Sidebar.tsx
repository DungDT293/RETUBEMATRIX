import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  FlaskConical,
  FolderDown,
  Globe,
  LayoutDashboard,
  LogIn,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Tv,
  UserCheck,
  Users2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthModal } from '@/components/auth/AuthModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isOwnerEmail, useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export type Page =
  | 'dashboard'
  | 'saas'
  | 'profiles'
  | 'universal'
  | 'channels'
  | 'outliers'
  | 'reup'
  | 'library'
  | 'logs'
  | 'settings';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

interface NavItem {
  id: Page;
  labelKey: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'sidebar.dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    id: 'profiles',
    labelKey: 'sidebar.profiles',
    icon: <UserCheck className="w-5 h-5" />,
  },
  {
    id: 'channels',
    labelKey: 'sidebar.channels',
    icon: <Tv className="w-5 h-5" />,
  },
  {
    id: 'outliers',
    labelKey: 'sidebar.outliers',
    icon: <Flame className="w-5 h-5 text-orange-400" />,
  },
  {
    id: 'reup',
    labelKey: 'sidebar.reup',
    icon: <FlaskConical className="w-5 h-5" />,
  },
  {
    id: 'library',
    labelKey: 'sidebar.library',
    icon: <FolderDown className="w-5 h-5" />,
  },
  {
    id: 'universal',
    labelKey: 'sidebar.universal',
    icon: <Globe className="w-5 h-5" />,
  },
  {
    id: 'logs',
    labelKey: 'sidebar.logs',
    icon: <ScrollText className="w-5 h-5" />,
  },
  {
    id: 'saas',
    labelKey: 'sidebar.saas',
    icon: <Crown className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />,
  },
  {
    id: 'settings',
    labelKey: 'sidebar.settings',
    icon: <Settings className="w-5 h-5" />,
  },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const { t } = useTranslation('common');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { mode, toggleMode } = useTheme();
  const { user, isAuthenticated, isHwidMismatch } = useAuth();

  const isPrivileged =
    user?.role === 'owner' ||
    user?.role === 'admin' ||
    user?.role === 'leader' ||
    isOwnerEmail(user?.email);

  const visibleNavItems: NavItem[] = useMemo(() => {
    if (!isPrivileged) {
      return navItems.filter((item) => item.id !== 'saas');
    }
    return navItems.map((item) => {
      if (item.id === 'saas') {
        if (user?.role === 'admin') {
          return {
            ...item,
            labelKey: 'sidebar.saasAdmin',
            icon: (
              <Building2 className="w-5 h-5 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
            ),
          };
        }
        if (user?.role === 'leader') {
          return {
            ...item,
            labelKey: 'sidebar.saasLeader',
            icon: (
              <Users2 className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            ),
          };
        }
        return {
          ...item,
          labelKey: 'sidebar.saasOwner',
          icon: (
            <Crown className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          ),
        };
      }
      return item;
    });
  }, [isPrivileged, user?.role]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'h-full flex flex-col rounded-2xl transition-all duration-300 ease-out',
          'bg-card/30 backdrop-blur-xl',
          'border border-white/[0.08] dark:border-white/[0.05]',
          'shadow-[0_8px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.25)]',
          'relative overflow-hidden',
          isCollapsed ? 'w-[60px]' : 'w-[248px]',
        )}
      >
        {/* Subtle gradient overlay */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-50"
          style={{
            background: `
              linear-gradient(180deg, 
                hsl(var(--gradient-from) / 0.05) 0%, 
                transparent 30%,
                transparent 70%,
                hsl(var(--gradient-to) / 0.03) 100%
              )
            `,
          }}
        />

        {/* Logo */}
        <div
          className={cn(
            'relative flex items-center h-16 transition-all duration-300',
            isCollapsed ? 'justify-center px-2' : 'justify-start px-3.5',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'flex-shrink-0 rounded-xl overflow-hidden transition-all duration-300',
                isCollapsed ? 'w-9 h-9' : 'w-10 h-10',
              )}
            >
              <img src="/logo-128.png" alt="RETubeMatrix" className="w-full h-full object-cover" />
            </div>
            <span
              className={cn(
                'font-bold text-lg whitespace-nowrap transition-all duration-300 gradient-text tracking-wide',
                isCollapsed ? 'opacity-0 w-0 ml-0 pointer-events-none' : 'opacity-100',
              )}
            >
              RETubeMatrix
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Navigation */}
        <nav className="relative flex-1 p-2 space-y-1 mt-2">
          {visibleNavItems.map((item, index) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onPageChange(item.id)}
                  className={cn(
                    'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                    'transition-all duration-200 ease-out',
                    'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]',
                    currentPage === item.id && ['bg-primary/10', 'text-primary'],
                    currentPage !== item.id && 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 transition-all duration-200 relative',
                      'group-hover:scale-110',
                      currentPage === item.id && 'drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)]',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium whitespace-nowrap transition-all duration-300',
                      isCollapsed ? 'opacity-0 w-0' : 'opacity-100',
                    )}
                  >
                    {`${index + 1}. ${t(item.labelKey)}`}
                  </span>

                  {/* Active indicator */}
                  {currentPage === item.id && (
                    <div className="absolute left-0 w-1 h-5 rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />
                  )}
                </button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="font-medium">
                  {`${index + 1}. ${t(item.labelKey)}`}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="relative p-2 space-y-1">
          {/* Divider */}
          <div className="mx-1 mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* SaaS Account / License Button */}
          {(() => {
            const isOwner = user?.role === 'owner' || isOwnerEmail(user?.email);
            const isRealMismatch = isHwidMismatch && !isOwner;

            let buttonClass =
              'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ease-out';
            let iconNode: React.ReactNode = (
              <LogIn className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300" />
            );
            let labelText = 'Đăng nhập / Đăng ký';
            let tooltipText = 'Đăng nhập hoặc Đăng ký tài khoản RETubeMatrix';

            if (isRealMismatch) {
              buttonClass = cn(
                buttonClass,
                'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20',
              );
              iconNode = <AlertTriangle className="w-5 h-5 text-rose-400" />;
              labelText = 'Lỗi khóa máy';
              tooltipText = 'Thiết bị không trùng khớp. Nhấn để gửi đơn đổi máy.';
            } else if (isAuthenticated && user) {
              const sanitizeName = (raw?: string | null) => {
                if (!raw) return isOwner ? 'Tiến Dũng (Master Owner)' : 'Thành viên';
                return raw.replace(/Dũng\s+(Đỗ|Đồng)/gi, 'Tiến Dũng');
              };
              const userDisplayName = sanitizeName(user?.fullName);

              if (isOwner) {
                buttonClass = cn(
                  buttonClass,
                  'bg-gradient-to-r from-purple-500/15 to-amber-500/15 border border-purple-500/30 text-purple-200 hover:from-purple-500/25 hover:to-amber-500/25',
                );
                iconNode = (
                  <Crown className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                );
                const ownerDisplayName = userDisplayName.includes('Master Owner')
                  ? userDisplayName
                  : `${userDisplayName} (Master Owner)`;
                labelText = ownerDisplayName;
                tooltipText = `${ownerDisplayName} • Master Owner (Đặc quyền mọi máy)`;
              } else if (user.role === 'admin') {
                buttonClass = cn(
                  buttonClass,
                  'bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20',
                );
                iconNode = <Building2 className="w-5 h-5 text-blue-400" />;
                labelText = userDisplayName || 'Sếp công ty';
                tooltipText = `${userDisplayName} • Quản trị viên (Admin)`;
              } else if (user.role === 'leader') {
                buttonClass = cn(
                  buttonClass,
                  'bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20',
                );
                iconNode = <Users2 className="w-5 h-5 text-amber-400" />;
                labelText = userDisplayName || 'Trưởng nhóm';
                tooltipText = `${userDisplayName} • Trưởng nhóm (Leader)`;
              } else {
                buttonClass = cn(
                  buttonClass,
                  'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20',
                );
                iconNode = <UserCheck className="w-5 h-5 text-emerald-400" />;
                labelText = userDisplayName || 'Nhân viên';
                tooltipText = `${userDisplayName} • Nhân viên (Staff)`;
              }
            } else {
              buttonClass = cn(
                buttonClass,
                'text-slate-300 hover:text-white hover:bg-white/[0.08] dark:hover:bg-white/[0.05] border border-transparent hover:border-white/10',
              );
            }

            return (
              <div className="relative group/user flex items-center gap-1 w-full">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (isAuthenticated && isPrivileged) {
                          onPageChange('saas');
                        } else {
                          setIsAuthModalOpen(true);
                        }
                      }}
                      className={cn(buttonClass, 'flex-1 min-w-0')}
                    >
                      <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                        {iconNode}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium whitespace-nowrap transition-all duration-300 truncate text-left',
                          isCollapsed ? 'opacity-0 w-0' : 'opacity-100',
                        )}
                      >
                        {labelText}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {isPrivileged ? `${tooltipText} — Nhấn để mở Quản trị hệ thống` : tooltipText}
                  </TooltipContent>
                </Tooltip>

                {isAuthenticated && !isCollapsed && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Cài đặt tài khoản & Đăng xuất"
                        onClick={() => setIsAuthModalOpen(true)}
                        className="p-2 rounded-xl hover:bg-white/[0.08] dark:hover:bg-white/[0.05] text-slate-400 hover:text-white transition shrink-0"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      Cài đặt tài khoản & Đăng xuất
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })()}

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleMode}
                className={cn(
                  'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]',
                )}
              >
                <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                  {mode === 'dark' ? (
                    <Sun className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-indigo-400" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium whitespace-nowrap transition-all duration-300',
                    isCollapsed ? 'opacity-0 w-0' : 'opacity-100',
                  )}
                >
                  {mode === 'dark' ? t('sidebar.light') : t('sidebar.dark')}
                </span>
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="font-medium">
                {mode === 'dark' ? t('sidebar.lightMode') : t('sidebar.darkMode')}
              </TooltipContent>
            )}
          </Tooltip>

          {/* Collapse Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]',
                )}
              >
                <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                  {isCollapsed ? (
                    <ChevronRight className="w-5 h-5" />
                  ) : (
                    <ChevronLeft className="w-5 h-5" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium whitespace-nowrap transition-all duration-300',
                    isCollapsed ? 'opacity-0 w-0' : 'opacity-100',
                  )}
                >
                  {t('sidebar.collapse')}
                </span>
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="font-medium">
                {t('sidebar.expand')}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </TooltipProvider>
  );
}
