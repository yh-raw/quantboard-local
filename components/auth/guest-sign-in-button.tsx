"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";

const GUEST_KEY_STORAGE = "quantboard_guest_key";

function generateGuestKey() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? `${Date.now()}${Math.random()}`;
  return `d${random.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 31)}`;
}

function getOrCreateGuestKey() {
  try {
    const current = window.localStorage.getItem(GUEST_KEY_STORAGE);
    if (current && /^[a-z0-9_-]{8,64}$/i.test(current)) {
      return current.toLowerCase();
    }
  } catch {
    // ignore localStorage failure and fallback to runtime key
  }

  const created = generateGuestKey();
  try {
    window.localStorage.setItem(GUEST_KEY_STORAGE, created);
  } catch {
    // ignore localStorage failure
  }
  return created;
}

export function GuestSignInButton() {
  const { t } = useLanguage();

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() => {
        const guestKey = getOrCreateGuestKey();
        void signIn("guest", {
          callbackUrl: "/",
          guestKey,
        });
      }}
    >
      {t("auth.signInGuest")}
    </Button>
  );
}
