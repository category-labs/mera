<script setup lang="ts">
import { NETWORK_NAME } from "@category-labs/mera-demo-shared/network";
import { truncateAddress } from "@category-labs/mera-demo-shared/ui";
import { useCopyButton } from "./useCopyButton";

/**
 * Title-row account indicator: the account's truncated address as a copy
 * button, over the network's name with a dot that turns green once the
 * network context resolves. The network line renders even when signed out,
 * so the page always says where trades settle.
 */
defineProps<{
  address: `0x${string}` | null;
  connected: boolean;
}>();

const { copied, copy } = useCopyButton();
</script>

<template>
  <div class="account-chip">
    <button
      v-if="address !== null"
      type="button"
      class="chip-address mono"
      :title="address"
      @click="copy(address)"
    >
      {{ copied ? "Copied" : truncateAddress(address) }}
    </button>
    <span class="chip-network" :class="{ connected }">
      {{ NETWORK_NAME }}
    </span>
  </div>
</template>
