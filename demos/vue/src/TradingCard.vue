<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { parseDecimalAmount } from "@category-labs/mera-demo-shared/amount";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
  revealMnemonic,
} from "@category-labs/mera-demo-shared/connect";
import {
  costBasisAfterBuy,
  costBasisAfterSell,
} from "@category-labs/mera-demo-shared/costBasis";
import {
  loadCostBasis,
  saveCostBasis,
} from "@category-labs/mera-demo-shared/costBasisStorage";
import {
  buyShares,
  COMPANY_NAME,
  coversTrade,
  type Fill,
  LOW_CASH_WEI,
  maxTradeInput,
  type Portfolio,
  priceAt,
  REFRESH_MS,
  readPortfolio,
  type Side,
  sellShares,
  sharesToSell,
  TICKER,
  UNIT,
} from "@category-labs/mera-demo-shared/market";
import {
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { currentPasskeyWallet } from "@category-labs/mera-demo-shared/passkeyWallet";
import {
  CASH_SYMBOL,
  formatCash,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import ConnectPanel from "./ConnectPanel.vue";
import { RPC_URL } from "./config";
import NewsTicker from "./NewsTicker.vue";
import PriceChart from "./PriceChart.vue";
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

const SIDES: readonly Side[] = ["buy", "sell"];

const connectMode = ref<AccountMode>("passkey");
const connecting = ref(false);

const portfolio = shallowRef<Portfolio | null>(null);
const readError = ref<string | null>(null);
const now = ref(Math.floor(Date.now() / 1000));

const side = ref<Side>("buy");
const amount = ref("");
const sellAll = ref(false);
const busy = ref(false);
const fill = shallowRef<(Fill & { spent?: bigint }) | null>(null);
const tradeError = ref<string | null>(null);
const funding = ref(false);

// Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
// only here while shown and replaces the card (Hide drops it); the demo
// never persists it.
const phrase = ref<string | null>(null);
const revealing = ref(false);
const backupError = ref<string | null>(null);

const address = computed(() => accountAddress(account.value));

// Polling, foregrounding, funding, and trades all refresh, so reads
// overlap. Only the newest may commit: a slow pre-funding snapshot would
// otherwise overwrite fresh balances, and its zero shares would trip the
// basis reset below and erase the saved basis.
let readGeneration = 0;

// Switches to `next` and drops everything scoped to the previous account.
function adoptAccount(
  next: AccountState,
  nextPortfolio: Portfolio | null = null,
): void {
  readGeneration += 1;
  account.value = next;
  // The connect panel unmounts on adoption, and Vue drops the busyChange
  // it emits after that, so the flag is cleared here.
  connecting.value = false;
  portfolio.value = nextPortfolio;
  amount.value = "";
  sellAll.value = false;
  fill.value = null;
  tradeError.value = null;
  readError.value = null;
  backupError.value = null;
}

// Cash invested in the open position; localStorage so P&L survives reloads.
const basis = ref(0n);
watch(
  address,
  (current) => {
    basis.value = current === null ? 0n : loadCostBasis(current);
  },
  { immediate: true },
);
function applyBasis(next: bigint): void {
  if (address.value === null) return;
  basis.value = next;
  saveCostBasis(address.value, next);
}

// A network restart wipes the chain, and with it the position; a basis
// left behind would report a loss on shares that no longer exist. Skip the
// reset while a trade is in flight: right after a buy mines, the basis is
// already updated while `portfolio` still shows the pre-trade zero shares.
watchEffect(() => {
  if (!busy.value && portfolio.value?.shares === 0n && basis.value !== 0n) {
    applyBasis(0n);
  }
});

async function refresh(): Promise<void> {
  now.value = Math.floor(Date.now() / 1000);
  const evm = props.evm;
  const current = address.value;
  if (evm === null || current === null) return;
  const generation = ++readGeneration;
  try {
    const read = await readPortfolio(evm, current);
    if (generation !== readGeneration) return;
    portfolio.value = read;
    readError.value = null;
  } catch (caught) {
    if (generation !== readGeneration) return;
    readError.value = describeError(caught);
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
const positionValue = computed(() =>
  portfolio.value === null
    ? null
    : (portfolio.value.shares * price.value) / UNIT,
);
const delta = computed(
  () => price.value - priceAt(BigInt(now.value - CHART_WINDOW_SECONDS)),
);

// House credits change cash, never the basis, so refills cannot fake gains.
const pnl = computed(() =>
  positionValue.value !== null &&
  portfolio.value !== null &&
  portfolio.value.shares > 0n
    ? positionValue.value - basis.value
    : null,
);
const pnlText = computed(() => {
  if (pnl.value === null) return null;
  const text = `${pnl.value < 0n ? "" : "+"}${formatCash(pnl.value)}`;
  if (basis.value <= 0n) return text;
  const percent = Number((pnl.value * 10_000n) / basis.value) / 100;
  return `${text} · ${percent < 0 ? "" : "+"}${percent.toFixed(2)}%`;
});

const amountWei = computed(() => parseDecimalAmount(amount.value, 18));
const canTrade = computed(
  () =>
    !busy.value &&
    portfolio.value !== null &&
    amountWei.value !== null &&
    coversTrade({
      side: side.value,
      amountWei: amountWei.value,
      price: price.value,
      portfolio: portfolio.value,
    }),
);

const estimatedShares = computed(() =>
  amountWei.value === null ? null : (amountWei.value * UNIT) / price.value,
);

const holdingsValue = computed(() =>
  portfolio.value === null || positionValue.value === null
    ? "…"
    : `${formatShares(portfolio.value.shares)} · ${formatCash(positionValue.value)}`,
);

const submitLabel = computed(() => {
  if (!busy.value) return side.value === "buy" ? "Buy" : "Sell";
  if (account.value.status === "locked") return "Waiting for passkey…";
  return side.value === "buy" ? "Buying…" : "Selling…";
});

const fillText = computed(() => {
  const current = fill.value;
  if (current === null) return null;
  if (current.side === "sell") {
    return `Sold ${formatShares(current.shares)} ${TICKER}`;
  }
  const spent =
    current.spent === undefined
      ? ""
      : ` for ${formatCash(current.spent)} ${CASH_SYMBOL}`;
  return `Bought ${formatShares(current.shares)} ${TICKER}${spent}`;
});

function chooseSide(next: Side): void {
  side.value = next;
  sellAll.value = false;
  tradeError.value = null;
}

// Typing retires the sell-all intent and the last fill shown under the
// estimate. Max sets the amount from code, which fires no input event, so its
// sell-all intent survives.
function onAmountInput(): void {
  sellAll.value = false;
  fill.value = null;
}

function fillMax(): void {
  if (portfolio.value === null) return;
  tradeError.value = null;
  amount.value = maxTradeInput({
    side: side.value,
    price: price.value,
    portfolio: portfolio.value,
  });
  // Max on the sell side means the whole position: converting its stale
  // cash figure back to shares at a moved price can strand dust.
  sellAll.value = side.value === "sell";
}

async function submit(): Promise<void> {
  const current = account.value;
  const evm = props.evm;
  const held = portfolio.value;
  const wei = amountWei.value;
  if (
    !canTrade.value ||
    current.status === "none" ||
    evm === null ||
    held === null ||
    wei === null
  )
    return;
  // Read the trade's inputs once: the quote ticks every second, and the side
  // tabs stay live while the trade waits on the passkey and the chain.
  const tradeSide = side.value;
  const quote = price.value;
  const startingBasis = basis.value;
  const liquidate = sellAll.value;
  busy.value = true;
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
    const session = wallet.account.session;
    if (tradeSide === "buy") {
      const result = await buyShares(session, evm, wei);
      fill.value = { ...result, spent: wei };
      applyBasis(costBasisAfterBuy(startingBasis, wei));
    } else {
      const shares = sharesToSell({
        amountWei: wei,
        price: quote,
        heldShares: held.shares,
        sellAll: liquidate,
      });
      const result = await sellShares(session, evm, shares);
      fill.value = result;
      applyBasis(costBasisAfterSell(startingBasis, result.shares, held.shares));
    }
    amount.value = "";
    sellAll.value = false;
    await refresh();
  } catch (caught) {
    tradeError.value = describeError(caught);
  } finally {
    busy.value = false;
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
            {{ delta < 0n ? "" : "+" }}{{ formatCash(delta) }} · 30m
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
        @busy-change="connecting = $event"
      />
      <template v-else>
        <div class="holdings">
          <div class="holding-row">
            <span class="holding-label">{{ CASH_SYMBOL }}</span>
            <span class="holding-value">
              {{ portfolio === null ? "…" : formatCash(portfolio.cash) }}
            </span>
          </div>
          <div class="holding-row">
            <span class="holding-label">{{ TICKER }}</span>
            <span class="holding-value">{{ holdingsValue }}</span>
          </div>
          <div v-if="pnl !== null" class="holding-row">
            <span class="holding-label">P&amp;L</span>
            <span class="holding-value" :class="pnl < 0n ? 'down' : 'up'">
              {{ pnlText }}
            </span>
          </div>
        </div>

        <div class="segmented" role="tablist" aria-label="Trade side">
          <button
            v-for="entry in SIDES"
            :key="entry"
            type="button"
            role="tab"
            class="segment"
            :class="{ active: entry === side }"
            :aria-selected="entry === side"
            @click="chooseSide(entry)"
          >
            {{ entry === "buy" ? "Buy" : "Sell" }}
          </button>
        </div>

        <form class="trade" @submit.prevent="submit">
          <div class="send-row">
            <div class="field grow">
              <span class="field-head">
                <label for="trade-amount">Amount ({{ CASH_SYMBOL }})</label>
                <button
                  type="button"
                  class="link small"
                  :disabled="busy || portfolio === null"
                  @click="fillMax"
                >
                  Max
                </button>
              </span>
              <input
                id="trade-amount"
                v-model="amount"
                placeholder="100.00"
                inputmode="decimal"
                spellcheck="false"
                :disabled="busy"
                @input="onAmountInput"
              />
            </div>
            <button
              type="submit"
              class="btn primary send-btn"
              :disabled="!canTrade"
            >
              {{ submitLabel }}
            </button>
          </div>

          <p v-if="estimatedShares !== null && fill === null" class="hint">
            ≈ {{ formatShares(estimatedShares) }} {{ TICKER }} at the current
            price
          </p>

          <p v-if="fillText !== null" class="status ok">{{ fillText }}</p>

          <p v-if="tradeError" class="status error">{{ tradeError }}</p>
          <p v-if="readError" class="status error">{{ readError }}</p>
        </form>
      </template>
    </section>

    <template v-if="account.status !== 'none'">
      <div class="account-links">
        <button
          v-if="portfolio !== null && portfolio.cash < LOW_CASH_WEI"
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
          :disabled="busy || revealing"
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
