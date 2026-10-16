<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
  revealMnemonic,
} from "@category-labs/mera-demo-shared/connect";
import {
  loadCostBasis,
  saveCostBasis,
} from "@category-labs/mera-demo-shared/costBasisStorage";
import {
  COMPANY_NAME,
  type Fill,
  LOW_CASH_WEI,
  type Order,
  type Portfolio,
  placeOrder,
  priceAt,
  REFRESH_MS,
  readPortfolio,
  TICKER,
  type TradeDraft,
} from "@category-labs/mera-demo-shared/market";
import {
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { currentPasskeyWallet } from "@category-labs/mera-demo-shared/passkeyWallet";
import {
  initialPositionState,
  loadedPosition,
  positionReducer,
} from "@category-labs/mera-demo-shared/position";
import {
  CASH_SYMBOL,
  formatCash,
  formatSignedCash,
} from "@category-labs/mera-demo-shared/ui";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import AccountHoldings from "./AccountHoldings.vue";
import ConnectPanel from "./ConnectPanel.vue";
import { RPC_URL } from "./config";
import NewsTicker from "./NewsTicker.vue";
import PriceChart from "./PriceChart.vue";
import TradeForm from "./TradeForm.vue";
import WalletBackup from "./WalletBackup.vue";

/**
 * The always-on trading surface: the stock's price, chart, and fake newsroom
 * render for everyone (history comes from the price mirror, so they need no
 * network); the area below them depends on the account state. Unlocked
 * trades sign silently; a passkey prompt appears only at connect, at the
 * first trade after a reload, and when exporting the recovery phrase.
 */
const props = defineProps<{
  evm: EvmContext | null;
  evmError: string | null;
}>();
const account = defineModel<AccountState>("account", { required: true });

const connectMode = ref<AccountMode>("passkey");
const connecting = ref(false);

// The switch to `next`, with the cost basis this device stored for it.
function accountChanged(
  next: AccountState,
  portfolio: Portfolio | null,
): positionReducer.Event {
  const nextAddress = accountAddress(next);
  return {
    type: "accountChanged",
    address: nextAddress,
    basis: nextAddress === null ? null : loadCostBasis(nextAddress),
    portfolio,
  };
}

const address = computed(() => accountAddress(account.value));
// Later address changes all go through `adoptAccount`, which resets the
// position in the same step.
const position = shallowRef(
  positionReducer(initialPositionState, accountChanged(account.value, null)),
);
const loaded = computed(() => loadedPosition(position.value));
const stage = computed(() => position.value.trade?.stage ?? null);
let operationId = 0;

const now = ref(Math.floor(Date.now() / 1000));

const draft = shallowRef<TradeDraft>({ kind: "amount", side: "buy", text: "" });
const fill = shallowRef<Fill | null>(null);
const tradeError = ref<string | null>(null);
const funding = ref(false);

// Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
// only here while shown and replaces the card (Hide drops it); the demo
// never persists it.
const phrase = ref<string | null>(null);
const revealing = ref(false);
const backupError = ref<string | null>(null);

function dispatch(event: positionReducer.Event): void {
  position.value = positionReducer(position.value, event);
}

// Switches to `next` and drops everything scoped to the previous account.
function adoptAccount(
  next: AccountState,
  nextPortfolio: Portfolio | null = null,
): void {
  dispatch(accountChanged(next, nextPortfolio));
  account.value = next;
  draft.value = { kind: "amount", side: draft.value.side, text: "" };
  fill.value = null;
  tradeError.value = null;
  backupError.value = null;
}

function setConnecting(busy: boolean): void {
  connecting.value = busy;
}

// The last fill and trade error describe the draft they came from.
function editDraft(next: TradeDraft): void {
  draft.value = next;
  fill.value = null;
  tradeError.value = null;
}

watch(
  [() => position.value.address, () => position.value.basis],
  ([current, value]) => {
    if (current !== null && value !== null) saveCostBasis(current, value);
  },
);

async function refresh(): Promise<void> {
  now.value = Math.floor(Date.now() / 1000);
  const evm = props.evm;
  const current = address.value;
  if (evm === null || current === null) return;
  const requestId = ++operationId;
  dispatch({ type: "readStarted", address: current, requestId });
  try {
    const read = await readPortfolio(evm, current);
    dispatch({ type: "portfolioLoaded", requestId, portfolio: read });
  } catch (caught) {
    dispatch({
      type: "refreshFailed",
      requestId,
      error: describeError(caught),
    });
  }
}

// Funding needs only an address and the guard no-ops above its threshold,
// so cached accounts refill after a network reset too.
let funded: string | null = null;
watch(
  address,
  (current) => {
    if (current === null || funded === current) return;
    funded = current;
    funding.value = true;
    fundAccount(RPC_URL, current)
      .catch(() => {
        // A failed top-up surfaces through the balance read; the button
        // below offers a retry once the network is back.
      })
      .finally(() => {
        funding.value = false;
        void refresh();
      });
  },
  { immediate: true },
);

// Funds and reads a freshly connected account before adopting it, so the
// connect panel gives way to settled balances instead of placeholders that
// fill in one network round trip at a time. On failure the account is
// adopted without a portfolio and the poll's read error reports the cause.
async function openAccount(wallet: ConnectedWallet): Promise<void> {
  let read: Portfolio | null = null;
  const nextAddress = wallet.account.address;
  const evm = props.evm;
  if (evm !== null) {
    funded = nextAddress; // the auto-fund watcher must not repeat this
    try {
      await fundAccount(RPC_URL, nextAddress);
      read = await readPortfolio(evm, nextAddress);
    } catch {
      // Adopt anyway; the account exists even when the network misbehaves.
    }
  }
  adoptAccount({ status: "unlocked", wallet }, read);
}

let clockTick: number | undefined;
let pollInterval: number | undefined;

// Refresh when the tab regains focus, so state that changed while the tab
// was hidden appears without waiting for the next tick.
function refreshWhenVisible(): void {
  if (document.visibilityState === "visible") void refresh();
}

onMounted(() => {
  clockTick = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1_000);
  pollInterval = window.setInterval(() => void refresh(), REFRESH_MS);
  document.addEventListener("visibilitychange", refreshWhenVisible);
});

