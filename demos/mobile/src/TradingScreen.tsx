import { parseDecimalAmount } from "@category-labs/mera-demo-shared/amount";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  costBasisAfterBuy,
  costBasisAfterSell,
} from "@category-labs/mera-demo-shared/costBasis";
import {
  buyShares,
  COMPANY_NAME,
  type Fill,
  type Portfolio,
  priceAt,
  readPortfolio,
  sellShares,
  TICKER,
  UNIT,
} from "@category-labs/mera-demo-shared/market";
import {
  DEMO_RPC_URL,
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { CASH_SYMBOL, formatCash } from "@category-labs/mera-demo-shared/ui";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { isAddressEqual } from "viem";
import { type AccountState, accountAddress } from "./account";
import { Button, LinkButton } from "./Button";
import { Holdings } from "./Holdings";
import { NewsTicker } from "./NewsTicker";
import { PriceChart } from "./PriceChart";
import { RecoveryPhrase } from "./RecoveryPhrase";
import { clearStoredAccount, loadCostBasis, saveCostBasis } from "./storage";
import { type Side, TradeForm } from "./TradeForm";
import { palette } from "./theme";
import {
  createAccount,
  describeError,
  revealMnemonic,
  signIn,
  unlockStoredWallet,
  type Wallet,
} from "./wallet";

const REFRESH_MS = 5_000;
// Cash kept out of Max buys so the account can always pay a trade's network
// fee; at the demo network's gas prices this covers hundreds of trades.
const FEE_RESERVE_WEI = 10n ** 16n;
// Cash below this offers the 10,000 DEMOCASH top-up; the guard enforces the
// same threshold, so the button cannot inflate a healthy account.
const LOW_CASH_WEI = 100n * UNIT;
// One cent, the display resolution: sells that would leave less than this
// behind sell the whole position instead.
const CENT_WEI = 10n ** 16n;

type Pending = "create" | "signin" | "trade" | "recovery" | "funding";

type TradingScreenProps = {
  /** `null` while the stored account is still being read at launch. */
  account: AccountState | null;
  evm: EvmContext | null;
  evmError: string | null;
  onAccountChange: (next: AccountState) => void;
};

/**
 * The always-on trading surface: the stock's price, chart, and fake newsroom
 * render for everyone (history comes from the price mirror, so they need no
 * network); the area below them depends on the account state. Unlocked
 * trades sign silently; the first trade while locked reads the stored PRF
 * output behind a biometric prompt, and a passkey prompt appears only at
 * connect and when exporting the recovery phrase.
 */
function TradingScreen({
  account,
  evm,
  evmError,
  onAccountChange,
}: TradingScreenProps): ReactElement {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [sellAll, setSellAll] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [fill, setFill] = useState<(Fill & { spent?: bigint }) | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
  // only here while shown and replaces the card (Hide drops it); the demo
  // never persists it.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // The phrase must not linger into the app switcher's snapshot: leaving the
  // foreground drops it, and returning shows the account view again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPhrase(null);
    });
    return () => subscription.remove();
  }, []);

  const busy = pending !== null;
  const address = account === null ? null : accountAddress(account);

  // Polling, foregrounding, funding, and trades all refresh, so reads
  // overlap. Only the newest may commit: a slow pre-trade snapshot would
  // otherwise overwrite fresh balances, and its zero shares would trip the
  // basis reset below and erase the saved basis.
  const readGeneration = useRef(0);

  // Switches to `next` and drops everything scoped to the previous account.
  function adoptAccount(next: AccountState): void {
    readGeneration.current += 1;
    onAccountChange(next);
    setPortfolio(null);
    setAmount("");
    setSellAll(false);
    setFill(null);
    setTradeError(null);
    setReadError(null);
  }

  // Cash invested in the open position; stored on the device so P&L survives
  // relaunches.
  const [basis, setBasis] = useState(0n);
  useEffect(() => {
    setBasis(0n);
    if (address === null) return;
    let stale = false;
    void loadCostBasis(address).then((stored) => {
      if (!stale) setBasis(stored);
    });
    return () => {
      stale = true;
    };
  }, [address]);

  // Persistence is cosmetic: a lost save shows as stale P&L, not lost funds.
  function applyBasis(next: bigint): void {
    if (address === null) return;
    setBasis(next);
    saveCostBasis(address, next).catch(() => undefined);
  }

  // A network restart wipes the chain, and with it the position; a basis
  // left behind would report a loss on shares that no longer exist. Skip the
  // reset while a trade is in flight: right after a buy mines, the basis is
  // already updated while `portfolio` still shows the pre-trade zero shares.
  useEffect(() => {
    if (!busy && address !== null && portfolio?.shares === 0n && basis !== 0n) {
      setBasis(0n);
      saveCostBasis(address, 0n).catch(() => undefined);
    }
  }, [busy, portfolio, basis, address]);

  const refresh = useCallback(async () => {
    setNow(Math.floor(Date.now() / 1000));
    if (evm === null || address === null) return;
    const generation = ++readGeneration.current;
    try {
      const read = await readPortfolio(evm, address);
      if (generation !== readGeneration.current) return;
      setPortfolio(read);
      setReadError(null);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      setReadError(describeError(caught));
    }
  }, [evm, address]);

  // Funding needs only an address and the guard no-ops above its threshold,
  // so stored accounts refill after a network reset too.
  const funded = useRef<string | null>(null);
  useEffect(() => {
    if (address === null || funded.current === address) return;
    funded.current = address;
    fundAccount(DEMO_RPC_URL, address)
      .catch(() => {
        // A failed top-up surfaces through the balance read; the button
        // below offers a retry once the network is back.
      })
      .finally(() => void refresh());
  }, [address, refresh]);

  useEffect(() => {
    const tick = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    // The immediate call covers the moments the poll would miss by up to a
    // tick: the network context resolving after mount, and account changes.
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    // Refresh when the app returns to the foreground, so state that changed
    // in the background appears without waiting for the next tick.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  // The quote is the mirror at the current second: it equals the on-chain
  // price by construction and ticks without network reads.
  const price = priceAt(BigInt(now));
  const positionValue =
    portfolio === null ? null : (portfolio.shares * price) / UNIT;
  const delta = price - priceAt(BigInt(now - CHART_WINDOW_SECONDS));

  // House credits change cash, never the basis, so refills cannot fake gains.
  const pnl =
    positionValue !== null && portfolio !== null && portfolio.shares > 0n
      ? positionValue - basis
      : null;
  const pnlPercent =
    pnl !== null && basis > 0n ? Number((pnl * 10_000n) / basis) / 100 : null;

  const amountWei = parseDecimalAmount(amount, 18);
  // Buys must leave the fee reserve behind; sells cannot exceed the position
  // (with a cent of slack for price movement between render and submit) and
  // still need the reserve for the trade's network fee.
  const covered =
    portfolio !== null &&
    amountWei !== null &&
    (side === "buy"
      ? amountWei + FEE_RESERVE_WEI <= portfolio.cash
      : positionValue !== null &&
        positionValue > 0n &&
        amountWei <= positionValue + CENT_WEI &&
        portfolio.cash >= FEE_RESERVE_WEI);
  const canTrade = covered && !busy;

  const estimatedShares =
    amountWei !== null ? (amountWei * UNIT) / price : null;

  const submitLabel =
    pending === "trade"
      ? account?.status === "locked"
        ? "Unlocking…"
        : side === "buy"
          ? "Buying…"
          : "Selling…"
      : side === "buy"
        ? "Buy"
        : "Sell";

  // Wei to a plain decimal cash string, floored to cents.
  function cashInput(wei: bigint): string {
    const cents = wei / CENT_WEI;
    return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  }

  function fillMax(): void {
    if (portfolio === null) return;
    setTradeError(null);
    const wei =
      side === "buy"
        ? portfolio.cash > FEE_RESERVE_WEI
          ? portfolio.cash - FEE_RESERVE_WEI
          : 0n
        : (positionValue ?? 0n);
    setAmount(cashInput(wei));
    // Max on the sell side means the whole position: converting its stale
    // cash figure back to shares at a moved price can strand dust.
    setSellAll(side === "sell");
  }

  async function connect(action: "create" | "signin"): Promise<void> {
    setPending(action);
    setTradeError(null);
    try {
      const wallet =
        action === "create" ? await createAccount() : await signIn();
      adoptAccount({ status: "unlocked", wallet });
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  async function submit(): Promise<void> {
    if (
      amountWei === null ||
      portfolio === null ||
      evm === null ||
      account === null ||
      account.status === "none"
    )
      return;
    setPending("trade");
    setTradeError(null);
    setFill(null);
    try {
      let wallet: Wallet;
      if (account.status === "locked") {
        // Reading the stored PRF output asks for a biometric or device
        // credential; the signing afterwards is silent.
        const unlocked = await unlockStoredWallet();
        if (unlocked === undefined) {
          await clearStoredAccount();
          adoptAccount({ status: "none" });
          setTradeError("The stored account is gone. Sign in again.");
          return;
        }
        if (!isAddressEqual(unlocked.address, account.address)) {
          unlocked.session.end();
          await clearStoredAccount();
          adoptAccount({ status: "none" });
          setTradeError(
            "The stored key does not open this account. Sign in again.",
          );
          return;
        }
        wallet = unlocked;
        onAccountChange({ status: "unlocked", wallet });
      } else {
        wallet = account.wallet;
      }
      if (side === "buy") {
        const result = await buyShares(wallet.session, evm, amountWei);
        setFill({ ...result, spent: amountWei });
        applyBasis(costBasisAfterBuy(basis, amountWei));
      } else {
        let shares = (amountWei * UNIT) / price;
        // A Max sell, or a typed amount within a cent of the whole position,
        // sells all of it, so no dust the display would round to 0.00 is
        // left behind.
        if (
          sellAll ||
          ((portfolio.shares - shares) * price) / UNIT < CENT_WEI
        ) {
          shares = portfolio.shares;
        }
        const result = await sellShares(wallet.session, evm, shares);
        setFill(result);
        applyBasis(costBasisAfterSell(basis, result.shares, portfolio.shares));
      }
      setAmount("");
      setSellAll(false);
      await refresh();
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  async function addFunds(): Promise<void> {
    if (address === null) return;
    setPending("funding");
    setTradeError(null);
    try {
      await fundAccount(DEMO_RPC_URL, address);
      await refresh();
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  async function revealBackup(): Promise<void> {
    if (account === null || account.status === "none") return;
    setPending("recovery");
    setBackupError(null);
    try {
      const credentialId =
        account.status === "unlocked"
          ? account.wallet.credentialId
          : account.credentialId;
      setPhrase(await revealMnemonic(credentialId));
      setRecoveryWarning(false);
    } catch (caught) {
      setBackupError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  function lock(): void {
    if (account === null || account.status !== "unlocked") return;
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
    setRecoveryWarning(false);
    setBackupError(null);
    adoptAccount({ status: "none" });
  }

  // The phrase takes over the card slot.
  if (phrase !== null) {
    return <RecoveryPhrase phrase={phrase} onHide={() => setPhrase(null)} />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        <View style={styles.stockHead}>
          <View style={styles.stockTitle}>
            <Text style={styles.stockName}>{COMPANY_NAME}</Text>
            <View style={styles.stockSymbol}>
              <Text style={styles.stockSymbolLabel}>{TICKER}</Text>
            </View>
          </View>
          <View style={styles.stockQuote}>
            <Text style={styles.stockPrice}>{formatCash(price)}</Text>
            <Text
              style={[styles.stockDelta, delta < 0n ? styles.down : styles.up]}
            >
              {delta < 0n ? "" : "+"}
              {formatCash(delta)} · 30m
            </Text>
          </View>
        </View>

        <PriceChart livePrice={price} now={now} />
        <NewsTicker now={now} />

        {evmError !== null ? (
          <Text style={styles.error}>
            The market is unavailable: {evmError}
          </Text>
        ) : null}

        {account === null ? null : account.status === "none" ? (
          <View style={styles.connect}>
            <Button
              title={
                pending === "create" ? "Waiting for passkey…" : "Create account"
              }
              primary
              disabled={busy || evm === null}
              onPress={() => void connect("create")}
            />
            <Button
              title={pending === "signin" ? "Waiting for passkey…" : "Sign in"}
              disabled={busy || evm === null}
              onPress={() => void connect("signin")}
            />
            {tradeError !== null ? (
              <Text style={styles.error}>{tradeError}</Text>
            ) : null}
          </View>
        ) : (
          <>
            <Holdings
              portfolio={portfolio}
              positionValue={positionValue}
              pnl={pnl}
              pnlPercent={pnlPercent}
            />
            <TradeForm
              side={side}
              amount={amount}
              busy={busy}
              canTrade={canTrade}
              maxDisabled={busy || portfolio === null}
              submitLabel={submitLabel}
              estimatedShares={estimatedShares}
              fill={fill}
              onAmountChange={(value) => {
                setAmount(value);
                setSellAll(false);
                // A new amount retires the last fill for the estimate.
                setFill(null);
              }}
              onMax={fillMax}
              onSideChange={(next) => {
                setSide(next);
                setSellAll(false);
                setTradeError(null);
              }}
              onSubmit={() => void submit()}
            />
            {tradeError !== null ? (
              <Text style={styles.error}>{tradeError}</Text>
            ) : null}
            {readError !== null ? (
              <Text style={styles.error}>{readError}</Text>
            ) : null}
          </>
        )}
      </View>

      {account !== null && account.status !== "none" ? (
        <View style={styles.links}>
          {portfolio !== null && portfolio.cash < LOW_CASH_WEI ? (
            <LinkButton
              title={
                pending === "funding"
                  ? "Adding funds…"
                  : `Add 10,000 ${CASH_SYMBOL}`
              }
              disabled={busy}
              onPress={() => void addFunds()}
            />
          ) : null}
          <LinkButton
            title="Lock"
            disabled={busy || account.status === "locked"}
            onPress={lock}
          />
          <LinkButton
            title="Export account"
            disabled={busy}
            onPress={() => setRecoveryWarning(true)}
          />
          <LinkButton
            title="Sign out"
            disabled={busy}
            onPress={() => void signOut()}
          />
        </View>
      ) : null}

      {backupError !== null ? (
        <Text style={[styles.error, styles.centered]}>{backupError}</Text>
      ) : null}

      {recoveryWarning ? (
        <View style={styles.warning}>
          <Text style={styles.error}>
            The next passkey check reveals the recovery phrase. Anyone who sees
            or copies it can control the account.
          </Text>
          <View style={styles.warningActions}>
            <View style={styles.warningAction}>
              <Button
                title="Cancel"
                onPress={() => setRecoveryWarning(false)}
              />
            </View>
            <View style={styles.warningAction}>
              <Button
                title={
                  pending === "recovery"
                    ? "Waiting for passkey…"
                    : "Reveal phrase"
                }
                primary
                disabled={busy}
                onPress={() => void revealBackup()}
              />
            </View>
          </View>
        </View>
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
  down: { color: palette.down },
  error: { color: palette.error, fontSize: 13, lineHeight: 18 },
  links: {
    columnGap: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: 6,
  },
  shell: { gap: 14 },
  stockDelta: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  stockHead: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  stockName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.16,
  },
  stockPrice: {
    color: palette.text,
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -0.48,
  },
  stockQuote: { alignItems: "flex-end", gap: 2 },
  stockSymbol: {
    backgroundColor: "rgba(255, 85, 0, 0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stockSymbolLabel: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  stockTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  up: { color: palette.up },
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
