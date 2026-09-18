<script setup lang="ts">
import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { computed, onBeforeUnmount, ref } from "vue";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
} from "./connect";

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

const emit = defineEmits<{
  /** True from the click until the action settles, for disabling mode switching. */
  busyChange: [busy: boolean];
}>();

const secret = ref("");
const busy = ref<ConnectBusy | null>(null);
const error = ref<string | null>(null);

const trimmedSecret = computed(() => secret.value.trim());
const secretValid = computed(() => isValidMnemonic(trimmedSecret.value));

// A ceremony in flight when the panel unmounts (mode switch, parent teardown)
// must not hand its wallet to a parent that no longer expects one.
let disposed = false;
onBeforeUnmount(() => {
  disposed = true;
});

function generate() {
  secret.value = createMnemonic();
  error.value = null;
}

async function run(action: ConnectAction) {
  busy.value = { action, phase: "passkey" };
  error.value = null;
  emit("busyChange", true);
  try {
    const wallet = await connect(props.mode, action, secret.value);
    if (disposed) {
      // Nobody will adopt this wallet; zero its signing key now.
      wallet.lock();
      return;
    }
    busy.value = { action, phase: "opening" };
    await props.onConnected(wallet);
  } catch (caught) {
    if (!disposed) error.value = describeError(caught);
  } finally {
    busy.value = null;
    if (!disposed) emit("busyChange", false);
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
  <div v-if="mode === 'vault'" class="connect-cta">
    <p class="hint">
      The demo encrypts a recovery phrase in a vault that opens with the
      passkey. Generate a fresh one rather than importing a phrase that holds
      funds.
    </p>
    <label class="field">
      <span class="field-head">
        Recovery phrase
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
        v-model="secret"
        placeholder="Generate a recovery phrase, or paste one from a wallet app"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="busy !== null"
      />
    </label>
    <p v-if="trimmedSecret.length > 0 && !secretValid" class="status error">
      That is not a valid recovery phrase.
    </p>
    <div class="actions">
      <button
        type="button"
        class="btn primary"
        :disabled="busy !== null || !secretValid"
        @click="void run('create')"
      >
        {{ actionLabel("create", "Open account") }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="busy !== null"
        @click="void run('signin')"
      >
        {{ actionLabel("signin", "Sign in") }}
      </button>
    </div>
    <p v-if="error" class="status error">{{ error }}</p>
  </div>

  <div v-else class="connect-cta">
    <div class="actions">
      <button
        type="button"
        class="btn primary"
        :disabled="busy !== null"
        @click="void run('create')"
      >
        {{ actionLabel("create", "Create account") }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="busy !== null"
        @click="void run('signin')"
      >
        {{ actionLabel("signin", "Sign in") }}
      </button>
    </div>
    <p v-if="error" class="status error">{{ error }}</p>
  </div>
</template>
