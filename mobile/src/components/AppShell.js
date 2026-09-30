import React, { useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurTargetView, BlurView } from "expo-blur";
import Icon from "./Icon";
import GlassBackdrop from "./GlassBackdrop";
import { colors, spacing, type, glass } from "../theme";
import { useLanguage } from "../context/LanguageContext";
import { usePreferences } from "../context/PreferencesContext";
import ConnectionBanner from "./ConnectionBanner";

/** The app's chrome, in glass: a floating top bar and a floating tab bar
 * over the ambient backdrop, both genuinely blurred because content
 * scrolls beneath them.
 *
 * The mockups show four tabs; the app has more screens than that, so —
 * exactly as on the web — the first three keep their place and the rest
 * move behind a "More" sheet instead of becoming unreachable.
 *
 * Android blurs only what sits inside a BlurTargetView, so the backdrop
 * and the screen content live in one, and the bars read it through
 * `blurTarget`. `dimezisBlurViewSdk31Plus` blurs on Android 12 and later
 * and falls back to the translucent fill below that, where a live blur
 * would cost frames on every scroll. */
const BLUR = {
  intensity: 60,
  tint: "systemChromeMaterialLight",
  blurMethod: "dimezisBlurViewSdk31Plus",
};

// Height of the floating tab bar and the gap under it; screens pad their
// scroll content by this much so the last card clears the bar.
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 12;

export default function AppShell({
  items,
  footerItems = [],
  active,
  onNavigate,
  headerRight,
  children,
}) {
  const { t } = useLanguage();
  const { reduceTransparency } = usePreferences();
  const insets = useSafeAreaInsets();
  // Opaque bars when the user asked for less transparency.
  const Bar = reduceTransparency ? OpaqueBar : BlurView;
  const blurTarget = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = items.slice(0, 3);
  const overflow = [...items.slice(3), ...footerItems];
  const overflowActive = overflow.some((i) => i.key === active);

  const go = (key) => {
    setMoreOpen(false);
    onNavigate?.(key);
  };

  const Tab = ({ item, isActive, iconName, label }) => (
    <TouchableOpacity
      key={item?.key ?? label}
      onPress={() => (item ? go(item.key) : setMoreOpen((v) => !v))}
      activeOpacity={0.7}
      style={[styles.tab, isActive && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive, expanded: item ? undefined : moreOpen }}
      accessibilityLabel={label}
    >
      <Icon name={iconName} size={24} color={isActive ? colors.secondary : colors.onSurfaceVariant} />
      <Text
        style={[styles.tabLabel, { color: isActive ? colors.secondary : colors.onSurfaceVariant }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
        <GlassBackdrop />
        <SafeAreaView style={styles.content} edges={["top"]}>
          {/* Room for the floating top bar */}
          <View style={{ height: HEADER_HEIGHT + spacing.xs }} />
          <View style={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + TAB_BAR_GAP + insets.bottom }]}>
            <ConnectionBanner />
            {children}
          </View>
        </SafeAreaView>
      </BlurTargetView>

      {/* TopAppBar */}
      <View style={[styles.headerWrap, { top: insets.top + spacing.xs }]}>
        <Bar {...BLUR} blurTarget={blurTarget} style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandOrb}>
              <Icon name="bolt" size={18} color={colors.onSecondaryFixed} />
            </View>
            <Text style={styles.brand}>EnergiBox</Text>
          </View>
          <View style={styles.headerRight}>{headerRight}</View>
        </Bar>
      </View>

      {/* "More" sheet */}
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoreOpen(false)}>
          <Pressable
            style={[styles.sheetWrap, { marginBottom: TAB_BAR_HEIGHT + TAB_BAR_GAP * 2 + insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Bar {...BLUR} style={styles.sheet}>
              {overflow.map((item) => {
                const isActive = item.key === active;
                const tint = isActive ? colors.secondary : item.danger ? colors.error : colors.onSurfaceVariant;
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => go(item.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={[styles.sheetRow, isActive && styles.sheetRowActive]}
                  >
                    <Icon name={item.icon} size={24} color={tint} />
                    <Text style={[styles.sheetLabel, { color: tint }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Bar>
          </Pressable>
        </Pressable>
      </Modal>

      {/* BottomNavBar */}
      <View style={[styles.tabBarWrap, { bottom: TAB_BAR_GAP + insets.bottom }]}>
        <Bar {...BLUR} blurTarget={blurTarget} style={styles.tabBar}>
          {primary.map((item) => (
            <Tab key={item.key} item={item} isActive={item.key === active} iconName={item.icon} label={item.label} />
          ))}
          {overflow.length > 0 && (
            <Tab
              item={null}
              isActive={overflowActive || moreOpen}
              iconName="more_horiz"
              label={overflow.find((i) => i.key === active)?.label ?? t("shell.more")}
            />
          )}
        </Bar>
      </View>
    </View>
  );
}

/** Stands in for BlurView when transparency is reduced: same layout, a
 * solid white fill instead of the blur. */
function OpaqueBar({ style, children }) {
  return <View style={[style, { backgroundColor: "#ffffff" }]}>{children}</View>;
}

const HEADER_HEIGHT = 56;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },

  headerWrap: {
    ...glass.strong,
    position: "absolute",
    left: spacing.sm - 4,
    right: spacing.sm - 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm - 2,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondaryFixedDim,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
  },
  brand: { ...type.headlineMd, fontSize: 21, lineHeight: 28, color: colors.onSurface },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },

  tabBarWrap: {
    ...glass.strong,
    position: "absolute",
    left: spacing.sm - 4,
    right: spacing.sm - 4,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  tabBar: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: 16,
    minWidth: 64,
  },
  tabActive: {
    ...glass.pillActive,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  tabLabel: { ...type.labelSm, fontSize: 10, marginTop: 2 },

  scrim: { flex: 1, backgroundColor: glass.scrim, justifyContent: "flex-end" },
  sheetWrap: {
    ...glass.strong,
    marginHorizontal: spacing.sm - 4,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  sheet: { paddingVertical: 6 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 14,
    marginHorizontal: 6,
    borderRadius: 14,
  },
  sheetRowActive: { backgroundColor: "rgba(255, 255, 255, 0.85)" },
  sheetLabel: { ...type.labelSm, fontSize: 14 },
});
