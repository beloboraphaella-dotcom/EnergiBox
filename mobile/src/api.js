import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";
import { isConnectivityError, reportFailure, reportOk } from "./live/connection";

export const api = axios.create({ baseURL: API_BASE });

// Registered once, at module load — mirrors the web app's interceptor.
// A 401 from any endpoint means the token expired or is invalid; force a
// clean logout instead of letting each screen guess why its request failed.
// `logoutHandler` is swapped for the real one by App() once it mounts.
export let logoutHandler = async () => {
  await AsyncStorage.multiRemove(["token", "user", "activeHomeId"]);
};

export function setLogoutHandler(fn) {
  logoutHandler = fn;
}

api.interceptors.request.use(async (config) => {
  const [[, token], [, language]] = await AsyncStorage.multiGet(["token", "language"]);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // The API returns alerts, suggestions and reports in this language.
  config.headers["Accept-Language"] = language === "fr" ? "fr" : "en";
  return config;
});

api.interceptors.response.use(
  (response) => {
    reportOk();
    return response;
  },
  async (error) => {
    // Feeds the "connection lost" banner; see live/connection.js.
    if (isConnectivityError(error)) reportFailure();
    else reportOk();
    if (error.response?.status === 401) {
      await logoutHandler();
    }
    return Promise.reject(error);
  }
);
