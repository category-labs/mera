import type { ReactElement } from "react";
import { TICKER, UNIT } from "./market";
import type { LoadedPosition } from "./position";
import { CASH_SYMBOL, formatCash, formatPnl, formatShares } from "./ui";

type AccountHoldingsProps = {
  position: LoadedPosition;
  price: bigint;
  /** A trade waits for the read that includes its fee, so cash shows "…". */
  settling: boolean;
};

/**
 * The account's balances: cash, the position at the live price, and its gain
 * or loss against the cost basis. House credits change cash, never the basis,
 * so refills cannot fake gains.
 */
function AccountHoldings({
  position,
  price,
  settling,
}: AccountHoldingsProps): ReactElement {
  const value = (position.shares * price) / UNIT;
  const pnl = value - position.basis;
  return (
    <div className="holdings">
      <div className="holding-row">
        <span className="holding-label">{CASH_SYMBOL}</span>
        <span className="holding-value">
          {settling ? "…" : formatCash(position.cash)}
        </span>
      </div>
      <div className="holding-row">
        <span className="holding-label">{TICKER}</span>
        <span className="holding-value">
          {`${formatShares(position.shares)} · ${formatCash(value)}`}
        </span>
      </div>
      {position.shares > 0n && (
        <div className="holding-row">
          <span className="holding-label">P&L</span>
          <span
            className={pnl < 0n ? "holding-value down" : "holding-value up"}
          >
            {formatPnl(pnl, position.basis)}
          </span>
        </div>
      )}
    </div>
  );
}

export { AccountHoldings };
