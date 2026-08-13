import type { StoredAccount } from "./storage";
import type { Wallet } from "./wallet";

type AccountState =
  | { status: "none" }
  | ({ status: "locked" } & StoredAccount)
  | { status: "unlocked"; wallet: Wallet };

function accountAddress(account: AccountState): `0x${string}` | null {
  if (account.status === "none") return null;
  return account.status === "locked" ? account.address : account.wallet.address;
}

export type { AccountState };
export { accountAddress };
