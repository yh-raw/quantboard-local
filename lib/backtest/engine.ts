import { AppError } from "@/lib/errors";
import { calcMovingAverage } from "@/lib/indicators/ma";

export type BacktestParams = {
  ticker: string;
  timeframe: "1d";
  shortWindow: number;
  longWindow: number;
  initialCapital: number;
  feeBps: number;
  riskFreeRatePct: number;
};

export type BacktestInputBar = {
  ts: Date;
  close: number;
};

export type BacktestTrade = {
  ts: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  fee: number;
  cashAfter: number;
  equityAfter: number;
};

export type BacktestCurvePoint = {
  ts: string;
  close: number;
  shortMA: number | null;
  longMA: number | null;
  equity: number;
  benchmarkEquity: number;
  drawdownPct: number;
};

export type BacktestMetrics = {
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

export type BacktestResult = {
  params: BacktestParams;
  metrics: BacktestMetrics;
  equityCurve: BacktestCurvePoint[];
  trades: BacktestTrade[];
};

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function runMaCrossBacktest(params: {
  bars: BacktestInputBar[];
  strategy: BacktestParams;
}): BacktestResult {
  const { bars, strategy } = params;
  const { shortWindow, longWindow, initialCapital, feeBps, riskFreeRatePct } = strategy;

  if (shortWindow >= longWindow) {
    throw new AppError("INVALID_STRATEGY_PARAMS", 400, "shortWindow must be less than longWindow");
  }
  if (bars.length < longWindow + 2) {
    throw new AppError("INSUFFICIENT_BARS", 400, `Need at least ${longWindow + 2} bars to run backtest`);
  }
  if (initialCapital <= 0) {
    throw new AppError("INVALID_CAPITAL", 400, "initialCapital must be greater than 0");
  }

  const closes = bars.map((bar) => bar.close);
  const shortMA = calcMovingAverage(closes, shortWindow);
  const longMA = calcMovingAverage(closes, longWindow);
  const startIndex = longWindow - 1;

  let cash = initialCapital;
  let quantity = 0;
  let positionCost = 0;
  let peakEquity = initialCapital;

  const feeRate = feeBps / 10000;
  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestCurvePoint[] = [];
  const benchmarkShares = initialCapital / closes[startIndex];

  let roundTripCount = 0;
  let winCount = 0;

  for (let i = startIndex; i < bars.length; i += 1) {
    const price = closes[i];
    const ts = bars[i].ts.toISOString();

    if (i > startIndex) {
      const prevShort = shortMA[i - 1];
      const prevLong = longMA[i - 1];
      const currShort = shortMA[i];
      const currLong = longMA[i];

      if (prevShort !== null && prevLong !== null && currShort !== null && currLong !== null) {
        const crossUp = prevShort <= prevLong && currShort > currLong;
        const crossDown = prevShort >= prevLong && currShort < currLong;

        if (quantity === 0 && crossUp) {
          const buyQuantity = cash / (price * (1 + feeRate));
          if (buyQuantity > 0) {
            const buyCost = buyQuantity * price;
            const fee = buyCost * feeRate;
            cash -= buyCost + fee;
            quantity = buyQuantity;
            positionCost = buyCost + fee;
            trades.push({
              ts,
              side: "BUY",
              price: round(price),
              quantity: round(buyQuantity, 6),
              fee: round(fee),
              cashAfter: round(cash),
              equityAfter: round(cash + quantity * price),
            });
          }
        } else if (quantity > 0 && crossDown) {
          const sellValue = quantity * price;
          const fee = sellValue * feeRate;
          const netProceeds = sellValue - fee;
          cash += netProceeds;

          const pnl = netProceeds - positionCost;
          roundTripCount += 1;
          if (pnl > 0) {
            winCount += 1;
          }

          trades.push({
            ts,
            side: "SELL",
            price: round(price),
            quantity: round(quantity, 6),
            fee: round(fee),
            cashAfter: round(cash),
            equityAfter: round(cash),
          });

          quantity = 0;
          positionCost = 0;
        }
      }
    }

    const equity = cash + quantity * price;
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;
    const currShort = shortMA[i];
    const currLong = longMA[i];

    equityCurve.push({
      ts,
      close: round(price),
      shortMA: currShort === null ? null : round(currShort),
      longMA: currLong === null ? null : round(currLong),
      equity: round(equity),
      benchmarkEquity: round(benchmarkShares * price),
      drawdownPct: round(drawdownPct),
    });
  }

  const equities = equityCurve.map((point) => point.equity);
  const returns = equities.slice(1).map((equity, index) => equity / equities[index] - 1);
  const dailyRiskFree = riskFreeRatePct / 100 / 252;
  const excessReturns = returns.map((ret) => ret - dailyRiskFree);

  const avgExcess = mean(excessReturns);
  const stdExcess = std(excessReturns);
  const sharpeRatio = stdExcess > 0 ? (avgExcess / stdExcess) * Math.sqrt(252) : 0;

  const finalEquity = equities[equities.length - 1] ?? initialCapital;
  const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100;

  const periods = Math.max(equityCurve.length - 1, 1);
  const annualizedReturnPct = (Math.pow(finalEquity / initialCapital, 252 / periods) - 1) * 100;

  const benchmarkFinal = equityCurve[equityCurve.length - 1]?.benchmarkEquity ?? initialCapital;
  const benchmarkReturnPct = ((benchmarkFinal - initialCapital) / initialCapital) * 100;

  const maxDrawdownPct = equityCurve.reduce((minValue, point) => Math.min(minValue, point.drawdownPct), 0);

  return {
    params: strategy,
    metrics: {
      finalEquity: round(finalEquity),
      totalReturnPct: round(totalReturnPct),
      annualizedReturnPct: round(annualizedReturnPct),
      benchmarkReturnPct: round(benchmarkReturnPct),
      maxDrawdownPct: round(maxDrawdownPct),
      sharpeRatio: round(sharpeRatio),
      tradeCount: trades.length,
      roundTripCount,
      winRatePct: round(roundTripCount > 0 ? (winCount / roundTripCount) * 100 : 0),
      startTs: equityCurve[0]?.ts ?? bars[startIndex].ts.toISOString(),
      endTs: equityCurve[equityCurve.length - 1]?.ts ?? bars[bars.length - 1].ts.toISOString(),
    },
    equityCurve,
    trades,
  };
}
