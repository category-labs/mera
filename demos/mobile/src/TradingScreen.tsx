import { useNow, usePosition } from "@category-labs/mera-demo-shared/hooks";
import type {
  Fill,
  Order,
  Portfolio,
  TradeDraft,
} from "@category-labs/mera-demo-shared/market";
import {
  LOW_CASH_WEI,
  placeOrder,
  priceAt,
  readPortfolio,
} from "@category-labs/mera-demo-shared/market";
import type { EvmContext } from "@category-labs/mera-demo-shared/network";
import { fundAccount } from "@category-labs/mera-demo-shared/network";
import { CASH_SYMBOL } from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import type { AccountState } from "./account";
import { accountAddress } from "./account";
import { Button, LinkButton } from "./Button";
import { Holdings } from "./Holdings";
import { RecoveryPhrase } from "./RecoveryPhrase";
import { StockOverview } from "./StockOverview";
import { clearStoredAccount, storedCostBasis } from "./storage";
import { TradeForm } from "./TradeForm";
import { palette, text } from "./theme";
import type { Wallet } from "./wallet";
import {
  createAccount,
  describeError,
  revealMnemonic,
  signIn,
  unlockStoredWallet,
} from "./wallet";

type Pending =
  | "create"
  | "signin"
  | "opening:create"
  | "opening:signin"
  | "recovery";

type TradingScreenProps = {
  account: AccountState;
  evm: EvmContext | null;
  evmError: string | null;
  onAccountChange: (next: AccountState) => void;
};

const clearedDraft = (draft: TradeDraft): TradeDraft => ({
  kind: "amount",
  side: draft.side,
  text: "",
});

type AccountLinksProps = {
  lowCash: boolean;
  funding: boolean;
  busy: boolean;
  locked: boolean;
  onAddFunds: () => void;
  onLock: () => void;
  onExport: () => void;
  onSignOut: () => void;
};

function AccountLinks({
  lowCash,
  funding,
  busy,
  locked,
  onAddFunds,
  onLock,
  onExport,
  onSignOut,
}: AccountLinksProps): ReactElement {
  return (
    <View style={styles.links}>
      {lowCash ? (
        <LinkButton
          disabled={busy}
          onPress={onAddFunds}
          title={funding ? "Adding funds…" : `Add 10,000 ${CASH_SYMBOL}`}
        />
      ) : null}
      <LinkButton disabled={busy || locked} onPress={onLock} title="Lock" />
      <LinkButton disabled={busy} onPress={onExport} title="Export account" />
      <LinkButton disabled={busy} onPress={onSignOut} title="Sign out" />
    </View>
  );
}

type RecoveryWarningProps = {
  busy: boolean;
  revealing: boolean;
  onCancel: () => void;
  onReveal: () => void;
};

