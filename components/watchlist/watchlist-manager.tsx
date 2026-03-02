"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPct, formatPrice } from "@/lib/format";
import { normalizeTicker } from "@/lib/ticker";
import type { ApiResponse } from "@/lib/api-response";
import type { WatchlistOverviewItem } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";

type WatchlistResponse = ApiResponse<{ items: WatchlistOverviewItem[] }>;

export function WatchlistManager() {
  const { t } = useLanguage();
  const [items, setItems] = useState<WatchlistOverviewItem[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const loadWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const payload = (await response.json()) as WatchlistResponse;

      if (payload.success) {
        setItems(payload.data.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  const submitTicker = useCallback(async () => {
    const ticker = normalizeTicker(tickerInput);
    if (!ticker) {
      return;
    }

    setMutating(true);
    try {
      await fetch("/api/watchlist/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });

      await fetch("/api/market/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, tf: "1d", days: 180, source: "auto" }),
      });

      setTickerInput("");
      await loadWatchlist();
    } finally {
      setMutating(false);
    }
  }, [loadWatchlist, tickerInput]);

  const removeTicker = useCallback(
    async (ticker: string) => {
      setMutating(true);
      try {
        await fetch(`/api/watchlist/item?ticker=${encodeURIComponent(ticker)}`, {
          method: "DELETE",
        });
        await loadWatchlist();
      } finally {
        setMutating(false);
      }
    },
    [loadWatchlist],
  );

  const syncTicker = useCallback(
    async (ticker: string) => {
      setMutating(true);
      try {
        await fetch("/api/market/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, tf: "1d", days: 60, source: "auto" }),
        });
        await loadWatchlist();
      } finally {
        setMutating(false);
      }
    },
    [loadWatchlist],
  );

  const hasItems = useMemo(() => items.length > 0, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("watchlist.card.title")}</CardTitle>
        <CardDescription>{t("watchlist.card.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder={t("watchlist.input.placeholder")}
            value={tickerInput}
            onChange={(event) => setTickerInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitTicker();
              }
            }}
          />
          <Button onClick={() => void submitTicker()} disabled={mutating || !tickerInput.trim()}>
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("watchlist.addSync")}
          </Button>
          <Button variant="outline" onClick={() => void loadWatchlist()} disabled={loading || mutating}>
            <RefreshCw className="h-4 w-4" />
            {t("watchlist.refresh")}
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">{t("watchlist.loading")}</div>
        ) : hasItems ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("watchlist.table.ticker")}</TableHead>
                <TableHead>{t("watchlist.table.latestClose")}</TableHead>
                <TableHead>{t("watchlist.table.change")}</TableHead>
                <TableHead className="text-right">{t("watchlist.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.ticker}>
                  <TableCell>
                    <Badge variant="secondary">{item.ticker}</Badge>
                  </TableCell>
                  <TableCell>{formatPrice(item.latestClose)}</TableCell>
                  <TableCell
                    className={
                      item.changePct === null
                        ? "text-muted-foreground"
                        : item.changePct < 0
                          ? "text-red-600"
                          : "text-green-600"
                    }
                  >
                    {formatPct(item.changePct)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => void syncTicker(item.ticker)} disabled={mutating}>
                        {t("watchlist.sync")}
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/asset/${encodeURIComponent(item.ticker)}`}>{t("watchlist.detail")}</Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void removeTicker(item.ticker)}
                        disabled={mutating}
                        aria-label={`Delete ${item.ticker}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("watchlist.empty")}</div>
        )}
      </CardContent>
    </Card>
  );
}
