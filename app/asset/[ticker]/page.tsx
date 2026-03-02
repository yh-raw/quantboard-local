import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetChart } from "@/components/asset/asset-chart";
import { SyncAssetButton } from "@/components/asset/sync-asset-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_TIMEFRAME } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { getBars } from "@/lib/repo/priceBarRepo";
import { ensureTickerRealDataFresh } from "@/lib/services/realDataAutoRefresh";
import { normalizeTicker } from "@/lib/ticker";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: tickerParam } = await params;
  if (!tickerParam) {
    notFound();
  }

  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  const ticker = normalizeTicker(decodeURIComponent(tickerParam));
  await ensureTickerRealDataFresh(ticker);
  const bars = await getBars(ticker, DEFAULT_TIMEFRAME, 260);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href="/watchlist" className="text-sm text-muted-foreground hover:underline">
            ← {t("asset.back")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{ticker}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t("asset.timeframe")}</Badge>
          <SyncAssetButton ticker={ticker} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("asset.latestClose")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPrice(bars.at(-1)?.close ?? null)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("asset.cachedBars")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{bars.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("asset.latestTs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{bars.at(-1)?.ts.toISOString().slice(0, 10) ?? "--"}</div>
          </CardContent>
        </Card>
      </div>

      {bars.length > 0 ? (
        <AssetChart
          ticker={ticker}
          initialTimeframe={DEFAULT_TIMEFRAME}
          bars={bars.map((bar) => ({
            ts: bar.ts.toISOString(),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          }))}
        />
      ) : (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">{t("asset.noBars")}</CardContent>
        </Card>
      )}
    </div>
  );
}
