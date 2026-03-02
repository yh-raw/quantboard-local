"use client";

import { useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ApiResponse } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/components/i18n/language-provider";

type SyncInfo = {
  provider: "real" | "mock";
  source: "auto" | "real" | "mock";
  written: number;
};

type BacktestData = {
  sync: SyncInfo;
  params: {
    ticker: string;
    timeframe: "1d";
    shortWindow: number;
    longWindow: number;
    initialCapital: number;
    feeBps: number;
    riskFreeRatePct: number;
  };
  metrics: {
    finalEquity: number;
    totalReturnPct: number;
    annualizedReturnPct: number;
    benchmarkReturnPct: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    tradeCount: number;
    roundTripCount: number;
    winRatePct: number;
    startTs: string;
    endTs: string;
  };
  equityCurve: Array<{
    ts: string;
    close: number;
    shortMA: number | null;
    longMA: number | null;
    equity: number;
    benchmarkEquity: number;
    drawdownPct: number;
  }>;
  trades: Array<{
    ts: string;
    side: "BUY" | "SELL";
    price: number;
    quantity: number;
    fee: number;
    cashAfter: number;
    equityAfter: number;
  }>;
};

type BacktestResponse = ApiResponse<BacktestData>;

const defaultForm = {
  ticker: "AAPL",
  lookbackDays: 720,
  shortWindow: 20,
  longWindow: 60,
  initialCapital: 100000,
  feeBps: 10,
  riskFreeRatePct: 2,
  source: "auto" as "auto" | "real" | "mock",
};

