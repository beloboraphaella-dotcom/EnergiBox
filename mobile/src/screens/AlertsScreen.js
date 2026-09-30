import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { colors, spacing, type, glass } from "../theme";
import { Chip, EmptyCard, Orb } from "../components/GlassUI";

// One tone per alert type, matching the web's alert list.
const TONES = {
  spike: { icon: "warning", tone: "red", color: colors.error, orb: "rgba(255, 218, 214, 0.75)" },
  extended_runtime: { icon: "timer", tone: "amber", color: colors.onTertiaryFixedVariant, orb: "rgba(255, 221, 184, 0.75)" },
  idle_waste: { icon: "nights_stay", tone: "indigo", color: colors.onPrimaryFixedVariant, orb: null },
};

export default function AlertsScreen({ homeId }) {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await api.get(`/alerts?home_id=${homeId}`);
      setAlerts(res.data);
    } catch (err) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAlerts();
    setRefreshing(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <Text style={styles.title}>{t("shell.alerts")}</Text>
      {alerts.length === 0 ? (
        <EmptyCard icon="check_circle">{t("alerts.none")}</EmptyCard>
      ) : (
        alerts.map((a, i) => {
          const tone = TONES[a.type] || TONES.idle_waste;
          return (
            <View key={i} style={[glass.card, styles.card]}>
              <Orb icon={tone.icon} color={tone.color} background={tone.orb} size={40} />
              <View style={styles.body}>
                <View style={styles.cardTop}>
                  <Text style={styles.appliance} numberOfLines={1}>{a.appliance}</Text>
                  <Chip tone={tone.tone}>{t(`detail.alert.${a.type}`)}</Chip>
                </View>
                <Text style={styles.message}>{a.message}</Text>
                <Text style={styles.time}>{a.created_at}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface, marginBottom: spacing.xs },
  card: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.sm },
  body: { flex: 1, gap: 4 },
  // Wraps rather than squeezes: French alert labels run long enough to
  // push the appliance name down to an ellipsis.
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  appliance: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, color: colors.onSurface, maxWidth: "100%" },
  message: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: colors.onSurfaceVariant },
  time: { ...type.dataLabel, fontSize: 11, color: colors.outline, marginTop: 2 },
});
