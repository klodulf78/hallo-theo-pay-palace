import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type Lang } from "./translations";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (path: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "hf.lang";

function resolve(obj: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "de" || stored === "en") setLangState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<Ctx>(() => {
    const dict = translations[lang];
    return {
      lang,
      setLang,
      t: (path: string) => resolve(dict, path),
    };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for any tree rendered outside provider — return English defaults
    return {
      lang: "en",
      setLang: () => {},
      t: (path: string) => resolve(translations.en, path),
    };
  }
  return ctx;
}

// --- Formatters ---

export function formatDate(iso: string | Date | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso) : iso;
  if (isNaN(d.getTime())) return "—";
  const locale = lang === "de" ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    day: lang === "de" ? "2-digit" : "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatMonth(month: string | null | undefined, lang: Lang): string {
  if (!month) return "—";
  const d = new Date(`${month}-01T00:00:00Z`);
  const locale = lang === "de" ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(d);
}

export function formatCurrency(amount: number, lang: Lang): string {
  const locale = lang === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatNumber(n: number, lang: Lang): string {
  const locale = lang === "de" ? "de-DE" : "en-US";
  return n.toLocaleString(locale);
}

export function formatPercent(n: number, lang: Lang, digits = 1): string {
  const locale = lang === "de" ? "de-DE" : "en-US";
  return `${n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