export function BacktestRunner() {
  const { t, locale } = useLanguage();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestData | null>(null);

  const numberLocale = locale === "zh" ? "zh-CN" : "en-US";

  const fmtMoney = (value: number) => value.toLocaleString(numberLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const fmtPct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

  async function runBacktest() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker,
          tf: "1d",
          lookbackDays: form.lookbackDays,
          shortWindow: form.shortWindow,
          longWindow: form.longWindow,
          initialCapital: form.initialCapital,
          feeBps: form.feeBps,
          riskFreeRatePct: form.riskFreeRatePct,
          source: form.source,
        }),
      });

      const payload = (await response.json()) as BacktestResponse;
      if (!payload.success) {
        setError(payload.error.message);
        return;
      }

      setResult(payload.data);
    } catch {
      setError(t("backtest.error.request"));
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.equityCurve.map((point) => ({
      ...point,
      date: point.ts.slice(0, 10),
    }));
  }, [result]);

  const recentTrades = useMemo(() => {
    if (!result) {
      return [];
    }
    return [...result.trades].slice(-20).reverse();
  }, [result]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("backtest.params.title")}</CardTitle>
          <CardDescription>{t("backtest.params.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="ticker">{t("backtest.field.ticker")}</Label>
            <Input id="ticker" value={form.ticker} onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lookbackDays">{t("backtest.field.lookbackDays")}</Label>
            <Input
              id="lookbackDays"
              type="number"
              value={form.lookbackDays}
              onChange={(e) => setForm((prev) => ({ ...prev, lookbackDays: Number(e.target.value) || prev.lookbackDays }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shortWindow">{t("backtest.field.shortMA")}</Label>
            <Input
              id="shortWindow"
              type="number"
              value={form.shortWindow}
              onChange={(e) => setForm((prev) => ({ ...prev, shortWindow: Number(e.target.value) || prev.shortWindow }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="longWindow">{t("backtest.field.longMA")}</Label>
            <Input
              id="longWindow"
              type="number"
              value={form.longWindow}
              onChange={(e) => setForm((prev) => ({ ...prev, longWindow: Number(e.target.value) || prev.longWindow }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialCapital">{t("backtest.field.initialCapital")}</Label>
            <Input
              id="initialCapital"
              type="number"
              value={form.initialCapital}
              onChange={(e) => setForm((prev) => ({ ...prev, initialCapital: Number(e.target.value) || prev.initialCapital }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feeBps">{t("backtest.field.feeBps")}</Label>
            <Input id="feeBps" type="number" value={form.feeBps} onChange={(e) => setForm((prev) => ({ ...prev, feeBps: Number(e.target.value) || 0 }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="riskFreeRatePct">{t("backtest.field.riskFree")}</Label>
            <Input
              id="riskFreeRatePct"
              type="number"
              value={form.riskFreeRatePct}
              onChange={(e) => setForm((prev) => ({ ...prev, riskFreeRatePct: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">{t("backtest.field.source")}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant={form.source === "auto" ? "default" : "outline"} onClick={() => setForm((prev) => ({ ...prev, source: "auto" }))}>
                {t("backtest.source.auto")}
              </Button>
              <Button type="button" variant={form.source === "real" ? "default" : "outline"} onClick={() => setForm((prev) => ({ ...prev, source: "real" }))}>
                {t("backtest.source.real")}
              </Button>
              <Button type="button" variant={form.source === "mock" ? "default" : "outline"} onClick={() => setForm((prev) => ({ ...prev, source: "mock" }))}>
                {t("backtest.source.mock")}
              </Button>
            </div>
          </div>

          <div className="md:col-span-4 flex items-center gap-3">
            <Button onClick={() => void runBacktest()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("backtest.run")}
            </Button>
            {result ? <Badge variant="secondary">{t("backtest.syncBadge", { provider: result.sync.provider, source: result.sync.source, written: result.sync.written })}</Badge> : null}
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("backtest.metric.totalReturn")}</CardTitle>
              </CardHeader>
              <CardContent className={result.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}>{fmtPct(result.metrics.totalReturnPct)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("backtest.metric.maxDrawdown")}</CardTitle>
              </CardHeader>
              <CardContent className="text-red-600">{fmtPct(result.metrics.maxDrawdownPct)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("backtest.metric.sharpe")}</CardTitle>
              </CardHeader>
              <CardContent>{result.metrics.sharpeRatio.toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("backtest.metric.finalEquity")}</CardTitle>
              </CardHeader>
              <CardContent>{fmtMoney(result.metrics.finalEquity)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("backtest.equity.title")}</CardTitle>
              <CardDescription>{t("backtest.equity.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" minTickGap={24} />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="equity" stroke="#0ea5e9" dot={false} strokeWidth={2} name={t("backtest.equity.strategy")} />
                    <Line type="monotone" dataKey="benchmarkEquity" stroke="#64748b" dot={false} name={t("backtest.equity.benchmark")} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("backtest.drawdown.title")}</CardTitle>
              <CardDescription>{t("backtest.drawdown.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" minTickGap={24} />
                    <YAxis domain={["auto", 0]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="drawdownPct" stroke="#dc2626" dot={false} strokeWidth={2} name={t("backtest.drawdown.line")} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("backtest.trades.title")}</CardTitle>
              <CardDescription>
                {t("backtest.trades.desc", {
                  orders: result.metrics.tradeCount,
                  roundTrips: result.metrics.roundTripCount,
                  winRate: fmtPct(result.metrics.winRatePct),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("backtest.table.date")}</TableHead>
                    <TableHead>{t("backtest.table.side")}</TableHead>
                    <TableHead>{t("backtest.table.price")}</TableHead>
                    <TableHead>{t("backtest.table.qty")}</TableHead>
                    <TableHead>{t("backtest.table.fee")}</TableHead>
                    <TableHead className="text-right">{t("backtest.table.equityAfter")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.map((trade) => (
                    <TableRow key={`${trade.ts}-${trade.side}-${trade.price}`}>
                      <TableCell>{trade.ts.slice(0, 10)}</TableCell>
                      <TableCell>
                        <Badge variant={trade.side === "BUY" ? "secondary" : "outline"}>{trade.side}</Badge>
                      </TableCell>
                      <TableCell>{fmtMoney(trade.price)}</TableCell>
                      <TableCell>{trade.quantity.toFixed(4)}</TableCell>
                      <TableCell>{fmtMoney(trade.fee)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(trade.equityAfter)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
