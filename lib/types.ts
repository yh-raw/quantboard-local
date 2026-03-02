export type Timeframe = string;

export type PriceBarInput = {
  ticker: string;
  timeframe: Timeframe;
  ts: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type WatchlistOverviewItem = {
  ticker: string;
  latestClose: number | null;
  changePct: number | null;
  updatedAt: string | null;
};
