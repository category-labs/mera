import { useCopyButton } from "@category-labs/mera-demo-shared/hooks";
import { setStringAsync } from "expo-clipboard";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, LinkButton } from "./Button";
import { monoFont, palette, text } from "./theme";

type RecoveryPhraseProps = {
  phrase: string;
  onHide: () => void;
};

/**
 * The recovery phrase, shown in place of the trading card. Only the caller's
 * state holds the phrase; JS strings cannot be zeroed, so dropping it on Hide
 * is the tightest lifetime available.
 */
function RecoveryPhrase({ phrase, onHide }: RecoveryPhraseProps): ReactElement {
  const { copied, copy } = useCopyButton(setStringAsync);
  const words = phrase
    .split(" ")
    .map((word, index) => ({ position: index + 1, word }));

  return (
    <View style={styles.backup}>
      <View style={styles.head}>
        <Text style={text.label}>Recovery phrase</Text>
        <LinkButton title="Hide" onPress={onHide} />
      </View>
      <Text style={text.hint}>
        Anyone with these {words.length} words controls the funds. Compatible
        wallet apps, such as MetaMask, can recover the same addresses.
      </Text>
      <View style={styles.grid}>
        {words.map(({ position, word }) => (
          <View key={position} style={styles.word}>
            <Text style={styles.num}>{position}</Text>
            <Text style={styles.wordText}>{word}</Text>
          </View>
        ))}
      </View>
      <Button
        title={copied ? "Copied" : "Copy phrase"}
        onPress={() => void copy(phrase)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backup: {
    backgroundColor: palette.surface2,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  head: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  num: {
    color: palette.muted,
    fontSize: 11,
    minWidth: 18,
    textAlign: "right",
  },
  word: {
    alignItems: "baseline",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "45%",
    flexDirection: "row",
    flexGrow: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wordText: { color: palette.text, fontFamily: monoFont, fontSize: 13 },
});

export { RecoveryPhrase };
