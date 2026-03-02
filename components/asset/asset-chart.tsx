"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Eraser,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  PenLine,
  ScanLine,
  Square,
  Trash2,
  Type,
  Undo2,
  WandSparkles,
} from "lucide-react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  isBusinessDay,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type LineData,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ApiResponse } from "@/lib/api-response";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { calcMovingAverage } from "@/lib/indicators/ma";
import { calcBollingerBands } from "@/lib/indicators/boll";
import { detectSignals } from "@/lib/indicators/signals";
import { PRESET_TIMEFRAMES, estimateDaysForBars, isValidTimeframe, normalizeTimeframe } from "@/lib/timeframe";
import type { ChartBar, Timeframe } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";

type AssetChartProps = {
  ticker: string;
  bars: ChartBar[];
  initialTimeframe?: Timeframe;
};

type BarsPayload = ApiResponse<{
  ticker: string;
  timeframe: string;
  bars: ChartBar[];
}>;

type NormalizedBar = ChartBar & { unix: UTCTimestamp };

type DrawTool = "cursor" | "trend" | "ray" | "hline" | "vline" | "rect" | "fib" | "text";

type DrawPoint = { time: UTCTimestamp; price: number };

type DrawShape =
  | { id: string; type: "trend"; start: DrawPoint; end: DrawPoint }
  | { id: string; type: "ray"; start: DrawPoint; end: DrawPoint }
  | { id: string; type: "hline"; price: number }
  | { id: string; type: "vline"; time: UTCTimestamp }
  | { id: string; type: "rect"; start: DrawPoint; end: DrawPoint }
  | { id: string; type: "fib"; start: DrawPoint; end: DrawPoint }
  | { id: string; type: "text"; point: DrawPoint; text: string };

type DragMode = "move" | "start" | "end" | "price" | "time" | "point";

type DragState = {
  shapeId: string;
  mode: DragMode;
  originShape: DrawShape;
  originPoint: DrawPoint;
};

type HitResult = {
  shapeId: string;
  mode: DragMode;
};

type CandleSeriesLike = {
  coordinateToPrice(coordinate: number): number | null;
  priceToCoordinate(price: number): number | null;
};

const TWO_POINT_TOOLS: readonly DrawTool[] = ["trend", "ray", "rect", "fib"];
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

function toUnixTimestamp(raw: string): UTCTimestamp | null {
  const unixSec = Math.floor(new Date(raw).getTime() / 1000);
  return Number.isFinite(unixSec) ? (unixSec as UTCTimestamp) : null;
}

function toEventTime(time: Time | null | undefined): UTCTimestamp | null {
  if (time == null) return null;
  if (typeof time === "number") return time as UTCTimestamp;
  if (typeof time === "string") {
    const unixSec = Math.floor(new Date(time).getTime() / 1000);
    return Number.isFinite(unixSec) ? (unixSec as UTCTimestamp) : null;
  }
  if (isBusinessDay(time)) {
    const unixSec = Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
    return unixSec as UTCTimestamp;
  }
  return null;
}

function getErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "success" in payload &&
    (payload as { success: unknown }).success === false &&
    "error" in payload
  ) {
    const error = (payload as { error?: { message?: string } }).error;
    return error?.message ?? null;
  }
  return null;
}

function createDrawId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function findNearestBarByTime(bars: NormalizedBar[], target: UTCTimestamp): NormalizedBar | null {
  if (!bars.length) return null;
  let left = 0;
  let right = bars.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (bars[mid].unix < target) left = mid + 1;
    else right = mid;
  }
  const cur = bars[left];
  const prev = left > 0 ? bars[left - 1] : null;
  if (!prev) return cur;
  return Math.abs(prev.unix - target) <= Math.abs(cur.unix - target) ? prev : cur;
}

function nearestOHLCPrice(bar: NormalizedBar, price: number): number {
  const arr = [bar.open, bar.high, bar.low, bar.close];
  let best = arr[0];
  let bestDiff = Math.abs(best - price);
  for (let i = 1; i < arr.length; i += 1) {
    const diff = Math.abs(arr[i] - price);
    if (diff < bestDiff) {
      best = arr[i];
      bestDiff = diff;
    }
  }
  return best;
}

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(point.x - cx, point.y - cy);
}

