import type { ReactElement } from "react";
import type { Fill, Order, Portfolio, Side, TradeDraft } from "./market";
import {
  coversTrade,
  draftOrder,
  maxDraft,
  orderShares,
  TICKER,
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
    if (stage !== "sending") {
      return buying ? "Buy" : "Sell";
    }
    if (locked) {
      return "Waiting for passkey…";
    }
    return buying ? "Buying…" : "Selling…";
  }

  return (
    <>
      <div aria-label="Trade side" className="segmented" role="tablist">
        {SIDES.map((side) => (
          <button
            aria-selected={side === draft.side}
            className={side === draft.side ? "segment active" : "segment"}
            disabled={disabled}
            key={side}
            onClick={() => editAmount(side, draft.text)}
            role="tab"
            type="button"
          >
            {side === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <form
        className="trade"
        onSubmit={(event) => {
          event.preventDefault();
          if (coveredOrder !== null) {
            onSubmit(coveredOrder);
          }
        }}
      >
        <div className="send-row">
          <div className="field grow">
            <span className="field-head">
              <label htmlFor="trade-amount">Amount ({CASH_SYMBOL})</label>
              <button
                className="link small"
                disabled={!idle}
                onClick={() =>
                  onDraftChange(
                    maxDraft({ side: draft.side, price, portfolio })
                  )
                }
                type="button"
              >
                Max
              </button>
            </span>
            <input
              disabled={disabled || stage === "sending"}
              id="trade-amount"
              inputMode="decimal"
              onChange={(event) => editAmount(draft.side, event.target.value)}
              placeholder="100.00"
              spellCheck={false}
              value={draft.text}
            />
          </div>
          <button
            className="btn primary send-btn"
            disabled={coveredOrder === null}
            type="submit"
          >
            {submitLabel()}
          </button>
        </div>

        {fill === null && estimatedShares !== null && (
          <p className="hint">
            ≈ {formatShares(estimatedShares)} {TICKER} at the current price
          </p>
        )}
        {fill !== null && <p className="status ok">{fillText(fill)}</p>}
      </form>
    </>
  );
}

export { TradeForm };
