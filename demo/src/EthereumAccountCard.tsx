import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { type ReactElement, useMemo } from "react";
import { formatEther, getAddress, isAddress, parseEther } from "viem";
import { toPasskeyAccount } from "./account";
import { ChainAccountCard, type ChainAdapter } from "./ChainAccountCard";
import {
  createTransactionClient,
  type EthereumContext,
  explorerTxUrl,
} from "./chains/ethereum";
import type { AccountMode } from "./connect";

const MONAD_FAUCET_URL = "https://faucet.monad.xyz/";

// Positive decimal amounts only — parseEther alone would also accept "" and "0".
function parseEthAmount(value: string): bigint | null {
  if (!/^\d*\.?\d+$/.test(value) || Number(value) <= 0) return null;
  return parseEther(value);
}

type EthereumAccountCardProps = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
  mode: AccountMode;
  ethereum: EthereumContext;
  isTestnet: boolean;
  /** A self-owned recipient to pre-fill (testnet, derived mode); absent otherwise. */
  suggestedRecipient?: string;
  suggestedLabel?: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onRevealRecipient?: () => void;
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
  const adapter = useMemo<ChainAdapter>(() => {
    const { chain, publicClient, rpcUrl } = ethereum;
    const account = toPasskeyAccount(session);
    const symbol = chain.nativeCurrency.symbol;
    return {
      chainName: "Ethereum",
      badgeClassName: "badge",
      symbol,
      networkName: chain.name,
      faucetUrl: MONAD_FAUCET_URL,
      faucetText: `Get testnet ${symbol} ↗`,
      recipientPlaceholder: "0x…",
      balanceTooLowError: "Balance is too low to cover gas",
      isValidRecipient: isAddress,
      parseAmount: parseEthAmount,
      formatAmount: formatEther,
      async fetchBalance() {
        const [balance, fees] = await Promise.all([
          publicClient.getBalance({ address }),
          publicClient.estimateFeesPerGas(),
        ]);
        // 21000 gas is the base cost of a native transfer to an EOA.
        return { balance, feeReserve: 21000n * fees.maxFeePerGas };
      },
      async send(to, valueWei, onSigned) {
        const transactionClient = createTransactionClient(
          account,
          chain,
          rpcUrl,
        );
        const request = await transactionClient.prepareTransactionRequest({
          to: getAddress(to),
          value: valueWei,
        });
        const serializedTransaction =
          await transactionClient.signTransaction(request);
        onSigned(serializedTransaction);
        return publicClient.sendRawTransaction({ serializedTransaction });
      },
      explorerTxUrl: (hash) => explorerTxUrl(chain, hash),
    };
  }, [session, address, ethereum]);

  return (
    <ChainAccountCard
      adapter={adapter}
      address={address}
      mode={mode}
      isTestnet={isTestnet}
      suggestedRecipient={suggestedRecipient}
      suggestedLabel={suggestedLabel}
      onRevealRecipient={onRevealRecipient}
      onLock={onLock}
    />
  );
}

export { EthereumAccountCard };
