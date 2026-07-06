import { useEffect, useState } from "react";

const BALANCE_REFRESH_MS = 10_000;
const DEMO_SEND_AMOUNT = "0.01";

type SuggestedRecipientProps = {
  /** A self-owned recipient to pre-fill (testnet, derived mode); absent otherwise. */
  suggestedRecipient?: string;
  suggestedLabel?: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onRevealRecipient?: () => void;
};

type SuggestedRecipientState = {
  to: string;
  setTo: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  showChip: boolean;
  switchToManual: () => void;
  restoreSuggestion: () => void;
};

function useSuggestedRecipient(
  suggestedRecipient: string | undefined,
): SuggestedRecipientState {
  // Pre-fill a one-click self-transfer when a suggested recipient is offered
  // (testnet, derived). The card remounts per account, so these initializers
  // re-seed on every account switch.
  const [to, setTo] = useState(() => suggestedRecipient ?? "");
  const [amount, setAmount] = useState(() =>
    suggestedRecipient ? DEMO_SEND_AMOUNT : "",
  );
  const [manual, setManual] = useState(() => !suggestedRecipient);

  const showChip = Boolean(suggestedRecipient) && !manual;

  function switchToManual(): void {
    setManual(true);
    setTo("");
  }

  function restoreSuggestion(): void {
    if (!suggestedRecipient) return;
    setManual(false);
    setTo(suggestedRecipient);
  }

  return {
    to,
    setTo,
    amount,
    setAmount,
    showChip,
    switchToManual,
    restoreSuggestion,
  };
}

function useBalancePolling(
  refreshBalance: () => void | Promise<void>,
  reset: () => void,
): void {
  useEffect(() => {
    reset();
    void refreshBalance();
    const interval = window.setInterval(() => {
      void refreshBalance();
    }, BALANCE_REFRESH_MS);
    // Refresh the moment the tab regains focus -- e.g. returning from the
    // faucet -- so the new balance shows without a manual Refresh button.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBalance();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBalance, reset]);
}

export type { SuggestedRecipientProps };
export { useBalancePolling, useSuggestedRecipient };
