import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { formatEther, getAddress, isAddress, parseEther } from "viem";
import { AccountCardShell } from "./AccountCardShell";
import { toPasskeyAccount } from "./account";
import {
  type SuggestedRecipientProps,
  useBalancePolling,
  useSuggestedRecipient,
} from "./accountCardShared";
import {
  createTransactionClient,
  type EthereumContext,
  explorerTxUrl,
} from "./chains/ethereum";
import { type AccountMode, describeError } from "./connect";
import { trimAmount } from "./ui";

const MONAD_FAUCET_URL = "https://faucet.monad.xyz/";

type EthereumAccountCardProps = SuggestedRecipientProps & {
  session: Secp256k1SigningSession;
  address: EvmAddress;
  mode: AccountMode;
  ethereum: EthereumContext;
  isTestnet: boolean;
  onLock: () => void;
};

/** Account view for an Ethereum passkey session: address, balance, receive QR, send form. */
function EthereumAccountCard({
  session,
  address,
  mode,
  ethereum,
  isTestnet,
  suggestedRecipient,
  suggestedLabel,
  onRevealRecipient,
  onLock,
}: EthereumAccountCardProps): ReactElement {
  const { chain, publicClient, rpcUrl } = ethereum;
  const account = useMemo(() => toPasskeyAccount(session), [session]);

  const [balance, setBalance] = useState<string | null>(null);
  // Wei to reserve for a 21k-gas native transfer, refreshed with the balance so
  // the funding check accounts for gas, not just the amount.
  const [gasReserve, setGasReserve] = useState<bigint>(0n);
  const {
    to,
    setTo,
    amount,
    setAmount,
    showChip,
    switchToManual,
    restoreSuggestion,
  } = useSuggestedRecipient(suggestedRecipient);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountValid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0;
  const amountWei = amountValid ? parseEther(amount) : 0n;
  const balanceWei = balance !== null ? parseEther(balance) : null;
  // Testnet gates Send on a *known* balance that covers amount + gas, and
  // prompts the faucet when it doesn't. Mainnet is unchanged: send on a valid
  // form. `covered` is false while the balance is still null (loading/failed),
  // so Send stays disabled until we actually know there are funds.
  const covered = balanceWei !== null && balanceWei >= amountWei + gasReserve;
  const needsFunds = isTestnet && balanceWei !== null && !covered;
  const canSend =
    isAddress(to) && amountValid && !busy && (!isTestnet || covered);

  const refreshBalance = useCallback(async () => {
    try {
      const [wei, fees] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.estimateFeesPerGas(),
      ]);
      setBalance(formatEther(wei));
      // 21000 gas is the base cost of a native transfer to an EOA.
      setGasReserve(21000n * fees.maxFeePerGas);
    } catch {
      setBalance(null);
    }
  }, [publicClient, address]);

  const resetBalanceState = useCallback(() => {
    setBalance(null);
    setSigned(null);
    setTxHash(null);
    setError(null);
  }, []);

  useBalancePolling(refreshBalance, resetBalanceState);

  async function send() {
    setBusy(true);
    setError(null);
    setSigned(null);
    setTxHash(null);
    try {
      const transactionClient = createTransactionClient(account, chain, rpcUrl);
      const request = await transactionClient.prepareTransactionRequest({
        to: getAddress(to),
        value: parseEther(amount),
      });
      const serializedTransaction =
        await transactionClient.signTransaction(request);
      setSigned(serializedTransaction);
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction,
      });
      setTxHash(hash);
      void refreshBalance();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendMax() {
    if (balance === null || busy) return;
    setError(null);
    try {
      const balanceWei = parseEther(balance);
      const { maxFeePerGas } = await publicClient.estimateFeesPerGas();
      // 21000 gas is the base cost of a native ETH transfer to an EOA.
      const gasCost = 21000n * maxFeePerGas;
      if (balanceWei <= gasCost) {
        setError("Balance is too low to cover gas");
        return;
      }
      setAmount(formatEther(balanceWei - gasCost));
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  const explorer = txHash ? explorerTxUrl(chain, txHash) : undefined;
  const symbol = chain.nativeCurrency.symbol;

  return (
    <AccountCardShell
      badgeClassName="badge chain-ethereum"
      badgeText={`Ethereum · ${mode}`}
      onLock={onLock}
      address={address}
      balanceText={balance === null ? "…" : trimAmount(balance)}
      symbol={symbol}
      needsFunds={needsFunds}
      faucetUrl={MONAD_FAUCET_URL}
      faucetText={`Get testnet ${symbol} ↗`}
      networkName={chain.name}
      recipientPlaceholder="0x…"
      suggestedRecipient={suggestedRecipient}
      suggestedLabel={suggestedLabel}
      onRevealRecipient={onRevealRecipient}
      to={to}
      setTo={setTo}
      amount={amount}
      setAmount={setAmount}
      showChip={showChip}
      switchToManual={switchToManual}
      restoreSuggestion={restoreSuggestion}
      busy={busy}
      canSend={canSend}
      onSend={() => void send()}
      onSendMax={() => void sendMax()}
      maxDisabled={busy || balance === null}
      signed={signed}
      broadcastId={txHash}
      explorerUrl={explorer}
      error={error}
    />
  );
}

export { EthereumAccountCard };
