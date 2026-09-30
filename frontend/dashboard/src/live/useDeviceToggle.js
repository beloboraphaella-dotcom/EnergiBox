import { useCallback, useRef, useState } from "react";
import axios from "axios";
import { API } from "../config";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";

/** Switch a device on or off with the screen reacting at once.
 *
 * The switch used to move only once the relay had been commanded and the
 * next refresh had come back — up to three seconds with nothing
 * happening. Now the new state shows immediately; if the command fails,
 * it goes back and a message says so.
 *
 * `setState(mac, isOn)` updates the screen's own copy of the device.
 * While a command is in flight, a refresh could bring back the old state
 * and flick the switch back; pass fetched lists through `apply` to keep
 * the pending state on screen until the command has landed. */
export function useDeviceToggle(token, setState) {
  const { t } = useLanguage();
  const toast = useToast();
  const pending = useRef({});
  const [busy, setBusy] = useState({});

  const toggle = useCallback(async (device) => {
    const { mac } = device;
    if (mac in pending.current) return;
    const next = !device.is_on;
    pending.current[mac] = next;
    setBusy((b) => ({ ...b, [mac]: true }));
    setState(mac, next);
    try {
      await axios.post(`${API}/control/${mac}?command=${next ? "ON" : "OFF"}`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setState(mac, !next);
      toast.show(
        t(next ? "control.failedOn" : "control.failedOff", { name: device.name }),
        { tone: "error" }
      );
    }
    delete pending.current[mac];
    setBusy((b) => ({ ...b, [mac]: false }));
  }, [token, setState, t, toast]);

  const apply = useCallback(
    (devices) => devices.map((d) => (d.mac in pending.current ? { ...d, is_on: pending.current[d.mac] } : d)),
    []
  );

  return { toggle, apply, busy };
}
