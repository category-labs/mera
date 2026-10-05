<script setup lang="ts">
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
} from "@category-labs/mera-demo-shared/connect";
import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { computed, ref } from "vue";

type ConnectAction = "create" | "signin";

// The action a click started, and how far it has come: the passkey ceremony,
// then the awaited `onConnected`.
type ConnectBusy = {
  action: ConnectAction;
  phase: "passkey" | "opening";
};

/**
 * The connect area under the market data. Passkey mode offers explicit
 * create and sign-in actions; new passkeys are created under a fixed default
 * name. Vault mode imports or creates a phrase-backed account. The panel
 * stays busy until `onConnected` settles, so the parent can load the account
 * before this panel gives way to it. Mount with `:key="mode"` so switching
 * modes resets the local state.
 */
const props = defineProps<{
  mode: AccountMode;
  onConnected: (wallet: ConnectedWallet) => Promise<void>;
}>();

const secret = ref("");
const busy = ref<ConnectBusy | null>(null);
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
  try {
    const wallet = await connect(props.mode, action, secret.value);
    busy.value = { action, phase: "opening" };
    await props.onConnected(wallet);
  } catch (caught) {
    error.value = describeError(caught);
  } finally {
    busy.value = null;
  }
}

function actionLabel(action: ConnectAction, idle: string): string {
  if (busy.value === null || busy.value.action !== action) return idle;
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
