"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, setLocale, t } = useLanguage();

  function applyLocale(nextLocale: "en" | "zh") {
    if (nextLocale === locale) {
      return;
    }
    setLocale(nextLocale);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 rounded-md border p-1">
      <Button
        size="sm"
        variant={locale === "en" ? "default" : "ghost"}
        onClick={() => applyLocale("en")}
        type="button"
      >
        {t("lang.en")}
      </Button>
      <Button
        size="sm"
        variant={locale === "zh" ? "default" : "ghost"}
        onClick={() => applyLocale("zh")}
        type="button"
      >
        {t("lang.zh")}
      </Button>
    </div>
  );
}
