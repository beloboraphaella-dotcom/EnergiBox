import { useCallback, useRef, useState } from "react";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { failure, tap } from "../haptics";

/** Switch a device with the screen reacting at once — the web app's
 * live/useDeviceToggle.js, plus a light tap under the thumb.
 *
 * `setState(mac, isOn)` updates the screen's copy of the device; fetched
 * lists go through `apply` so a refresh landing mid-command does not flick
 * the switch back. On failure the switch returns and a message says so. */
export function useDeviceToggle(setState) {
  const { t } = useLanguage();
  const toast = useToast();
  const pending = useRef({});
  const [busy, setBusy] = useState({});

  const toggle = useCallback(async (device) => {
    const { mac } = device;
    if (mac in pending.current) return;
    const next = !device.is_on;
    pending.current[mac] = next;
    tap();
    setBusy((b) => ({ ...b, [mac]: true }));
    setState(mac, next);
    try {
      await api.post(`/control/${mac}?command=${next ? "ON" : "OFF"}`);
    } catch {
      setState(mac, !next);
      failure();
      toast.show(t(next ? "control.failedOn" : "control.failedOff", { name: device.name }), { tone: "error" });
    }
    delete pending.current[mac];
    setBusy((b) => ({ ...b, [mac]: false }));
  }, [setState, t, toast]);

  const apply = useCallback(
    (devices) => devices.map((d) => (d.mac in pending.current ? { ...d, is_on: pending.current[d.mac] } : d)),
    []
  );

  return { toggle, apply, busy };
}
