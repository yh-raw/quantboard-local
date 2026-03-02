import { redirect } from "next/navigation";
import { WatchlistManager } from "@/components/watchlist/watchlist-manager";
import { getServerAuthSession } from "@/lib/auth/session";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export default async function WatchlistPage() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("watchlist.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("watchlist.page.subtitle")}</p>
      </section>
      <WatchlistManager />
    </div>
  );
}
