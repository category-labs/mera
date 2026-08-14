import { priceAt } from "./market";

// The chart shows this much history; the header's delta uses the same window
// so the number and the shape always tell one story.
const CHART_WINDOW_SECONDS = 1800;
const SAMPLE_SECONDS = 5;

// viewBox units; the drawing scales with the card while text keeps its size.
const CHART_WIDTH = 400;
const CHART_HEIGHT = 110;
const PAD_Y = 8;

type ChartGeometry = {
  /** SVG path of the price line. */
  line: string;
  /** The line closed down to the bottom edge, for the tinted fill. */
  area: string;
  /** y of the window's opening price, for a reference line. */
  openY: number;
  /** Whether the newest price is at or above the window's open. */
  up: boolean;
  /** Window high in DEMOCASH. */
  high: number;
  /** Window low in DEMOCASH. */
  low: number;
};

// Grid prices, pruned to the drawn window. A redraw resamples the whole
// window at eight keccak hashes per sample, which stalls JIT-less engines
// when repeated every second; a grid price never changes, so a redraw
// computes only the samples that newly entered the window.
const gridPrices = new Map<number, bigint>();

/**
 * Lays out the last CHART_WINDOW_SECONDS of the stock price as SVG path data
 * in the CHART_WIDTH by CHART_HEIGHT space. History comes from the price
 * mirror (see market.ts) and only the newest point is the caller's live
 * price, so the computation needs no network reads.
 */
function chartGeometry(livePrice: bigint, now: number): ChartGeometry {
  const points: { t: number; price: bigint }[] = [];
  // Sample on the absolute SAMPLE_SECONDS grid, not relative to `now`:
  // anchoring to `now` would shift every sample time each tick, re-rolling
  // the price noise across the whole line and making it visibly shimmer.
  const start =
    Math.ceil((now - CHART_WINDOW_SECONDS) / SAMPLE_SECONDS) * SAMPLE_SECONDS;
  // Dropping t >= now also clears samples ahead of a clock that moved back.
  for (const t of gridPrices.keys()) {
    if (t < start || t >= now) gridPrices.delete(t);
  }
  for (let t = start; t < now; t += SAMPLE_SECONDS) {
    let price = gridPrices.get(t);
    if (price === undefined) {
      price = priceAt(BigInt(t));
      gridPrices.set(t, price);
    }
    points.push({ t, price });
  }
  points.push({ t: now, price: livePrice });

  let min = points[0]?.price ?? 0n;
  let max = min;
  for (const point of points) {
    if (point.price < min) min = point.price;
    if (point.price > max) max = point.price;
  }
  // Cents as floats are exact enough for pixel math.
  const toCents = (price: bigint) => Number(price / 10n ** 16n);
  const [minC, maxC] = [toCents(min), toCents(max)];
  const span = Math.max(maxC - minC, 1);
  const x = (t: number) =>
    ((t - (now - CHART_WINDOW_SECONDS)) / CHART_WINDOW_SECONDS) * CHART_WIDTH;
  const y = (price: bigint) =>
    CHART_HEIGHT -
    PAD_Y -
    ((toCents(price) - minC) / span) * (CHART_HEIGHT - 2 * PAD_Y);

  const coords = points.map(
    (point) => `${x(point.t).toFixed(1)},${y(point.price).toFixed(1)}`,
  );
  const first = points[0];
  const last = points[points.length - 1];
  return {
    line: `M${coords.join(" L")}`,
    area: `M${coords.join(" L")} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`,
    openY: first ? y(first.price) : 0,
    up: first !== undefined && last !== undefined && last.price >= first.price,
    high: maxC / 100,
    low: minC / 100,
  };
}

export type { ChartGeometry };
export { CHART_HEIGHT, CHART_WIDTH, CHART_WINDOW_SECONDS, chartGeometry };
