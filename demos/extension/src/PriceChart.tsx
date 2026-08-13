import { type ReactElement, useMemo } from "react";
import { priceAt, TICKER } from "./market";

const CHART_WINDOW_SECONDS = 1800;
const SAMPLE_SECONDS = 5;
const WIDTH = 400;
const HEIGHT = 110;
const PAD_Y = 8;

type Props = { livePrice: bigint; now: number };

function PriceChart({ livePrice, now }: Props): ReactElement {
  const { line, area, openY, up, high, low } = useMemo(() => {
    const points: { t: number; price: bigint }[] = [];
    const start =
      Math.ceil((now - CHART_WINDOW_SECONDS) / SAMPLE_SECONDS) * SAMPLE_SECONDS;
    for (let time = start; time < now; time += SAMPLE_SECONDS) {
      points.push({ t: time, price: priceAt(BigInt(time)) });
    }
    points.push({ t: now, price: livePrice });
    let min = points[0]?.price ?? 0n;
    let max = min;
    for (const point of points) {
      if (point.price < min) min = point.price;
      if (point.price > max) max = point.price;
    }
    const toCents = (price: bigint): number => Number(price / 10n ** 16n);
    const [minCents, maxCents] = [toCents(min), toCents(max)];
    const span = Math.max(maxCents - minCents, 1);
    const x = (time: number): number =>
      ((time - (now - CHART_WINDOW_SECONDS)) / CHART_WINDOW_SECONDS) * WIDTH;
    const y = (price: bigint): number =>
      HEIGHT -
      PAD_Y -
      ((toCents(price) - minCents) / span) * (HEIGHT - 2 * PAD_Y);
    const coordinates = points.map(
      (point) => `${x(point.t).toFixed(1)},${y(point.price).toFixed(1)}`,
    );
    const first = points[0];
    const last = points[points.length - 1];
    return {
      line: `M${coordinates.join(" L")}`,
      area: `M${coordinates.join(" L")} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`,
      openY: first ? y(first.price) : 0,
      up:
        first !== undefined && last !== undefined && last.price >= first.price,
      high: maxCents / 100,
      low: minCents / 100,
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
