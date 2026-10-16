<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { describeError } from "@category-labs/mera-demo-shared/connect";
import {
  type EvmContext,
  resolveEvmContext,
  retryingResolve,
} from "@category-labs/mera-demo-shared/network";
import { computed, onUnmounted, ref, shallowRef } from "vue";
import AccountChip from "./AccountChip.vue";
import { RPC_URL } from "./config";
import TradingCard from "./TradingCard.vue";

const evm = shallowRef<EvmContext | null>(null);
const evmError = ref<string | null>(null);
const cached = loadCachedAccount();
const account = shallowRef<AccountState>(
  cached ? { status: "locked", ...cached } : { status: "none" },
);
const address = computed(() => accountAddress(account.value));

const stopResolving = retryingResolve(
  () => resolveEvmContext({ rpcUrl: RPC_URL }),
  (context) => {
    evm.value = context;
    // Clear the failure once a retry lands, or the error line would outlive
    // the outage it reported.
    evmError.value = null;
  },
  (error) => {
    evmError.value = describeError(error);
  },
);
onUnmounted(stopResolving);
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
