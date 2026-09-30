import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** A light tap under the thumb when a switch flips, so the action is felt
 * before the relay has answered. Browsers have no haptics engine, and a
 * phone without one simply does nothing. */
export function tap() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A distinct buzz when a command failed. */
export function failure() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function success() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
