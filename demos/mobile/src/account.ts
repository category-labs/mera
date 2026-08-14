import type { EvmAddress } from "@category-labs/mera";
import type { Wallet } from "./wallet";

/**
 * The screen's account. `locked` carries the stored metadata: the portfolio
 * renders from the address, and the first trade unlocks the signing key.
 */
type AccountState =
  | { status: "none" }
  | { status: "locked"; address: EvmAddress; credentialId: string }
  | { status: "unlocked"; wallet: Wallet };

function accountAddress(account: AccountState): EvmAddress | null {
  switch (account.status) {
    case "none":
      return null;
    case "locked":
      return account.address;
    case "unlocked":
      return account.wallet.address;
  }
}

export type { AccountState };
export { accountAddress };
