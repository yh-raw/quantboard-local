"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";

export function AuthControls() {
  const { data, status } = useSession();
  const { t } = useLanguage();

  if (status === "loading") {
    return (
      <Button size="sm" variant="outline" disabled>
        ...
      </Button>
    );
  }

  if (!data?.user?.id) {
    return (
      <Button size="sm" asChild>
        <Link href="/auth/signin">{t("auth.signIn")}</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-40 truncate text-xs text-muted-foreground">{data.user.name ?? data.user.email ?? "User"}</span>
      <Button size="sm" variant="outline" onClick={() => void signOut({ callbackUrl: "/auth/signin" })} type="button">
        {t("auth.signOut")}
      </Button>
    </div>
  );
}
