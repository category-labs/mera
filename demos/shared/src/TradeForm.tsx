import type { ReactElement } from "react";
import {
  coversTrade,
  draftOrder,
  type Fill,
  maxDraft,
  type Order,
  orderShares,
  type Portfolio,
  type Side,
  TICKER,
  type TradeDraft,
} from "./market";
import type { positionReducer } from "./position";
import { CASH_SYMBOL, fillText, formatShares } from "./ui";

type TradeFormProps = {
  draft: TradeDraft;
  onDraftChange: (next: TradeDraft) => void;
  portfolio: Portfolio;
  price: bigint;
  stage: positionReducer.TradeStage | null;
  /** The next trade first runs a passkey ceremony to restore the session. */
  locked: boolean;
  fill: Fill | null;
  /** Another action holds the wallet, so the form takes no input. */
  disabled?: boolean;
  onSubmit: (order: Order) => void;
};

const SIDES: readonly Side[] = ["buy", "sell"];

/**
 * The buy and sell form. It calls `onSubmit` with an order the portfolio
 * covers, and takes no order while a trade is in flight.
 */
function TradeForm({
  draft,
  onDraftChange,
  portfolio,
  price,
  stage,
  locked,
  fill,
  disabled = false,
  onSubmit,
}: TradeFormProps): ReactElement {
  const idle = stage === null && !disabled;
  const order = draftOrder(draft);
  const coveredOrder =
    idle && order !== null && coversTrade({ order, price, portfolio })
      ? order
      : null;
  const estimatedShares =
    order === null
      ? null
      : orderShares({ order, price, heldShares: portfolio.shares });

  function editAmount(side: Side, text: string): void {
    onDraftChange({ kind: "amount", side, text });
  }

  function submitLabel(): string {
    const buying = draft.side === "buy";
    if (stage !== "sending") return buying ? "Buy" : "Sell";
    if (locked) return "Waiting for passkey…";
    return buying ? "Buying…" : "Selling…";
  }

  return (
    <>
      <div className="segmented" role="tablist" aria-label="Trade side">
        {SIDES.map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={side === draft.side}
            className={side === draft.side ? "segment active" : "segment"}
            disabled={disabled}
            onClick={() => editAmount(side, draft.text)}
          >
            {side === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <form
        className="trade"
        onSubmit={(event) => {
          event.preventDefault();
          if (coveredOrder !== null) onSubmit(coveredOrder);
        }}
      >
        <div className="send-row">
          <div className="field grow">
            <span className="field-head">
              <label htmlFor="trade-amount">Amount ({CASH_SYMBOL})</label>
              <button
                type="button"
                className="link small"
                disabled={!idle}
                onClick={() =>
                  onDraftChange(
                    maxDraft({ side: draft.side, price, portfolio }),
                  )
                }
              >
                Max
              </button>
            </span>
            <input
              id="trade-amount"
              value={draft.text}
              placeholder="100.00"
              inputMode="decimal"
              spellCheck={false}
              disabled={disabled || stage === "sending"}
              onChange={(event) => editAmount(draft.side, event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn primary send-btn"
            disabled={coveredOrder === null}
          >
            {submitLabel()}
          </button>
        </div>

        {fill !== null ? (
          <p className="status ok">{fillText(fill)}</p>
        ) : estimatedShares !== null ? (
          <p className="hint">
            ≈ {formatShares(estimatedShares)} {TICKER} at the current price
          </p>
        ) : null}
      </form>
    </>
  );
}

export { TradeForm };
