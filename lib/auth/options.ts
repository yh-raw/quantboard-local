import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";

const GUEST_NAME = "Guest";
const GUEST_EMAIL_DOMAIN = "guest.quantboard.local";

function normalizeGuestKey(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().toLowerCase();
  if (!/^[a-z0-9_-]{8,64}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

async function ensureGuestUserByKey(guestKey: string) {
  const email = `guest+${guestKey}@${GUEST_EMAIL_DOMAIN}`;
  return prisma.user.upsert({
    where: { email },
    update: {
      name: `${GUEST_NAME}-${guestKey.slice(0, 6)}`,
    },
    create: {
      email,
      name: `${GUEST_NAME}-${guestKey.slice(0, 6)}`,
    },
  });
}

const providers = [];
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  );
}

providers.push(
  CredentialsProvider({
    id: "guest",
    name: "Guest",
    credentials: {
      guestKey: { label: "guestKey", type: "text" },
    },
    async authorize(credentials) {
      const guestKey = normalizeGuestKey(credentials?.guestKey);
      if (!guestKey) {
        return null;
      }

      const guestUser = await ensureGuestUserByKey(guestKey);
      return {
        id: guestUser.id,
        name: guestUser.name ?? GUEST_NAME,
        email: guestUser.email,
      };
    },
  }),
);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
      }
      return session;
    },
  },
};
