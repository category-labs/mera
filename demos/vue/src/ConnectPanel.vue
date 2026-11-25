<script lang="ts" setup>
  import type {
    AccountMode,
    ConnectedWallet,
  } from "@category-labs/mera-demo-shared/connect";
  import { connect } from "@category-labs/mera-demo-shared/connect";
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
  const connectError = ref<string | null>(null);

  const trimmedSecret = computed(() => secret.value.trim());
  const secretValid = computed(() => isValidMnemonic(trimmedSecret.value));
  // The first action is the primary one. Vault sign-in opens only a vault this
  // browser saved, so sign-in leads only in passkey mode, where any passkey for
  // the site can answer.
  const actions = computed<ConnectAction[]>(() =>
    mode === "passkey" ? ["signin", "create"] : ["create", "signin"]
  );

  function generate(): void {
    secret.value = createMnemonic();
    connectError.value = null;
  }

  async function run(action: ConnectAction): Promise<void> {
    busy.value = { action, phase: "passkey" };
    connectError.value = null;
    onBusyChange(true);
    try {
      const wallet = await connect(mode, action, secret.value);
      busy.value = { action, phase: "opening" };
      await onConnected(wallet);
    } catch (caught) {
      connectError.value = describeError(caught);
    } finally {
      busy.value = null;
      onBusyChange(false);
    }
  }

  function actionLabel(action: ConnectAction): string {
    if (busy.value?.action === action) {
      return busy.value.phase === "passkey"
        ? "Waiting for passkey…"
        : "Opening account…";
    }
    if (action === "signin") {
      return "Sign in with a passkey";
    }
    return mode === "vault" ? "Create a vault" : "Create a new wallet";
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
            class="link small"
            type="button"
            :disabled="busy !== null"
            @click="generate"
          >
            Generate
          </button>
        </span>
        <input
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          id="recovery-phrase"
          placeholder="Generate a recovery phrase, or paste one from a wallet app"
          spellcheck="false"
          v-model="secret"
          :disabled="busy !== null"
        >
      </div>
      <p class="status error" v-if="trimmedSecret.length > 0 && !secretValid">
        That is not a valid recovery phrase.
      </p>
    </template>
    <div class="actions">
      <button
        type="button"
        v-for="(action, index) in actions"
        :key="action"
        :class="index === 0 ? 'btn primary' : 'btn'"
        :disabled="
          busy !== null ||
          (action === 'create' && mode === 'vault' && !secretValid)
        "
        @click="run(action)"
      >
        {{ actionLabel(action) }}
      </button>
    </div>
    <p class="status error" v-if="connectError">{{ connectError }}</p>
  </div>
</template>
