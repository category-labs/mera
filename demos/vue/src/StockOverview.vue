<script setup lang="ts">
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
import { computed } from "vue";

/**
 * The stock at `now` (Unix seconds): its quote, the last 30 minutes as a line
 * over a dotted reference at the opening price, and a fictional headline.
 */
const { now } = defineProps<{ now: number }>();

const chart = computed(() => chartGeometry(now));
const tone = computed(() => (chart.value.delta < 0n ? "down" : "up"));
const label = `${TICKER} price, last 30 minutes`;
</script>

<template>
  <div class="stock-head">
    <div>
      <span class="stock-name">{{ COMPANY_NAME }}</span>
      <span class="stock-symbol">{{ TICKER }}</span>
    </div>
    <div class="stock-quote">
      <span class="stock-price">{{ formatCash(chart.price) }}</span>
      <span class="stock-delta" :class="tone">
        {{ formatSignedCash(chart.delta) }} · 30m
      </span>
    </div>
  </div>
  <svg
    class="chart"
    :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
    role="img"
    :aria-label="label"
  >
    <title>{{ label }}</title>
    <path :d="chart.area" :fill="`var(--${tone})`" opacity="0.08" />
    <line
      x1="0"
      :y1="chart.openY"
      :x2="CHART_WIDTH"
      :y2="chart.openY"
      stroke="var(--muted)"
      stroke-opacity="0.35"
      stroke-dasharray="3 5"
    />
    <path
      :d="chart.line"
      fill="none"
      :stroke="`var(--${tone})`"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <text class="chart-label" x="6" y="14">H {{ chart.high.toFixed(2) }}</text>
    <text class="chart-label" x="6" :y="CHART_HEIGHT - 5">
      L {{ chart.low.toFixed(2) }}
    </text>
  </svg>
  <p class="news"><span class="news-tag">News</span>{{ headlineAt(now) }}</p>
</template>
