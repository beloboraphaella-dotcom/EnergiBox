import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLanguage } from "../context/LanguageContext";
import { getConnection, subscribeConnection } from "../live/connection";

/** Shown while the API is unreachable, so figures on screen are not taken
 * for live ones: says when the last good data arrived. Requests keep
 * retrying on their own, and the banner leaves with the first success. */
export default function ConnectionBanner() {
  const { t, locale } = useLanguage();
  const [connection, setConnection] = useState(getConnection);

  useEffect(() => subscribeConnection(setConnection), []);

  if (connection.online) return null;
  const time = new Date(connection.lastOk).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      role="alert"
      className="glass-strong rounded-2xl px-4 py-3 mb-md flex items-start gap-3 border-l-4 border-l-[#e0930b] max-w-7xl mx-auto"
    >
      <Icon name="cloud_off" className="text-[#b45309] shrink-0" />
      <div>
        <p className="font-label-sm text-label-sm text-on-surface">{t("conn.lost")}</p>
        <p className="font-body-md text-[14px] text-on-surface-variant">{t("conn.lastData", { time })}</p>
      </div>
    </div>
  );
}
