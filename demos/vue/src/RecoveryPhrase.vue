<script setup lang="ts">
import { computed } from "vue";
import { useCopyButton } from "./composables";

/**
 * The recovery phrase, shown in place of the account card. Only the caller's
 * state holds the phrase; JS strings cannot be zeroed, so dropping it on Hide
 * is the tightest lifetime available.
 */
const { phrase } = defineProps<{ phrase: string }>();
const emit = defineEmits<{ hide: [] }>();

const { feedback, copy } = useCopyButton();
const words = computed(() =>
  phrase.split(" ").map((word, index) => ({ position: index + 1, word })),
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
    <button type="button" class="btn" @click="copy(phrase)">
      {{ feedback ?? "Copy phrase" }}
    </button>
  </section>
</template>
