<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { describeError } from "@category-labs/mera-demo-shared/connect";
import {
  DEMO_CHAIN_ID,
  type EvmContext,
  resolveEvmContext,
} from "@category-labs/mera-demo-shared/network";
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import AccountChip from "./AccountChip.vue";
import { RPC_URL } from "./config";
import TradingCard from "./TradingCard.vue";

const RESOLVE_RETRY_MS = 5_000;

const evm = shallowRef<EvmContext | null>(null);
const evmError = ref<string | null>(null);
const cached = loadCachedAccount();
const account = shallowRef<AccountState>(
  cached ? { status: "locked", ...cached } : { status: "none" },
);
const address = computed(() => accountAddress(account.value));

// Resolves the network context, retrying until it lands. Each failure shows
// while the retries continue, because the demo network comes back empty but
// reachable after a restart, which can take up to a minute.
let stopped = false;
let retryTimer: number | undefined;
async function resolveNetwork(): Promise<void> {
  try {
    evm.value = await resolveEvmContext({
      rpcUrl: RPC_URL,
      expectedChainId: DEMO_CHAIN_ID,
    });
    // Clear the failure once a retry lands, or the error line would outlive
    // the outage it reported.
    evmError.value = null;
  } catch (error) {
    if (stopped) return;
    evmError.value = describeError(error);
    retryTimer = window.setTimeout(
      () => void resolveNetwork(),
      RESOLVE_RETRY_MS,
    );
  }
}

onMounted(() => void resolveNetwork());
onUnmounted(() => {
  stopped = true;
  window.clearTimeout(retryTimer);
});
</script>

<template>
  <main class="app">
    <header class="app-head">
      <h1>mera demo <span class="framework-badge">Vue 3</span></h1>
      <AccountChip :address="address" :connected="evm !== null" />
    </header>
    <TradingCard v-model:account="account" :evm="evm" :evm-error="evmError" />
  </main>
</template>
