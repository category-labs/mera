import { NETWORK_NAME } from "@category-labs/mera-demo-shared/network";
import { truncateAddress } from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { useCopyButton } from "./useCopyButton";

type AccountChipProps = {
  address: `0x${string}` | null;
  connected: boolean;
};

/**
 * Title-row account indicator: the account's truncated address as a copy
 * button, over the network's name with a dot that turns green once the
 * network context resolves. The network line renders even when signed out,
 * so the page always says where trades settle.
 */
function AccountChip({ address, connected }: AccountChipProps): ReactElement {
  const { copied, copy } = useCopyButton();
  return (
    <div className="account-chip">
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
      <span className={connected ? "chip-network connected" : "chip-network"}>
        {NETWORK_NAME}
      </span>
    </div>
  );
}

export { AccountChip };
