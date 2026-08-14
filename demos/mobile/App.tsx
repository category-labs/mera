import {
  DEMO_CHAIN_ID,
  DEMO_RPC_URL,
  type EvmContext,
  resolveEvmContext,
} from "@category-labs/mera-demo-shared/network";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccountChip } from "./src/AccountChip";
import { type AccountState, accountAddress } from "./src/account";
import { loadStoredAccount } from "./src/storage";
import { TradingScreen } from "./src/TradingScreen";
import { palette } from "./src/theme";
import { describeError } from "./src/wallet";

export default function App() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [evm, setEvm] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  // Ends the outgoing session whenever the unlocked wallet leaves the state.
  const replaceAccount = useCallback((next: AccountState): void => {
    const current = accountRef.current;
    if (
      current?.status === "unlocked" &&
      (next.status !== "unlocked" || next.wallet !== current.wallet)
    ) {
      current.wallet.session.end();
    }
    accountRef.current = next;
    setAccount(next);
  }, []);

  // Launch lands in the locked state (or signed out) with no biometric
  // prompt: only the ungated metadata is read here. The stored PRF output
  // is read, behind biometrics, when the first trade needs the signing key.
  useEffect(() => {
    let stale = false;
    loadStoredAccount()
      .then((stored) => {
        if (stale) return;
        setAccount(
          stored === undefined
            ? { status: "none" }
            : { status: "locked", ...stored },
        );
      })
      .catch(() => {
        if (!stale) setAccount({ status: "none" });
      });
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function connectNetwork(): Promise<void> {
      try {
        const context = await resolveEvmContext({
          rpcUrl: DEMO_RPC_URL,
          expectedChainId: DEMO_CHAIN_ID,
        });
        if (!stopped) {
          setEvm(context);
          setEvmError(null);
        }
      } catch (error) {
        if (!stopped) {
          setEvm(null);
          setEvmError(describeError(error));
          timer = setTimeout(() => void connectNetwork(), 5_000);
        }
      }
    }
    void connectNetwork();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  // End the live session when the app unmounts.
  useEffect(
    () => () => {
      const current = accountRef.current;
      if (current?.status === "unlocked") current.wallet.session.end();
    },
    [],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <Text style={styles.title}>mera demo</Text>
            <AccountChip
              address={account === null ? null : accountAddress(account)}
              connected={evm !== null}
            />
          </View>
          <TradingScreen
            account={account}
            evm={evm}
            evmError={evmError}
            onAccountChange={replaceAccount}
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
