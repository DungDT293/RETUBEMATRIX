import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import arChannels from './locales/ar/channels.json';
import arCommon from './locales/ar/common.json';
import arDownload from './locales/ar/download.json';
import arPages from './locales/ar/pages.json';
import arSettings from './locales/ar/settings.json';
import arUniversal from './locales/ar/universal.json';
import enChannels from './locales/en/channels.json';
// Import translations
import enCommon from './locales/en/common.json';
import enDownload from './locales/en/download.json';
import enPages from './locales/en/pages.json';
import enSettings from './locales/en/settings.json';
import enUniversal from './locales/en/universal.json';
import esChannels from './locales/es/channels.json';
import esCommon from './locales/es/common.json';
import esDownload from './locales/es/download.json';
import esPages from './locales/es/pages.json';
import esSettings from './locales/es/settings.json';
import esUniversal from './locales/es/universal.json';
import frChannels from './locales/fr/channels.json';
import frCommon from './locales/fr/common.json';
import frDownload from './locales/fr/download.json';
import frPages from './locales/fr/pages.json';
import frSettings from './locales/fr/settings.json';
import frUniversal from './locales/fr/universal.json';
import jaChannels from './locales/ja/channels.json';
import jaCommon from './locales/ja/common.json';
import jaDownload from './locales/ja/download.json';
import jaPages from './locales/ja/pages.json';
import jaSettings from './locales/ja/settings.json';
import jaUniversal from './locales/ja/universal.json';
import ptChannels from './locales/pt/channels.json';
import ptCommon from './locales/pt/common.json';
import ptDownload from './locales/pt/download.json';
import ptPages from './locales/pt/pages.json';
import ptSettings from './locales/pt/settings.json';
import ptUniversal from './locales/pt/universal.json';
import roChannels from './locales/ro/channels.json';
import roCommon from './locales/ro/common.json';
import roDownload from './locales/ro/download.json';
import roPages from './locales/ro/pages.json';
import roSettings from './locales/ro/settings.json';
import roUniversal from './locales/ro/universal.json';

import ruChannels from './locales/ru/channels.json';
import ruCommon from './locales/ru/common.json';
import ruDownload from './locales/ru/download.json';
import ruPages from './locales/ru/pages.json';
import ruSettings from './locales/ru/settings.json';
import ruUniversal from './locales/ru/universal.json';
import thChannels from './locales/th/channels.json';
import thCommon from './locales/th/common.json';
import thDownload from './locales/th/download.json';
import thPages from './locales/th/pages.json';
import thSettings from './locales/th/settings.json';
import thUniversal from './locales/th/universal.json';
import trChannels from './locales/tr/channels.json';
import trCommon from './locales/tr/common.json';
import trDownload from './locales/tr/download.json';
import trPages from './locales/tr/pages.json';
import trSettings from './locales/tr/settings.json';
import trUniversal from './locales/tr/universal.json';
import uzChannels from './locales/uz/channels.json';
import uzCommon from './locales/uz/common.json';
import uzDownload from './locales/uz/download.json';
import uzPages from './locales/uz/pages.json';
import uzSettings from './locales/uz/settings.json';
import uzUniversal from './locales/uz/universal.json';
import viChannels from './locales/vi/channels.json';
import viCommon from './locales/vi/common.json';
import viDownload from './locales/vi/download.json';
import viPages from './locales/vi/pages.json';
import viSettings from './locales/vi/settings.json';
import viUniversal from './locales/vi/universal.json';
import zhCNChannels from './locales/zh-CN/channels.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNDownload from './locales/zh-CN/download.json';
import zhCNPages from './locales/zh-CN/pages.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNUniversal from './locales/zh-CN/universal.json';

const resources = {
  ar: {
    common: arCommon,
    channels: arChannels,
    download: arDownload,
    universal: arUniversal,
    pages: arPages,
    settings: arSettings,
  },
  en: {
    common: enCommon,
    channels: enChannels,
    download: enDownload,
    universal: enUniversal,
    pages: enPages,
    settings: enSettings,
  },
  es: {
    common: esCommon,
    channels: esChannels,
    download: esDownload,
    universal: esUniversal,
    pages: esPages,
    settings: esSettings,
  },
  fr: {
    common: frCommon,
    channels: frChannels,
    download: frDownload,
    universal: frUniversal,
    pages: frPages,
    settings: frSettings,
  },
  ja: {
    common: jaCommon,
    channels: jaChannels,
    download: jaDownload,
    universal: jaUniversal,
    pages: jaPages,
    settings: jaSettings,
  },
  vi: {
    common: viCommon,
    channels: viChannels,
    download: viDownload,
    universal: viUniversal,
    pages: viPages,
    settings: viSettings,
  },
  'zh-CN': {
    common: zhCNCommon,
    channels: zhCNChannels,
    download: zhCNDownload,
    universal: zhCNUniversal,
    pages: zhCNPages,
    settings: zhCNSettings,
  },
  pt: {
    common: ptCommon,
    channels: ptChannels,
    download: ptDownload,
    universal: ptUniversal,
    pages: ptPages,
    settings: ptSettings,
  },
  ro: {
    common: roCommon,
    channels: roChannels,
    download: roDownload,
    universal: roUniversal,
    pages: roPages,
    settings: roSettings,
  },
  ru: {
    common: ruCommon,
    channels: ruChannels,
    download: ruDownload,
    universal: ruUniversal,
    pages: ruPages,
    settings: ruSettings,
  },
  th: {
    common: thCommon,
    channels: thChannels,
    download: thDownload,
    universal: thUniversal,
    pages: thPages,
    settings: thSettings,
  },
  tr: {
    common: trCommon,
    channels: trChannels,
    download: trDownload,
    universal: trUniversal,
    pages: trPages,
    settings: trSettings,
  },
  uz: {
    common: uzCommon,
    channels: uzChannels,
    download: uzDownload,
    universal: uzUniversal,
    pages: uzPages,
    settings: uzSettings,
  },
};

const RTL_LANGUAGES = new Set(['ar']);

function applyDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return;

  const baseLanguage = language.toLowerCase().split('-')[0];
  document.documentElement.lang = language;
  document.documentElement.dir = RTL_LANGUAGES.has(baseLanguage) ? 'rtl' : 'ltr';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'channels', 'download', 'universal', 'pages', 'settings'],

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false,
    },
  });

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
