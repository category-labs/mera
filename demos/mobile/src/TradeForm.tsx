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
} from "@category-labs/mera-demo-shared/market";
import type { positionReducer } from "@category-labs/mera-demo-shared/position";
import {
  CASH_SYMBOL,
  fillText,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, LinkButton } from "./Button";
import { palette, text } from "./theme";

type TradeFormProps = {
  draft: TradeDraft;
  onDraftChange: (next: TradeDraft) => void;
  portfolio: Portfolio;
  price: bigint;
  stage: positionReducer.TradeStage | null;
  /** The next trade first unlocks the stored key behind a biometric prompt. */
  locked: boolean;
  fill: Fill | null;
  /** Another action holds the wallet, so the form takes no input. */
  disabled: boolean;
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
  disabled,
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
    if (locked) return "Unlocking…";
    return buying ? "Buying…" : "Selling…";
  }

  return (
    <View style={styles.trade}>
      <View style={styles.segmented}>
        {SIDES.map((side) => (
          <Pressable
            key={side}
            accessibilityRole="tab"
            accessibilityState={{ selected: side === draft.side }}
            disabled={disabled}
            onPress={() => editAmount(side, draft.text)}
            style={[
              styles.segment,
              side === draft.side ? styles.segmentActive : null,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                side === draft.side ? styles.segmentLabelActive : null,
              ]}
            >
              {side === "buy" ? "Buy" : "Sell"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sendRow}>
        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Text style={text.label}>Amount ({CASH_SYMBOL})</Text>
            <LinkButton
              title="Max"
              disabled={!idle}
              onPress={() =>
                onDraftChange(maxDraft({ side: draft.side, price, portfolio }))
              }
            />
          </View>
          <TextInput
            accessibilityLabel={`Amount (${CASH_SYMBOL})`}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled && stage !== "sending"}
            keyboardType="decimal-pad"
            onChangeText={(text) => editAmount(draft.side, text)}
            placeholder="100.00"
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={draft.text}
          />
        </View>
        <View style={styles.submit}>
          <Button
            title={submitLabel()}
            primary
            disabled={coveredOrder === null}
            onPress={() => {
              if (coveredOrder !== null) onSubmit(coveredOrder);
            }}
          />
        </View>
      </View>

      {fill !== null ? (
        <Text style={styles.ok}>{fillText(fill)}</Text>
      ) : estimatedShares !== null ? (
        <Text style={text.hint}>
          ≈ {formatShares(estimatedShares)} {TICKER} at the current price
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: 6 },
  fieldHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  input: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    color: palette.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ok: { color: palette.ok, fontSize: 13, lineHeight: 18 },
  segment: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: palette.surface,
    elevation: 1,
    shadowColor: palette.text,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  segmentLabel: { color: palette.muted, fontSize: 14, fontWeight: "600" },
  segmentLabelActive: { color: palette.text },
  segmented: {
    backgroundColor: palette.surface2,
    borderRadius: 11,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  sendRow: { alignItems: "flex-end", flexDirection: "row", gap: 10 },
  submit: { minWidth: 92 },
  trade: { gap: 12 },
});

export { TradeForm };
