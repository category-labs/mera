import { headlineAt } from "@category-labs/mera-demo-shared/news";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, text } from "./theme";

type NewsTickerProps = {
  /** Unix seconds; picks the rotation window and its sentiment. */
  now: number;
};

function NewsTicker({ now }: NewsTickerProps): ReactElement {
  return (
    <View style={styles.news}>
      <Text style={styles.tag}>News</Text>
      <Text style={[text.hint, styles.headline]}>{headlineAt(now)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { flex: 1 },
  news: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  tag: {
    backgroundColor: palette.surface2,
    borderRadius: 999,
    color: palette.muted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
});

export { NewsTicker };
