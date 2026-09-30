import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";
import { colors, glass, type } from "../theme";
import { useLanguage } from "../context/LanguageContext";

/** Picks a time without the keyboard: steppers for the hour and for the
 * minutes (by quarter hour), around a large HH:MM readout. Typing
 * "22:00" on a phone keyboard, with its validation error, was the slowest
 * part of creating a schedule. Works the same on iOS, Android and web.
 *
 * `value` and `onChange` use "HH:MM". */
export default function TimeField({ label, value, onChange }) {
  const { t } = useLanguage();
  const [h, m] = (value || "00:00").split(":").map(Number);

  const set = (hours, minutes) => {
    const total = (((hours * 60 + minutes) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    onChange(`${hh}:${mm}`);
  };
  // Minutes step to the next quarter, so 22:07 goes to 22:15, not 22:22.
  const nextQuarter = (dir) => {
    const snapped = dir > 0 ? Math.floor(m / 15) * 15 + 15 : Math.ceil(m / 15) * 15 - 15;
    set(h, snapped);
  };

  const Step = ({ icon, onPress, a11y }) => (
    <TouchableOpacity
      onPress={onPress}
      style={styles.step}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      activeOpacity={0.6}
    >
      <Icon name={icon} size={22} color={colors.secondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[glass.subtle, styles.box]}
        accessible={false}
      >
        <View style={styles.column}>
          <Step icon="expand_less" onPress={() => set(h + 1, m)} a11y={t("time.hourUp", { label })} />
          <Step icon="expand_more" onPress={() => set(h - 1, m)} a11y={t("time.hourDown", { label })} />
        </View>
        <Text style={styles.value} accessibilityLabel={`${label} ${value}`}>{value}</Text>
        <View style={styles.column}>
          <Step icon="expand_less" onPress={() => nextQuarter(1)} a11y={t("time.minUp", { label })} />
          <Step icon="expand_more" onPress={() => nextQuarter(-1)} a11y={t("time.minDown", { label })} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 6 },
  label: { ...type.labelSm, color: colors.onSurfaceVariant },
  box: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 16, paddingHorizontal: 4, paddingVertical: 4, overflow: "hidden",
  },
  column: { gap: 2 },
  step: { width: 44, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  value: { ...type.dataLabel, fontSize: 22, lineHeight: 28, color: colors.onSurface },
});
