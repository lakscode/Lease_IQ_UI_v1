// Minimal i18n: every file in ./locales exports a LocaleDict; they are merged at build time.
// Keys are namespaced ("leases.upload.title"). Missing translations fall back to English, then the key.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setFormatLocale } from '../lib/format.ts';

export const LOCALES = ['en', 'de', 'es', 'pt', 'it'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English', de: 'Deutsch', es: 'Español', pt: 'Português', it: 'Italiano',
};

export type LocaleDict = { en: Record<string, string> } & Partial<Record<Exclude<Locale, 'en'>, Record<string, string>>>;

const modules = import.meta.glob<{ default: LocaleDict }>('./locales/*.ts', { eager: true });
const dictionaries: Record<Locale, Record<string, string>> = { en: {}, de: {}, es: {}, pt: {}, it: {} };
for (const mod of Object.values(modules)) {
  for (const locale of LOCALES) Object.assign(dictionaries[locale], mod.default[locale] ?? {});
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let text = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

const STORAGE_KEY = 'leaseiq.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // storage unavailable
  }
  const nav = navigator.language.slice(0, 2);
  return (LOCALES as readonly string[]).includes(nav) ? (nav as Locale) : 'en';
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    setFormatLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
