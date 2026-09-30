import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Icon from "./Icon";
import { colors, spacing, type, glass, chips } from "../theme";

/** Small building blocks the glass screens share, the mobile side of the
 * web's .chip / .icon-orb classes. */

export function Chip({ tone, icon, children, style }) {
  const palette = tone ? chips[tone] : null;
  const fg = palette ? palette.fg : chips.text.color;
  return (
    <View
      style={[
        chips.base,
        palette && { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Text style={[chips.text, { color: fg }]}>{capitalize(children)}</Text>
    </View>
  );
}

// Status words come from the API in lower case ("spike", "pending").
function capitalize(value) {
  return typeof value === "string" && value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function Orb({ icon, color = colors.secondary, background, size = 44 }) {
  return (
    <View
      style={[
        glass.orb,
        { width: size, height: size, borderRadius: size / 2 },
        background && { backgroundColor: background },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

export function SectionTitle({ icon, children }) {
  return (
    <View style={styles.sectionRow}>
      {icon && <Icon name={icon} size={22} color={colors.secondary} />}
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export function EmptyCard({ icon, children }) {
  return (
    <View style={[glass.card, styles.empty]}>
      <Orb icon={icon} size={40} />
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },
  empty: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  emptyText: { ...type.bodyMd, color: colors.onSurfaceVariant, flex: 1 },
});
