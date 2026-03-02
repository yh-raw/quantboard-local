import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthControls } from "@/components/auth/auth-controls";
import { AppSessionProvider } from "@/components/auth/session-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getServerAuthSession } from "@/lib/auth/session";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";
import { startDevMarketSyncScheduler } from "@/lib/services/devMarketScheduler";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QuantBoard",
  description: "Personal quant investment dashboard demo built with Next.js + Prisma",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  startDevMarketSyncScheduler();
  const session = await getServerAuthSession();
  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-muted/30 antialiased`}>
        <AppSessionProvider session={session}>
          <LanguageProvider initialLocale={locale}>
            <header className="border-b bg-background/90 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                  QuantBoard
                </Link>
                <div className="flex items-center gap-4">
                  <nav className="flex items-center gap-5 text-sm text-muted-foreground">
                    <Link href="/">{t("nav.dashboard")}</Link>
                    <Link href="/watchlist">{t("nav.watchlist")}</Link>
                    <Link href="/alerts">{t("nav.alerts")}</Link>
                    <Link href="/backtest">{t("nav.backtest")}</Link>
                  </nav>
                  <LanguageSwitcher />
                  <AuthControls />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
          </LanguageProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
