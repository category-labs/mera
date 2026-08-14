import { type Portfolio, TICKER } from "@category-labs/mera-demo-shared/market";
import {
  CASH_SYMBOL,
  formatCash,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, text } from "./theme";

type HoldingsProps = {
  portfolio: Portfolio | null;
  positionValue: bigint | null;
  pnl: bigint | null;
  pnlPercent: number | null;
};

function Holdings({
  portfolio,
  positionValue,
  pnl,
  pnlPercent,
}: HoldingsProps): ReactElement {
  return (
    <View style={styles.holdings}>
      <Row
        label={CASH_SYMBOL}
        value={portfolio === null ? "…" : formatCash(portfolio.cash)}
      />
      <Row
        label={TICKER}
        value={
          portfolio === null || positionValue === null
            ? "…"
            : `${formatShares(portfolio.shares)} · ${formatCash(positionValue)}`
        }
      />
      {pnl !== null ? (
        <Row
          label="P&L"
          tone={pnl < 0n ? "down" : "up"}
          value={`${pnl < 0n ? "" : "+"}${formatCash(pnl)}${
            pnlPercent === null
              ? ""
              : ` · ${pnlPercent < 0 ? "" : "+"}${pnlPercent.toFixed(2)}%`
          }`}
        />
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={[text.label, styles.label]}>{label}</Text>
      <Text
        style={[
          styles.value,
          tone === "up" ? styles.up : null,
          tone === "down" ? styles.down : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  down: { color: palette.down },
  holdings: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14,
  },
  label: { fontSize: 12, letterSpacing: 0.5 },
  row: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  up: { color: palette.up },
  value: {
    color: palette.text,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
});

export { Holdings };
