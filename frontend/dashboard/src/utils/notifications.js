/** Browser notifications for new alerts while the tab is in the
 * background. There is no service worker, so nothing arrives once the tab
 * is closed; phones get real push notifications through the mobile app.
 *
 * Opt-in from Settings: the browser only lets a page ask for permission
 * in answer to a click. */

const PREF_KEY = "alertNotifications";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled() {
  try {
    return (
      notificationsSupported() &&
      Notification.permission === "granted" &&
      localStorage.getItem(PREF_KEY) === "on"
    );
  } catch {
    return false;
  }
}

/** Ask for permission (from a click) and remember the choice. Resolves to
 * "granted", "denied" or "unsupported". */
export async function enableNotifications() {
  if (!notificationsSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  try {
    localStorage.setItem(PREF_KEY, permission === "granted" ? "on" : "off");
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  return permission;
}

export function disableNotifications() {
  try {
    localStorage.setItem(PREF_KEY, "off");
  } catch {
    // Nothing to forget.
  }
}

/** Show a notification per new alert if the tab is hidden and the user
 * opted in. Returns whether it did, so the caller can fall back to an
 * in-app message. */
export function notifyNewAlerts(alerts, t) {
  if (!document.hidden || !notificationsEnabled()) return false;
  alerts.forEach((alert) => {
    new Notification(t(`detail.alert.${alert.type}`), {
      body: t("notif.body", { appliance: alert.appliance }),
      tag: `alert-${alert.id}`,
    });
  });
  return true;
}
