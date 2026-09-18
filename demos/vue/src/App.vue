<script setup lang="ts">
import {
  DEMO_CHAIN_ID,
  type EvmContext,
  resolveEvmContext,
} from "@category-labs/mera-demo-shared/network";
import { computed, onMounted, onUnmounted, shallowRef } from "vue";
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "./account";
import { RPC_URL } from "./config";
import { describeError } from "./connect";
import AccountChip from "./shared/AccountChip.vue";
import TradingCard from "./TradingCard.vue";

const evm = shallowRef<EvmContext | null>(null);
const evmError = shallowRef<string | null>(null);
const account = shallowRef<AccountState>({ status: "none" });
const address = computed(() => accountAddress(account.value));
let stopped = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function adoptAccount(next: AccountState): void {
  const previous = account.value;
  if (stopped) {
    if (next.status === "unlocked") next.wallet.lock();
    return;
  }
  if (
    previous.status === "unlocked" &&
    (next.status !== "unlocked" || next.wallet !== previous.wallet)
  ) {
    previous.wallet.lock();
  }
  account.value = next;
}

async function resolveNetwork(): Promise<void> {
  try {
    const context = await resolveEvmContext({
      rpcUrl: RPC_URL,
      expectedChainId: DEMO_CHAIN_ID,
    });
    if (stopped) return;
    evm.value = context;
    evmError.value = null;
  } catch (error) {
    if (stopped) return;
    evmError.value = describeError(error);
    retryTimer = setTimeout(() => void resolveNetwork(), 5_000);
  }
}

function lockOnPageHide(): void {
  if (account.value.status !== "unlocked") return;
  adoptAccount({
    status: "locked",
    mode: account.value.wallet.mode,
    address: account.value.wallet.account.address,
  });
}

onMounted(() => {
  const cached = loadCachedAccount();
  if (cached) account.value = { status: "locked", ...cached };
  window.addEventListener("pagehide", lockOnPageHide);
  void resolveNetwork();
});
onUnmounted(() => {
  stopped = true;
  clearTimeout(retryTimer);
  window.removeEventListener("pagehide", lockOnPageHide);
  if (account.value.status === "unlocked") account.value.wallet.lock();
});
</script>

<template>
  <main class="app">
    <header class="app-head">
      <h1>mera demo <span class="framework-badge">Vue 3</span></h1>
      <AccountChip :address="address" :connected="evm !== null" />
    </header>
    <TradingCard :evm="evm" :evm-error="evmError" :account="account" @account-change="adoptAccount" />
    <p class="source-credit">
      Vue adaptation of <a href="https://github.com/category-labs/mera/tree/main/demos/web" target="_blank" rel="noreferrer">Category Labs’ demo</a>.
      Use demo accounts only. Passkeys are bound to this site's domain.
    </p>
  </main>
</template>

<style scoped>
.framework-badge { display: inline-block; vertical-align: middle; padding: 3px 7px; border: 1px solid var(--border); border-radius: 5px; color: var(--muted); font-size: 11px; font-weight: 500; letter-spacing: 0; }
.source-credit { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; text-align: center; }
</style>
