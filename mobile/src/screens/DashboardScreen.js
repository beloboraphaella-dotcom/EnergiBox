import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl
} from "react-native";
import { api } from "../api";

export default function DashboardScreen({ homeId, user }) {
  const [dashboard, setDashboard] = useState(null);
  const [overview, setOverview] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!homeId) return;
    try {
      const [dashRes, overviewRes] = await Promise.all([
        api.get(`/dashboard?home_id=${homeId}`),
        api.get(`/stats/overview?home_id=${homeId}`),
      ]);
      setDashboard(dashRes.data);
      setOverview(overviewRes.data);
    } catch (err) {}
  }, [homeId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  useEffect(() => {
    setDashboard(null);
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (!dashboard) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const totalKw = dashboard.appliances.reduce((sum, a) => sum + a.watts, 0) / 1000;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning," : hour < 18 ? "Good Afternoon," : "Good Evening,";

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.greetingName}>{user?.name?.split(" ")[0] || "User"}</Text>

      {/* Hero card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroLabel}>⚡ Current Consumption</Text>
            <Text style={styles.heroWatts}>{totalKw.toFixed(2)} <Text style={styles.heroUnit}>kW</Text></Text>
          </View>
          <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● Live</Text></View>
        </View>
        <View style={styles.heroDivider} />
        <Text style={styles.heroLabel}>📋 Estimated Bill</Text>
        <Text style={styles.heroBill}>{dashboard.bill.estimated_fcfa.toLocaleString()} FCFA</Text>
        <Text style={styles.heroMonth}>This Month</Text>
      </View>

      {/* Appliances */}
      <Text style={styles.sectionTitle}>Live Consumption</Text>
      {dashboard.appliances.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No devices yet</Text></View>
      ) : (
        dashboard.appliances.map((a, i) => (
          <View key={i} style={styles.appCard}>
            <View style={styles.appLeft}>
              <View style={styles.appIconWrap}><Text style={styles.appIcon}>🔌</Text></View>
              <View>
                <Text style={styles.appName}>{a.name}</Text>
                <Text style={styles.appTime}>{new Date(a.timestamp).toLocaleTimeString()}</Text>
              </View>
            </View>
            <View style={styles.appRight}>
              <Text style={styles.appWatts}>{a.watts.toFixed(1)}W</Text>
              <View style={[styles.statusBadge, { backgroundColor: a.watts > 10 ? "#dcfce7" : "#f1f5f9" }]}>
                <Text style={[styles.statusText, { color: a.watts > 10 ? "#16a34a" : "#94a3b8" }]}>
                  {a.watts > 10 ? "ON" : "OFF"}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* Bottom stats */}
      {overview && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.devices.total}</Text>
            <Text style={styles.statLabel}>Total Devices</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.devices.online}</Text>
            <Text style={styles.statLabel}>Online</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.devices.active_alerts}</Text>
            <Text style={styles.statLabel}>Alerts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.month.kwh} kWh</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loading: { color: "#94a3b8", fontSize: 16 },

  greeting: { fontSize: 14, color: "#94a3b8", marginBottom: 2 },
  greetingName: { fontSize: 26, fontWeight: "700", color: "#0f172a", marginBottom: 16 },

  heroCard: {
    backgroundColor: "#3b82f6", borderRadius: 20, padding: 20, marginBottom: 20,
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 6 },
  heroWatts: { fontSize: 30, fontWeight: "700", color: "#fff" },
  heroUnit: { fontSize: 16, fontWeight: "400" },
  liveBadge: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  liveBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 16 },
  heroBill: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 2 },
  heroMonth: { fontSize: 12, color: "rgba(255,255,255,0.7)" },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 12 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#94a3b8" },

  appCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  appLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  appIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center" },
  appIcon: { fontSize: 20 },
  appName: { fontSize: 15, fontWeight: "600", color: "#0f172a", marginBottom: 2 },
  appTime: { fontSize: 11, color: "#cbd5e1" },
  appRight: { alignItems: "flex-end", gap: 6 },
  appWatts: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, marginBottom: 24 },
  statCard: { flexBasis: "47%", backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  statLabel: { fontSize: 11, color: "#94a3b8" },
});
