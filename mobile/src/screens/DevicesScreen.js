import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Switch, ActivityIndicator
} from "react-native";
import { api } from "../api";

function getIcon(name = "", type = "appliance") {
  if (type === "socket") return "🔌";
  const n = name.toLowerCase();
  if (n.includes("ac") || n.includes("air")) return "❄️";
  if (n.includes("fridge") || n.includes("refrigerator")) return "🧊";
  if (n.includes("wash")) return "🧺";
  if (n.includes("light") || n.includes("lamp") || n.includes("bulb")) return "💡";
  if (n.includes("tv") || n.includes("television")) return "📺";
  if (n.includes("charger") || n.includes("ev")) return "🔌";
  if (n.includes("battery")) return "🔋";
  if (n.includes("water") || n.includes("heater")) return "🚿";
  if (n.includes("microwave") || n.includes("oven")) return "🍽️";
  if (n.includes("coffee")) return "☕";
  if (n.includes("fan")) return "🌀";
  return "📦";
}

export default function DevicesScreen({ homeId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedMac, setSelectedMac] = useState(null);

  const fetchDevices = useCallback(async () => {
    if (!homeId) return;
    try {
      const res = await api.get(`/devices?home_id=${homeId}`);
      setDevices(res.data);
    } catch (err) {}
    setLoading(false);
  }, [homeId]);

  useEffect(() => {
    setLoading(true);
    fetchDevices();
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  };

  const toggleDevice = async (d) => {
    try {
      await api.post(`/control/${d.mac}?command=${d.is_on ? "OFF" : "ON"}`);
      setTimeout(fetchDevices, 500);
    } catch (err) {}
  };

  if (selectedMac) {
    return (
      <DeviceDetail
        mac={selectedMac}
        homeId={homeId}
        onBack={() => { setSelectedMac(null); fetchDevices(); }}
      />
    );
  }

  const filtered = devices.filter((d) => {
    if (filter === "online") return d.status === "online";
    if (filter === "offline") return d.status !== "online";
    return true;
  });
  const totalKw = devices.reduce((sum, d) => sum + (d.watts || 0), 0) / 1000;

  return (
    <View style={styles.page}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Devices</Text>
        <Text style={styles.pageSub}>Power Use: <Text style={styles.pageSubBold}>{totalKw.toFixed(2)} kW</Text></Text>
      </View>

      <View style={styles.filterRow}>
        {[
          { id: "all", label: `All (${devices.length})` },
          { id: "online", label: "Online" },
          { id: "offline", label: "Offline" },
        ].map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterBtn, filter === f.id && styles.filterBtnActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterBtnText, filter === f.id && styles.filterBtnTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>Loading devices...</Text></View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No devices in this view</Text></View>
        ) : (
          filtered.map((d) => (
            <TouchableOpacity key={d.mac} style={styles.deviceRow} onPress={() => setSelectedMac(d.mac)}>
              <View style={styles.deviceIconBox}><Text style={styles.deviceIcon}>{getIcon(d.name, d.type)}</Text></View>
              <View style={styles.deviceInfo}>
                <View style={styles.deviceNameRow}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <View style={styles.typeTag}><Text style={styles.typeTagText}>{d.type === "socket" ? "Socket" : "Appliance"}</Text></View>
                </View>
                <Text style={styles.deviceRoom}>{d.room}</Text>
                <Text style={[styles.deviceStatus, { color: d.status === "online" ? "#16a34a" : "#ef4444" }]}>
                  {d.status === "online" ? "Online" : "Offline"}
                </Text>
              </View>
              <View style={styles.deviceRight}>
                <Text style={styles.deviceKw}>{(d.watts / 1000).toFixed(2)} kW</Text>
                <Switch
                  value={d.is_on}
                  onValueChange={() => toggleDevice(d)}
                  trackColor={{ false: "#e2e8f0", true: "#bfdbfe" }}
                  thumbColor={d.is_on ? "#3b82f6" : "#f4f3f4"}
                />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function DeviceDetail({ mac, homeId, onBack }) {
  const [device, setDevice] = useState(null);
  const [toggling, setToggling] = useState(false);

  const fetchDevice = useCallback(async () => {
    try {
      const res = await api.get(`/devices/${mac}`);
      setDevice(res.data);
    } catch (err) {}
  }, [mac]);

  useEffect(() => {
    fetchDevice();
    const interval = setInterval(fetchDevice, 3000);
    return () => clearInterval(interval);
  }, [fetchDevice]);

  const togglePower = async () => {
    setToggling(true);
    try {
      await api.post(`/control/${mac}?command=${device.is_on ? "OFF" : "ON"}`);
      setTimeout(fetchDevice, 500);
    } catch (err) {}
    setToggling(false);
  };

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>‹ Back to Devices</Text></TouchableOpacity>

      <View style={styles.detailHeader}>
        <Text style={styles.detailIcon}>{getIcon(device.name, device.type)}</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.deviceNameRow}>
            <Text style={styles.detailName}>{device.name}</Text>
            <View style={styles.typeTag}><Text style={styles.typeTagText}>{device.type === "socket" ? "Socket" : "Appliance"}</Text></View>
          </View>
          <Text style={styles.detailRoom}>📍 {device.room}</Text>
        </View>
      </View>

      <View style={styles.powerCard}>
        <View>
          <Text style={styles.powerLabel}>Current Power</Text>
          <Text style={styles.powerWatts}>{device.watts} <Text style={styles.powerUnit}>W</Text></Text>
        </View>
        <Switch
          value={device.is_on}
          onValueChange={togglePower}
          disabled={toggling}
          trackColor={{ false: "rgba(255,255,255,0.3)", true: "rgba(255,255,255,0.5)" }}
          thumbColor="#fff"
        />
      </View>

      <Text style={styles.sectionLabel}>RUNTIME</Text>
      <View style={styles.runtimeRow}>
        <View style={styles.runtimeCard}>
          <Text style={styles.runtimeLabel}>Today</Text>
          <Text style={styles.runtimeValue}>{device.runtime.today_hours}h</Text>
        </View>
        <View style={styles.runtimeCard}>
          <Text style={styles.runtimeLabel}>7 Days</Text>
          <Text style={styles.runtimeValue}>{device.runtime.past_7_days_hours}h</Text>
        </View>
        <View style={styles.runtimeCard}>
          <Text style={styles.runtimeLabel}>30 Days</Text>
          <Text style={styles.runtimeValue}>{device.runtime.past_30_days_hours}h</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>DEVICE INFO</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>MAC Address</Text><Text style={styles.infoValue}>{device.mac}</Text></View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.infoLabel}>Last Seen</Text><Text style={styles.infoValue}>{device.last_seen || "—"}</Text></View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  pageHeader: { padding: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  pageSub: { fontSize: 13, color: "#64748b" },
  pageSubBold: { fontWeight: "700", color: "#3b82f6" },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "#f1f5f9" },
  filterBtnActive: { backgroundColor: "#3b82f6" },
  filterBtnText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  filterBtnTextActive: { color: "#fff" },

  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center" },
  emptyText: { color: "#94a3b8" },

  deviceRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
  },
  deviceIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center" },
  deviceIcon: { fontSize: 20 },
  deviceInfo: { flex: 1 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  deviceName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  deviceRoom: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  deviceStatus: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  deviceRight: { alignItems: "flex-end", gap: 6 },
  deviceKw: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  typeTag: { backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  typeTagText: { fontSize: 9, fontWeight: "700", color: "#3b82f6", textTransform: "uppercase" },

  backBtn: { color: "#3b82f6", fontSize: 14, fontWeight: "600", marginBottom: 16 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  detailIcon: { fontSize: 36 },
  detailName: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  detailRoom: { fontSize: 13, color: "#94a3b8", marginTop: 2 },

  powerCard: {
    backgroundColor: "#3b82f6", borderRadius: 18, padding: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20,
  },
  powerLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  powerWatts: { fontSize: 28, fontWeight: "700", color: "#fff" },
  powerUnit: { fontSize: 14, fontWeight: "400" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5, marginBottom: 10 },
  runtimeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  runtimeCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center" },
  runtimeLabel: { fontSize: 11, color: "#94a3b8", marginBottom: 4 },
  runtimeValue: { fontSize: 16, fontWeight: "700", color: "#0f172a" },

  card: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  infoLabel: { fontSize: 13, color: "#94a3b8" },
  infoValue: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
});
