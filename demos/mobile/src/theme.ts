import { Platform, StyleSheet } from "react-native";

// The trading demos' shared light palette, as StyleSheet-ready values.
const palette = {
  bg: "#f5f6f8",
  surface: "#ffffff",
  surface2: "#f1f2f5",
  text: "#0f1115",
  muted: "#6b7280",
  border: "rgba(15, 17, 21, 0.1)",
  accent: "#f50",
  accentText: "#ffffff",
  ok: "#15a34a",
  error: "#dc2626",
  up: "#15a34a",
  down: "#dc2626",
} as const;

const monoFont = Platform.select({ ios: "Menlo", default: "monospace" });

// Text styles every screen repeats: section labels and muted hints.
const text = StyleSheet.create({
  hint: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  label: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});

export { monoFont, palette, text };
