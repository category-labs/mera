import { onScopeDispose, type Ref, ref } from "vue";

/**
 * Copy-to-clipboard button state: `copy(text)` writes to the clipboard and
 * flips `copied` true for a moment so the button can show a confirmation.
 * After the owning scope disposes, a pending copy changes nothing.
 */
function useCopyButton(): {
  copied: Ref<boolean>;
  copy: (text: string) => Promise<void>;
} {
  const copied = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(timer);
  });

  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    // The write can outlive the component; a timer set now would leak past
    // the cleanup that already ran.
    if (disposed) return;
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 1_200);
  }

  return { copied, copy };
}

export { useCopyButton };
