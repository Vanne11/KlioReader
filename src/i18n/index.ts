import { create } from 'zustand';
import es from './locales/es';
import en from './locales/en';
import badgesEs from './badges/es';
import badgesEn from './badges/en';
import type { TranslationDict } from './locales/es';

export type Locale = 'es' | 'en';

const dictionaries: Record<Locale, TranslationDict> = { es, en };
const badgeDicts: Record<Locale, Record<string, { name: string; description: string }>> = { es: badgesEs, en: badgesEn };

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: (localStorage.getItem('klioLocale') as Locale) || detectLocale(),
  setLocale: (locale) => {
    localStorage.setItem('klioLocale', locale);
    set({ locale });
  },
}));

export function detectLocale(): Locale {
  const lang = navigator.language || '';
  return lang.startsWith('es') ? 'es' : 'en';
}

/** Resolve a dot-notation key from a dictionary */
function resolve(dict: any, key: string): string | string[] | undefined {
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Interpolate {var} placeholders */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`);
}

function createT(locale: Locale) {
  const dict = dictionaries[locale];
  const badges = badgeDicts[locale];

  function t(key: string, vars?: Record<string, string | number>): string {
    const val = resolve(dict, key);
    if (typeof val === 'string') return interpolate(val, vars);
    return key; // fallback
  }

  function tp(key: string, count: number, vars?: Record<string, string | number>): string {
    const val = resolve(dict, key);
    if (Array.isArray(val) && val.length === 2) {
      const str = count === 1 ? val[0] : val[1];
      return interpolate(str, { count, ...vars });
    }
    return t(key, vars);
  }

  function badge(id: string): { name: string; description: string } {
    return badges[id] || { name: id, description: '' };
  }

  return { t, tp, badge, locale };
}

/** Hook for components */
export function useT() {
  const locale = useI18nStore(s => s.locale);
  return createT(locale);
}

/** Non-hook version for outside components */
export function getT(locale?: Locale) {
  return createT(locale || useI18nStore.getState().locale);
}
