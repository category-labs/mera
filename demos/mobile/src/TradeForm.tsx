import { type Fill, TICKER } from "@category-labs/mera-demo-shared/market";
import {
  CASH_SYMBOL,
  formatCash,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, LinkButton } from "./Button";
import { palette, text } from "./theme";

type Side = "buy" | "sell";

type TradeFormProps = {
  side: Side;
  amount: string;
  busy: boolean;
  canTrade: boolean;
  maxDisabled: boolean;
  submitLabel: string;
  estimatedShares: bigint | null;
  fill: (Fill & { spent?: bigint }) | null;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onSideChange: (side: Side) => void;
  onSubmit: () => void;
};

function TradeForm({
  side,
  amount,
  busy,
  canTrade,
  maxDisabled,
  submitLabel,
  estimatedShares,
  fill,
  onAmountChange,
  onMax,
  onSideChange,
  onSubmit,
}: TradeFormProps): ReactElement {
  return (
    <View style={styles.trade}>
      <View style={styles.segmented}>
        {(["buy", "sell"] as const).map((entry) => (
          <Pressable
            key={entry}
            accessibilityRole="tab"
            accessibilityState={{ selected: entry === side }}
            disabled={busy}
            onPress={() => onSideChange(entry)}
            style={[
              styles.segment,
              entry === side ? styles.segmentActive : null,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                entry === side ? styles.segmentLabelActive : null,
              ]}
            >
              {entry === "buy" ? "Buy" : "Sell"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sendRow}>
        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Text style={text.label}>Amount ({CASH_SYMBOL})</Text>
            <LinkButton title="Max" disabled={maxDisabled} onPress={onMax} />
          </View>
          <TextInput
            accessibilityLabel={`Amount (${CASH_SYMBOL})`}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            keyboardType="decimal-pad"
            onChangeText={onAmountChange}
            placeholder="100.00"
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={amount}
          />
        </View>
        <View style={styles.submit}>
          <Button
            title={submitLabel}
            primary
            disabled={!canTrade}
            onPress={onSubmit}
          />
        </View>
      </View>

      {estimatedShares !== null && fill === null ? (
        <Text style={text.hint}>
          ≈ {formatShares(estimatedShares)} {TICKER} at the current price
        </Text>
      ) : null}

      {fill !== null ? (
        <Text style={styles.ok}>
          {fill.side === "buy"
            ? `Bought ${formatShares(fill.shares)} ${TICKER}${
                fill.spent === undefined
                  ? ""
                  : ` for ${formatCash(fill.spent)} ${CASH_SYMBOL}`
              }`
            : `Sold ${formatShares(fill.shares)} ${TICKER}`}
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

export type { Side };
export { TradeForm };