onUnmounted(() => {
  window.clearInterval(clockTick);
  window.clearInterval(pollInterval);
  document.removeEventListener("visibilitychange", refreshWhenVisible);
});

// The immediate call covers the moments the poll would miss by up to a
// tick: the network context resolving after mount, and account changes.
watch([() => props.evm, address], () => void refresh(), { immediate: true });

// The quote is the mirror at the current second: it equals the on-chain
// price by construction and ticks without network reads.
const price = computed(() => priceAt(BigInt(now.value)));
const delta = computed(
  () => price.value - priceAt(BigInt(now.value - CHART_WINDOW_SECONDS)),
);

async function submit(order: Order): Promise<void> {
  const current = account.value;
  const evm = props.evm;
  const held = loaded.value;
  if (current.status === "none" || evm === null || held === null) return;
  // The quote ticks while the trade waits on the passkey and the chain; size
  // the sell at the one the click saw.
  const quote = price.value;
  const tradeId = ++operationId;
  dispatch({ type: "tradeStarted", tradeId });
  tradeError.value = null;
  fill.value = null;
  try {
    let wallet: ConnectedWallet;
    if (current.status === "locked") {
      // The ceremony must be the first await so the click's user activation
      // still covers the WebAuthn prompt (Safari enforces this); the
      // signing afterwards is silent.
      wallet = await connect(current.mode, "signin");
      if (wallet.account.address !== current.address) {
        // A different passkey was chosen; the amount was validated against
        // the old portfolio, so adopt the new account instead of trading.
        adoptAccount({ status: "unlocked", wallet });
        tradeError.value =
          "That passkey opens a different account; its balances are shown now.";
        return;
      }
      account.value = { status: "unlocked", wallet };
    } else {
      wallet = current.wallet;
    }
    const result = await placeOrder({
      session: wallet.account.session,
      evm,
      order,
      price: quote,
      heldShares: held.shares,
    });
    fill.value = result;
    dispatch({ type: "tradeConfirmed", tradeId, fill: result });
    draft.value = { kind: "amount", side: draft.value.side, text: "" };
    await refresh();
  } catch (caught) {
    tradeError.value = describeError(caught);
  } finally {
    dispatch({ type: "tradeFinished", tradeId });
  }
}

