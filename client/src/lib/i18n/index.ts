import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';

type Locale = 'en' | 'es';

interface Translations {
  errorCodes: Record<string, string>;
}

const translations: Record<Locale, Translations> = {
  en: enTranslations,
  es: esTranslations,
};

let currentLocale: Locale = 'en';

/**
 * Set the current locale for translations
 * @param locale - The locale to set ('en' or 'es')
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Get the current locale
 * @returns The current locale
 */
export function getCurrentLocale(): Locale {
  return currentLocale;
}

/**
 * Get available locales
 * @returns Array of available locale codes
 */
export function getAvailableLocales(): Locale[] {
  return Object.keys(translations) as Locale[];
}

/**
 * Translate an error code to a localized message
 * @param errorCode - The error code to translate
 * @param locale - Optional locale to use (defaults to current locale)
 * @returns The translated message or the error code if no translation is found
 */
export function translateErrorCode(errorCode: string, locale?: Locale): string {
  const targetLocale = locale || currentLocale;
  const translation = translations[targetLocale]?.errorCodes[errorCode];
  
  if (translation) {
    return translation;
  }
  
  // Fallback to English if current locale doesn't have the translation
  if (targetLocale !== 'en') {
    const englishTranslation = translations.en?.errorCodes[errorCode];
    if (englishTranslation) {
      return englishTranslation;
    }
  }
  
  // Return the error code itself if no translation is found
  return errorCode;
}

/**
 * Initialize i18n with browser locale detection
 */
export function initializeI18n(): void {
  // Try to detect browser locale
  const browserLocale = navigator.language.toLowerCase();
  
  if (browserLocale.startsWith('es')) {
    setLocale('en');
  } else {
    setLocale('en');
  }
}