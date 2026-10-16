import { useEvmContext } from "@category-labs/mera-demo-shared/hooks";
import { DEMO_RPC_URL } from "@category-labs/mera-demo-shared/network";
import { useEffect, useEffectEvent, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccountChip } from "./src/AccountChip";
import { type AccountState, accountAddress } from "./src/account";
import { loadStoredAccount } from "./src/storage";
import { TradingScreen } from "./src/TradingScreen";
import { palette } from "./src/theme";

export default function App() {
  const { evm, evmError } = useEvmContext(DEMO_RPC_URL);
  // Launch reads only the ungated metadata, so it shows no biometric prompt;
  // the first trade reads the stored PRF output behind one.
  const [account, setAccount] = useState<AccountState>(() => {
    const stored = loadStoredAccount();
    return stored === undefined
      ? { status: "none" }
      : { status: "locked", ...stored };
  });
  // Unmounting ends the live session, so its key does not wait for garbage
  // collection.
  const endSession = useEffectEvent((): void => {
    if (account.status === "unlocked") account.wallet.session.end();
  });
  useEffect(() => () => endSession(), []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <Text style={styles.title}>mera demo</Text>
            <AccountChip
              address={accountAddress(account)}
              connected={evm !== null}
            />
          </View>
          <TradingScreen
            account={account}
            evm={evm}
            evmError={evmError}
            onAccountChange={setAccount}
          />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 24 },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  screen: { backgroundColor: palette.bg, flex: 1 },
  title: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
