import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import en from "./en";
import zh from "./zh";

const locales: Record<string, Record<string, string>> = { en, zh };
type Locale = "en" | "zh";

let _currentLocale: Locale = "en";
const _listeners: (() => void)[] = [];

export function setGlobalLocale(locale: Locale) {
  _currentLocale = locale;
  _listeners.forEach((fn) => fn());
}

export function getGlobalLocale(): Locale {
  return _currentLocale;
}

export function t(key: string, ...args: string[]): string {
  const dict = locales[_currentLocale] || locales.en;
  let val = dict[key] ?? key;
  args.forEach((arg, i) => {
    val = val.replace(`{${i}}`, arg);
  });
  return val;
}

export function useT() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    _listeners.push(fn);
    return () => { const idx = _listeners.indexOf(fn); if (idx >= 0) _listeners.splice(idx, 1); };
  }, []);
  return t;
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const setLocale = useCallback((locale: Locale) => {
    setGlobalLocale(locale);
    window.gitAPI?.setSetting("language", locale);
  }, []);
  return [_currentLocale, setLocale];
}


