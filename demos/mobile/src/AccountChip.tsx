import type { EvmAddress } from "@category-labs/mera";
import { NETWORK_NAME } from "@category-labs/mera-demo-shared/network";
import { truncateAddress } from "@category-labs/mera-demo-shared/ui";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { monoFont, palette } from "./theme";
import { useCopyButton } from "./useCopyButton";

type AccountChipProps = {
  address: EvmAddress | null;
  connected: boolean;
};

/**
 * Title-row account indicator: the account's truncated address as a copy
 * button, over the network's name with a dot that turns green once the
 * network context resolves. The network line renders even when signed out,
 * so the screen always says where trades settle.
 */
function AccountChip({ address, connected }: AccountChipProps): ReactElement {
  const { copied, copy } = useCopyButton();
  return (
    <View style={styles.chip}>
      {address !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void copy(address)}
        >
          <Text style={styles.address}>
            {copied ? "Copied" : truncateAddress(address)}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.network}>
        <View style={[styles.dot, connected ? styles.dotConnected : null]} />
        <Text style={styles.networkName}>{NETWORK_NAME}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  address: { color: palette.text, fontFamily: monoFont, fontSize: 13 },
  chip: { alignItems: "flex-end", gap: 2 },
  dot: {
    backgroundColor: palette.muted,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dotConnected: { backgroundColor: palette.ok },
  network: { alignItems: "center", flexDirection: "row", gap: 5 },
  networkName: { color: palette.muted, fontSize: 11, fontWeight: "600" },
});

export { AccountChip };
