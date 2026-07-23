import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

import { api, setLogoutHandler } from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import DevicesScreen from "./src/screens/DevicesScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import HomeSwitcher from "./src/components/HomeSwitcher";

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
  const [homes, setHomes] = useState(null); // null = not loaded yet
  const [activeHomeId, setActiveHomeId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Load any persisted session on first launch.
  useEffect(() => {
    (async () => {
      const [storedToken, storedUser, storedHomeId] = await AsyncStorage.multiGet([
        "token", "user", "activeHomeId",
      ]).then((pairs) => pairs.map(([, v]) => v));
      if (storedToken) setToken(storedToken);
      if (storedUser) setUser(JSON.parse(storedUser));
      if (storedHomeId) setActiveHomeId(Number(storedHomeId));
      setBootstrapping(false);
    })();
  }, []);

  const fetchHomes = async () => {
    try {
      const res = await api.get("/homes");
      setHomes(res.data);
      setActiveHomeId((prev) => {
        const stillValid = res.data.some((h) => h.id === prev);
        const next = stillValid ? prev : (res.data[0]?.id ?? null);
        if (next) AsyncStorage.setItem("activeHomeId", String(next));
        return next;
      });
    } catch (err) {
      if (err.response?.status !== 401) {
        setHomes([]);
      }
      // 401 is handled by the api.js interceptor (forces logout)
    }
  };

  useEffect(() => {
    if (token) fetchHomes();
  }, [token]);

  const handleAuthSuccess = async (newToken, userData) => {
    await AsyncStorage.setItem("token", newToken);
    await AsyncStorage.setItem("user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "user", "activeHomeId"]);
    setToken(null);
    setUser(null);
    setHomes(null);
    setActiveHomeId(null);
    setAuthView("login");
    setActiveTab("dashboard");
  };

  // Keep the api.js interceptor pointed at this render's handleLogout.
  useEffect(() => {
    setLogoutHandler(handleLogout);
  });

  const handleSwitchHome = async (homeId) => {
    await AsyncStorage.setItem("activeHomeId", String(homeId));
    setActiveHomeId(homeId);
  };

  let content;

  if (bootstrapping) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  } else if (!token) {
    content = authView === "signup" ? (
      <SignupScreen onSignupSuccess={handleAuthSuccess} onBackToLogin={() => setAuthView("login")} />
    ) : (
      <LoginScreen onLogin={handleAuthSuccess} onGoToSignup={() => setAuthView("signup")} />
    );
  } else if (homes === null) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  } else if (homes.length === 0) {
    content = <OnboardingScreen onComplete={fetchHomes} />;
  } else {
    content = (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <HomeSwitcher
            homes={homes}
            activeHomeId={activeHomeId}
            onSwitchHome={handleSwitchHome}
            onHomesChanged={fetchHomes}
          />
        </View>

        <View style={styles.content}>
          {activeTab === "dashboard" && <DashboardScreen homeId={activeHomeId} user={user} />}
          {activeTab === "devices" && <DevicesScreen homeId={activeHomeId} />}
          {activeTab === "profile" && <ProfileScreen user={user} onLogout={handleLogout} />}
        </View>

        <View style={styles.tabBar}>
          {[
            { id: "dashboard", icon: "⚡", label: "Dashboard" },
            { id: "devices", icon: "🔌", label: "Devices" },
            { id: "profile", icon: "👤", label: "Profile" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[
                styles.tabLabel,
                { color: activeTab === tab.id ? "#3b82f6" : "#94a3b8" },
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#f8fafc", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row", alignItems: "center", minHeight: 64,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
    paddingVertical: 8,
  },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
    paddingBottom: 8,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 4 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, fontWeight: "600" },
});
