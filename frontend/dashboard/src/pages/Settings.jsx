import { useEffect, useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import Switch from "../components/Switch";
import { reducedTransparency, setReducedTransparency } from "../utils/preferences";
import {
  disableNotifications, enableNotifications, notificationsEnabled, notificationsSupported,
} from "../utils/notifications";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";

/** Settings, from the "Settings & Configuration" mockup.
 *
 * Three of the mockup's four panels describe controls the platform cannot
 * honour, so each shows what is actually true instead of a control that
 * silently does nothing:
 *
 *   - Box Setup asks for WiFi SSID, signal strength and firmware version.
 *     No EnergiBox reports any of those — the MQTT payload carries watts
 *     and nothing else. The panel lists the paired boxes with the
 *     connectivity the backend really tracks: MAC, protocol, online state
 *     and last contact.
 *   - Billing Rates offers an editable FCFA/kWh field. Cameroon's
 *     low-voltage tariff is progressive by monthly volume, so a single
 *     editable number cannot express it. The panel shows the published
 *     bands, read-only, and says plainly which one the app currently
 *     bills everything at.
 *   - Usage Alerts offers two threshold sliders. alert_engine has no
 *     user thresholds; it compares against a computed baseline. The panel
 *     states the rules that actually fire.
 *
 * Account Settings is the one panel that works, and it is wired.
 */
function Panel({ icon, title, children, wide }) {
  return (
    <section
      className={
        "glass rounded-2xl p-md " +
        (wide ? "md:col-span-2" : "")
      }
    >
      <div className="flex items-center space-x-sm mb-6 border-b border-white/70 pb-4">
        <Icon name={icon} className="text-secondary text-2xl" />
        <h2 className="font-headline-md text-[20px] leading-[28px] font-semibold text-on-surface">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** Marks a panel whose data the platform does not collect yet, so the
 * reason is on screen rather than only in this file. */
function NotCollected({ children }) {
  return (
    <div className="flex items-start gap-3 glass-subtle rounded-xl p-3">
      <Icon name="info" className="text-on-surface-variant shrink-0" style={{ fontSize: "20px" }} />
      <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">
        {children}
      </p>
    </div>
  );
}

export default function Settings({ token, user, homeId, onLogout, onUpdateUser }) {
  const { t, language, setLanguage } = useLanguage();

  const [devices, setDevices] = useState([]);
  const [tariffs, setTariffs] = useState(null);

  const [nameInput, setNameInput] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    axios.get(`${API}/tariffs`, authHeaders).then((r) => setTariffs(r.data)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!homeId) return;
    axios
      .get(`${API}/devices?home_id=${homeId}`, authHeaders)
      .then((r) => setDevices(r.data))
      .catch(() => {});
  }, [homeId, token]);

  const saveProfile = async () => {
    if (!nameInput.trim()) return;
    setProfileSaving(true);
    setProfileMsg("");
    try {
      await axios.put(`${API}/auth/profile`, { name: nameInput.trim() }, authHeaders);
      onUpdateUser?.({ name: nameInput.trim() });
      setProfileMsg("success");
    } catch (err) {
      setProfileMsg(err.response?.data?.detail || t("settings.saveError"));
    }
    setProfileSaving(false);
  };

  const savePassword = async () => {
    setPwMsg("");
    if (!currentPw || !newPw) return;
    setPwSaving(true);
    try {
      await axios.put(
        `${API}/auth/password`,
        { current_password: currentPw, new_password: newPw },
        authHeaders
      );
      setPwMsg("success");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      setPwMsg(err.response?.data?.detail || t("settings.pwError"));
    }
    setPwSaving(false);
  };

  const inputClass =
    "glass-input font-body-md text-body-md";
  const labelClass = "font-label-sm text-label-sm text-on-surface-variant block mb-2";

  const bands = tariffs?.bands?.residential ?? [];
  // How far the schedule is confirmed by real bills. Bands starting
  // beyond that are published figures and are labelled as such rather
  // than shown with the same authority.
  const verified = tariffs?.verified;

  return (
    <div className="max-w-4xl mx-auto py-lg space-y-lg">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {t("settings.title")}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* items-start so a short panel keeps its natural height instead of
          being stretched to match the tallest in its row. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md items-start">
        {/* ── Box setup ── */}
        <Panel icon="router" title={t("settings.boxSetup")}>
          <div className="space-y-4">
            {devices.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("settings.noBoxes")}
              </p>
            ) : (
              devices.map((d) => (
                <div
                  key={d.id}
                  className="glass-subtle p-3 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      name={d.status === "online" ? "wifi" : "wifi_off"}
                      className={
                        "shrink-0 " +
                        (d.status === "online" ? "text-secondary" : "text-outline")
                      }
                    />
                    <p className="font-body-md text-body-md text-on-surface font-medium truncate flex-1">
                      {d.name}
                    </p>
                    <span
                      className={
                        "font-label-sm text-label-sm shrink-0 " +
                        (d.status === "online" ? "text-secondary" : "text-outline")
                      }
                    >
                      {d.status === "online" ? t("settings.online") : t("settings.offline")}
                    </span>
                  </div>
                  {/* MAC and last-contact sit on their own line: side by side
                      they collide at phone widths. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-1 pl-9">
                    <span className="font-data-label text-data-label text-on-surface-variant text-xs">
                      {d.mac}
                    </span>
                    {d.last_seen && (
                      <span className="font-label-sm text-label-sm text-outline text-xs">
                        {new Date(d.last_seen.replace(" ", "T")).toLocaleString(locale)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}

            <NotCollected>{t("settings.boxNotCollected")}</NotCollected>
          </div>
        </Panel>

        {/* ── Billing ── */}
        <Panel icon="payments" title={t("settings.billing")}>
          <div className="space-y-4">
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("settings.billingIntro")}
            </p>

            <div className="rounded-xl glass-subtle overflow-hidden">
              {bands.map((b, i) => {
                const isVerified = verified && b.from_kwh <= verified.up_to_kwh;
                return (
                  <div
                    key={i}
                    className={
                      "flex items-center justify-between px-3 py-2.5 font-body-md text-body-md " +
                      (i > 0 ? "border-t border-white/70 " : "") +
                      (isVerified ? "bg-secondary-container/35" : "bg-white/35")
                    }
                  >
                    <span className="text-on-surface-variant">
                      {/* The last band is open-ended: the API sends
                          to_kwh as null, which must not be printed. */}
                      {b.to_kwh == null || b.to_kwh >= 2000
                        ? `${b.from_kwh}+ kWh`
                        : `${b.from_kwh} – ${b.to_kwh} kWh`}
                    </span>
                    <span className="flex items-center gap-2">
                      {isVerified && (
                        <span className="font-label-sm text-label-sm text-on-secondary-container">
                          {t("settings.appliedBand")}
                        </span>
                      )}
                      <span className="font-data-label text-data-label text-on-surface">
                        {b.fcfa_per_kwh} FCFA
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* How the bands apply is the part that changes what a
                household should do, so it is stated, not implied. */}
            <div className="flex items-start gap-3 bg-secondary-container/30 border border-secondary-container/50 rounded-lg p-3">
              <Icon
                name="info"
                className="text-on-secondary-container shrink-0"
                style={{ fontSize: "20px" }}
              />
              <p className="font-label-sm text-label-sm text-on-secondary-container leading-relaxed">
                {t("settings.billingThreshold")}
              </p>
            </div>

            {tariffs?.vat && tariffs.vat.charged === false && (
              <p className="font-label-sm text-label-sm text-outline leading-relaxed">
                {t("settings.billingNoVat")}
              </p>
            )}

            {tariffs?.source && (
              <p className="font-label-sm text-label-sm text-outline leading-relaxed">
                {t("settings.tariffSource", {
                  regulator: tariffs.source.regulator,
                  decision: tariffs.source.decision,
                })}{" "}
                {verified &&
                  t("settings.tariffVerified", {
                    bills: verified.bills,
                    period: verified.period,
                    upTo: verified.up_to_kwh,
                  })}
              </p>
            )}
          </div>
        </Panel>

        {/* ── Alerts ── */}
        <Panel icon="tune" title={t("settings.alerts")} wide>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: "warning", key: "spike" },
              { icon: "schedule", key: "runtime" },
              { icon: "energy_savings_leaf", key: "idle" },
            ].map((rule) => (
              <div key={rule.key} className="flex items-start gap-3">
                <div className="icon-orb w-10 h-10">
                  <Icon name={rule.icon} style={{ fontSize: "20px" }} />
                </div>
                <div>
                  <h3 className="font-body-md text-body-md text-on-surface">
                    {t(`settings.rule.${rule.key}.title`)}
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mt-1 leading-relaxed">
                    {t(`settings.rule.${rule.key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <NotCollected>{t("settings.alertsNotConfigurable")}</NotCollected>
          </div>
        </Panel>

        {/* ── Account ── */}
        <Panel icon="manage_accounts" title={t("settings.account")} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wider">
                {t("settings.profile")}
              </h3>
              <div>
                <label className={labelClass} htmlFor="set-name">
                  {t("settings.fullName")}
                </label>
                <input
                  id="set-name"
                  className={inputClass}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="set-email">
                  {t("settings.email")}
                </label>
                <input
                  id="set-email"
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  disabled
                />
                <p className="font-label-sm text-label-sm text-outline mt-2">
                  {t("settings.emailFixed")}
                </p>
              </div>
              <button
                type="button"
                onClick={saveProfile}
                disabled={profileSaving}
                className="btn-primary w-full py-3 disabled:opacity-60"
              >
                {profileSaving ? t("settings.saving") : t("settings.saveProfile")}
              </button>
              {profileMsg && (
                <p
                  className={
                    "font-label-sm text-label-sm " +
                    (profileMsg === "success" ? "text-secondary" : "text-error")
                  }
                >
                  {profileMsg === "success" ? t("settings.saved") : profileMsg}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wider">
                {t("settings.security")}
              </h3>
              <div>
                <label className={labelClass} htmlFor="set-cur-pw">
                  {t("settings.currentPassword")}
                </label>
                <input
                  id="set-cur-pw"
                  className={inputClass}
                  type="password"
                  placeholder="••••••••"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="set-new-pw">
                  {t("settings.newPassword")}
                </label>
                <input
                  id="set-new-pw"
                  className={inputClass}
                  type="password"
                  placeholder={t("settings.newPassword")}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={savePassword}
                disabled={pwSaving}
                className="btn-glass mt-2 text-secondary disabled:opacity-60"
              >
                {pwSaving ? t("settings.saving") : t("settings.updatePassword")}
              </button>
              {pwMsg && (
                <p
                  className={
                    "font-label-sm text-label-sm " +
                    (pwMsg === "success" ? "text-secondary" : "text-error")
                  }
                >
                  {pwMsg === "success" ? t("settings.pwSaved") : pwMsg}
                </p>
              )}
            </div>
          </div>

          {/* Preferences the app really does own */}
          <div className="mt-8 pt-6 border-t border-white/70 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <span className={labelClass}>{t("settings.language")}</span>
              <div className="flex gap-2">
                {[
                  { id: "en", label: "English" },
                  { id: "fr", label: "Français" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLanguage(opt.id)}
                    className={
                      "px-4 py-1.5 rounded-full font-label-sm text-label-sm transition-colors " +
                      (language === opt.id
                        ? "bg-white/85 text-secondary border border-white shadow-[0_4px_12px_-6px_rgba(0,106,97,0.45)]"
                        : "glass-subtle text-on-surface-variant hover:bg-white/70")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <DisplayPreferences labelClass={labelClass} />
          </div>

          <div className="mt-8 pt-6 border-t border-white/70 flex justify-end">
            <button
              type="button"
              onClick={onLogout}
              className="btn-danger"
            >
              <Icon name="logout" style={{ fontSize: "18px" }} />
              {t("shell.logout")}
            </button>
          </div>
        </Panel>
      </div>

      <div className="mt-12 text-center pb-8">
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {t("settings.version", { version: "1.0" })}
        </p>
      </div>
    </div>
  );
}

/** Alert notifications while the tab is in the background, and the
 * opaque display for bright light. Both stay on this browser. */
function DisplayPreferences({ labelClass }) {
  const { t } = useLanguage();
  const [notify, setNotify] = useState(notificationsEnabled);
  const [denied, setDenied] = useState(false);
  const [opaque, setOpaque] = useState(reducedTransparency);

  const toggleNotify = async (on) => {
    if (!on) {
      disableNotifications();
      setNotify(false);
      return;
    }
    const result = await enableNotifications();
    setNotify(result === "granted");
    setDenied(result === "denied");
  };

  return (
    <div className="space-y-4">
      <span className={labelClass}>{t("settings.display")}</span>
      {notificationsSupported() && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-on-surface">{t("settings.notify")}</p>
            <p className="text-[13px] text-on-surface-variant">
              {denied ? t("settings.notifyDenied") : t("settings.notifyHint")}
            </p>
          </div>
          <Switch checked={notify} onChange={toggleNotify} label={t("settings.notify")} />
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-on-surface">{t("settings.opaque")}</p>
          <p className="text-[13px] text-on-surface-variant">{t("settings.opaqueHint")}</p>
        </div>
        <Switch
          checked={opaque}
          onChange={(on) => {
            setReducedTransparency(on);
            setOpaque(on);
          }}
          label={t("settings.opaque")}
        />
      </div>
    </div>
  );
}
