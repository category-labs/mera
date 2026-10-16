import { TICKER, UNIT } from "@category-labs/mera-demo-shared/market";
import type { LoadedPosition } from "@category-labs/mera-demo-shared/position";
import {
  CASH_SYMBOL,
  formatCash,
  formatPnl,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, text } from "./theme";

type HoldingsProps = {
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
function Holdings({ position, price, settling }: HoldingsProps): ReactElement {
  const value = (position.shares * price) / UNIT;
  const pnl = value - position.basis;
  return (
    <View style={styles.holdings}>
      <Row
        label={CASH_SYMBOL}
        value={settling ? "…" : formatCash(position.cash)}
      />
      <Row
        label={TICKER}
        value={`${formatShares(position.shares)} · ${formatCash(value)}`}
      />
      {position.shares > 0n ? (
        <Row
          label="P&L"
          tone={pnl < 0n ? "down" : "up"}
          value={formatPnl(pnl, position.basis)}
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
