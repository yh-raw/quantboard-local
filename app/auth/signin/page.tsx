import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GuestSignInButton } from "@/components/auth/guest-sign-in-button";
import { getServerAuthSession } from "@/lib/auth/session";
import { getServerLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getServerAuthSession();
  if (session?.user?.id) {
    redirect("/");
  }

  const hasGitHub = Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET);
  const locale = await getServerLocale();
  const t = getServerTranslator(locale);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.signInTitle")}</CardTitle>
          <CardDescription>{t("auth.signInDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasGitHub ? (
            <Button asChild className="w-full">
              <Link href="/api/auth/signin/github?callbackUrl=/">{t("auth.signInGitHub")}</Link>
            </Button>
          ) : null}
          <GuestSignInButton />
          <p className="text-xs text-muted-foreground">{t("auth.signInHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
