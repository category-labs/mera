import { useCallback, useState } from "react";

/**
 * Copy-to-clipboard button state: `copy(text)` writes to the clipboard and
 * flips `copied` true for a moment so the button can show a confirmation.
 */
function useCopyButton(): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
  reset: () => void;
} {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, []);
  const reset = useCallback(() => setCopied(false), []);
  return { copied, copy, reset };
}

export { useCopyButton };
