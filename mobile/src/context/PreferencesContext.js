import { createContext, useContext, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Display preferences kept on this phone.
 *
 * Reduced transparency swaps the coloured backdrop for a plain one and
 * the blurred bars for opaque ones, so text never sits on moving colour —
 * easier to read in bright sunlight. It starts from the system setting
 * where one exists (iOS "Reduce Transparency") and can be set by hand in
 * Settings on any phone. */

const PreferencesContext = createContext({ reduceTransparency: false, setReduceTransparency: () => {} });
const KEY = "reduceTransparency";

export function PreferencesProvider({ children }) {
  const [reduceTransparency, setState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await AsyncStorage.getItem(KEY).catch(() => null);
      let value = saved === "on";
      if (saved === null) {
        value = await AccessibilityInfo.isReduceTransparencyEnabled?.().catch(() => false) ?? false;
      }
      if (!cancelled) setState(!!value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setReduceTransparency = (on) => {
    setState(on);
    AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {});
  };

  return (
    <PreferencesContext.Provider value={{ reduceTransparency, setReduceTransparency }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
