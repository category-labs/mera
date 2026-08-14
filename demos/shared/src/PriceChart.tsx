import { type ReactElement, useMemo } from "react";
import { CHART_HEIGHT, CHART_WIDTH, chartGeometry } from "./chart";
import { TICKER } from "./market";

type PriceChartProps = {
  /** Current on-chain price, drawn as the newest point, in wei per share. */
  livePrice: bigint;
  /** Unix seconds of the newest point; changing it re-samples the history. */
  now: number;
};

/**
 * The stock's last 30 minutes as an SVG line with a dotted reference at the
 * window's opening price.
 */
function PriceChart({ livePrice, now }: PriceChartProps): ReactElement {
  const { line, area, openY, up, high, low } = useMemo(
    () => chartGeometry(livePrice, now),
    [livePrice, now],
  );

  const tone = up ? "var(--up)" : "var(--down)";
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`${TICKER} price, last 30 minutes`}
    >
      <title>{`${TICKER} price, last 30 minutes`}</title>
      <path d={area} fill={tone} opacity="0.08" />
      <line
        x1="0"
        y1={openY}
        x2={CHART_WIDTH}
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
      <text className="chart-label" x="6" y={CHART_HEIGHT - 5}>
        L {low.toFixed(2)}
      </text>
    </svg>
  );
}

export { PriceChart };
