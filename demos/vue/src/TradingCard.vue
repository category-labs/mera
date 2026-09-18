<script setup lang="ts">
import { parseDecimalAmount } from "@category-labs/mera-demo-shared/amount";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  costBasisAfterBuy,
  costBasisAfterSell,
} from "@category-labs/mera-demo-shared/costBasis";
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
import {
  CASH_SYMBOL,
  formatCash,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "./account";
import ConnectPanel from "./ConnectPanel.vue";
import { RPC_URL } from "./config";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
  revealMnemonic,
} from "./connect";
import { loadCostBasis, saveCostBasis } from "./costBasis";
import { currentPasskeyWallet } from "./passkeyWallet";
import NewsTicker from "./shared/NewsTicker.vue";
import PriceChart from "./shared/PriceChart.vue";
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
  account: AccountState;
}>();

const emit = defineEmits<{
  accountChange: [next: AccountState];
}>();

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

const address = computed(() => accountAddress(props.account));

// Polling, foregrounding, funding, and trades all refresh, so reads
// overlap. Only the newest may commit: a slow pre-funding snapshot would
// otherwise overwrite fresh balances, and its zero shares would trip the
// basis reset below and erase the saved basis.
let readGeneration = 0;

// Which account the card is serving. Every async flow (connect, trade,
// funding, reveal) captures the tenure it started under and commits only
// while that tenure is still current, so a result that lands after an
// account switch, a sign-out, or the card's disposal cannot adopt stale
// state, and a wallet it created is locked instead of leaking a live
// signing session.
let tenure = 0;
let disposed = false;
function live(started: number): boolean {
  return !disposed && started === tenure;
}

// Switches to `next` and drops everything scoped to the previous account.
function adoptAccount(
  next: AccountState,
  nextPortfolio: Portfolio | null = null,
): void {
  readGeneration += 1;
  tenure += 1;
  emit("accountChange", next);
  connecting.value = false;
  busy.value = false;
  funding.value = false;
  revealing.value = false;
  phrase.value = null;
  portfolio.value = nextPortfolio;
  amount.value = "";
  sellAll.value = false;
  fill.value = null;
  tradeError.value = null;
  readError.value = null;
  backupError.value = null;
}

// Locking also retires pending exports, including a pagehide-triggered lock.
watch(
  () => props.account.status,
  (status, previous) => {
    if (status !== "locked" || previous !== "unlocked") return;
    tenure += 1;
    phrase.value = null;
    revealing.value = false;
    busy.value = false;
    funding.value = false;
  },
  { flush: "sync" },
);

// Cash invested in the open position; localStorage so P&L survives reloads.
// Loaded synchronously with the address so no watcher ever sees the new
// account paired with the previous account's basis.
const basis = ref(0n);
watch(
  address,
  (current) => {
    basis.value = current === null ? 0n : loadCostBasis(current);
  },
  { immediate: true, flush: "sync" },
);

// Saves the basis for the account the trade ran under; the displayed basis
// follows only while that account is still the card's.
function applyBasis(
  forAddress: `0x${string}`,
  next: bigint,
  started: number,
): void {
  saveCostBasis(forAddress, next);
  if (live(started)) basis.value = next;
}

// A network restart wipes the chain, and with it the position; a basis
// left behind would report a loss on shares that no longer exist. Skip the
// reset while a trade is in flight: right after a buy mines, the basis is
// already updated while `portfolio` still shows the pre-trade zero shares.
watchEffect(() => {
  const current = address.value;
  if (
    !busy.value &&
    current !== null &&
    portfolio.value?.shares === 0n &&
    basis.value !== 0n
  ) {
    basis.value = 0n;
    saveCostBasis(current, 0n);
  }
});