async function addFunds(): Promise<void> {
  const current = address.value;
  if (current === null) return;
  funding.value = true;
  tradeError.value = null;
  try {
    await fundAccount(RPC_URL, current);
    await refresh();
  } catch (caught) {
    tradeError.value = describeError(caught);
  } finally {
    funding.value = false;
  }
}

async function revealBackup(): Promise<void> {
  const current = account.value;
  if (current.status === "none") return;
  revealing.value = true;
  backupError.value = null;
  try {
    // In the locked state the reveal runs against the device's remembered
    // credential; picking a different discoverable passkey would show that
    // passkey's phrase, not the cached account's.
    const target =
      current.status === "unlocked"
        ? current.wallet
        : { mode: current.mode, credential: currentPasskeyWallet() };
    phrase.value = await revealMnemonic(target);
  } catch (caught) {
    backupError.value = describeError(caught);
  } finally {
    revealing.value = false;
  }
}

function signOut(): void {
  if (account.value.status === "unlocked") account.value.wallet.lock();
  clearCachedAccount();
  adoptAccount({ status: "none" });
}
</script>

<template>
  <div v-if="phrase !== null" class="account-shell">
    <WalletBackup :phrase="phrase" @hide="phrase = null" />
  </div>

  <div v-else class="account-shell">
    <section class="card">
      <div class="stock-head">
        <div>
          <span class="stock-name">{{ COMPANY_NAME }}</span>
          <span class="stock-symbol">{{ TICKER }}</span>
        </div>
        <div class="stock-quote">
          <span class="stock-price">{{ formatCash(price) }}</span>
          <span class="stock-delta" :class="delta < 0n ? 'down' : 'up'">
            {{ formatSignedCash(delta) }} · 30m
          </span>
        </div>
      </div>

      <PriceChart :live-price="price" :now="now" />
      <NewsTicker :now="now" />

      <p v-if="evmError" class="status error">
        The market is unavailable: {{ evmError }}
      </p>

      <ConnectPanel
        v-if="account.status === 'none'"
        :key="connectMode"
        :mode="connectMode"
        :on-connected="openAccount"
        :on-busy-change="setConnecting"
      />
      <template v-else>
        <div v-if="loaded === null" class="holdings">
          <p class="hint">Loading balances…</p>
        </div>
        <template v-else>
          <AccountHoldings
            :position="loaded"
            :price="price"
            :settling="stage === 'settling'"
          />
          <TradeForm
            :draft="draft"
            :portfolio="loaded"
            :price="price"
            :stage="stage"
            :locked="account.status === 'locked'"
            :fill="fill"
            @update:draft="editDraft"
            @submit="submit"
          />
        </template>
        <p v-if="tradeError" class="status error">{{ tradeError }}</p>
        <p v-if="position.readError" class="status error">
          {{ position.readError }}
        </p>
      </template>
    </section>

    <template v-if="account.status !== 'none'">
      <div class="account-links">
        <button
          v-if="loaded !== null && loaded.cash < LOW_CASH_WEI"
          type="button"
          class="link"
          :disabled="funding"
          @click="addFunds"
        >
          {{ funding ? "Adding funds…" : `Add 10,000 ${CASH_SYMBOL}` }}
        </button>
        <button
          type="button"
          class="link"
          :disabled="revealing"
          @click="revealBackup"
        >
          {{ revealing ? "Waiting for passkey…" : "Export account" }}
        </button>
        <button
          type="button"
          class="link"
          :disabled="stage === 'sending' || revealing"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
      <p v-if="backupError" class="status error">{{ backupError }}</p>
    </template>

    <div class="shell-footer">
      <button
        v-if="account.status === 'none'"
        type="button"
        class="mode-switch"
        :disabled="connecting"
        @click="connectMode = connectMode === 'passkey' ? 'vault' : 'passkey'"
      >
        {{
          connectMode === "passkey"
            ? "Import existing secret →"
            : "← Back to passkey accounts"
        }}
      </button>
      <p class="disclaimer">
        Runs on a demo network. Everything traded is fictional.
      </p>
    </div>
  </div>
</template>
