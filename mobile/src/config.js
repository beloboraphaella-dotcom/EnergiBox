import Constants from "expo-constants";

// When running via `expo start`, Constants exposes the dev server's host
// (e.g. "192.168.1.42:8081") — reuse that IP so the phone can always reach
// the backend on the same LAN without editing this file by hand. Falls back
// to a hardcoded IP for standalone/production builds where hostUri isn't set.
function resolveApiBase() {
  const hostUri =
    Constants.expoConfig?.hostUri || Constants.expoGoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }
  return "http://192.168.1.121:8000"; // fallback — update to your machine's LAN IP
}

export const API_BASE = resolveApiBase();
