import { useState, useEffect } from 'react';
import { getCurrentLocale, setLocale, getAvailableLocales, translateErrorCode } from '@/lib/i18n';

type Locale = 'en' | 'es';

/**
 * Custom hook for i18n functionality
 * @returns Object with locale management and translation functions
 */
export function useI18n() {
  const [currentLocale, setCurrentLocale] = useState<Locale>(getCurrentLocale());

  /**
   * Change the current locale
   * @param newLocale - The locale to switch to
   */
  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    setCurrentLocale(newLocale);
  };

  /**
   * Translate an error code
   * @param errorCode - The error code to translate
   * @returns The translated message
   */
  const t = (errorCode: string): string => {
    return translateErrorCode(errorCode);
  };

  return {
    locale: currentLocale,
    availableLocales: getAvailableLocales(),
    changeLocale,
    translateErrorCode: t,
  };
}