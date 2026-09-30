import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { colors, glass, spacing, type } from "../theme";
import { useLanguage } from "../context/LanguageContext";
import { getConnection, subscribeConnection } from "../live/connection";

/** Shown while the API is unreachable, so figures on screen are not taken
 * for live ones. Requests keep retrying; the banner leaves with the first
 * success. */
export default function ConnectionBanner() {
  const { t, locale } = useLanguage();
  const [connection, setConnection] = useState(getConnection);

  useEffect(() => subscribeConnection(setConnection), []);

  if (connection.online) return null;
  const time = new Date(connection.lastOk).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <View accessibilityRole="alert" style={[glass.strong, styles.banner]}>
      <Icon name="cloud_off" size={22} color="#b45309" />
      <View style={styles.flex}>
        <Text style={styles.title}>{t("conn.lost")}</Text>
        <Text style={styles.body}>{t("conn.lastData", { time })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    marginHorizontal: spacing.marginMobile, marginBottom: spacing.xs,
    padding: 12, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: "#e0930b", overflow: "hidden",
  },
  flex: { flex: 1 },
  title: { ...type.labelSm, color: colors.onSurface },
  body: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: colors.onSurfaceVariant },
});
