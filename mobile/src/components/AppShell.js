import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "./Icon";
import { colors, spacing, radius, type } from "../theme";

/** The mockups' mobile chrome: a translucent top app bar and a bottom tab
 * bar with a pill-shaped active tab.
 *
 * The mockups show four tabs; the app has more screens than that, so —
 * exactly as on the web — the first three keep their place and the rest
 * move behind a "More" sheet instead of becoming unreachable.
 *
 * The web's `bg-surface/90 backdrop-blur-lg` has no RN equivalent. Both
 * bars sit on a flat background, so the translucent fill alone composites
 * to the same colour the blurred version would produce. */
export default function AppShell({
  items,
  footerItems = [],
  active,
  onNavigate,
  headerRight,
  children,
}) {
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
    >
      <Icon
        name={iconName}
        size={24}
        color={isActive ? colors.onSecondaryContainer : colors.onSurfaceVariant}
      />
      <Text
        style={[
          styles.tabLabel,
          { color: isActive ? colors.onSecondaryContainer : colors.onSurfaceVariant },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* TopAppBar */}
      <View style={styles.header}>
        <Text style={styles.brand}>EnergiBox</Text>
        <View style={styles.headerRight}>{headerRight}</View>
      </View>

      <View style={styles.content}>{children}</View>

      {/* "More" sheet */}
      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setMoreOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {overflow.map((item) => {
              const isActive = item.key === active;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => go(item.key)}
                  activeOpacity={0.7}
                  style={[styles.sheetRow, isActive && styles.sheetRowActive]}
                >
                  <Icon
                    name={item.icon}
                    size={24}
                    color={
                      isActive
                        ? colors.onSecondaryContainer
                        : item.danger
                          ? colors.error
                          : colors.onSurfaceVariant
                    }
                  />
                  <Text
                    style={[
                      styles.sheetLabel,
                      {
                        color: isActive
                          ? colors.onSecondaryContainer
                          : item.danger
                            ? colors.error
                            : colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* BottomNavBar */}
      <View style={styles.tabBar}>
        {primary.map((item) => (
          <Tab
            key={item.key}
            item={item}
            isActive={item.key === active}
            iconName={item.icon}
            label={item.label}
          />
        ))}
        {overflow.length > 0 && (
          <Tab
            item={null}
            isActive={overflowActive || moreOpen}
            iconName="more_horiz"
            label={
              overflow.find((i) => i.key === active)?.label ??
              (moreOpen ? "More" : "More")
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.marginMobile,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(248, 249, 255, 0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(198, 198, 205, 0.3)",
  },
  brand: { ...type.headlineMd, color: colors.onSurface },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  content: { flex: 1 },

  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 64,
    paddingHorizontal: spacing.xs,
    backgroundColor: "rgba(248, 249, 255, 0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(198, 198, 205, 0.3)",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.lg,
    minWidth: 64,
  },
  tabActive: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  tabLabel: { ...type.labelSm, fontSize: 10, marginTop: 4 },

  scrim: { flex: 1, backgroundColor: "rgba(11, 28, 48, 0.3)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.marginMobile,
    marginBottom: 80,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(198, 198, 205, 0.3)",
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 14,
  },
  sheetRowActive: { backgroundColor: colors.secondaryContainer },
  sheetLabel: { ...type.labelSm },
});
