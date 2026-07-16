import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { getAddress, isAddress } from "viem";
import { formatDecimalAmount, parseDecimalAmount } from "./amount";
import type { ChainAdapter } from "./ChainAccountCard";
import {
  createTransactionClient,
  type EvmContext,
  fundAccount,
} from "./chains/evm";
import { createFundingGate } from "./funding";

const EVM_DECIMALS = 18;
// Balances below this ask the network for funds. The top-up policy lives in
// the network's guard (demo/network/evm/server.mts), which uses the same
// threshold.
const MIN_BALANCE_WEI = 10n * 10n ** 18n;

/**
 * Builds the EVM `ChainAdapter` for one account: balance and gas-reserve
 * reads from the context's public client, passkey signing, and raw-transaction
 * broadcast.
 */
function createEvmAdapter(
  session: Secp256k1SigningSession,
  address: EvmAddress,
  evm: EvmContext,
): ChainAdapter {
  const { chain, publicClient, rpcUrl } = evm;
  const account = toViemAccount(session);
  const symbol = chain.nativeCurrency.symbol;
  const ensureFunded = createFundingGate({
    minBalance: MIN_BALANCE_WEI,
    fund: () => fundAccount(address),
    readBalance: () => publicClient.getBalance({ address }),
  });
  return {
    chainName: "EVM",
    badgeClassName: "badge",
    symbol,
    recipientPlaceholder: "0x…",
    balanceTooLowError: "Balance is too low to cover gas.",
    isValidRecipient: isAddress,
    parseAmount: (text) => parseDecimalAmount(text, EVM_DECIMALS),
    formatAmount: (amount) => formatDecimalAmount(amount, EVM_DECIMALS),
    async fetchBalance() {
      const [balance, fees] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.estimateFeesPerGas(),
      ]);
      // 21000 gas is the base cost of a native transfer to an EOA.
      return {
        balance: await ensureFunded(balance),
        feeReserve: 21000n * fees.maxFeePerGas,
      };
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

export { createEvmAdapter };
