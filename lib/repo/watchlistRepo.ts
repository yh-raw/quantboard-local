import { prisma } from "@/lib/db";

export async function addWatchlistItem(userId: string, ticker: string) {
  return prisma.watchlistItem.upsert({
    where: {
      userId_ticker: {
        userId,
        ticker,
      },
    },
    update: {},
    create: {
      userId,
      ticker,
    },
  });
}

export async function removeWatchlistItem(userId: string, ticker: string) {
  return prisma.watchlistItem.deleteMany({
    where: {
      userId,
      ticker,
    },
  });
}

export async function listWatchlistItems(userId: string) {
  return prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listWatchlistTickers(userId: string) {
  const rows = await prisma.watchlistItem.findMany({
    where: { userId },
    select: { ticker: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => row.ticker);
}

export async function listAllWatchlistTickers() {
  const rows = await prisma.watchlistItem.findMany({
    select: { ticker: true },
    distinct: ["ticker"],
    orderBy: { ticker: "asc" },
  });
  return rows.map((row) => row.ticker);
}

