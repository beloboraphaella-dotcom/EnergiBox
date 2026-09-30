import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "./Icon";
import GlassBackdrop from "./GlassBackdrop";
import { colors, spacing, type, fonts, glass } from "../theme";
import { useLanguage } from "../context/LanguageContext";

/** The frame shared by sign-in, sign-up and onboarding, as on the web
 * (frontend/dashboard/src/components/AuthLayout.jsx): the deep hero
 * backdrop, the brand mark, and one centred glass card. */
export default function AuthLayout({ title, subtitle, footer, children }) {
  const { t } = useLanguage();
  return (
    <View style={styles.root}>
      <GlassBackdrop variant="hero" />
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brandRow}>
              <View style={styles.brandOrb}>
                <Icon name="bolt" size={24} color={colors.onSecondaryFixed} />
              </View>
              <View>
                <Text style={styles.brand}>EnergiBox</Text>
                <Text style={styles.tagline}>{t("shell.tagline")}</Text>
              </View>
            </View>

            <View style={[glass.hero, styles.card]}>
              {!!title && <Text style={styles.title}>{title}</Text>}
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              <View style={(title || subtitle) && styles.body}>{children}</View>
            </View>

            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** A labelled field on the hero card. */
export function HeroField({ label, icon, secure = false, style, ...inputProps }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        {icon && (
          <View style={styles.inputIcon} pointerEvents="none">
            <Icon name={icon} size={20} color="rgba(255, 255, 255, 0.75)" />
          </View>
        )}
        <TextInput
          placeholderTextColor={glass.heroPlaceholder}
          secureTextEntry={secure && hidden}
          style={[glass.heroInput, styles.input, icon && styles.inputWithIcon, secure && styles.inputWithToggle, style]}
          {...inputProps}
        />
        {secure && (
          <TouchableOpacity
            style={styles.eye}
            onPress={() => setHidden((h) => !h)}
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
          >
            <Icon name={hidden ? "visibility" : "visibility_off"} size={20} color="rgba(255, 255, 255, 0.85)" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function HeroError({ children }) {
  if (!children) return null;
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Icon name="error" size={18} color={colors.errorContainer} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

export function HeroButton({ label, onPress, loading, disabled, icon, variant = "primary", style }) {
  const ghost = variant === "ghost";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        ghost ? styles.ghostButton : glass.primaryButton,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
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

/** "Don't have an account? Sign up" under the card. */
export function HeroLink({ prompt, action, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.link} activeOpacity={0.7}>
      <Text style={styles.linkText}>
        {prompt} <Text style={styles.linkBold}>{action}</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b4f55" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.md },

  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.md },
  brandOrb: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.secondaryFixedDim,
    borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.6)",
  },
  brand: { fontFamily: fonts.headlineBold, fontSize: 24, lineHeight: 30, color: "#ffffff" },
  tagline: { ...type.labelSm, color: "rgba(255, 255, 255, 0.7)" },

  card: { width: "100%", maxWidth: 420, padding: spacing.md },
  title: { ...type.headlineMd, color: "#ffffff", textAlign: "center" },
  subtitle: { ...type.bodyMd, color: "rgba(255, 255, 255, 0.78)", textAlign: "center", marginTop: 6 },
  body: { marginTop: spacing.md },

  field: { marginBottom: spacing.sm - 2 },
  label: {
    ...type.labelSm, color: "rgba(255, 255, 255, 0.8)",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6,
  },
  inputRow: { justifyContent: "center" },
  input: { ...type.bodyMd },
  inputWithIcon: { paddingLeft: 44 },
  inputWithToggle: { paddingRight: 44 },
  inputIcon: { position: "absolute", left: 14, zIndex: 1 },
  eye: { position: "absolute", right: 8, padding: 6 },

  error: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(186, 26, 26, 0.25)",
    borderWidth: 1, borderColor: "rgba(255, 218, 214, 0.4)",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: spacing.sm - 2,
  },
  errorText: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: "#ffffff", flex: 1 },

  ghostButton: {
    ...glass.ghostButton,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  disabled: { opacity: 0.55 },

  link: { marginTop: spacing.md, padding: 4 },
  linkText: { ...type.bodyMd, fontSize: 15, color: "rgba(255, 255, 255, 0.8)" },
  linkBold: { fontFamily: fonts.label, color: "#ffffff" },
});