function RecoveryWarning({
  busy,
  revealing,
  onCancel,
  onReveal,
}: RecoveryWarningProps): ReactElement {
  return (
    <View style={styles.warning}>
      <Text style={styles.error}>
        The next passkey check reveals the recovery phrase. Anyone who sees or
        copies it can control the account.
      </Text>
      <View style={styles.warningActions}>
        <View style={styles.warningAction}>
          <Button onPress={onCancel} title="Cancel" />
        </View>
        <View style={styles.warningAction}>
          <Button
            disabled={busy}
            onPress={onReveal}
            primary
            title={revealing ? "Waiting for passkey…" : "Reveal phrase"}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The trading surface. The stock renders for everyone; the area below it
 * depends on the account. Trades sign without a prompt; the first trade while
 * locked reads the stored PRF output behind a biometric prompt, and a passkey
 * prompt appears only at connect and when exporting the recovery phrase.
 */
function TradingScreen({
  account,
  evm,
  evmError,
  onAccountChange,
}: TradingScreenProps): ReactElement {
  const now = useNow();
  // The mirror equals the on-chain price by construction.
  const price = priceAt(BigInt(now));
  const { position, loaded, stage, funding, fund, adopt, trade } = usePosition(
    evm,
    accountAddress(account),
    storedCostBasis
  );
  const [draft, setDraft] = useState<TradeDraft>({
    kind: "amount",
    side: "buy",
    text: "",
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  // Revealed by a fresh passkey ceremony and never persisted. While shown, it
  // takes over the card slot.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const busy = pending !== null || funding || stage === "sending";

  // Leaving the foreground drops the phrase, so it never lingers into the app
  // switcher's snapshot.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setPhrase(null);
      }
    });
    return () => subscription.remove();
  }, []);

  // Switches to `next` and drops everything scoped to the previous account.
  function switchAccount(next: AccountState): void {
    onAccountChange(next);
    setDraft(clearedDraft);
    setFill(null);
    setTradeError(null);
    setRecoveryWarning(false);
    setBackupError(null);
  }

  // The fill and the error describe the draft they came from.
  function editDraft(next: TradeDraft): void {
    setDraft(next);
    setFill(null);
    setTradeError(null);
  }

  async function connect(action: "create" | "signin"): Promise<void> {
    setPending(action);
    setTradeError(null);
    try {
      const wallet =
        action === "create" ? await createAccount() : await signIn();
      // Fund and read the account first, so the connect buttons give way to
      // settled balances.
      setPending(`opening:${action}`);
      let portfolio: Portfolio | null = null;
      if (evm !== null) {
        try {
          await fundAccount(evm, wallet.address);
          portfolio = await readPortfolio(evm, wallet.address);
        } catch {
          // Show the account anyway; the balance reads report the failure.
        }
      }
      if (portfolio !== null) {
        adopt(wallet.address, portfolio);
      }
      switchAccount({ status: "unlocked", wallet });
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  function connectLabel(action: "create" | "signin", idle: string): string {
    if (pending === action) {
      return "Waiting for passkey…";
    }
    if (pending === `opening:${action}`) {
      return "Opening account…";
    }
    return idle;
  }

  // Reads the stored PRF output behind a biometric or device-credential
  // prompt; signs out when it is gone or opens a different account.
  async function unlock(address: Wallet["address"]): Promise<Wallet> {
    const wallet = await unlockStoredWallet();
    if (wallet?.address !== address) {
      wallet?.session.end();
      await clearStoredAccount();
      switchAccount({ status: "none" });
      throw new Error(
        wallet === undefined
          ? "The stored account is gone. Sign in again."
          : "The stored key does not open this account. Sign in again."
      );
    }
    onAccountChange({ status: "unlocked", wallet });
    return wallet;
  }

  async function submit(order: Order): Promise<void> {
    if (loaded === null || evm === null || account.status === "none") {
      return;
    }
    setTradeError(null);
    setFill(null);
    try {
      const filled = await trade(async () => {
        const wallet =
          account.status === "unlocked"
            ? account.wallet
            : await unlock(account.address);
        return placeOrder({
          session: wallet.session,
          evm,
          order,
          price,
          heldShares: loaded.shares,
        });
      });
      setFill(filled);
      setDraft(clearedDraft);
    } catch (caught) {
      setTradeError(describeError(caught));
    }
  }

  async function addFunds(): Promise<void> {
    setTradeError(null);
    try {
      await fund();
    } catch (caught) {
      setTradeError(describeError(caught));
    }
  }

  async function revealBackup(): Promise<void> {
    if (account.status === "none") {
      return;
    }
    setPending("recovery");
    setBackupError(null);
    try {
      setPhrase(
        await revealMnemonic(
          account.status === "unlocked"
            ? account.wallet.credentialId
            : account.credentialId
        )
      );
      setRecoveryWarning(false);
    } catch (caught) {
      setBackupError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  function lock(): void {
    if (account.status !== "unlocked") {
      return;
    }
    account.wallet.session.end();
    setRecoveryWarning(false);
    onAccountChange({
      status: "locked",
      address: account.wallet.address,
      credentialId: account.wallet.credentialId,
    });
  }

  async function signOut(): Promise<void> {
    try {
      await clearStoredAccount();
    } catch (caught) {
      setTradeError(describeError(caught));
      return;
    }
    if (account.status === "unlocked") {
      account.wallet.session.end();
    }
    switchAccount({ status: "none" });
  }

  if (phrase !== null) {
    return <RecoveryPhrase onHide={() => setPhrase(null)} phrase={phrase} />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        <StockOverview now={now} />

        {evmError === null ? null : (
          <Text style={styles.error}>
            The market is unavailable: {evmError}
          </Text>
        )}

        {account.status === "none" ? (
          <View style={styles.connect}>
            <Button
              disabled={busy || evm === null}
              onPress={() => void connect("create")}
              primary
              title={connectLabel("create", "Create account")}
            />
            <Button
              disabled={busy || evm === null}
              onPress={() => void connect("signin")}
              title={connectLabel("signin", "Sign in")}
            />
            {tradeError === null ? null : (
              <Text style={styles.error}>{tradeError}</Text>
            )}
          </View>
        ) : (
          <>
            {loaded === null ? (
              <Text style={text.hint}>Loading balances…</Text>
            ) : (
              <>
                <Holdings
                  position={loaded}
                  price={price}
                  settling={stage === "settling"}
                />
                <TradeForm
                  disabled={pending !== null || funding}
                  draft={draft}
                  fill={fill}
                  locked={account.status === "locked"}
                  onDraftChange={editDraft}
                  onSubmit={(next) => void submit(next)}
                  portfolio={loaded}
                  price={price}
                  stage={stage}
                />
              </>
            )}
            {tradeError === null ? null : (
              <Text style={styles.error}>{tradeError}</Text>
            )}
            {position.readError === null ? null : (
              <Text style={styles.error}>{position.readError}</Text>
            )}
          </>
        )}
      </View>

      {account.status === "none" ? null : (
        <AccountLinks
          busy={busy}
          funding={funding}
          locked={account.status === "locked"}
          lowCash={loaded !== null && loaded.cash < LOW_CASH_WEI}
          onAddFunds={() => void addFunds()}
          onExport={() => setRecoveryWarning(true)}
          onLock={lock}
          onSignOut={() => void signOut()}
        />
      )}

      {backupError === null ? null : (
        <Text style={[styles.error, styles.centered]}>{backupError}</Text>
      )}

      {recoveryWarning ? (
        <RecoveryWarning
          busy={busy}
          onCancel={() => setRecoveryWarning(false)}
          onReveal={() => void revealBackup()}
          revealing={pending === "recovery"}
        />
      ) : null}

      <Text style={styles.disclaimer}>
        Runs on a demo network. Everything traded is fictional.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    gap: 16,
    padding: 20,
    shadowColor: palette.text,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  centered: { textAlign: "center" },
  connect: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 14,
  },
  disclaimer: {
    color: palette.muted,
    fontSize: 12,
    textAlign: "center",
  },
  error: { color: palette.error, fontSize: 13, lineHeight: 18 },
  links: {
    columnGap: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: 6,
  },
  shell: { gap: 14 },
  warning: {
    backgroundColor: palette.surface2,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  warningAction: { flex: 1 },
  warningActions: { flexDirection: "row", gap: 10 },
});

export { TradingScreen };