export function AssetChart({ ticker, bars, initialTimeframe = "1d" }: AssetChartProps) {
  const { t } = useLanguage();
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(normalizeTimeframe(initialTimeframe));
  const [barsState, setBarsState] = useState<ChartBar[]>(bars);
  const [customTimeframe, setCustomTimeframe] = useState("");
  const [switchingTf, setSwitchingTf] = useState(false);
  const [timeframeError, setTimeframeError] = useState<string | null>(null);
  const [showMA20, setShowMA20] = useState(true);
  const [showBOLL, setShowBOLL] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawTool>("cursor");
  const [magnetOn, setMagnetOn] = useState(true);
  const [draftStart, setDraftStart] = useState<DrawPoint | null>(null);
  const [draftHover, setDraftHover] = useState<DrawPoint | null>(null);
  const [drawings, setDrawings] = useState<DrawShape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [chartVersion, setChartVersion] = useState(0);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayHitRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<CandleSeriesLike | null>(null);
  const requestSeqRef = useRef(0);

  const isFullscreen = isNativeFullscreen || isPseudoFullscreen;

  const normalizedBars = useMemo<NormalizedBar[]>(() => {
    const map = new Map<number, NormalizedBar>();
    for (const bar of barsState) {
      const unix = toUnixTimestamp(bar.ts);
      if (unix === null) continue;
      map.set(unix, { ...bar, ts: new Date(unix * 1000).toISOString(), unix });
    }
    return Array.from(map.values()).sort((a, b) => a.unix - b.unix);
  }, [barsState]);

  const latest = normalizedBars.at(-1);
  const prev = normalizedBars.at(-2);
  const change = latest && prev ? latest.close - prev.close : 0;
  const changePct = latest && prev && prev.close !== 0 ? (change / prev.close) * 100 : 0;

  const data = useMemo(() => {
    const candles: CandlestickData<Time>[] = normalizedBars.map((bar) => ({
      time: bar.unix,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    const volume: HistogramData<Time>[] = normalizedBars.map((bar) => ({
      time: bar.unix,
      value: bar.volume,
      color: bar.close >= bar.open ? "#22c55e88" : "#ef444488",
    }));

    const closes = normalizedBars.map((bar) => bar.close);
    const ma20 = calcMovingAverage(closes, 20);
    const boll = calcBollingerBands(closes, 20, 2);

    const maLine: LineData<Time>[] = [];
    const bollUpper: LineData<Time>[] = [];
    const bollMid: LineData<Time>[] = [];
    const bollLower: LineData<Time>[] = [];

    for (let i = 0; i < normalizedBars.length; i += 1) {
      const bar = normalizedBars[i];
      const ma = ma20[i];
      const upper = boll.upper[i];
      const mid = boll.mid[i];
      const lower = boll.lower[i];
      if (ma != null && Number.isFinite(ma)) maLine.push({ time: bar.unix, value: ma });
      if (upper != null && Number.isFinite(upper)) bollUpper.push({ time: bar.unix, value: upper });
      if (mid != null && Number.isFinite(mid)) bollMid.push({ time: bar.unix, value: mid });
      if (lower != null && Number.isFinite(lower)) bollLower.push({ time: bar.unix, value: lower });
    }

    const signals = detectSignals(
      normalizedBars.map((bar) => bar.ts),
      normalizedBars.map((bar) => bar.close),
    ).slice(-120);

    const markers: SeriesMarker<Time>[] = [];
    for (const signal of signals) {
      const time = toUnixTimestamp(signal.ts);
      if (time === null) continue;
      const isUp = signal.type === "MA_CROSS_UP" || signal.type === "BOLL_BREAK_UP";
      markers.push({
        time,
        position: isUp ? "belowBar" : "aboveBar",
        color: isUp ? "#22c55e" : "#ef4444",
        shape: isUp ? "arrowUp" : "arrowDown",
        text: isUp ? t("asset.chart.signalUp") : t("asset.chart.signalDown"),
      });
    }

    return { candles, volume, maLine, bollUpper, bollMid, bollLower, markers };
  }, [normalizedBars, t]);

  async function syncAndLoadTimeframe(nextTfRaw: string) {
    const nextTf = normalizeTimeframe(nextTfRaw);
    if (!isValidTimeframe(nextTf)) {
      setTimeframeError(t("asset.chart.invalidTf"));
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    setSwitchingTf(true);
    setTimeframeError(null);

    try {
      const days = estimateDaysForBars(nextTf, 320);
      const syncResponse = await fetch("/api/market/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, tf: nextTf, days, source: "auto" }),
      });
      const syncPayload = await syncResponse.json().catch(() => null);
      const syncError = getErrorMessage(syncPayload);
      if (!syncResponse.ok || syncError) throw new Error(syncError ?? t("asset.chart.loadFailed"));

      const barsResponse = await fetch(
        `/api/market/bars?ticker=${encodeURIComponent(ticker)}&tf=${encodeURIComponent(nextTf)}&limit=360`,
        { cache: "no-store" },
      );
      const barsPayload = (await barsResponse.json()) as BarsPayload;
      if (!barsResponse.ok || !barsPayload.success) {
        const message = barsPayload.success ? t("asset.chart.loadFailed") : barsPayload.error.message;
        throw new Error(message);
      }
      if (requestSeqRef.current !== requestId) return;

      setBarsState(barsPayload.data.bars);
      setActiveTimeframe(nextTf);
      setCustomTimeframe(nextTf);
      setDrawings([]);
      setSelectedShapeId(null);
      setDragState(null);
      setDraftStart(null);
      setDraftHover(null);
      setDrawError(null);
    } catch (error) {
      setTimeframeError(error instanceof Error ? error.message : t("asset.chart.loadFailed"));
    } finally {
      if (requestSeqRef.current === requestId) setSwitchingTf(false);
    }
  }

  function applyCustomTimeframe() {
    void syncAndLoadTimeframe(customTimeframe);
  }

  function pickTool(tool: DrawTool) {
    setActiveTool(tool);
    setDraftStart(null);
    setDraftHover(null);
    setDrawError(null);
  }

  function getToolLabelForShape(shape: DrawShape) {
    if (shape.type === "trend") return t("asset.chart.toolTrend");
    if (shape.type === "ray") return t("asset.chart.toolRay");
    if (shape.type === "hline") return t("asset.chart.toolHLine");
    if (shape.type === "vline") return t("asset.chart.toolVLine");
    if (shape.type === "rect") return t("asset.chart.toolRect");
    if (shape.type === "fib") return t("asset.chart.toolFib");
    return t("asset.chart.toolText");
  }

  function toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const overlay = overlayHitRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function getDrawPointFromCanvasXY(x: number, y: number): DrawPoint | null {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return null;

    const time = toEventTime(chart.timeScale().coordinateToTime(x));
    const price = candle.coordinateToPrice(y);
    if (time === null || price === null) return null;

    if (!magnetOn) return { time, price };

    const nearestBar = findNearestBarByTime(normalizedBars, time);
    if (!nearestBar) return { time, price };
    return { time: nearestBar.unix, price: nearestOHLCPrice(nearestBar, price) };
  }

  function pointToPixel(point: DrawPoint): { x: number; y: number } | null {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return null;
    const x = chart.timeScale().timeToCoordinate(point.time);
    const y = candle.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function hitTestShape(
    shape: DrawShape,
    mouse: { x: number; y: number },
    width: number,
    height: number,
  ): HitResult | null {
    const handleThreshold = 8;
    const lineThreshold = 6;

    if (shape.type === "trend" || shape.type === "ray" || shape.type === "rect" || shape.type === "fib") {
      const start = pointToPixel(shape.start);
      const end = pointToPixel(shape.end);
      if (!start || !end) return null;

      if (Math.hypot(mouse.x - start.x, mouse.y - start.y) <= handleThreshold) {
        return { shapeId: shape.id, mode: "start" };
      }
      if (Math.hypot(mouse.x - end.x, mouse.y - end.y) <= handleThreshold) {
        return { shapeId: shape.id, mode: "end" };
      }

      if (shape.type === "trend") {
        if (distanceToSegment(mouse, start, end) <= lineThreshold) return { shapeId: shape.id, mode: "move" };
        return null;
      }

      if (shape.type === "ray") {
        if (end.x === start.x) return null;
        const rayX = end.x >= start.x ? width : 0;
        const tValue = (rayX - start.x) / (end.x - start.x);
        const rayY = start.y + (end.y - start.y) * tValue;
        if (distanceToSegment(mouse, start, { x: rayX, y: rayY }) <= lineThreshold) {
          return { shapeId: shape.id, mode: "move" };
        }
        return null;
      }

      if (shape.type === "rect") {
        const left = Math.min(start.x, end.x);
        const right = Math.max(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const bottom = Math.max(start.y, end.y);
        const inside = mouse.x >= left && mouse.x <= right && mouse.y >= top && mouse.y <= bottom;
        if (inside) return { shapeId: shape.id, mode: "move" };
        return null;
      }

      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const diff = shape.end.price - shape.start.price;
      for (const level of FIB_LEVELS) {
        const price = shape.start.price + diff * level;
        const y = candleRef.current?.priceToCoordinate(price);
        if (y === null || y === undefined) continue;
        if (mouse.x >= left && mouse.x <= right && Math.abs(mouse.y - y) <= lineThreshold) {
          return { shapeId: shape.id, mode: "move" };
        }
      }
      return null;
    }

    if (shape.type === "hline") {
      const y = candleRef.current?.priceToCoordinate(shape.price);
      if (y === null || y === undefined) return null;
      if (Math.abs(mouse.y - y) <= lineThreshold) return { shapeId: shape.id, mode: "price" };
      return null;
    }

    if (shape.type === "vline") {
      const x = chartRef.current?.timeScale().timeToCoordinate(shape.time);
      if (x === null || x === undefined) return null;
      if (Math.abs(mouse.x - x) <= lineThreshold && mouse.y >= 0 && mouse.y <= height) {
        return { shapeId: shape.id, mode: "time" };
      }
      return null;
    }

    const anchor = pointToPixel(shape.point);
    if (!anchor) return null;
    const widthApprox = Math.min(240, Math.max(44, shape.text.length * 7 + 16));
    const box = { x: anchor.x + 8, y: anchor.y - 32, width: widthApprox, height: 24 };
    const inside = mouse.x >= box.x && mouse.x <= box.x + box.width && mouse.y >= box.y && mouse.y <= box.y + box.height;
    return inside ? { shapeId: shape.id, mode: "point" } : null;
  }

  function deleteSelectedShape() {
    if (!selectedShapeId) return;
    setDrawings((prev) => prev.filter((item) => item.id !== selectedShapeId));
    setSelectedShapeId(null);
  }

  function handleOverlayMouseDown(event: { clientX: number; clientY: number }) {
    if (activeTool !== "cursor") return;
    const overlay = overlayHitRef.current;
    if (!overlay) return;

    const mouse = toCanvasPoint(event.clientX, event.clientY);
    if (!mouse) return;
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;

    const reversed = [...drawings].reverse();
    const hit = reversed
      .map((shape) => hitTestShape(shape, mouse, width, height))
      .find((item): item is HitResult => item !== null);

    if (!hit) {
      setSelectedShapeId(null);
      return;
    }

    const shape = drawings.find((item) => item.id === hit.shapeId);
    if (!shape) {
      return;
    }

    const originPoint = getDrawPointFromCanvasXY(mouse.x, mouse.y);
    if (!originPoint) {
      setSelectedShapeId(shape.id);
      return;
    }

    setSelectedShapeId(shape.id);
    setDragState({
      shapeId: shape.id,
      mode: hit.mode,
      originShape: shape,
      originPoint,
    });
  }

  useEffect(() => {
    const onFsChange = () => setIsNativeFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    onFsChange();
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPseudoFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    if (!selectedShapeId) return;
    if (!drawings.some((shape) => shape.id === selectedShapeId)) {
      setSelectedShapeId(null);
    }
  }, [drawings, selectedShapeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedShapeId) {
        event.preventDefault();
        setDrawings((prev) => prev.filter((shape) => shape.id !== selectedShapeId));
        setSelectedShapeId(null);
      }
      if (event.key === "Escape") {
        setDragState(null);
        setDraftStart(null);
        setDraftHover(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedShapeId]);

  useEffect(() => {
    if (!dragState) return;

    const toCanvas = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const overlay = overlayHitRef.current;
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const toDraw = (x: number, y: number): DrawPoint | null => {
      const chart = chartRef.current;
      const candle = candleRef.current;
      if (!chart || !candle) return null;

      const time = toEventTime(chart.timeScale().coordinateToTime(x));
      const price = candle.coordinateToPrice(y);
      if (time === null || price === null) return null;

      if (!magnetOn) return { time, price };
      const nearestBar = findNearestBarByTime(normalizedBars, time);
      if (!nearestBar) return { time, price };
      return { time: nearestBar.unix, price: nearestOHLCPrice(nearestBar, price) };
    };

    const onMouseMove = (event: MouseEvent) => {
      const mouse = toCanvas(event.clientX, event.clientY);
      if (!mouse) return;

      const current = toDraw(mouse.x, mouse.y);
      if (!current) return;

      const deltaTime = (current.time - dragState.originPoint.time) as UTCTimestamp;
      const deltaPrice = current.price - dragState.originPoint.price;
      const shiftTime = (time: UTCTimestamp) => Math.max(1, time + deltaTime) as UTCTimestamp;
      const shiftPoint = (point: DrawPoint): DrawPoint => ({
        time: shiftTime(point.time),
        price: round2(point.price + deltaPrice),
      });

      setDrawings((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragState.shapeId) return shape;

          const original = dragState.originShape;
          if (original.type === "trend" || original.type === "ray" || original.type === "rect" || original.type === "fib") {
            if (dragState.mode === "start") return { ...original, start: current };
            if (dragState.mode === "end") return { ...original, end: current };
            if (dragState.mode === "move") {
              return {
                ...original,
                start: shiftPoint(original.start),
                end: shiftPoint(original.end),
              };
            }
            return original;
          }

          if (original.type === "hline") {
            if (dragState.mode === "price" || dragState.mode === "move") {
              return { ...original, price: round2(original.price + deltaPrice) };
            }
            return original;
          }

          if (original.type === "vline") {
            if (dragState.mode === "time" || dragState.mode === "move") {
              return { ...original, time: shiftTime(original.time) };
            }
            return original;
          }

          if (dragState.mode === "point" || dragState.mode === "move") {
            return { ...original, point: shiftPoint(original.point) };
          }
          return original;
        }),
      );
    };

    const onMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, magnetOn, normalizedBars]);

  useEffect(() => {
    if (!chartContainerRef.current || data.candles.length === 0) return;
    const container = chartContainerRef.current;
    const getHeight = () => Math.max(container.clientHeight, 420);

    const chart = createChart(container, {
      width: container.clientWidth,
      height: getHeight(),
      layout: {
        background: { type: ColorType.Solid, color: "#0b1220" },
        textColor: "#cbd5e1",
        attributionLogo: false,
      },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: false },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#16a34a",
      downColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      borderVisible: false,
      priceScaleId: "right",
    });
    candleRef.current = candleSeries;
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    candleSeries.setData(data.candles);
    candleSeries.setMarkers(data.markers);

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeSeries.setData(data.volume);

    if (showMA20) {
      const maSeries = chart.addLineSeries({ color: "#38bdf8", lineWidth: 2, priceLineVisible: false });
      maSeries.setData(data.maLine);
    }

    if (showBOLL) {
      const upperSeries = chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false });
      const midSeries = chart.addLineSeries({ color: "#fb923c", lineWidth: 1, priceLineVisible: false });
      const lowerSeries = chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false });
      upperSeries.setData(data.bollUpper);
      midSeries.setData(data.bollMid);
      lowerSeries.setData(data.bollLower);
    }

    chart.timeScale().fitContent();
    setChartVersion((v) => v + 1);

    const onResize = () => {
      chart.applyOptions({ width: container.clientWidth, height: getHeight() });
    };

    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      setChartVersion((v) => v + 1);
    };
  }, [data, isFullscreen, showBOLL, showMA20]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries || chartVersion === 0) return;

    const toDrawPoint = (param: MouseEventParams<Time>): DrawPoint | null => {
      if (!param.point) return null;
      const time = toEventTime(param.time);
      if (time === null) return null;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return null;

      if (!magnetOn) return { time, price };
      const nearestBar = findNearestBarByTime(normalizedBars, time);
      if (!nearestBar) return { time, price };
      return { time: nearestBar.unix, price: nearestOHLCPrice(nearestBar, price) };
    };

    const onMove = (param: MouseEventParams<Time>) => {
      if (!draftStart || !TWO_POINT_TOOLS.includes(activeTool)) {
        if (draftHover) setDraftHover(null);
        return;
      }
      const point = toDrawPoint(param);
      if (point) setDraftHover(point);
    };

    const onClick = (param: MouseEventParams<Time>) => {
      if (activeTool === "cursor") return;
      const point = toDrawPoint(param);
      if (!point) return;
      setDrawError(null);

      if (activeTool === "hline") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "hline", price: round2(point.price) }]);
        setSelectedShapeId(id);
        return;
      }

      if (activeTool === "vline") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "vline", time: point.time }]);
        setSelectedShapeId(id);
        return;
      }

      if (activeTool === "text") {
        const raw = window.prompt(t("asset.chart.textPrompt"), t("asset.chart.textDefault"));
        if (raw === null) return;
        const text = raw.trim().slice(0, 80);
        if (!text) return;
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "text", point, text }]);
        setSelectedShapeId(id);
        return;
      }

      if (!draftStart) {
        setDraftStart(point);
        setDraftHover(null);
        return;
      }

      if (draftStart.time === point.time && (activeTool === "trend" || activeTool === "ray" || activeTool === "fib")) {
        setDrawError(t("asset.chart.drawSameTime"));
        return;
      }

      if (activeTool === "trend") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "trend", start: draftStart, end: point }]);
        setSelectedShapeId(id);
      } else if (activeTool === "ray") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "ray", start: draftStart, end: point }]);
        setSelectedShapeId(id);
      } else if (activeTool === "rect") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "rect", start: draftStart, end: point }]);
        setSelectedShapeId(id);
      } else if (activeTool === "fib") {
        const id = createDrawId();
        setDrawings((prev) => [...prev, { id, type: "fib", start: draftStart, end: point }]);
        setSelectedShapeId(id);
      }

      setDraftStart(null);
      setDraftHover(null);
    };

    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onMove);
    };
  }, [activeTool, chartVersion, draftHover, draftStart, magnetOn, normalizedBars, t]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const canvas = overlayCanvasRef.current;
    if (!chart || !candleSeries || !canvas || chartVersion === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const box = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(box.width));
      const height = Math.max(1, Math.floor(box.height));
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.floor(width * dpr);
      const ph = Math.floor(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    };

    const toPixel = (point: DrawPoint): { x: number; y: number } | null => {
      const x = chart.timeScale().timeToCoordinate(point.time);
      const y = candleSeries.priceToCoordinate(point.price);
      if (x === null || y === null) return null;
      return { x, y };
    };

    const drawLine = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      color: string,
      dashed = false,
      lineWidth = 1.5,
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawHandle = (x: number, y: number, color: string) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFib = (shape: { start: DrawPoint; end: DrawPoint }, selected = false) => {
      const a = toPixel(shape.start);
      const b = toPixel(shape.end);
      if (!a || !b) return;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const diff = shape.end.price - shape.start.price;

      const stroke = selected ? "#fcd34d" : "#f59e0b";
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.font = "12px ui-sans-serif, system-ui, Segoe UI";
      ctx.textBaseline = "middle";

      for (const level of FIB_LEVELS) {
        const price = shape.start.price + diff * level;
        const y = candleSeries.priceToCoordinate(price);
        if (y === null) continue;
        drawLine({ x: left, y }, { x: right, y }, stroke, level === 0.5 || level === 0.618, selected ? 2.2 : 1.4);
        ctx.fillText(`${(level * 100).toFixed(1)}% ${round2(price)}`, right + 6, y);
      }

      if (selected) {
        drawHandle(a.x, a.y, stroke);
        drawHandle(b.x, b.y, stroke);
      }
    };

    const renderShape = (shape: DrawShape, width: number, height: number) => {
      const selected = shape.id === selectedShapeId;
      const accentWidth = selected ? 2.4 : 1.5;

      if (shape.type === "trend") {
        const a = toPixel(shape.start);
        const b = toPixel(shape.end);
        if (!a || !b) return;
        drawLine(a, b, selected ? "#93c5fd" : "#60a5fa", false, accentWidth);
        if (selected) {
          drawHandle(a.x, a.y, "#93c5fd");
          drawHandle(b.x, b.y, "#93c5fd");
        }
        return;
      }

      if (shape.type === "ray") {
        const a = toPixel(shape.start);
        const b = toPixel(shape.end);
        if (!a || !b || b.x === a.x) return;
        const x = b.x >= a.x ? width : 0;
        const tValue = (x - a.x) / (b.x - a.x);
        const y = a.y + (b.y - a.y) * tValue;
        drawLine(a, { x, y }, selected ? "#c4b5fd" : "#8b5cf6", false, accentWidth);
        if (selected) {
          drawHandle(a.x, a.y, "#c4b5fd");
          drawHandle(b.x, b.y, "#c4b5fd");
        }
        return;
      }

      if (shape.type === "hline") {
        const y = candleSeries.priceToCoordinate(shape.price);
        if (y === null) return;
        drawLine({ x: 0, y }, { x: width, y }, selected ? "#fdba74" : "#f97316", true, accentWidth);
        ctx.fillStyle = selected ? "#fdba74" : "#f97316";
        ctx.font = "12px ui-sans-serif, system-ui, Segoe UI";
        ctx.fillText(round2(shape.price).toString(), 8, y - 8);
        return;
      }

      if (shape.type === "vline") {
        const x = chart.timeScale().timeToCoordinate(shape.time);
        if (x === null) return;
        drawLine({ x, y: 0 }, { x, y: height }, selected ? "#d8b4fe" : "#a855f7", true, accentWidth);
        return;
      }

      if (shape.type === "rect") {
        const a = toPixel(shape.start);
        const b = toPixel(shape.end);
        if (!a || !b) return;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.beginPath();
        ctx.fillStyle = selected ? "rgba(52, 211, 153, 0.16)" : "rgba(16, 185, 129, 0.12)";
        ctx.strokeStyle = selected ? "#6ee7b7" : "#10b981";
        ctx.lineWidth = accentWidth;
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        if (selected) {
          drawHandle(a.x, a.y, "#6ee7b7");
          drawHandle(b.x, b.y, "#6ee7b7");
        }
        return;
      }

      if (shape.type === "fib") {
        drawFib(shape, selected);
        return;
      }

      const p = toPixel(shape.point);
      if (!p) return;
      ctx.font = "12px ui-sans-serif, system-ui, Segoe UI";
      const w = Math.max(44, Math.min(240, ctx.measureText(shape.text).width + 16));
      const h = 24;
      const x = p.x + 8;
      const y = p.y - h - 8;
      ctx.fillStyle = selected ? "rgba(30, 41, 59, 0.94)" : "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = selected ? "#bfdbfe" : "#94a3b8";
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      ctx.textBaseline = "middle";
      ctx.fillText(shape.text, x + 8, y + h / 2);
    };

    const renderDraft = (width: number) => {
      if (!draftStart || !draftHover || !TWO_POINT_TOOLS.includes(activeTool)) return;
      if (activeTool === "fib") {
        drawFib({ start: draftStart, end: draftHover }, true);
        return;
      }

      const a = toPixel(draftStart);
      const b = toPixel(draftHover);
      if (!a || !b) return;

      if (activeTool === "trend") {
        drawLine(a, b, "#60a5fa", true);
      } else if (activeTool === "ray") {
        if (b.x === a.x) return;
        const x = b.x >= a.x ? width : 0;
        const tValue = (x - a.x) / (b.x - a.x);
        const y = a.y + (b.y - a.y) * tValue;
        drawLine(a, { x, y }, "#8b5cf6", true);
      } else if (activeTool === "rect") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        ctx.beginPath();
        ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
        ctx.strokeStyle = "#10b981";
        ctx.setLineDash([6, 4]);
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    const draw = () => {
      const { width, height } = resizeCanvas();
      ctx.clearRect(0, 0, width, height);
      for (const shape of drawings) renderShape(shape, width, height);
      renderDraft(width);
    };

    draw();
    const onRedraw = () => draw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRedraw);
    chart.subscribeCrosshairMove(onRedraw);
    const timer = window.setInterval(draw, 120);
    const onResize = () => draw();
    window.addEventListener("resize", onResize);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRedraw);
      chart.unsubscribeCrosshairMove(onRedraw);
      window.removeEventListener("resize", onResize);
      window.clearInterval(timer);
    };
  }, [activeTool, chartVersion, draftHover, draftStart, drawings, selectedShapeId]);

  function fitChartContent() {
    chartRef.current?.timeScale().fitContent();
  }

  async function toggleFullscreen() {
    const panel = panelRef.current;
    if (!panel) return;

    if (isNativeFullscreen) {
      await document.exitFullscreen();
      return;
    }

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (panel.requestFullscreen) {
      try {
        await panel.requestFullscreen();
        return;
      } catch (error) {
        console.error("[asset-chart] requestFullscreen failed", error);
      }
    }

    setIsPseudoFullscreen(true);
  }

  const tools: Array<{ key: DrawTool; icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { key: "cursor", icon: MousePointer2, label: t("asset.chart.toolCursor") },
    { key: "trend", icon: PenLine, label: t("asset.chart.toolTrend") },
    { key: "ray", icon: ArrowRight, label: t("asset.chart.toolRay") },
    { key: "hline", icon: Minus, label: t("asset.chart.toolHLine") },
    { key: "vline", icon: WandSparkles, label: t("asset.chart.toolVLine") },
    { key: "rect", icon: Square, label: t("asset.chart.toolRect") },
    { key: "fib", icon: ScanLine, label: t("asset.chart.toolFib") },
    { key: "text", icon: Type, label: t("asset.chart.toolText") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{`${ticker} ${t("asset.chart.titleSuffix")}`}</CardTitle>
        <CardDescription>{t("asset.chart.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={panelRef}
          className={cn(
            "rounded-xl border border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-xl",
            isFullscreen ? "fixed inset-0 z-[100] rounded-none border-0 p-5" : "",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {PRESET_TIMEFRAMES.map((tf) => (
                <Button
                  key={tf}
                  size="sm"
                  variant={activeTimeframe === tf ? "secondary" : "ghost"}
                  className={cn(
                    activeTimeframe === tf ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "text-slate-400",
                  )}
                  onClick={() => void syncAndLoadTimeframe(tf)}
                  type="button"
                  disabled={switchingTf}
                >
                  {tf}
                </Button>
              ))}

              <div className="ml-1 flex items-center gap-1">
                <Input
                  value={customTimeframe}
                  onChange={(event) => setCustomTimeframe(event.target.value)}
                  placeholder={t("asset.chart.customPlaceholder")}
                  className="h-8 w-28 border-slate-700 bg-slate-900 text-xs text-slate-100 placeholder:text-slate-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 hover:bg-slate-800"
                  onClick={applyCustomTimeframe}
                  type="button"
                  disabled={switchingTf || !customTimeframe.trim()}
                >
                  {t("asset.chart.apply")}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {switchingTf ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : null}
              <Badge variant="outline" className="border-slate-700 text-slate-200">{activeTimeframe}</Badge>
              <span>O <strong>{latest?.open.toFixed(2) ?? "--"}</strong></span>
              <span>H <strong>{latest?.high.toFixed(2) ?? "--"}</strong></span>
              <span>L <strong>{latest?.low.toFixed(2) ?? "--"}</strong></span>
              <span>C <strong>{latest?.close.toFixed(2) ?? "--"}</strong></span>
              <span className={change >= 0 ? "text-green-400" : "text-red-400"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)} ({changePct.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-800 bg-slate-900/80 p-1">
                <span className="px-1 text-xs text-slate-400">{t("asset.chart.draw")}</span>
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Button
                      key={tool.key}
                      size="sm"
                      type="button"
                      variant={activeTool === tool.key ? "secondary" : "ghost"}
                      className={cn(
                        "h-7 gap-1 px-2 text-xs",
                        activeTool === tool.key ? "bg-slate-700" : "text-slate-300",
                      )}
                      onClick={() => pickTool(tool.key)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tool.label}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-slate-300"
                  onClick={() => setDrawings((prev) => prev.slice(0, -1))}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {t("asset.chart.undoDraw")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-slate-300"
                  onClick={() => {
                    setDrawings([]);
                    setSelectedShapeId(null);
                    setDragState(null);
                    setDraftStart(null);
                    setDraftHover(null);
                  }}
                >
                  <Eraser className="h-3.5 w-3.5" />
                  {t("asset.chart.clearDraw")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={!selectedShapeId}
                  className="h-7 px-2 text-xs text-slate-300 disabled:opacity-40"
                  onClick={deleteSelectedShape}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("asset.chart.deleteSelected")}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={magnetOn} onCheckedChange={setMagnetOn} id="toggle-magnet" />
                  <Label htmlFor="toggle-magnet" className="text-slate-200">{t("asset.chart.magnet")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showMA20} onCheckedChange={setShowMA20} id="toggle-ma20" />
                  <Label htmlFor="toggle-ma20" className="text-slate-200">MA20</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showBOLL} onCheckedChange={setShowBOLL} id="toggle-boll" />
                  <Label htmlFor="toggle-boll" className="text-slate-200">BOLL</Label>
                </div>
              </div>

              {draftStart && TWO_POINT_TOOLS.includes(activeTool) ? (
                <span className="text-xs text-amber-300">{t("asset.chart.drawPickEnd")}</span>
              ) : null}
              {timeframeError ? <span className="text-xs text-red-400">{timeframeError}</span> : null}
              {drawError ? <span className="text-xs text-red-400">{drawError}</span> : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                onClick={fitChartContent}
                type="button"
              >
                <ScanLine className="h-4 w-4" />
                {t("asset.chart.fit")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                onClick={() => void toggleFullscreen()}
                type="button"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {isFullscreen ? t("asset.chart.exitFullscreen") : t("asset.chart.fullscreen")}
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/70 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300">
                {t("asset.chart.layers")} ({drawings.length})
              </span>
              {selectedShapeId ? (
                <span className="text-xs text-emerald-300">{t("asset.chart.selected")}</span>
              ) : (
                <span className="text-xs text-slate-500">{t("asset.chart.noSelection")}</span>
              )}
            </div>
            {drawings.length > 0 ? (
              <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
                {drawings.map((shape, index) => (
                  <Button
                    key={shape.id}
                    size="sm"
                    type="button"
                    variant={selectedShapeId === shape.id ? "secondary" : "outline"}
                    className={cn(
                      "h-7 shrink-0 border-slate-700 bg-slate-900 text-xs text-slate-200",
                      selectedShapeId === shape.id ? "bg-slate-700" : "",
                    )}
                    onClick={() => setSelectedShapeId(shape.id)}
                  >
                    {index + 1}. {getToolLabelForShape(shape)}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "relative mt-4 w-full overflow-hidden rounded-lg border border-slate-800",
              isFullscreen ? "h-[calc(100vh-220px)] min-h-[460px]" : "h-[560px]",
            )}
          >
            <div ref={chartContainerRef} className="h-full w-full" />
            <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
            <div
              ref={overlayHitRef}
              className={cn(
                "absolute inset-0 z-30",
                activeTool === "cursor"
                  ? dragState
                    ? "cursor-grabbing"
                    : selectedShapeId
                      ? "cursor-move"
                      : "cursor-default"
                  : "pointer-events-none",
              )}
              onMouseDown={handleOverlayMouseDown}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
