import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { palette } from "./theme";

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
};

function Button({
  title,
  onPress,
  disabled,
  primary,
}: ButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.label, primary ? styles.primaryLabel : null]}>
        {title}
      </Text>
    </Pressable>
  );
}

type LinkButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

function LinkButton({
  title,
  onPress,
  disabled,
}: LinkButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={styles.linkLabel}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  disabled: { opacity: 0.5 },
  label: { color: palette.text, fontSize: 14, fontWeight: "600" },
  link: { paddingHorizontal: 4, paddingVertical: 2 },
  linkLabel: { color: palette.accent, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.8 },
  primary: { backgroundColor: palette.accent, borderColor: "transparent" },
  primaryLabel: { color: palette.accentText },
});

export { Button, LinkButton };
