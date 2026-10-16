<script setup lang="ts">
import { headlineAt } from "@category-labs/mera-demo-shared/news";

defineProps<{
  /** Unix seconds; picks the rotation window and its sentiment. */
  now: number;
}>();
</script>

<template>
  <p class="news"><span class="news-tag">News</span>{{ headlineAt(now) }}</p>
</template>
