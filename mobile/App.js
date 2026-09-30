import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk/600SemiBold";
import { HankenGrotesk_700Bold } from "@expo-google-fonts/hanken-grotesk/700Bold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";

import { api, setLogoutHandler } from "./src/api";
import { colors } from "./src/theme";
import { LanguageProvider, useLanguage } from "./src/context/LanguageContext";
import AppShell from "./src/components/AppShell";
import Icon from "./src/components/Icon";
import GlassBackdrop from "./src/components/GlassBackdrop";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import DevicesScreen from "./src/screens/DevicesScreen";
import AlertsScreen from "./src/screens/AlertsScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import RoomsScreen from "./src/screens/RoomsScreen";
import AdminScreen from "./src/screens/AdminScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import HomeSwitcher from "./src/components/HomeSwitcher";
import { ToastProvider } from "./src/components/Toast";
import { PreferencesProvider } from "./src/context/PreferencesContext";
import { LiveProvider } from "./src/live/LiveContext";
import { disablePush, refreshPush } from "./src/push";

export default function App() {
  // The language provider wraps everything, so a screen can call t()
  // wherever it is mounted — including the auth screens, which render
  // before there is a session at all.
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <PreferencesProvider>
          <ToastProvider>
            <AppInner />
          </ToastProvider>
        </PreferencesProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const { t, language } = useLanguage();

  // The mockups' typography is Hanken Grotesk / Inter / JetBrains Mono.
  // Nothing renders until they are resolved, otherwise every screen would
  // flash in the system font first.
  const [fontsLoaded] = useFonts({
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const [bootstrapping, setBootstrapping] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
  const [homes, setHomes] = useState(null); // null = not loaded yet
  const [activeHomeId, setActiveHomeId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [devicesOnline, setDevicesOnline] = useState(null);
  // A device to open on the Devices tab, from a card on the dashboard.
  const [deviceToOpen, setDeviceToOpen] = useState(null);

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

  const isAdmin = user?.role === "admin";

  // An admin account owns no home: fetching them would find none and send
  // the admin to onboarding. The web skips it for the same reason.
  useEffect(() => {
    if (token && !isAdmin) fetchHomes();
  }, [token, isAdmin]);

  const handleAuthSuccess = async (newToken, userData) => {
    await AsyncStorage.setItem("token", newToken);
    await AsyncStorage.setItem("user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  // Keep this phone's notification token on the signed-in account, in the
  // language the app now shows.
  useEffect(() => {
    if (token && !isAdmin) refreshPush(language);
  }, [token, isAdmin, language]);

  const handleLogout = async () => {
    // Withdraw the phone's notification token while the session still
    // authorises it, so the next person to sign in here gets no alerts
    // meant for this account.
    await disablePush();
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

  // The web's navigation, item for item (pages/Dashboard.jsx): the first
  // three keep a tab, the rest move behind "More".
  const navItems = isAdmin
    ? [
        { key: "admin", icon: "admin_panel_settings", label: t("shell.admin") },
        { key: "profile", icon: "settings", label: t("shell.settings") },
      ]
    : [
        { key: "dashboard", icon: "dashboard", label: t("shell.dashboard") },
        { key: "devices", icon: "devices", label: t("shell.devices") },
        { key: "alerts", icon: "notifications", label: t("shell.alerts") },
        { key: "history", icon: "monitoring", label: t("shell.history") },
        { key: "rooms", icon: "meeting_room", label: t("shell.rooms") },
        { key: "profile", icon: "settings", label: t("shell.settings") },
      ];
  const footerItems = [
    { key: "logout", icon: "logout", label: t("shell.logout"), danger: true },
  ];

  const handleNavigate = (key) => {
    if (key === "logout") return handleLogout();
    setDeviceToOpen(null);
    setActiveTab(key);
  };

  const openDevice = (mac) => {
    setDeviceToOpen(mac);
    setActiveTab("devices");
  };

  const spinner = (
    <View style={styles.loading}>
      <GlassBackdrop />
      <ActivityIndicator size="large" color={colors.secondary} />
    </View>
  );

  let content;

  if (!fontsLoaded || bootstrapping) {
    content = spinner;
  } else if (!token) {
    content = authView === "signup" ? (
      <SignupScreen onSignupSuccess={handleAuthSuccess} onBackToLogin={() => setAuthView("login")} />
    ) : (
      <LoginScreen onLogin={handleAuthSuccess} onGoToSignup={() => setAuthView("signup")} />
    );
  } else if (isAdmin) {
    content = (
      <AppShell
        items={navItems}
        footerItems={footerItems}
        active={activeTab === "profile" ? "profile" : "admin"}
        onNavigate={handleNavigate}
      >
        <StatusBar style="dark" />
        {activeTab === "profile" ? (
          <SettingsScreen
            user={user}
            homeId={null}
            onLogout={handleLogout}
            onUpdateUser={(updates) => setUser((prev) => ({ ...prev, ...updates }))}
          />
        ) : (
          <AdminScreen currentUserId={user?.id} />
        )}
      </AppShell>
    );
  } else if (homes === null) {
    content = spinner;
  } else if (homes.length === 0) {
    content = <OnboardingScreen onComplete={fetchHomes} />;
  } else {
    content = (
      <LiveProvider token={token} homeId={activeHomeId}>
      <AppShell
        items={navItems}
        footerItems={footerItems}
        active={activeTab}
        onNavigate={handleNavigate}
        headerRight={
          <>
            <HomeSwitcher
              homes={homes}
              activeHomeId={activeHomeId}
              onSwitchHome={handleSwitchHome}
              onHomesChanged={fetchHomes}
            />
            {/* A status, not a button: it used to look tappable and do
                nothing. Screen readers read the state. */}
            <View
              style={styles.wifiButton}
              accessible
              accessibilityLabel={devicesOnline ? t("overview.online") : t("overview.offline")}
            >
              <Icon
                name="wifi"
                size={22}
                color={devicesOnline ? colors.secondary : colors.outline}
              />
            </View>
          </>
        }
      >
        <StatusBar style="dark" />
        {activeTab === "dashboard" && (
          <DashboardScreen
            homeId={activeHomeId}
            onOpenDevices={() => handleNavigate("devices")}
            onOpenDevice={openDevice}
            onOnlineCount={setDevicesOnline}
          />
        )}
        {activeTab === "devices" && (
          <DevicesScreen homeId={activeHomeId} initialMac={deviceToOpen} key={deviceToOpen || "list"} />
        )}
        {activeTab === "alerts" && <AlertsScreen homeId={activeHomeId} />}
        {activeTab === "history" && <HistoryScreen homeId={activeHomeId} />}
        {activeTab === "rooms" && <RoomsScreen homeId={activeHomeId} />}
        {activeTab === "profile" && (
          <SettingsScreen
            user={user}
            homeId={activeHomeId}
            onLogout={handleLogout}
            onUpdateUser={(updates) => setUser((prev) => ({ ...prev, ...updates }))}
          />
        )}
      </AppShell>
      </LiveProvider>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  wifiButton: { padding: 6, borderRadius: 999 },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
