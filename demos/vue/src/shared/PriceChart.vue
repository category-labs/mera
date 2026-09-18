<script setup lang="ts">
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartGeometry,
} from "@category-labs/mera-demo-shared/chart";
import { TICKER } from "@category-labs/mera-demo-shared/market";
import { computed } from "vue";

const props = defineProps<{
  /** Current on-chain price, drawn as the newest point, in wei per share. */
  livePrice: bigint;
  /** Unix seconds of the newest point; changing it re-samples the history. */
  now: number;
}>();

/**
 * The stock's last 30 minutes as an SVG line with a dotted reference at the
 * window's opening price.
 */
const geometry = computed(() => chartGeometry(props.livePrice, props.now));
const tone = computed(() => (geometry.value.up ? "var(--up)" : "var(--down)"));
const label = `${TICKER} price, last 30 minutes`;
const viewBox = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;
const lowLabelY = CHART_HEIGHT - 5;
</script>

<template>
  <svg class="chart" :viewBox="viewBox" role="img" :aria-label="label">
    <title>{{ label }}</title>
    <path :d="geometry.area" :fill="tone" opacity="0.08" />
    <line
      x1="0"
      :y1="geometry.openY"
      :x2="CHART_WIDTH"
      :y2="geometry.openY"
      stroke="var(--muted)"
      stroke-opacity="0.35"
      stroke-dasharray="3 5"
      stroke-width="1"
    />
    <path
      :d="geometry.line"
      fill="none"
      :stroke="tone"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <text class="chart-label" x="6" y="14">H {{ geometry.high.toFixed(2) }}</text>
    <text class="chart-label" x="6" :y="lowLabelY">
      L {{ geometry.low.toFixed(2) }}
    </text>
  </svg>
</template>
