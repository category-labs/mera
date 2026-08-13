import { useEffect, useState } from "react";
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { rpId } from "./src/config";
import { clearStoredPrfResult } from "./src/prfStore";
import {
  createAccount,
  describeError,
  type PasskeyWallet,
  restoreStoredAccount,
  revealMnemonic,
  signIn as signInWithPasskey,
} from "./src/wallet";

const PENDING_STATUS_MESSAGES = {
  restoring: "Unlocking…",
  creatingPasskey: "Creating the passkey…",
  waitingForPasskey: "Waiting for the passkey…",
  clearingStoredAccount: "Clearing the stored account…",
} as const;

type PendingWalletStatus = keyof typeof PENDING_STATUS_MESSAGES;
type WalletStatus =
  | { phase: "idle"; message?: string }
  | { phase: PendingWalletStatus };

export default function App() {
  const { create, forget, lock, mnemonic, reveal, signIn, status, wallet } =
    usePasskeyWallet();
  const busy = status.phase !== "idle";
  const message =
    status.phase === "idle"
      ? status.message
      : PENDING_STATUS_MESSAGES[status.phase];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>mera</Text>
          <Text style={styles.subtitle}>
            Create a passkey here or sign in with one from the web demo. Both
            apps derive the same address.
          </Text>

          <Field label="Relying party" value={rpId} />

          {wallet ? (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>Signed in</Text>
              <Field label="Address" value={wallet.address} mono />
              {mnemonic ? (
                <Field label="Recovery phrase" value={mnemonic} mono />
              ) : null}
              <Button
                title="Reveal recovery phrase"
                disabled={busy}
                onPress={() => reveal(wallet)}
              />
              <Button
                title="Lock"
                disabled={busy}
                onPress={() => lock(wallet)}
              />
              <Button
                title="Clear stored account"
                disabled={busy}
                onPress={() => forget(wallet)}
              />
            </View>
          ) : (
            <>
              <Button title="Create passkey" disabled={busy} onPress={create} />
              <Button title="Sign in" disabled={busy} onPress={signIn} />
            </>
          )}

          {message ? <Text style={styles.status}>{message}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function usePasskeyWallet() {
  const [wallet, setWallet] = useState<PasskeyWallet>();
  const [mnemonic, setMnemonic] = useState<string>();
  const [status, setStatus] = useState<WalletStatus>({ phase: "restoring" });

  useEffect(() => {
    let ignore = false;

    restoreStoredAccount()
      .then((restored) => {
        if (ignore) {
          restored?.session.end();
          return;
        }

        if (restored === undefined) {
          setStatus({ phase: "idle" });
        } else {
          setWallet(restored);
          setStatus({
            phase: "idle",
            message: "Signed in from this device, with no passkey prompt.",
          });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setStatus({ phase: "idle", message: describeError(error) });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const session = wallet?.session;
    return () => session?.end();
  }, [wallet]);

  async function runAction(
    pendingStatus: PendingWalletStatus,
    action: () => Promise<string>,
  ) {
    setStatus({ phase: pendingStatus });
    try {
      setStatus({ phase: "idle", message: await action() });
    } catch (error) {
      setStatus({ phase: "idle", message: describeError(error) });
    }
  }

  function clearWallet() {
    setWallet(undefined);
    setMnemonic(undefined);
  }

  const signIn = () =>
    runAction("waitingForPasskey", async () => {
      setWallet(await signInWithPasskey());
      return "Signed in with the passkey.";
    });

  const create = () =>
    runAction("creatingPasskey", async () => {
      setWallet(await createAccount());
      return "Created a passkey and signed in. The web demo signs into this same address with it.";
    });

  const reveal = (connected: PasskeyWallet) =>
    runAction("waitingForPasskey", async () => {
      setMnemonic(await revealMnemonic(connected));
      return "The same phrase imports into any HD wallet.";
    });

  const lock = (connected: PasskeyWallet) => {
    connected.session.end();
    clearWallet();
    setStatus({
      phase: "idle",
      message: "Locked. The signing key is zeroed.",
    });
  };

  const forget = (connected: PasskeyWallet) =>
    runAction("clearingStoredAccount", async () => {
      await clearStoredPrfResult();
      connected.session.end();
      clearWallet();
      return "Stored account cleared. The next launch opens signed out.";
    });

  return {
    create,
    forget,
    lock,
    mnemonic,
    reveal,
    signIn,
    status,
    wallet,
  };
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono ? styles.mono : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#0a0a0a", flex: 1 },
  content: { gap: 16, padding: 24 },
  title: { color: "#fafafa", fontSize: 34, fontWeight: "600" },
  subtitle: { color: "#a1a1aa", fontSize: 15, lineHeight: 22 },
  result: {
    borderColor: "#27272a",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  resultTitle: { color: "#fafafa", fontSize: 18, fontWeight: "600" },
  field: { gap: 4 },
  fieldLabel: {
    color: "#71717a",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldValue: { color: "#fafafa", fontSize: 16 },
  mono: { fontFamily: "Courier", fontSize: 14 },
  status: { color: "#a1a1aa", fontSize: 14, lineHeight: 20 },
});
