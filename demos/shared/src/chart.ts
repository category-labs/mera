import { priceAt } from "./market";

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
  /** The price at `now`, in wei per share. */
  price: bigint;
  /** `price` minus the window's opening price. */
  delta: bigint;
  /** Window high in DEMOCASH. */
  high: number;
  /** Window low in DEMOCASH. */
  low: number;
};

// Grid prices, pruned to the drawn window. Each sample costs eight keccak
// hashes, which stalls JIT-less engines when the whole window is resampled
// every second; a grid price never changes, so a redraw computes only the
// samples that newly entered the window.
const gridPrices = new Map<number, bigint>();

/**
 * Lays out the stock price over the CHART_WINDOW_SECONDS before `now` (Unix
 * seconds) as SVG path data in the CHART_WIDTH by CHART_HEIGHT space. Every
 * point comes from the price mirror, so the layout needs no network reads.
 */
function chartGeometry(now: number): ChartGeometry {
  const points: { t: number; price: bigint }[] = [];
  // Sample on the absolute SAMPLE_SECONDS grid: anchoring to `now` would shift
  // every sample each tick and make the line shimmer.
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
  const price = priceAt(BigInt(now));
  points.push({ t: now, price });
  const open = points[0]?.price ?? price;

  let min = price;
  let max = price;
  for (const point of points) {
    if (point.price < min) min = point.price;
    if (point.price > max) max = point.price;
  }
  // Cents as floats are exact enough for pixel math.
  const toCents = (wei: bigint) => Number(wei / 10n ** 16n);
  const [minC, maxC] = [toCents(min), toCents(max)];
  const span = Math.max(maxC - minC, 1);
  const x = (t: number) =>
    ((t - (now - CHART_WINDOW_SECONDS)) / CHART_WINDOW_SECONDS) * CHART_WIDTH;
  const y = (wei: bigint) =>
    CHART_HEIGHT -
    PAD_Y -
    ((toCents(wei) - minC) / span) * (CHART_HEIGHT - 2 * PAD_Y);

  const line = `M${points.map((point) => `${x(point.t).toFixed(1)},${y(point.price).toFixed(1)}`).join(" L")}`;
  return {
    line,
    area: `${line} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`,
    openY: y(open),
    price,
    delta: price - open,
    high: maxC / 100,
    low: minC / 100,
  };
}

export type { ChartGeometry };
export { CHART_HEIGHT, CHART_WIDTH, chartGeometry };
