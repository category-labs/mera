import { truncateAddress } from "@category-labs/mera-demo-shared/ui";
import { type ReactElement, useState } from "react";

type Props = {
  address: `0x${string}` | null;
  connected: boolean;
};

function AccountChip({ address, connected }: Props): ReactElement {
  const [copied, setCopied] = useState(false);
  async function copyAddress(): Promise<void> {
    if (address === null) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }
  return (
    <div className="account-chip">
      {address !== null && (
        <button
          type="button"
          className="chip-address mono"
          title={address}
          onClick={() => void copyAddress()}
        >
          {copied ? "Copied" : truncateAddress(address)}
        </button>
      )}
      <span className={connected ? "chip-network connected" : "chip-network"}>
        Demo Network
      </span>
    </div>
  );
}

export { AccountChip };
