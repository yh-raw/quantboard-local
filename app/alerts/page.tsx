import { redirect } from "next/navigation";
import { AlertManager } from "@/components/alerts/alert-manager";
import { getServerAuthSession } from "@/lib/auth/session";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("alerts.page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("alerts.page.subtitle")}</p>
      </section>
      <AlertManager />
    </div>
  );
}
