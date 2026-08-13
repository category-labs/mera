import { priceAt, TICKER } from "@category-labs/mera-demo-shared/market";
import { type ReactElement, useMemo } from "react";

// The chart shows this much history; the header's delta uses the same window
// so the number and the shape always tell one story.
const CHART_WINDOW_SECONDS = 1800;
const SAMPLE_SECONDS = 5;

// viewBox units; the drawing scales with the card while text keeps its size.
const WIDTH = 400;
const HEIGHT = 110;
const PAD_Y = 8;

type PriceChartProps = {
  /** Current on-chain price, drawn as the newest point, in wei per share. */
  livePrice: bigint;
  /** Unix seconds of the newest point; changing it re-samples the history. */
  now: number;
};

/**
 * The stock's last 30 minutes as an SVG line with a dotted reference at the
 * window's opening price. History comes from the price mirror (see market.ts)
 * and only the newest point is the live on-chain price, so drawing needs no
 * network reads.
 */
function PriceChart({ livePrice, now }: PriceChartProps): ReactElement {
  const { line, area, openY, up, high, low } = useMemo(() => {
    const points: { t: number; price: bigint }[] = [];
    // Sample on the absolute SAMPLE_SECONDS grid, not relative to `now`:
    // anchoring to `now` would shift every sample time each tick, re-rolling
    // the price noise across the whole line and making it visibly shimmer.
    const start =
      Math.ceil((now - CHART_WINDOW_SECONDS) / SAMPLE_SECONDS) * SAMPLE_SECONDS;
    for (let t = start; t < now; t += SAMPLE_SECONDS) {
      points.push({ t, price: priceAt(BigInt(t)) });
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
      ((t - (now - CHART_WINDOW_SECONDS)) / CHART_WINDOW_SECONDS) * WIDTH;
    const y = (price: bigint) =>
      HEIGHT - PAD_Y - ((toCents(price) - minC) / span) * (HEIGHT - 2 * PAD_Y);

    const coords = points.map(
      (point) => `${x(point.t).toFixed(1)},${y(point.price).toFixed(1)}`,
    );
    const first = points[0];
    const last = points[points.length - 1];
    return {
      line: `M${coords.join(" L")}`,
      area: `M${coords.join(" L")} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`,
      openY: first ? y(first.price) : 0,
      up:
        first !== undefined && last !== undefined && last.price >= first.price,
      high: maxC / 100,
      low: minC / 100,
    };
  }, [livePrice, now]);

  const tone = up ? "var(--up)" : "var(--down)";
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${TICKER} price, last 30 minutes`}
    >
      <title>{`${TICKER} price, last 30 minutes`}</title>
      <path d={area} fill={tone} opacity="0.08" />
      <line
        x1="0"
        y1={openY}
        x2={WIDTH}
        y2={openY}
        stroke="var(--muted)"
        strokeOpacity="0.35"
        strokeDasharray="3 5"
        strokeWidth="1"
      />
      <path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <text className="chart-label" x="6" y="14">
        H {high.toFixed(2)}
      </text>
      <text className="chart-label" x="6" y={HEIGHT - 5}>
        L {low.toFixed(2)}
      </text>
    </svg>
  );
}

export { CHART_WINDOW_SECONDS, PriceChart };
