import { onScopeDispose, type Ref, ref } from "vue";

/**
 * Copy-to-clipboard button state: `copy(text)` writes to the clipboard and
 * flips `copied` true for a moment so the button can show a confirmation.
 */
function useCopyButton(): {
  copied: Ref<boolean>;
  copy: (text: string) => Promise<void>;
} {
  const copied = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onScopeDispose(() => clearTimeout(timer));

  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 1_200);
  }

  return { copied, copy };
}

export { useCopyButton };
