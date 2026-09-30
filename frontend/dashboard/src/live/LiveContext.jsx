import { createContext, useContext, useEffect, useRef, useState } from "react";
import { WS_URL } from "../config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { notifyNewAlerts } from "../utils/notifications";

/** One socket per signed-in home that says when something changed, so the
 * screens refetch then instead of polling every two or three seconds.
 * See backend/live.py for the protocol.
 *
 * The socket is closed while the tab is hidden and reopened when it comes
 * back; screens refetch on that return too (useLiveRefresh). When the
 * socket is down, screens fall back to polling at their old pace. */

const LiveContext = createContext(null);

// While the socket is up, a slow poll still runs as a safety net.
const SAFETY_INTERVAL = 30000;
// Coalesce bursts: several devices reporting in the same tick is one refetch.
const COALESCE_MS = 400;

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
      if (message.new_alerts?.length) {
        const shown = notifyNewAlerts(message.new_alerts, tRef.current);
        if (!shown) {
          const first = message.new_alerts[0];
          toastRef.current.show(
            `${tRef.current(`detail.alert.${first.type}`)} — ${first.appliance}`,
            { tone: "alert", icon: "notifications_active" }
          );
        }
      }
    };

    const connect = () => {
      if (stopped || document.hidden) return;
      socket = new WebSocket(WS_URL);
      socket.onopen = () => socket.send(JSON.stringify({ token, home_id: homeId }));
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
        // 4401/4403: the token or account was refused; polling takes over
        // and the next HTTP request will sign the user out if needed.
        if (stopped || event.code === 4401 || event.code === 4403) return;
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
      };
    };

    const onVisibility = () => {
      if (document.hidden) {
        socket?.close();
      } else if (!socket) {
        clearTimeout(timer);
        retry = 0;
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      socket?.close();
    };
  }, [token, homeId]);

  const subscribe = (topics, notify) => {
    const sub = { topics, notify };
    subscribers.current.add(sub);
    return () => subscribers.current.delete(sub);
  };

  return (
    <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}

/** Keep a screen fresh: refetch when the socket reports a change to one of
 * `topics`, when the tab becomes visible again, and on a poll — every
 * `interval` ms while the socket is down, every 30 s while it is up. No
 * poll runs while the tab is hidden. The first fetch stays with the
 * screen's own effect. */
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
      if (!document.hidden) fnRef.current();
    };
    const soon = () => {
      clearTimeout(pending);
      pending = setTimeout(run, COALESCE_MS);
    };
    const id = setInterval(run, connected ? SAFETY_INTERVAL : interval);
    const onVisibility = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = subscribe?.(topicKey.split(","), soon);
    return () => {
      clearInterval(id);
      clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe?.();
    };
    // subscribe is recreated each render but always closes over the same ref.
  }, [connected, interval, enabled, topicKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
