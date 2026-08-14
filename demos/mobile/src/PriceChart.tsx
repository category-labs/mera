import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartGeometry,
} from "@category-labs/mera-demo-shared/chart";
import { TICKER } from "@category-labs/mera-demo-shared/market";
import { type ReactElement, useMemo } from "react";
import { StyleSheet } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { palette } from "./theme";

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

  const tone = up ? palette.up : palette.down;
  return (
    <Svg
      accessibilityLabel={`${TICKER} price, last 30 minutes`}
      style={styles.chart}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
    >
      <Path d={area} fill={tone} opacity={0.08} />
      <Line
        x1={0}
        y1={openY}
        x2={CHART_WIDTH}
        y2={openY}
        stroke={palette.muted}
        strokeOpacity={0.35}
        strokeDasharray="3 5"
        strokeWidth={1}
      />
      <Path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <SvgText x={6} y={14} fill={palette.muted} fontSize={10} fontWeight="600">
        {`H ${high.toFixed(2)}`}
      </SvgText>
      <SvgText
        x={6}
        y={CHART_HEIGHT - 5}
        fill={palette.muted}
        fontSize={10}
        fontWeight="600"
      >
        {`L ${low.toFixed(2)}`}
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  chart: { aspectRatio: CHART_WIDTH / CHART_HEIGHT, width: "100%" },
});

export { PriceChart };
