import { Alert, Platform } from "react-native";

/** A yes/no question, resolved to a boolean.
 *
 * Alert.alert on phones. react-native-web implements Alert as a no-op, so
 * in a browser the question would never be asked and the action never
 * run; there the browser's own dialog stands in. */
export function confirm(message, { confirmLabel, cancelLabel, destructive = true } = {}) {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("EnergiBox", message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** A message with a single OK. */
export function notify(message) {
  if (Platform.OS === "web") {
    window.alert(message);
    return;
  }
  Alert.alert("EnergiBox", message);
}
