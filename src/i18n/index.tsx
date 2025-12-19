import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { zhCN } from './zh-CN';

export type Language = 'en' | 'zh-CN';

const STORAGE_KEY = 'openscreen.language';

type InterpolationValues = Record<string, string | number>;

function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function translateKnownPatternsZh(message: string): string | null {
  const patterns: Array<{ regex: RegExp; template: string }> = [
    { regex: /^Failed to load video:\s*(.+)$/i, template: '加载视频失败：{{detail}}' },
    { regex: /^Failed to load background image:\s*(.+)$/i, template: '加载背景图片失败：{{detail}}' },
    { regex: /^FFmpeg exited with code\s*(.+)\.$/i, template: 'FFmpeg 已退出，退出码：{{detail}}' },
  ];

  for (const { regex, template } of patterns) {
    const match = message.match(regex);
    if (!match) continue;
    return interpolate(template, { detail: match[1] ?? '' });
  }

  return null;
}

function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'zh' || lower === 'zh-cn' || lower.startsWith('zh-')) return 'zh-CN';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

function detectDefaultLanguage(): Language {
  const navLang = typeof navigator !== 'undefined' ? normalizeLanguage(navigator.language) : null;
  return navLang ?? 'en';
}

export type TFunction = (key: string, values?: InterpolationValues) => string;

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const stored = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
      return stored ?? detectDefaultLanguage();
    } catch {
      return detectDefaultLanguage();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore
    }
  }, [language]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeLanguage(event.newValue);
      if (!next) return;
      setLanguage((current) => (current === next ? current : next));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const t: TFunction = useCallback(
    (key, values) => {
      if (language === 'zh-CN') {
        const direct = zhCN[key];
        if (direct !== undefined) {
          return interpolate(direct, values);
        }
        const patternHit = translateKnownPatternsZh(key);
        if (patternHit) return patternHit;
      }

      return interpolate(key, values);
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

