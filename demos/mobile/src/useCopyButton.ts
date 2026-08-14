import { setStringAsync } from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";

/** Copies text to the clipboard; `copied` holds for 1.2 s after each copy. */
function useCopyButton(): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string) => {
    await setStringAsync(text);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1_200);
  }, []);

  return { copied, copy };
}

export { useCopyButton };
