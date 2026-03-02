export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

