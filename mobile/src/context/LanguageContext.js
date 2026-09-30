// Interface language, matching the web app's LanguageContext.
//
// Same hook, same t(key, vars), same two languages — the difference is
// storage. AsyncStorage is asynchronous, so the saved choice cannot be
// read before the first render the way localStorage can. The provider
// therefore starts on the default and swaps once the stored value
// arrives: a first frame in English for a French user, rather than a
// blank screen for everyone while a one-key read completes.

import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { translations } from "./translations";

const LanguageContext = createContext(null);

const STORAGE_KEY = "language";
const DEFAULT_LANGUAGE = "en";

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && (saved === "fr" || saved === "en")) {
          setLanguageState(saved);
        }
      })
      // A device that cannot read its own storage still gets an app, in
      // the default language.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = (next) => {
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  // Values are substituted into {placeholders}. An unknown key falls back
  // to English and then to the key itself, so a missing string shows up
  // as something searchable instead of as blank space.
  const t = (key, vars) => {
    const template = translations[language]?.[key] ?? translations.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  };

  // "3 rooms" / "1 pièce". French puts 0 and 1 in the singular, English
  // only 1, so the rule follows the language rather than the number.
  // For toLocaleString and friends: "9 459" and "30/09/2026" in French.
  const locale = language === "fr" ? "fr-FR" : "en-US";

  const tn = (key, count) => {
    const one = language === "fr" ? count <= 1 : count === 1;
    return t(`${key}.${one ? "one" : "other"}`, { count });
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tn, locale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
