import { headers } from "next/headers";
import { DEFAULT_LOCALE, dictionaries, formatMessage, isLocale, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

export async function getServerLocale(): Promise<Locale> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)locale=(en|zh)(?:;|$)/);
  const value = match?.[1];
  if (value && isLocale(value)) {
    return value;
  }
  return DEFAULT_LOCALE;
}

export function getServerTranslator(locale: Locale) {
  return (key: TranslationKey, params?: Record<string, string | number>) => {
    const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
    return formatMessage(template, params);
  };
}
