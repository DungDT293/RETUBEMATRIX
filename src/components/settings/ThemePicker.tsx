import { Check, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTheme } from '@/contexts/ThemeContext';
import { themeGradients, themes } from '@/lib/themes';
import { cn } from '@/lib/utils';

export function ThemePicker() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl hover:bg-white/[0.08] dark:hover:bg-white/[0.05]"
          title={t('general.colorTheme')}
        >
          <Palette className="h-4 w-4" />
          <span className="sr-only">{t('general.colorTheme')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-3" align="end">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('general.colorTheme')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {themes.map((themeItem) => (
              <button
                type="button"
                key={themeItem.name}
                onClick={() => setTheme(themeItem.name)}
                title={themeItem.label}
                className={cn(
                  'group flex items-center gap-2.5 p-2 rounded-xl transition-all text-left border-2',
                  theme === themeItem.name
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/30 hover:bg-muted/50',
                )}
              >
                <div
                  className={cn(
                    'w-7 h-7 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110 shrink-0',
                    themeGradients[themeItem.name],
                  )}
                >
                  {theme === themeItem.name && (
                    <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[2.5]" />
                  )}
                </div>
                <span className="text-xs font-medium truncate">{themeItem.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
