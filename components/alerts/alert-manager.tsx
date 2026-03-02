"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApiResponse } from "@/lib/api-response";
import { useLanguage } from "@/components/i18n/language-provider";

type AlertChannel = "WEBHOOK" | "TELEGRAM" | "LOG";
type AlertSignalType = "MA_CROSS_UP" | "MA_CROSS_DOWN" | "BOLL_BREAK_UP" | "BOLL_BREAK_DOWN";

type SubscriptionItem = {
  id: string;
  ticker: string;
  channel: AlertChannel;
  target: string | null;
  signalType: AlertSignalType | null;
  isActive: boolean;
  createdAt: string;
  latestDelivery: {
    status: string;
    signalType: AlertSignalType;
    signalTs: string;
    sentAt: string;
    message: string | null;
  } | null;
};

type DeliveryItem = {
  id: string;
  ticker: string;
  channel: AlertChannel;
  status: string;
  signalType: AlertSignalType;
  signalTs: string;
  signalPrice: number;
  sentAt: string;
  message: string | null;
};

type SubscriptionsResponse = ApiResponse<{
  subscriptions: SubscriptionItem[];
  deliveries: DeliveryItem[];
}>;

type ScanResponse = ApiResponse<{
  scanned: number;
  triggered: number;
  failed: number;
  skippedNoSignal: number;
  skippedDuplicate: number;
}>;

export function AlertManager() {
  const { t } = useLanguage();
  const [ticker, setTicker] = useState("AAPL");
  const [channel, setChannel] = useState<AlertChannel>("LOG");
  const [target, setTarget] = useState("");
  const [signalType, setSignalType] = useState<AlertSignalType | "ANY">("ANY");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState<string | null>(null);

  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);

  const signalOptions: Array<{ label: string; value: AlertSignalType | "ANY" }> = [
    { label: t("alerts.signal.any"), value: "ANY" },
    { label: t("alerts.signal.maUp"), value: "MA_CROSS_UP" },
    { label: t("alerts.signal.maDown"), value: "MA_CROSS_DOWN" },
    { label: t("alerts.signal.bollUp"), value: "BOLL_BREAK_UP" },
    { label: t("alerts.signal.bollDown"), value: "BOLL_BREAK_DOWN" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/alerts/subscriptions", { cache: "no-store" });
      const payload = (await response.json()) as SubscriptionsResponse;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }
      setSubscriptions(payload.data.subscriptions);
      setDeliveries(payload.data.deliveries);
    } catch {
      setError(t("alerts.error.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const requiresTarget = useMemo(() => channel === "WEBHOOK" || channel === "TELEGRAM", [channel]);

  async function createSubscription() {
    if (!ticker.trim()) {
      setError(t("alerts.error.tickerRequired"));
      return;
    }
    if (requiresTarget && !target.trim()) {
      setError(t("alerts.error.targetRequired"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          channel,
          target: target.trim() ? target.trim() : null,
          signalType: signalType === "ANY" ? null : signalType,
        }),
      });

      const payload = (await response.json()) as ApiResponse<{ item: SubscriptionItem }>;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }

      setTicker("AAPL");
      setTarget("");
      setSignalType("ANY");
      await load();
    } catch {
      setError(t("alerts.error.create"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubscription(id: string, isActive: boolean) {
    try {
      await fetch("/api/alerts/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      await load();
    } catch {
      setError(t("alerts.error.update"));
    }
  }

  async function removeSubscription(id: string) {
    try {
      await fetch(`/api/alerts/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch {
      setError(t("alerts.error.delete"));
    }
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    setScanSummary(null);

    try {
      const response = await fetch("/api/alerts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceSync: true, source: "auto" }),
      });

      const payload = (await response.json()) as ScanResponse;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }

      setScanSummary(
        t("alerts.scan.summary", {
          scanned: payload.data.scanned,
          triggered: payload.data.triggered,
          failed: payload.data.failed,
          duplicate: payload.data.skippedDuplicate,
        }),
      );
      await load();
    } catch {
      setError(t("alerts.error.scan"));
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("alerts.create.title")}</CardTitle>
          <CardDescription>{t("alerts.create.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="alert-ticker">{t("alerts.field.ticker")}</Label>
              <Input id="alert-ticker" value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder={t("alerts.placeholder.ticker")} />
            </div>
            <div className="space-y-2">
              <Label>{t("alerts.field.channel")}</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant={channel === "LOG" ? "default" : "outline"} onClick={() => setChannel("LOG")} type="button">
                  LOG
                </Button>
                <Button variant={channel === "WEBHOOK" ? "default" : "outline"} onClick={() => setChannel("WEBHOOK")} type="button">
                  WEBHOOK
                </Button>
                <Button variant={channel === "TELEGRAM" ? "default" : "outline"} onClick={() => setChannel("TELEGRAM")} type="button">
                  TELEGRAM
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-target">{t("alerts.field.target")}</Label>
              <Input
                id="alert-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={channel === "WEBHOOK" ? t("alerts.placeholder.webhook") : channel === "TELEGRAM" ? t("alerts.placeholder.telegram") : t("alerts.placeholder.optional")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-signal">{t("alerts.field.signal")}</Label>
              <select
                id="alert-signal"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={signalType}
                onChange={(event) => setSignalType(event.target.value as AlertSignalType | "ANY")}
              >
                {signalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void createSubscription()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              {t("alerts.add")}
            </Button>
            <Button variant="outline" onClick={() => void runScan()} disabled={scanning || loading}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("alerts.scan")}
            </Button>
            {scanSummary ? <Badge variant="secondary">{scanSummary}</Badge> : null}
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("alerts.subs.title")}</CardTitle>
          <CardDescription>{t("alerts.subs.desc", { count: subscriptions.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("alerts.subs.loading")}</div>
          ) : subscriptions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("alerts.subs.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("watchlist.table.ticker")}</TableHead>
                  <TableHead>{t("alerts.field.channel")}</TableHead>
                  <TableHead>{t("alerts.field.signal")}</TableHead>
                  <TableHead>{t("alerts.table.active")}</TableHead>
                  <TableHead>{t("alerts.table.latestDelivery")}</TableHead>
                  <TableHead className="text-right">{t("alerts.table.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.ticker}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.channel}</Badge>
                    </TableCell>
                    <TableCell>{item.signalType ?? t("alerts.signal.any")}</TableCell>
                    <TableCell>
                      <Switch checked={item.isActive} onCheckedChange={(checked) => void toggleSubscription(item.id, checked)} />
                    </TableCell>
                    <TableCell>
                      {item.latestDelivery ? `${item.latestDelivery.status} @ ${item.latestDelivery.signalTs.slice(0, 10)}` : "--"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => void removeSubscription(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("alerts.deliveries.title")}</CardTitle>
          <CardDescription>{t("alerts.deliveries.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("alerts.deliveries.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("alerts.table.time")}</TableHead>
                  <TableHead>{t("watchlist.table.ticker")}</TableHead>
                  <TableHead>{t("alerts.field.signal")}</TableHead>
                  <TableHead>{t("alerts.field.channel")}</TableHead>
                  <TableHead>{t("alerts.table.status")}</TableHead>
                  <TableHead>{t("backtest.table.price")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.sentAt.slice(0, 19).replace("T", " ")}</TableCell>
                    <TableCell>{item.ticker}</TableCell>
                    <TableCell>{item.signalType}</TableCell>
                    <TableCell>{item.channel}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "SENT" ? "secondary" : "outline"}>{item.status}</Badge>
                    </TableCell>
                    <TableCell>{item.signalPrice.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
