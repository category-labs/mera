<script setup lang="ts">
import { TICKER, UNIT } from "@category-labs/mera-demo-shared/market";
import type { LoadedPosition } from "@category-labs/mera-demo-shared/position";
import {
  CASH_SYMBOL,
  formatCash,
  formatPnl,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import { computed } from "vue";

/**
 * The account's balances: cash, the position at the live price, and its gain
 * or loss against the cost basis. House credits change cash, never the basis,
 * so refills cannot fake gains.
 */
const props = defineProps<{
  position: LoadedPosition;
  price: bigint;
  /** A trade waits for the read that includes its fee, so cash shows "…". */
  settling: boolean;
}>();

const value = computed(() => (props.position.shares * props.price) / UNIT);
const pnl = computed(() => value.value - props.position.basis);
</script>

<template>
  <div class="holdings">
    <div class="holding-row">
      <span class="holding-label">{{ CASH_SYMBOL }}</span>
      <span class="holding-value">
        {{ settling ? "…" : formatCash(position.cash) }}
      </span>
    </div>
    <div class="holding-row">
      <span class="holding-label">{{ TICKER }}</span>
      <span class="holding-value">
        {{ formatShares(position.shares) }} · {{ formatCash(value) }}
      </span>
    </div>
    <div v-if="position.shares > 0n" class="holding-row">
      <span class="holding-label">P&amp;L</span>
      <span class="holding-value" :class="pnl < 0n ? 'down' : 'up'">
        {{ formatPnl(pnl, position.basis) }}
      </span>
    </div>
  </div>
</template>
