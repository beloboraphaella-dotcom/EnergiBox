import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";

// Minimal for now — Phase 3 will expand this with Manage Profile, Password,
// Notifications, Language and Theme, matching the web app's Profile page.
export default function ProfileScreen({ user, onLogout }) {
  const initials = (user?.name || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.pageTitle}>Profile</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View>
          <Text style={styles.name}>{user?.name || "User"}</Text>
          <Text style={styles.email}>{user?.email || ""}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>🚪 Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 16 },

  profileCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 24,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#3b82f6",
    justifyContent: "center", alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  name: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  email: { fontSize: 12, color: "#94a3b8" },

  logoutBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 16, alignItems: "center" },
  logoutText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