async function refresh(): Promise<void> {
  now.value = Math.floor(Date.now() / 1000);
  const evm = props.evm;
  const current = address.value;
  if (disposed || evm === null || current === null) return;
  const generation = ++readGeneration;
  try {
    const read = await readPortfolio(evm, current);
    if (disposed || generation !== readGeneration) return;
    portfolio.value = read;
    readError.value = null;
  } catch (caught) {
    if (disposed || generation !== readGeneration) return;
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
    const started = tenure;
    funding.value = true;
    fundAccount(RPC_URL, current)
      .catch(() => {
        // A failed top-up surfaces through the balance read; the button
        // below offers a retry once the network is back.
      })
      .finally(() => {
        if (live(started)) funding.value = false;
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
  const started = tenure;
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
  if (!live(started)) {
    // The card moved on (disposed, or another account took over) while the
    // network was slow; nobody will hold this session, so end it.
    wallet.lock();
    return;
  }
  adoptAccount({ status: "unlocked", wallet }, read);
}

let clockTick: number | undefined;
let pollInterval: number | undefined;
function onVisible(): void {
  // Refresh when the tab regains focus, so state that changed while the
  // tab was hidden appears without waiting for the next tick.
  if (document.visibilityState === "visible") void refresh();
}

onMounted(() => {
  clockTick = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1_000);
  pollInterval = window.setInterval(() => void refresh(), REFRESH_MS);
  document.addEventListener("visibilitychange", onVisible);
});

// The immediate call covers the moments the poll would miss by up to a
// tick: the network context resolving after mount, and account changes.
watch([() => props.evm, address], () => void refresh(), { immediate: true });

onBeforeUnmount(() => {
  disposed = true;
  readGeneration += 1;
  window.clearInterval(clockTick);
  window.clearInterval(pollInterval);
  document.removeEventListener("visibilitychange", onVisible);
});

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
const deltaDown = computed(() => delta.value < 0n);

// House credits change cash, never the basis, so refills cannot fake gains.
const pnl = computed(() =>
  positionValue.value !== null &&
  portfolio.value !== null &&
  portfolio.value.shares > 0n
    ? positionValue.value - basis.value
    : null,
);
const pnlDown = computed(() => pnl.value !== null && pnl.value < 0n);
const pnlPercent = computed(() =>
  pnl.value !== null && basis.value > 0n
    ? Number((pnl.value * 10_000n) / basis.value) / 100
    : null,
);

const amountWei = computed(() => parseDecimalAmount(amount.value, 18));
const covered = computed(
  () =>
    portfolio.value !== null &&
    amountWei.value !== null &&
    coversTrade({
      side: side.value,
      amountWei: amountWei.value,
      price: price.value,
      portfolio: portfolio.value,
    }),
);
const canTrade = computed(
  () => props.evm !== null && covered.value && !busy.value && !revealing.value,
);

const estimatedShares = computed(() =>
  amountWei.value !== null ? (amountWei.value * UNIT) / price.value : null,
);

const holdingsValue = computed(() =>
  portfolio.value === null || positionValue.value === null
    ? "…"
    : `${formatShares(portfolio.value.shares)} · ${formatCash(positionValue.value)}`,
);

const submitLabel = computed(() =>
  busy.value
    ? props.account.status === "locked"
      ? "Waiting for passkey…"
      : side.value === "buy"
        ? "Buying…"
        : "Selling…"
    : side.value === "buy"
      ? "Buy"
      : "Sell",
);

const fillText = computed(() => {
  const current = fill.value;
  if (current === null) return null;
  if (current.side === "buy") {
    return `Bought ${formatShares(current.shares)} ${TICKER}${
      current.spent === undefined
        ? ""
        : ` for ${formatCash(current.spent)} ${CASH_SYMBOL}`
    }`;
  }
  return `Sold ${formatShares(current.shares)} ${TICKER}`;
});

const SIDES: readonly Side[] = ["buy", "sell"];

function chooseSide(entry: Side): void {
  side.value = entry;
  sellAll.value = false;
  tradeError.value = null;
}

function onAmountInput(event: Event): void {
  amount.value = (event.target as HTMLInputElement).value;
  sellAll.value = false;
  // A new amount retires the last fill for the estimate.
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
  const account = props.account;
  const evm = props.evm;
  const wei = amountWei.value;
  const held = portfolio.value;
  if (
    !canTrade.value ||
    wei === null ||
    held === null ||
    evm === null ||
    account.status === "none"
  )
    return;
  const started = tenure;
  const tradeSide = side.value;
  const quote = price.value;
  const startingBasis = basis.value;
  const liquidate = sellAll.value;
  const tradeAddress =
    account.status === "locked"
      ? account.address
      : account.wallet.account.address;
  busy.value = true;
  tradeError.value = null;
  fill.value = null;
  try {
    let wallet: ConnectedWallet;
    if (account.status === "locked") {
      // The ceremony must be the first await so the click's user activation
      // still covers the WebAuthn prompt (Safari enforces this); the
      // signing afterwards is silent.
      wallet = await connect(account.mode, "signin");
      if (!live(started)) {
        // Signed out or disposed while the prompt was up: the session that
        // just opened has no owner, so end it rather than adopt it.
        wallet.lock();
        return;
      }
      if (wallet.account.address !== account.address) {
        // A different passkey was chosen; the amount was validated against
        // the old portfolio, so adopt the new account instead of trading.
        adoptAccount({ status: "unlocked", wallet });
        tradeError.value =
          "That passkey opens a different account; its balances are shown now.";
        return;
      }
      emit("accountChange", { status: "unlocked", wallet });
    } else {
      wallet = account.wallet;
    }
    const session = wallet.account.session;
    if (tradeSide === "buy") {
      const result = await buyShares(session, evm, wei);
      const nextBasis = costBasisAfterBuy(startingBasis, wei);
      if (live(started)) fill.value = { ...result, spent: wei };
      applyBasis(tradeAddress, nextBasis, started);
    } else {
      const shares = sharesToSell({
        amountWei: wei,
        price: quote,
        heldShares: held.shares,
        sellAll: liquidate,
      });
      const result = await sellShares(session, evm, shares);
      const nextBasis = costBasisAfterSell(
        startingBasis,
        result.shares,
        held.shares,
      );
      if (live(started)) fill.value = result;
      applyBasis(tradeAddress, nextBasis, started);
    }
    if (!live(started)) return;
    amount.value = "";
    sellAll.value = false;
    await refresh();
  } catch (caught) {
    if (live(started)) tradeError.value = describeError(caught);
  } finally {
    // The account that was busy is gone with its tenure; a new one starts
    // idle, so only the same tenure may clear the flag.
    if (live(started)) busy.value = false;
  }
}

async function addFunds(): Promise<void> {
  const current = address.value;
  if (current === null) return;
  const started = tenure;
  funding.value = true;
  tradeError.value = null;
  try {
    await fundAccount(RPC_URL, current);
    await refresh();
  } catch (caught) {
    if (live(started)) tradeError.value = describeError(caught);
  } finally {
    if (live(started)) funding.value = false;
  }
}

async function revealBackup(): Promise<void> {
  const account = props.account;
  if (account.status === "none") return;
  const started = tenure;
  revealing.value = true;
  backupError.value = null;
  try {
    // In the locked state the reveal runs against the device's remembered
    // credential; picking a different discoverable passkey would show that
    // passkey's phrase, not the cached account's.
    const target =
      account.status === "unlocked"
        ? account.wallet
        : {
            mode: account.mode,
            credential: currentPasskeyWallet(),
          };
    const revealed = await revealMnemonic(target);
    // A phrase that arrives after the account changed hands belongs to the
    // previous owner; never show it over another account.
    if (live(started)) phrase.value = revealed;
  } catch (caught) {
    if (live(started)) backupError.value = describeError(caught);
  } finally {
    if (live(started)) revealing.value = false;
  }
}

// Ends the signing session but keeps the account's public identity: the
// portfolio stays on screen and the next trade re-runs the passkey ceremony,
// exactly like a reloaded page. Disabled while a trade is signing, since
// locking mid-trade would fail the signature it is waiting on.
function lockAccount(): void {
  const account = props.account;
  if (account.status !== "unlocked" || busy.value) return;
  const { mode, account: locked } = account.wallet;
  account.wallet.lock();
  tradeError.value = null;
  emit("accountChange", { status: "locked", mode, address: locked.address });
}

function signOut(): void {
  if (busy.value) return;
  if (props.account.status === "unlocked") props.account.wallet.lock();
  clearCachedAccount();
  adoptAccount({ status: "none" });
}

function switchConnectMode(): void {
  connectMode.value = connectMode.value === "passkey" ? "vault" : "passkey";
}
</script>

<template>
  <!-- The phrase takes over the card slot, keeping the embedded demo compact. -->
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
          <span :class="deltaDown ? 'stock-delta down' : 'stock-delta up'">
            {{ deltaDown ? "" : "+" }}{{ formatCash(delta) }} · 30m
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
            <span :class="pnlDown ? 'holding-value down' : 'holding-value up'">
              {{ pnlDown ? "" : "+" }}{{ formatCash(pnl)
              }}<template v-if="pnlPercent !== null">
                · {{ pnlPercent < 0 ? "" : "+" }}{{ pnlPercent.toFixed(2) }}%
              </template>
            </span>
          </div>
        </div>

        <div class="segmented" role="tablist" aria-label="Trade side">
          <button
            v-for="entry in SIDES"
            :key="entry"
            type="button"
            role="tab"
            :aria-selected="entry === side"
            :class="entry === side ? 'segment active' : 'segment'"
            :disabled="busy || revealing"
            @click="chooseSide(entry)"
          >
            {{ entry === "buy" ? "Buy" : "Sell" }}
          </button>
        </div>

        <form class="trade" @submit.prevent="canTrade && submit()">
          <div class="send-row">
            <label class="field grow">
              <span class="field-head">
                Amount ({{ CASH_SYMBOL }})
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
                :value="amount"
                placeholder="100.00"
                inputmode="decimal"
                :spellcheck="false"
                :disabled="busy"
                @input="onAmountInput"
              />
            </label>
            <button
              type="submit"
              class="btn primary send-btn"
              :disabled="!canTrade"
            >
              {{ submitLabel }}
            </button>
          </div>

          <p v-if="estimatedShares !== null && !fill" class="hint">
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
          @click="addFunds()"
        >
          {{ funding ? "Adding funds…" : `Add 10,000 ${CASH_SYMBOL}` }}
        </button>
        <button
          type="button"
          class="link"
          :disabled="revealing || busy"
          @click="revealBackup()"
        >
          {{ revealing ? "Waiting for passkey…" : "Export account" }}
        </button>
        <button
          v-if="account.status === 'unlocked'"
          type="button"
          class="link"
          :disabled="busy || revealing"
          @click="lockAccount"
        >
          Lock account
        </button>
        <button type="button" class="link" :disabled="busy" @click="signOut">
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
        @click="switchConnectMode"
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
