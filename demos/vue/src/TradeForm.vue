<script lang="ts" setup>
  import type {
    Fill,
    Order,
    Portfolio,
    Side,
    TradeDraft,
  } from "@category-labs/mera-demo-shared/market";
  import {
    coversTrade,
    draftOrder,
    maxDraft,
    orderShares,
    TICKER,
  } from "@category-labs/mera-demo-shared/market";
  import type { positionReducer } from "@category-labs/mera-demo-shared/position";
  import {
    CASH_SYMBOL,
    fillText,
    formatShares,
  } from "@category-labs/mera-demo-shared/ui";
  import { computed } from "vue";

  /**
   * The buy and sell form. It emits `submit` with an order the portfolio
   * covers, and takes no order while a trade is in flight.
   */
  const { portfolio, price, stage, locked, fill } = defineProps<{
    portfolio: Portfolio;
    price: bigint;
    stage: positionReducer.TradeStage | null;
    /** The next trade first runs a passkey ceremony to restore the session. */
    locked: boolean;
    fill: Fill | null;
  }>();
  const draft = defineModel<TradeDraft>("draft", { required: true });
  const emit = defineEmits<{ submit: [order: Order] }>();

  const SIDES: readonly Side[] = ["buy", "sell"];

  const order = computed(() => draftOrder(draft.value));
  const coveredOrder = computed(() =>
    stage === null &&
    order.value !== null &&
    coversTrade({ order: order.value, price, portfolio })
      ? order.value
      : null
  );
  const estimatedShares = computed(() =>
    order.value === null
      ? null
      : orderShares({ order: order.value, price, heldShares: portfolio.shares })
  );

  const amountText = computed({
    get: () => draft.value.text,
    set: (text: string) => {
      draft.value = { kind: "amount", side: draft.value.side, text };
    },
  });

  const submitLabel = computed(() => {
    const buying = draft.value.side === "buy";
    if (stage !== "sending") {
      return buying ? "Buy" : "Sell";
    }
    if (locked) {
      return "Waiting for passkey…";
    }
    return buying ? "Buying…" : "Selling…";
  });

  function chooseSide(side: Side): void {
    draft.value = { kind: "amount", side, text: draft.value.text };
  }

  function fillMax(): void {
    draft.value = maxDraft({ side: draft.value.side, price, portfolio });
  }

  function submit(): void {
    if (coveredOrder.value !== null) {
      emit("submit", coveredOrder.value);
    }
  }
</script>

<template>
  <div aria-label="Trade side" class="segmented" role="tablist">
    <button
      class="segment"
      role="tab"
      type="button"
      v-for="side in SIDES"
      :key="side"
      :aria-selected="side === draft.side"
      :class="{ active: side === draft.side }"
      @click="chooseSide(side)"
    >
      {{ side === "buy" ? "Buy" : "Sell" }}
    </button>
  </div>

  <form class="trade" @submit.prevent="submit">
    <div class="send-row">
      <div class="field grow">
        <span class="field-head">
          <label for="trade-amount">Amount ({{ CASH_SYMBOL }})</label>
          <button
            class="link small"
            type="button"
            :disabled="stage !== null"
            @click="fillMax"
          >
            Max
          </button>
        </span>
        <input
          id="trade-amount"
          inputmode="decimal"
          placeholder="100.00"
          spellcheck="false"
          v-model="amountText"
          :disabled="stage === 'sending'"
        >
      </div>
      <button
        class="btn primary send-btn"
        type="submit"
        :disabled="coveredOrder === null"
      >
        {{ submitLabel }}
      </button>
    </div>

    <p class="status ok" v-if="fill !== null">{{ fillText(fill) }}</p>
    <p class="hint" v-else-if="estimatedShares !== null">
      ≈ {{ formatShares(estimatedShares) }} {{ TICKER }} at the current price
    </p>
  </form>
</template>
