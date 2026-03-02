export function calcMovingAverage(values: number[], period: number) {
  const result: Array<number | null> = Array(values.length).fill(null);

  if (period <= 0) {
    return result;
  }

  let windowSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    windowSum += values[i];

    if (i >= period) {
      windowSum -= values[i - period];
    }

    if (i >= period - 1) {
      result[i] = windowSum / period;
    }
  }

  return result;
}

