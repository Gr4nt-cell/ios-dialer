import React, { createContext, useContext, useMemo } from 'react';
import { NativeModules, Platform } from 'react-native';
import { LANGS, STRINGS } from './strings';

export { LANGS } from './strings';

// The chosen language lives in the normal settings object, so it persists and
// syncs through the same path as every other preference.

const I18nContext = createContext((s) => s);

/** Best match for the device language, used when the setting is "system". */
export function deviceLanguage() {
  let tag = '';
  try {
    if (Platform.OS === 'android') {
      const l = NativeModules.I18nManager && NativeModules.I18nManager.localeIdentifier;
      tag = l || '';
    } else {
      const s = NativeModules.SettingsManager && NativeModules.SettingsManager.settings;
      tag = (s && (s.AppleLocale || (s.AppleLanguages && s.AppleLanguages[0]))) || '';
    }
  } catch {
    tag = '';
  }
  if (!tag) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale || '';
    } catch {
      tag = '';
    }
  }
  const lower = String(tag).toLowerCase().replace('_', '-');
  if (lower.startsWith('zh')) return 'zh';
  const base = lower.split('-')[0];
  return LANGS.some((l) => l.code === base) ? base : 'en';
}

export function I18nProvider({ language, children }) {
  const translate = useMemo(() => {
    const code = !language || language === 'system' ? deviceLanguage() : language;
    if (code === 'en') return (s) => s;
    return (s) => {
      const entry = STRINGS[s];
      return (entry && entry[code]) || s;
    };
  }, [language]);

  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

/**
 * Translate a string. Named `tr` at call sites because `t` is already the
 * theme throughout this codebase.
 */
export const useT = () => useContext(I18nContext);
