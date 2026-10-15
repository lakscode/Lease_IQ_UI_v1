// Minimal i18n: every file in ./locales exports a LocaleDict; they are merged at build time.
// The provider component lives in I18nProvider.tsx so this module exports no components (React Fast Refresh).
// Keys are namespaced ("leases.upload.title"). Missing translations fall back to English, then the key.
import { createContext, useContext } from 'react';

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

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let text = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
