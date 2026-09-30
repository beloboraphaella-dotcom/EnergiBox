import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

/** Alert notifications on the phone, through Expo's push service.
 *
 * The phone asks for permission, gets its Expo push token and hands it to
 * the backend (POST /push/register), which pushes each new alert in the
 * phone's language (backend/push.py). Turning the setting off, or signing
 * out, withdraws the token.
 *
 * Needs a real phone and a development or store build: Expo Go stopped
 * delivering remote notifications on Android in SDK 53, simulators get no
 * token, and the token is tied to the EAS project id in app.json
 * (extra.eas.projectId), which `eas init` fills in. Browsers are left
 * out; the web app has its own background-tab notifications. */

const KEY = "pushToken";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function pushSupported() {
  return Platform.OS !== "web" && Device.isDevice;
}

/** Resolves to "granted", "denied" or "unavailable". */
export async function enablePush(language) {
  if (!pushSupported()) return "unavailable";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return "denied";
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post("/push/register", { token, platform: Platform.OS, language });
    await AsyncStorage.setItem(KEY, token);
    return "granted";
  } catch {
    return "unavailable";
  }
}

export async function disablePush() {
  const token = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!token) return;
  await AsyncStorage.removeItem(KEY).catch(() => {});
  await api.delete(`/push/register?token=${encodeURIComponent(token)}`).catch(() => {});
}

export async function pushEnabled() {
  return !!(await AsyncStorage.getItem(KEY).catch(() => null));
}

/** Re-send the token after sign-in or a language change, so alerts reach
 * the account now using the phone, in the language it now shows. */
export async function refreshPush(language) {
  if (await pushEnabled()) await enablePush(language);
}
