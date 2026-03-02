import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getServerAuthSession } from "@/lib/auth/session";
import { formatPct, formatPrice } from "@/lib/format";
import { listWatchlistTickers } from "@/lib/repo/watchlistRepo";
import { ensureWatchlistRealDataFresh } from "@/lib/services/realDataAutoRefresh";
import { getRecentSignals } from "@/lib/services/signalService";
import { bootstrapUserWatchlist, getWatchlistOverview } from "@/lib/services/watchlistService";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/auth/signin");
  }

  await bootstrapUserWatchlist(userId);
  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  const tickers = await listWatchlistTickers(userId);
  await ensureWatchlistRealDataFresh(tickers);

  const watchlist = await getWatchlistOverview(userId);
  const signals = await getRecentSignals(watchlist.map((item) => item.ticker));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.recentSignals.title")}</CardTitle>
            <CardDescription>{t("dashboard.recentSignals.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {signals.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {signals.map((signal) => (
                  <Link key={`${signal.ticker}-${signal.ts}-${signal.type}`} href={`/asset/${encodeURIComponent(signal.ticker)}`}>
                    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{signal.ticker}</Badge>
                        <span className="text-xs text-muted-foreground">{signal.ts.slice(0, 10)}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium">{signal.type}</div>
                      <div className="text-xs text-muted-foreground">@ {formatPrice(signal.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t("dashboard.recentSignals.empty")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.watchlistEntry.title")}</CardTitle>
            <CardDescription>{t("dashboard.watchlistEntry.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-semibold">{watchlist.length}</div>
            <p className="text-xs text-muted-foreground">
              {watchlist.length} {t("dashboard.watchlistEntry.assets")}
            </p>
            <Separator />
            <Link href="/watchlist" className="text-sm font-medium text-primary hover:underline">
              {t("dashboard.watchlistEntry.link")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.snapshot.title")}</CardTitle>
          <CardDescription>{t("dashboard.snapshot.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {watchlist.map((item) => (
              <Link key={item.ticker} href={`/asset/${encodeURIComponent(item.ticker)}`}>
                <div className="rounded-lg border p-3 transition-colors hover:bg-muted/40">
                  <div className="text-sm font-medium">{item.ticker}</div>
                  <div className="mt-1 text-lg font-semibold">{formatPrice(item.latestClose)}</div>
                  <div
                    className={
                      item.changePct === null
                        ? "text-xs text-muted-foreground"
                        : item.changePct < 0
                          ? "text-xs text-red-600"
                          : "text-xs text-green-600"
                    }
                  >
                    {formatPct(item.changePct)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
