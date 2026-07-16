import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { getAddress, isAddress } from "viem";
import { formatDecimalAmount, parseDecimalAmount } from "./amount";
import type { ChainAdapter } from "./ChainAccountCard";
import {
  createTransactionClient,
  type EthereumContext,
} from "./chains/ethereum";

const ETH_DECIMALS = 18;

/**
 * Builds the Ethereum `ChainAdapter` for one account: balance and gas-reserve
 * reads from the context's public client, passkey signing, and raw-transaction
 * broadcast.
 */
function createEthereumAdapter(
  session: Secp256k1SigningSession,
  address: EvmAddress,
  ethereum: EthereumContext,
): ChainAdapter {
  const { chain, publicClient, rpcUrl } = ethereum;
  const account = toViemAccount(session);
  const symbol = chain.nativeCurrency.symbol;
  return {
    chainName: "Ethereum",
    badgeClassName: "badge",
    symbol,
    recipientPlaceholder: "0x…",
    balanceTooLowError: "Balance is too low to cover gas.",
    isValidRecipient: isAddress,
    parseAmount: (text) => parseDecimalAmount(text, ETH_DECIMALS),
    formatAmount: (amount) => formatDecimalAmount(amount, ETH_DECIMALS),
    async fetchBalance() {
      const [balance, fees] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.estimateFeesPerGas(),
      ]);
      // 21000 gas is the base cost of a native transfer to an EOA.
      return { balance, feeReserve: 21000n * fees.maxFeePerGas };
    },
    async signTransfer(to, valueWei) {
      const transactionClient = createTransactionClient(account, chain, rpcUrl);
      const request = await transactionClient.prepareTransactionRequest({
        to: getAddress(to),
        value: valueWei,
      });
      const serializedTransaction =
        await transactionClient.signTransaction(request);
      return {
        signed: serializedTransaction,
        broadcast: () =>
          publicClient.sendRawTransaction({ serializedTransaction }),
      };
    },
  };
}

export { createEthereumAdapter };
