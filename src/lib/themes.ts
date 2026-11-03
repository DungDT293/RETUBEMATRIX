export type ThemeName =
  | 'rose'
  | 'crimson'
  | 'midnight'
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'forest'
  | 'candy';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
}

export interface GradientColors {
  from: string;
  via?: string;
  to: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  emoji: string;
  gradient: {
    light: GradientColors;
    dark: GradientColors;
  };
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

export const themes: Theme[] = [
  {
    name: 'rose',
    label: 'Soft Rose (Đỏ Dịu)',
    emoji: '🌹',
    gradient: {
      light: { from: '350 85% 65%', via: '358 80% 68%', to: '15 85% 65%' },
      dark: { from: '350 70% 35%', via: '358 75% 38%', to: '15 70% 35%' },
    },
    colors: {
      light: {
        primary: '354 75% 58%',
        primaryForeground: '0 0% 100%',
        accent: '350 80% 96%',
        accentForeground: '354 75% 35%',
      },
      dark: {
        primary: '354 80% 65%',
        primaryForeground: '0 0% 100%',
        accent: '354 45% 18%',
        accentForeground: '354 85% 85%',
      },
    },
  },
  {
    name: 'crimson',
    label: 'Crimson Wine',
    emoji: '🍷',
    gradient: {
      light: { from: '345 75% 52%', via: '355 70% 55%', to: '10 75% 50%' },
      dark: { from: '345 65% 30%', via: '355 70% 32%', to: '10 65% 28%' },
    },
    colors: {
      light: {
        primary: '348 80% 52%',
        primaryForeground: '0 0% 100%',
        accent: '348 70% 95%',
        accentForeground: '348 80% 28%',
      },
      dark: {
        primary: '348 85% 62%',
        primaryForeground: '0 0% 100%',
        accent: '348 40% 16%',
        accentForeground: '348 85% 82%',
      },
    },
  },
  {
    name: 'midnight',
    label: 'Midnight',
    emoji: '🌙',
    gradient: {
      light: { from: '240 60% 50%', via: '280 70% 55%', to: '320 65% 50%' },
      dark: { from: '240 70% 35%', via: '280 80% 40%', to: '320 75% 35%' },
    },
    colors: {
      light: {
        primary: '262 83% 58%',
        primaryForeground: '0 0% 100%',
        accent: '280 60% 95%',
        accentForeground: '262 83% 30%',
      },
      dark: {
        primary: '270 80% 65%',
        primaryForeground: '0 0% 100%',
        accent: '280 50% 20%',
        accentForeground: '270 80% 85%',
      },
    },
  },
  {
    name: 'aurora',
    label: 'Aurora',
    emoji: '🌌',
    gradient: {
      light: { from: '160 80% 45%', via: '190 85% 50%', to: '220 80% 55%' },
      dark: { from: '160 90% 30%', via: '190 95% 35%', to: '220 90% 40%' },
    },
    colors: {
      light: {
        primary: '175 80% 40%',
        primaryForeground: '0 0% 100%',
        accent: '180 60% 94%',
        accentForeground: '175 80% 25%',
      },
      dark: {
        primary: '175 85% 50%',
        primaryForeground: '180 100% 10%',
        accent: '180 40% 18%',
        accentForeground: '175 85% 80%',
      },
    },
  },
  {
    name: 'sunset',
    label: 'Sunset',
    emoji: '🌅',
    gradient: {
      light: { from: '15 90% 55%', via: '35 95% 55%', to: '45 90% 50%' },
      dark: { from: '15 85% 40%', via: '35 90% 42%', to: '45 85% 38%' },
    },
    colors: {
      light: {
        primary: '25 95% 53%',
        primaryForeground: '0 0% 100%',
        accent: '30 100% 95%',
        accentForeground: '25 95% 30%',
      },
      dark: {
        primary: '30 95% 55%',
        primaryForeground: '30 100% 10%',
        accent: '25 50% 18%',
        accentForeground: '30 95% 80%',
      },
    },
  },
  {
    name: 'ocean',
    label: 'Ocean',
    emoji: '🌊',
    gradient: {
      light: { from: '200 90% 50%', via: '215 85% 55%', to: '230 80% 60%' },
      dark: { from: '200 95% 35%', via: '215 90% 40%', to: '230 85% 45%' },
    },
    colors: {
      light: {
        primary: '215 90% 55%',
        primaryForeground: '0 0% 100%',
        accent: '210 80% 95%',
        accentForeground: '215 90% 30%',
      },
      dark: {
        primary: '215 95% 60%',
        primaryForeground: '215 100% 10%',
        accent: '215 50% 18%',
        accentForeground: '215 95% 85%',
      },
    },
  },
  {
    name: 'forest',
    label: 'Forest',
    emoji: '🌲',
    gradient: {
      light: { from: '140 70% 40%', via: '160 65% 45%', to: '175 60% 42%' },
      dark: { from: '140 75% 28%', via: '160 70% 32%', to: '175 65% 30%' },
    },
    colors: {
      light: {
        primary: '152 75% 40%',
        primaryForeground: '0 0% 100%',
        accent: '150 50% 94%',
        accentForeground: '152 75% 25%',
      },
      dark: {
        primary: '152 80% 48%',
        primaryForeground: '150 100% 10%',
        accent: '150 40% 16%',
        accentForeground: '152 80% 80%',
      },
    },
  },
  {
    name: 'candy',
    label: 'Candy',
    emoji: '🍬',
    gradient: {
      light: { from: '330 85% 60%', via: '350 80% 65%', to: '10 85% 60%' },
      dark: { from: '330 90% 42%', via: '350 85% 48%', to: '10 90% 45%' },
    },
    colors: {
      light: {
        primary: '340 85% 55%',
        primaryForeground: '0 0% 100%',
        accent: '340 70% 96%',
        accentForeground: '340 85% 30%',
      },
      dark: {
        primary: '340 90% 60%',
        primaryForeground: '0 0% 100%',
        accent: '340 50% 18%',
        accentForeground: '340 90% 85%',
      },
    },
  },
];

export const getTheme = (name: ThemeName): Theme => {
  return themes.find((t) => t.name === name) || themes[0];
};
