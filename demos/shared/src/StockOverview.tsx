import type { ReactElement } from "react";
import { CHART_HEIGHT, CHART_WIDTH, chartGeometry } from "./chart";
import { COMPANY_NAME, TICKER } from "./market";
import { headlineAt } from "./news";
import { formatCash, formatSignedCash } from "./ui";

const CHART_LABEL = `${TICKER} price, last 30 minutes`;

/**
 * The stock at `now` (Unix seconds): its quote, the last 30 minutes as a line
 * over a dotted reference at the opening price, and a fictional headline.
 */
function StockOverview({ now }: { now: number }): ReactElement {
  const chart = chartGeometry(now);
  const tone = chart.delta < 0n ? "down" : "up";
  return (
    <>
      <div className="stock-head">
        <div>
          <span className="stock-name">{COMPANY_NAME}</span>
          <span className="stock-symbol">{TICKER}</span>
        </div>
        <div className="stock-quote">
          <span className="stock-price">{formatCash(chart.price)}</span>
          <span className={`stock-delta ${tone}`}>
            {formatSignedCash(chart.delta)} · 30m
          </span>
        </div>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={CHART_LABEL}
      >
        <title>{CHART_LABEL}</title>
        <path d={chart.area} fill={`var(--${tone})`} opacity="0.08" />
        <line
          x1="0"
          y1={chart.openY}
          x2={CHART_WIDTH}
          y2={chart.openY}
          stroke="var(--muted)"
          strokeOpacity="0.35"
          strokeDasharray="3 5"
        />
        <path
          d={chart.line}
          fill="none"
          stroke={`var(--${tone})`}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text className="chart-label" x="6" y="14">
          H {chart.high.toFixed(2)}
        </text>
        <text className="chart-label" x="6" y={CHART_HEIGHT - 5}>
          L {chart.low.toFixed(2)}
        </text>
      </svg>
      <p className="news">
        <span className="news-tag">News</span>
        {headlineAt(now)}
      </p>
    </>
  );
}

export { StockOverview };
