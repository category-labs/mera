<script setup lang="ts">
import { computed } from "vue";
import { useCopyButton } from "./shared/useCopyButton";

/**
 * Recovery-phrase display, shown in place of the account card.
 *
 * The phrase is held only by the caller's state while shown. `hide`, or
 * unmounting on lock, drops it. JS strings cannot be zeroed, so this is the
 * tightest lifetime achievable. Fresh user verification gates access while the
 * phrase is hidden.
 */
const props = defineProps<{
  /** The revealed recovery phrase to display (12 or 24 words). */
  phrase: string;
}>();

const emit = defineEmits<{
  /** Return to the account view, dropping the phrase reference. */
  hide: [];
}>();

const { copied, copy } = useCopyButton();

const words = computed(() =>
  props.phrase
    .trim()
    .split(/\s+/)
    .map((word, index) => ({ position: index + 1, word })),
);
</script>

<template>
  <section class="backup">
    <div class="backup-head">
      <span class="backup-title">Recovery phrase</span>
      <button type="button" class="link" @click="emit('hide')">Hide</button>
    </div>
    <p class="hint">
      Anyone with these {{ words.length }} words controls the funds. Compatible
      wallet apps, such as MetaMask, can recover the same addresses.
    </p>
    <ol class="mnemonic-grid">
      <li v-for="{ position, word } in words" :key="position">
        <span class="num">{{ position }}</span>
        <span class="mono">{{ word }}</span>
      </li>
    </ol>
    <button type="button" class="btn" @click="void copy(phrase)">
      {{ copied ? "Copied" : "Copy phrase" }}
    </button>
  </section>
</template>
