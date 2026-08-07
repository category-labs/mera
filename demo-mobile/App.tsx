import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fetchBalance } from "./src/chain";
import { rpId } from "./src/config";
import { clearCachedPrfResult } from "./src/prfCache";
import {
  createAccount,
  describeError,
  type PasskeyWallet,
  revealMnemonic,
  signIn,
  signMessage,
} from "./src/wallet";

const SIGNED_MESSAGE = "mera mobile demo";

export default function App() {
  const [wallet, setWallet] = useState<PasskeyWallet>();
  const [balance, setBalance] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [mnemonic, setMnemonic] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Every action reports through the status line instead of throwing, so a
  // cancelled ceremony reads the same way as any other outcome.
  async function run(pending: string, action: () => Promise<void>) {
    setBusy(true);
    setStatus(pending);
    try {
      await action();
    } catch (error) {
      setStatus(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  // Everything on screen below the relying party belongs to one account. The
  // Sign in and Create account buttons render only while there is no wallet, so
  // this is what puts the screen back into that state.
  function clearAccount() {
    setWallet(undefined);
    setBalance(undefined);
    setSignature(undefined);
    setMnemonic(undefined);
  }

  // The counterpart of clearAccount: what putting an account on screen means.
  async function showAccount(connected: PasskeyWallet, done: string) {
    setWallet(connected);
    setStatus(done);
    setBalance(await fetchBalance(connected.address));
  }

  const connect = () =>
    run("Unlocking…", async () => {
      const connected = await signIn();
      await showAccount(
        connected,
        connected.source === "cache"
          ? "Signed in from this device, with no passkey prompt."
          : "Signed in with the passkey, and cached it for next time.",
      );
    });

  // Creation is not done until the PRF output is in hand, so this text stays
  // true across the second prompt mera shows when the create returned none.
  const create = () =>
    run("Creating the passkey…", async () => {
      await showAccount(
        await createAccount(),
        "Created a passkey and signed in. The web demo signs into this same address with it.",
      );
    });

  const sign = (connected: PasskeyWallet) =>
    run("Signing…", async () => {
      setSignature(await signMessage(connected, SIGNED_MESSAGE));
      setStatus(`Signed "${SIGNED_MESSAGE}" with no passkey prompt.`);
    });

  const reveal = (connected: PasskeyWallet) =>
    run("Waiting for the passkey…", async () => {
      setMnemonic(await revealMnemonic(connected));
      setStatus("The same phrase imports into any HD wallet.");
    });

  const lock = (connected: PasskeyWallet) => {
    connected.lock();
    clearAccount();
    setStatus("Locked. The signing key is zeroed.");
  };

  const forget = (connected: PasskeyWallet) =>
    run("Clearing the cache…", async () => {
      await clearCachedPrfResult();
      connected.lock();
      clearAccount();
      setStatus("Cache cleared. The next sign-in runs a passkey ceremony.");
    });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>mera</Text>
          <Text style={styles.subtitle}>
            Sign in with a passkey the web demo created, or create one here.
            Either way the address comes from the passkey itself, so both apps
            reach the same account. After the first sign-in the device holds the
            PRF output behind a biometric check, which skips the ceremony and
            loses nothing when cleared.
          </Text>

          <Field label="Relying party" value={rpId} />

          {wallet ? (
            <>
              <Field label="Address" value={wallet.address} mono />
              <Field label="Balance" value={balance ?? "…"} />
              <Field
                label="Unlocked by"
                value={wallet.source === "cache" ? "This device" : "Passkey"}
              />
              {signature ? (
                <Field label="Signature" value={signature} mono />
              ) : null}
              {mnemonic ? (
                <Field label="Recovery phrase" value={mnemonic} mono />
              ) : null}
              <Button
                label="Sign a message"
                disabled={busy}
                onPress={() => sign(wallet)}
              />
              <Button
                label="Reveal recovery phrase"
                disabled={busy}
                onPress={() => reveal(wallet)}
              />
              <Button
                label="Lock"
                disabled={busy}
                onPress={() => lock(wallet)}
              />
              <Button
                label="Clear device cache"
                disabled={busy}
                onPress={() => forget(wallet)}
              />
            </>
          ) : (
            <>
              {/* Sign in first: it is the returning action, and it changes
                  nothing, where Create adds an account and repoints the cache. */}
              <Button label="Sign in" disabled={busy} onPress={connect} />
              <Button label="Create account" disabled={busy} onPress={create} />
            </>
          )}

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
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

function Button({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#0a0a0a", flex: 1 },
  content: { gap: 16, padding: 24 },
  title: { color: "#fafafa", fontSize: 34, fontWeight: "600" },
  subtitle: { color: "#a1a1aa", fontSize: 15, lineHeight: 22 },
  field: { gap: 4 },
  fieldLabel: {
    color: "#71717a",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldValue: { color: "#fafafa", fontSize: 16 },
  mono: { fontFamily: "Courier", fontSize: 14 },
  button: {
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: "#0a0a0a", fontSize: 16, fontWeight: "600" },
  status: { color: "#a1a1aa", fontSize: 14, lineHeight: 20 },
});
