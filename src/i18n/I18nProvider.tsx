// Locale state for the app: the current locale (saved per browser), date/number formatting, <html lang>.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setFormatLocale } from '../lib/format.ts';
import { I18nContext, LOCALES, translate, type Locale, type TFunction } from './index.tsx';

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
