import React from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Modal, Pressable, ScrollView, StyleSheet,
} from "react-native";
import Icon from "./Icon";
import GradientFill from "./GradientFill";
import { colors, spacing, type, fonts, glass, chips } from "../theme";
import { useLanguage } from "../context/LanguageContext";

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

export function Orb({ icon, color = colors.secondary, background, size = 44, children }) {
  return (
    <View
      style={[
        glass.orb,
        { width: size, height: size, borderRadius: size / 2 },
        background && { backgroundColor: background },
      ]}
    >
      {children ?? <Icon name={icon} size={Math.round(size * 0.5)} color={color} />}
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

/** .btn-primary */
export function PrimaryButton({ label, icon, onPress, disabled, loading, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[glass.primaryButton, (disabled || loading) && styles.disabled, style]}
    >
      <GradientFill />
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color="#ffffff" />}
          <Text style={glass.primaryButtonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** .btn-glass, and .btn-danger with `danger`. */
export function GhostButton({ label, icon, onPress, disabled, danger, compact, style, accessibilityLabel }) {
  const tint = danger ? colors.error : colors.onSurface;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={compact ? 8 : undefined}
      style={[
        glass.ghostButton,
        compact && styles.compact,
        danger && styles.danger,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon && <Icon name={icon} size={compact ? 16 : 18} color={tint} />}
      {!!label && <Text style={[glass.ghostButtonText, compact && styles.compactText, { color: tint }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** Round icon-only button (.btn-icon). */
export function IconButton({ icon, onPress, color = colors.onSurfaceVariant, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      activeOpacity={0.6}
    >
      <Icon name={icon} size={20} color={color} />
    </TouchableOpacity>
  );
}

/** .segmented: a row of options, one picked. */
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((opt) => {
        const picked = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            style={[styles.segment, picked && glass.pillActive]}
          >
            {opt.icon && <Icon name={opt.icon} size={16} color={picked ? colors.secondary : colors.onSurfaceVariant} />}
            <Text style={[styles.segmentText, { color: picked ? colors.secondary : colors.onSurfaceVariant }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A labelled .glass-input. */
export function Field({ label, style, ...inputProps }) {
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.outline}
        accessibilityLabel={label}
        style={[type.bodyMd, glass.input, style]}
        {...inputProps}
      />
    </View>
  );
}

/** The web's GlassModal: a bottom sheet over a blurred-looking scrim. */
export function GlassSheet({ visible, title, onClose, children }) {
  const { t } = useLanguage();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" onPress={onClose} label={t("common.close")} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A figure with its label and icon; `dark` is the screen's key figure. */
export function StatTile({ icon, label, value, unit, dark, children, style }) {
  return (
    <View style={[dark ? glass.dark : glass.card, styles.tile, style]}>
      {dark && <GradientFill kind="dark" />}
      <View style={styles.tileTop}>
        <Text style={[styles.tileLabel, dark && { color: colors.primaryFixedDim }]} numberOfLines={2}>{label}</Text>
        <Icon name={icon} size={20} color={dark ? colors.secondaryFixed : colors.secondary} />
      </View>
      <Text style={[styles.tileValue, dark && { color: "#ffffff" }]}>
        {value}
        {!!unit && <Text style={[styles.tileUnit, dark && { color: colors.primaryFixedDim }]}> {unit}</Text>}
      </Text>
      {children}
    </View>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <Text style={styles.errorText}>{children}</Text>;
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },
  empty: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  emptyText: { ...type.bodyMd, color: colors.onSurfaceVariant, flex: 1 },

  disabled: { opacity: 0.55 },
  compact: { paddingVertical: 6, paddingHorizontal: 12 },
  compactText: { fontSize: 13 },
  danger: { backgroundColor: "rgba(255, 218, 214, 0.55)", borderColor: "rgba(186, 26, 26, 0.18)" },
  iconButton: { padding: 8, borderRadius: 9999 },

  segmented: {
    ...glass.subtle,
    flexDirection: "row", alignSelf: "flex-start", gap: 4,
    borderRadius: 9999, padding: 4,
  },
  segment: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 9999, borderWidth: 1, borderColor: "transparent",
  },
  segmentText: { fontFamily: fonts.label, fontSize: 13 },

  field: { gap: 6 },
  fieldLabel: { ...type.labelSm, color: colors.onSurfaceVariant },

  scrim: { flex: 1, backgroundColor: glass.scrim, justifyContent: "flex-end" },
  sheet: {
    ...glass.strong,
    backgroundColor: "rgba(248, 250, 255, 0.96)",
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: glass.divider,
  },
  sheetTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },
  sheetBody: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },

  tile: { padding: spacing.sm + 2, gap: spacing.xs, flex: 1, minWidth: 140 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 },
  tileLabel: { ...type.dataLabel, fontSize: 12, textTransform: "uppercase", color: colors.outline, flex: 1 },
  tileValue: { ...type.headlineMd, color: colors.onSurface },
  tileUnit: { ...type.bodyMd, fontSize: 14, color: colors.outline },

  errorText: { ...type.labelSm, fontSize: 13, color: colors.error },
});
