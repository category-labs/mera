import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartGeometry,
} from "@category-labs/mera-demo-shared/chart";
import { COMPANY_NAME, TICKER } from "@category-labs/mera-demo-shared/market";
import { headlineAt } from "@category-labs/mera-demo-shared/news";
import {
  formatCash,
  formatSignedCash,
} from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { palette, text } from "./theme";

/**
 * The stock at `now` (Unix seconds): its quote, the last 30 minutes as a line
 * over a dotted reference at the opening price, and a fictional headline.
 */
function StockOverview({ now }: { now: number }): ReactElement {
  const chart = chartGeometry(now);
  const tone = chart.delta < 0n ? palette.down : palette.up;
  return (
    <>
      <View style={styles.head}>
        <View style={styles.title}>
          <Text style={styles.name}>{COMPANY_NAME}</Text>
          <View style={styles.symbol}>
            <Text style={styles.symbolLabel}>{TICKER}</Text>
          </View>
        </View>
        <View style={styles.quote}>
          <Text style={styles.price}>{formatCash(chart.price)}</Text>
          <Text style={[styles.delta, { color: tone }]}>
            {formatSignedCash(chart.delta)} · 30m
          </Text>
        </View>
      </View>
      <Svg
        accessibilityLabel={`${TICKER} price, last 30 minutes`}
        style={styles.chart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <Path d={chart.area} fill={tone} opacity={0.08} />
        <Line
          x1={0}
          y1={chart.openY}
          x2={CHART_WIDTH}
          y2={chart.openY}
          stroke={palette.muted}
          strokeOpacity={0.35}
          strokeDasharray="3 5"
        />
        <Path
          d={chart.line}
          fill="none"
          stroke={tone}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <SvgText
          x={6}
          y={14}
          fill={palette.muted}
          fontSize={10}
          fontWeight="600"
        >
          {`H ${chart.high.toFixed(2)}`}
        </SvgText>
        <SvgText
          x={6}
          y={CHART_HEIGHT - 5}
          fill={palette.muted}
          fontSize={10}
          fontWeight="600"
        >
          {`L ${chart.low.toFixed(2)}`}
        </SvgText>
      </Svg>
      <View style={styles.news}>
        <Text style={styles.tag}>News</Text>
        <Text style={[text.hint, styles.headline]}>{headlineAt(now)}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chart: { aspectRatio: CHART_WIDTH / CHART_HEIGHT, width: "100%" },
  delta: { fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "600" },
  head: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headline: { flex: 1 },
  name: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.16,
  },
  news: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  price: {
    color: palette.text,
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -0.48,
  },
  quote: { alignItems: "flex-end", gap: 2 },
  symbol: {
    backgroundColor: "rgba(255, 85, 0, 0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  symbolLabel: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  tag: {
    backgroundColor: palette.surface2,
    borderRadius: 999,
    color: palette.muted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  title: { alignItems: "center", flexDirection: "row", gap: 8 },
});

export { StockOverview };
