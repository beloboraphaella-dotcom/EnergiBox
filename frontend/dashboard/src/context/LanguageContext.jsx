import { createContext, useContext, useEffect, useState } from "react";
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
  }, [language]);

  // Values are substituted into {placeholders}; callers that pass nothing
  // behave exactly as before.
  const t = (key, vars) => {
    const template = translations[language]?.[key] ?? translations.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  };

  // "3 rooms" / "1 pièce". French puts 0 and 1 in the singular, English
  // only 1, so the rule follows the language rather than the number.
  const tn = (key, count) => {
    const one = language === "fr" ? count <= 1 : count === 1;
    return t(`${key}.${one ? "one" : "other"}`, { count });
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tn }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
