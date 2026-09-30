import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { translations } from "./translations";

const LanguageContext = createContext(null);

function getInitialLanguage() {
  const saved = localStorage.getItem("language");
  return saved === "fr" ? "fr" : "en";
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.setAttribute("lang", language);
    // The API returns alerts, suggestions and reports in this language.
    axios.defaults.headers.common["Accept-Language"] = language;
  }, [language]);

  // Values are substituted into {placeholders}; callers that pass nothing
  // behave exactly as before.
  // Stable per language, so screens can list t in their hook dependencies.
  const t = useCallback((key, vars) => {
    const template = translations[language]?.[key] ?? translations.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  }, [language]);

  // "3 rooms" / "1 pièce". French puts 0 and 1 in the singular, English
  // only 1, so the rule follows the language rather than the number.
  const tn = useCallback((key, count) => {
    const one = language === "fr" ? count <= 1 : count === 1;
    return t(`${key}.${one ? "one" : "other"}`, { count });
  }, [language, t]);

  // For toLocaleString and friends: "9 459" and "30/09/2026" in French.
  const locale = language === "fr" ? "fr-FR" : "en-US";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tn, locale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
