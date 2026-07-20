import type { ReactElement } from "react";
import { NETWORK_NAME } from "./chains/evm";
import { truncateAddress } from "./ui";
import { useCopyButton } from "./useCopyButton";

type AccountChipProps = {
  address: `0x${string}` | null;
};

/**
 * Title-row account indicator: the network's name, plus the account's
 * truncated address as a copy button. The network pill renders even when
 * signed out, so the page always says where trades settle.
 */
function AccountChip({ address }: AccountChipProps): ReactElement {
  const { copied, copy } = useCopyButton();
  return (
    <div className="account-chip">
      <span className="chip-network">{NETWORK_NAME}</span>
      {address !== null && (
        <button
          type="button"
          className="chip-address mono"
          title={address}
          onClick={() => void copy(address)}
        >
          {copied ? "Copied" : truncateAddress(address)}
        </button>
      )}
    </div>
  );
}

export { AccountChip };
