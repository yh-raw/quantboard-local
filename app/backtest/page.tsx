import { BacktestRunner } from "@/components/backtest/backtest-runner";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("backtest.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("backtest.page.subtitle")}</p>
      </section>
      <BacktestRunner />
    </div>
  );
}
