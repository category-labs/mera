<script setup lang="ts">
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
} from "@category-labs/mera-demo-shared/connect";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { computed, ref } from "vue";

type ConnectAction = "create" | "signin";

/**
 * Create and sign-in actions under the market data. Vault mode adds the
 * recovery phrase the new account is encrypted from. The panel stays busy
 * until `onConnected` settles, so the parent can load the account before the
 * panel gives way. Mount with `:key="mode"` so switching modes resets it.
 */
const { mode, onConnected, onBusyChange } = defineProps<{
  mode: AccountMode;
  onConnected: (wallet: ConnectedWallet) => Promise<void>;
  /**
   * Called with true at the click and false once the attempt settles, even
   * after the panel unmounts, so the parent can block a mode switch whose new
   * panel would race this one.
   */
  onBusyChange: (busy: boolean) => void;
}>();

const secret = ref("");
// The ceremony, then the awaited `onConnected`.
const busy = ref<{
  action: ConnectAction;
  phase: "passkey" | "opening";
} | null>(null);
const error = ref<string | null>(null);

const trimmedSecret = computed(() => secret.value.trim());
const secretValid = computed(() => isValidMnemonic(trimmedSecret.value));

function generate(): void {
  secret.value = createMnemonic();
  error.value = null;
}

async function run(action: ConnectAction): Promise<void> {
  busy.value = { action, phase: "passkey" };
  error.value = null;
  onBusyChange(true);
  try {
    const wallet = await connect(mode, action, secret.value);
    busy.value = { action, phase: "opening" };
    await onConnected(wallet);
  } catch (caught) {
    error.value = describeError(caught);
  } finally {
    busy.value = null;
    onBusyChange(false);
  }
}

function actionLabel(action: ConnectAction, idle: string): string {
  if (busy.value?.action !== action) return idle;
  return busy.value.phase === "passkey"
    ? "Waiting for passkey…"
    : "Opening account…";
}
</script>

<template>
  <div class="connect-cta">
    <template v-if="mode === 'vault'">
      <p class="hint">
        The demo encrypts a recovery phrase in a vault that opens with the
        passkey. Generate a fresh one rather than importing a phrase that holds
        funds.
      </p>
      <div class="field">
        <span class="field-head">
          <label for="recovery-phrase">Recovery phrase</label>
          <button
            type="button"
            class="link small"
            :disabled="busy !== null"
            @click="generate"
          >
            Generate
          </button>
        </span>
        <input
          id="recovery-phrase"
          v-model="secret"
          placeholder="Generate a recovery phrase, or paste one from a wallet app"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="busy !== null"
        />
      </div>
      <p v-if="trimmedSecret.length > 0 && !secretValid" class="status error">
        That is not a valid recovery phrase.
      </p>
    </template>
    <div class="actions">
      <button
        type="button"
        class="btn primary"
        :disabled="busy !== null || (mode === 'vault' && !secretValid)"
        @click="run('create')"
      >
        {{ actionLabel("create", mode === "vault" ? "Open account" : "Create account") }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="busy !== null"
        @click="run('signin')"
      >
        {{ actionLabel("signin", "Sign in") }}
      </button>
    </div>
    <p v-if="error" class="status error">{{ error }}</p>
  </div>
</template>
