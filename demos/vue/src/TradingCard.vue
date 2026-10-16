<script setup lang="ts">
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  revealMnemonic,
} from "@category-labs/mera-demo-shared/connect";
import { costBasisStorage } from "@category-labs/mera-demo-shared/costBasisStorage";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  type Fill,
  LOW_CASH_WEI,
  type Order,
  placeOrder,
  priceAt,
  readPortfolio,
  type TradeDraft,
} from "@category-labs/mera-demo-shared/market";
import {
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { CASH_SYMBOL } from "@category-labs/mera-demo-shared/ui";
import { computed, ref, shallowRef } from "vue";
import AccountHoldings from "./AccountHoldings.vue";
import ConnectPanel from "./ConnectPanel.vue";
import { useNow, usePosition } from "./composables";
import RecoveryPhrase from "./RecoveryPhrase.vue";
import StockOverview from "./StockOverview.vue";
import TradeForm from "./TradeForm.vue";

/**
 * The trading surface. The stock renders for everyone; the area below it
 * depends on the account. Trades sign without a prompt; a passkey prompt
 * appears only at connect, at the first trade after a reload, and when
 * exporting the recovery phrase.
 */
const { evm, evmError } = defineProps<{
  evm: EvmContext | null;
  evmError: string | null;
}>();
const account = defineModel<AccountState>("account", { required: true });

const now = useNow();
// The mirror equals the on-chain price by construction.
const price = computed(() => priceAt(BigInt(now.value)));
const { position, loaded, stage, funding, fund, adopt, trade } = usePosition(
  () => evm,
  () => accountAddress(account.value),
  costBasisStorage,
);
const connectMode = ref<AccountMode>("passkey");
const connecting = ref(false);
const draft = shallowRef<TradeDraft>({ kind: "amount", side: "buy", text: "" });
const fill = shallowRef<Fill | null>(null);
const tradeError = ref<string | null>(null);
// Revealed by a fresh passkey ceremony and never persisted. While shown, it
// takes over the card slot.
const phrase = ref<string | null>(null);
const revealing = ref(false);
const backupError = ref<string | null>(null);

function clearDraft(): void {
  draft.value = { kind: "amount", side: draft.value.side, text: "" };
}

// Switches to `next` and drops everything scoped to the previous account.
function switchAccount(next: AccountState): void {
  account.value = next;
  clearDraft();
  fill.value = null;
  tradeError.value = null;
  backupError.value = null;
}

// The fill and the error describe the draft they came from.
function editDraft(next: TradeDraft): void {
  draft.value = next;
  fill.value = null;
  tradeError.value = null;
}

async function openAccount(wallet: ConnectedWallet): Promise<void> {
  // Fund and read the account first, so the connect panel gives way to
  // settled balances.
  if (evm !== null) {
    try {
      await fundAccount(evm, wallet.address);
      adopt(wallet.address, await readPortfolio(evm, wallet.address));
    } catch {
      // Show the account anyway; the balance reads report the failure.
    }
  }
  switchAccount({ status: "unlocked", wallet });
}

async function submit(order: Order): Promise<void> {
  const current = account.value;
  const held = loaded.value;
  if (current.status === "none" || evm === null || held === null) return;
  // The quote ticks while the trade waits; size it at the one the click saw.
  const quote = price.value;
  tradeError.value = null;
  fill.value = null;
  try {
    const filled = await trade(async () => {
      let wallet: ConnectedWallet;
      if (current.status === "unlocked") {
        wallet = current.wallet;
      } else {
        // The ceremony must be the first await, so the click's user
        // activation still covers the WebAuthn prompt (Safari enforces it).
        wallet = await connect(current.mode, "signin");
        if (wallet.address !== current.address) {
          // The amount was checked against the old portfolio.
          switchAccount({ status: "unlocked", wallet });
          throw new Error(
            "That passkey opens a different account; its balances are shown now.",
          );
        }
        account.value = { status: "unlocked", wallet };
      }
      return placeOrder({
        session: wallet.session,
        evm,
        order,
        price: quote,
        heldShares: held.shares,
      });
    });
    fill.value = filled;
    clearDraft();
  } catch (caught) {
    tradeError.value = describeError(caught);
  }
}

async function addFunds(): Promise<void> {
  tradeError.value = null;
  try {
    await fund();
  } catch (caught) {
    tradeError.value = describeError(caught);
  }
}

async function revealBackup(): Promise<void> {
  const current = account.value;
  if (current.status === "none") return;
  revealing.value = true;
  backupError.value = null;
  try {
    phrase.value = await revealMnemonic(
      current.status === "unlocked" ? current.wallet : current,
    );
  } catch (caught) {
    backupError.value = describeError(caught);
  } finally {
    revealing.value = false;
  }
}

function signOut(): void {
  if (account.value.status === "unlocked") account.value.wallet.session.end();
  clearCachedAccount();
  switchAccount({ status: "none" });
}
</script>

<template>
  <div v-if="phrase !== null" class="account-shell">
    <RecoveryPhrase :phrase="phrase" @hide="phrase = null" />
  </div>

  <div v-else class="account-shell">
    <section class="card">
      <StockOverview :now="now" />

      <p v-if="evmError" class="status error">
        The market is unavailable: {{ evmError }}
      </p>

      <ConnectPanel
        v-if="account.status === 'none'"
        :key="connectMode"
        :mode="connectMode"
        :on-connected="openAccount"
        :on-busy-change="(busy: boolean) => (connecting = busy)"
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
