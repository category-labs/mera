<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  DEMO_RPC_URL,
  type EvmContext,
  resolveEvmContext,
  retryingResolve,
} from "@category-labs/mera-demo-shared/network";
import { onScopeDispose, ref, shallowRef } from "vue";
import AccountChip from "./AccountChip.vue";
import TradingCard from "./TradingCard.vue";

// Set in demos/vue/.env to run against a local network.
const RPC_URL = import.meta.env.VITE_EVM_RPC_URL ?? DEMO_RPC_URL;

const evm = shallowRef<EvmContext | null>(null);
const evmError = ref<string | null>(null);
const cached = loadCachedAccount();
const account = shallowRef<AccountState>(
  cached ? { status: "locked", ...cached } : { status: "none" },
);

onScopeDispose(
  retryingResolve(
    () => resolveEvmContext(RPC_URL),
    (context) => {
      evm.value = context;
      evmError.value = null;
    },
    (error) => {
      evmError.value = describeError(error);
    },
  ),
);
</script>

<template>
  <main class="app">
    <header class="app-head">
      <h1>mera demo <span class="framework-badge">Vue 3</span></h1>
      <AccountChip :address="accountAddress(account)" :connected="evm !== null" />
    </header>
    <TradingCard v-model:account="account" :evm="evm" :evm-error="evmError" />
  </main>
</template>
