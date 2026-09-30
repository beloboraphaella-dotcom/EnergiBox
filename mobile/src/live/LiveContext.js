import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { API_BASE } from "../config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";

/** One socket per signed-in home that says when something changed, so the
 * screens refetch then instead of polling every few seconds — mirror of
 * the web app's live/LiveContext.jsx; see backend/live.py.
 *
 * The socket closes when the app goes to the background and reopens when
 * it comes back, and nothing polls in between: an app left open in a
 * pocket no longer spends battery and data refreshing a screen nobody
 * sees. Phone notifications cover alerts meanwhile (push.js). */

const LiveContext = createContext(null);
const WS_URL = `${API_BASE.replace(/^http/, "ws")}/ws/live`;
const SAFETY_INTERVAL = 30000;
const COALESCE_MS = 400;

const isForeground = () => AppState.currentState === "active" || AppState.currentState == null;

export function LiveProvider({ token, homeId, children }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const subscribers = useRef(new Set());
  const tRef = useRef(t);
  tRef.current = t;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!token || !homeId) return undefined;
    let socket = null;
    let retry = 0;
    let timer = null;
    let stopped = false;

    const dispatch = (message) => {
      const topics = message.topics || [];
      subscribers.current.forEach((sub) => {
        if (sub.topics.some((topic) => topics.includes(topic))) sub.notify();
      });
      const first = message.new_alerts?.[0];
      if (first) {
        toastRef.current.show(`${tRef.current(`detail.alert.${first.type}`)} — ${first.appliance}`, {
          tone: "alert",
        });
      }
    };

    const connect = () => {
      if (stopped || !isForeground()) return;
      socket = new WebSocket(WS_URL);
      socket.onopen = () => socket?.send(JSON.stringify({ token, home_id: homeId }));
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "ready") {
          retry = 0;
          setConnected(true);
        } else if (message.type === "changed") {
          dispatch(message);
        }
      };
      socket.onclose = (event) => {
        socket = null;
        setConnected(false);
        if (stopped || event.code === 4401 || event.code === 4403) return;
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
      };
      socket.onerror = () => {};
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!socket) {
          clearTimeout(timer);
          retry = 0;
          connect();
        }
      } else {
        socket?.close();
      }
    });

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      subscription.remove();
      socket?.close();
    };
  }, [token, homeId]);

  const subscribe = (topics, notify) => {
    const sub = { topics, notify };
    subscribers.current.add(sub);
    return () => subscribers.current.delete(sub);
  };

  return <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

/** Keep a screen fresh: refetch when the socket reports a change to one of
 * `topics`, when the app returns to the foreground, and on a poll —
 * every `interval` ms while the socket is down, every 30 s while it is
 * up, never in the background. The first fetch stays with the screen. */
export function useLiveRefresh(fetchFn, { topics = ["devices"], interval = 3000, enabled = true } = {}) {
  const live = useContext(LiveContext);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;
  const connected = !!live?.connected;
  const subscribe = live?.subscribe;
  const topicKey = topics.join(",");

  useEffect(() => {
    if (!enabled) return undefined;
    let pending = null;
    const run = () => {
      if (isForeground()) fnRef.current();
    };
    const soon = () => {
      clearTimeout(pending);
      pending = setTimeout(run, COALESCE_MS);
    };
    const id = setInterval(run, connected ? SAFETY_INTERVAL : interval);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    const unsubscribe = subscribe?.(topicKey.split(","), soon);
    return () => {
      clearInterval(id);
      clearTimeout(pending);
      appState.remove();
      unsubscribe?.();
    };
    // subscribe is recreated each render but always closes over the same ref.
  }, [connected, interval, enabled, topicKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
