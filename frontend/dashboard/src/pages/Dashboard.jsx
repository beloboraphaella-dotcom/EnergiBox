import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import Settings from "./Settings";
import Devices from "./Devices";
import Rooms from "./Rooms";
import Admin from "./Admin";
import { useLanguage } from "../context/LanguageContext";
import AppShell from "../components/AppShell";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import Overview from "./Overview";
import Skeleton from "../components/Skeleton";
import { useLiveRefresh } from "../live/LiveContext";
import { SCHEDULE_PRESETS } from "../utils/schedulePresets";

const API = "http://localhost:8000";
// Appliance series. Distinct hues that sit with the teal brand on glass;
// the first is the brand colour itself.
const COLORS = ["#00897b", "#5b6ee1", "#e0930b", "#0ea5c6", "#d9486b", "#64748b"];

const ALERT_TONES = {
  spike: { icon: "warning", orb: "bg-error-container/70 text-error", chip: "chip-red" },
  extended_runtime: { icon: "timer", orb: "bg-tertiary-fixed/70 text-on-tertiary-fixed-variant", chip: "chip-amber" },
  idle_waste: { icon: "nights_stay", orb: "text-on-primary-fixed-variant", chip: "chip-indigo" },
};

function SectionTitle({ icon, children }) {
  return (
    <h2 className="flex items-center gap-2 font-headline-md text-[20px] leading-7 font-semibold text-on-surface">
      <Icon name={icon} className="text-secondary" />
      {children}
    </h2>
  );
}

function EmptyCard({ icon, children }) {
  return (
    <div className="glass rounded-2xl p-md flex items-center gap-3 text-on-surface-variant">
      <span className="icon-orb w-10 h-10"><Icon name={icon} style={{ fontSize: "20px" }} /></span>
      {children}
    </div>
  );
}

function StatTile({ icon, label, value, unit, dark = false, children }) {
  return (
    <div className={(dark ? "glass-dark" : "glass") + " rounded-2xl p-md flex flex-col justify-between gap-4 relative overflow-hidden"}>
      {dark && <div className="absolute -right-6 -top-6 w-24 h-24 bg-secondary-fixed/25 rounded-full blur-2xl" />}
      <div className="flex items-center justify-between relative">
        <span className={"font-data-label text-data-label uppercase " + (dark ? "text-primary-fixed-dim" : "text-outline")}>{label}</span>
        <Icon name={icon} className={dark ? "text-secondary-fixed" : "text-secondary"} />
      </div>
      <div className="relative">
        <p className={"font-headline-lg text-headline-lg " + (dark ? "text-white" : "text-on-surface")}>
          {value} <span className={"font-body-md text-body-md " + (dark ? "text-primary-fixed-dim" : "text-outline")}>{unit}</span>
        </p>
        {children && <p className="text-[13px] mt-1">{children}</p>}
      </div>
    </div>
  );
}
// The API labels a year's bars with English month abbreviations; this is
// their order, so each can be re-rendered in the reader's language.
const API_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export default function Dashboard({
  token, user, onLogout, onUpdateUser,
  homes = [], activeHomeId, onSwitchHome, onHomesChanged,
}) {
  const { t, language } = useLanguage();
  const locale = language === "fr" ? "fr-FR" : "en-US";
  // Numbers in the reader's convention: "9 456" and "119,7" in French.
  const fmt = (value, digits = 1) =>
    Number(value ?? 0).toLocaleString(locale, { maximumFractionDigits: digits });
  const isAdmin = user?.role === "admin";
  const [activeTab, setTab] = useState(isAdmin ? "admin" : "home");
  const [alerts, setAlerts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  // A device to open when the Devices tab is next shown (from a card on
  // the dashboard), so a tap lands on that device and not on the list.
  const [deviceToOpen, setDeviceToOpen] = useState(null);
  const [showRooms, setShowRooms] = useState(false);

  // History state
  const [historyMode, setHistoryMode] = useState("Month");
  const [historyDay, setHistoryDay] = useState(new Date().getDate());
  const [historyWeek, setHistoryWeek] = useState(1);
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyData, setHistoryData] = useState(null);
  const [applianceData, setApplianceData] = useState([]);

  // Schedule create/edit state
  const [scheduleModal, setScheduleModal] = useState(null); // null | "create" | { edit: scheduleObj }
  const [scheduleDevices, setScheduleDevices] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ monitored_point_id: "", on_time: "22:00", off_time: "05:00" });
  const [scheduleError, setScheduleError] = useState("");

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
  const hid = () => `home_id=${activeHomeId}`;

  const fetchAlerts = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/alerts?${hid()}`, authHeaders);
      setAlerts(res.data);
      setAlertsLoaded(true);
    } catch (err) {}
  };

  const fetchSuggestions = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/suggestions?${hid()}`, authHeaders);
      setSuggestions(res.data);
    } catch (err) {}
  };

  const fetchSchedules = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/schedules?${hid()}`, authHeaders);
      setSchedules(res.data);
    } catch (err) {}
  };

  const fetchHistory = async () => {
    if (!activeHomeId) return;
    try {
      let res;
      if (historyMode === "Day") {
        res = await axios.get(
          `${API}/history/daily?${hid()}&month=${historyMonth}&year=${historyYear}`, authHeaders
        );
      } else if (historyMode === "Week") {
        res = await axios.get(`${API}/history/weekly?${hid()}`, authHeaders);
      } else if (historyMode === "Month") {
        res = await axios.get(
          `${API}/history/daily?${hid()}&month=${historyMonth}&year=${historyYear}`, authHeaders
        );
      } else {
        res = await axios.get(`${API}/history/yearly?${hid()}&year=${historyYear}`, authHeaders);
      }
      setHistoryData(res.data);

      const appRes = await axios.get(
        `${API}/history/by-appliance?${hid()}&month=${historyMonth}&year=${historyYear}`, authHeaders
      );
      setApplianceData(appRes.data);
    } catch (err) {}
  };

  const acceptSuggestion = async (id) => {
    await axios.put(`${API}/suggestions/${id}/accept`, null, authHeaders);
    fetchSuggestions();
    fetchSchedules();
  };

  const ignoreSuggestion = async (id) => {
    await axios.put(`${API}/suggestions/${id}/ignore`, null, authHeaders);
    fetchSuggestions();
  };

  const deleteSchedule = async (sc) => {
    if (!window.confirm(t("sched.confirmDelete", { name: sc.appliance }))) return;
    await axios.delete(`${API}/schedules/${sc.id}`, authHeaders);
    fetchSchedules();
  };

  /** `pointId` preselects the device, when the schedule is offered from a
   * suggestion about it. */
  const openCreateSchedule = async (pointId = "") => {
    setScheduleError("");
    setScheduleForm({ monitored_point_id: pointId ? String(pointId) : "", on_time: "22:00", off_time: "05:00" });
    try {
      const res = await axios.get(`${API}/devices?${hid()}`, authHeaders);
      setScheduleDevices(res.data);
    } catch (err) {}
    setScheduleModal("create");
  };

  const openEditSchedule = (sc) => {
    setScheduleError("");
    setScheduleForm({ monitored_point_id: sc.monitored_point_id, on_time: sc.on_time.slice(0, 5), off_time: sc.off_time.slice(0, 5) });
    setScheduleModal({ edit: sc });
  };

  const submitScheduleForm = async () => {
    const { monitored_point_id, on_time, off_time } = scheduleForm;
    if (scheduleModal === "create" && !monitored_point_id) {
      setScheduleError(t("sched.errDevice"));
      return;
    }
    try {
      if (scheduleModal === "create") {
        await axios.post(
          `${API}/schedules?monitored_point_id=${monitored_point_id}&on_time=${on_time}&off_time=${off_time}&source=manual`,
          null, authHeaders
        );
      } else {
        await axios.put(
          `${API}/schedules/${scheduleModal.edit.id}?on_time=${on_time}&off_time=${off_time}`,
          null, authHeaders
        );
      }
      setScheduleModal(null);
      fetchSchedules();
    } catch (err) {
      setScheduleError(t("sched.errSave"));
    }
  };

  // This used to poll /dashboard every two seconds on every tab, for
  // figures no screen displayed any more. Only the alerts tab refreshes
  // here now, and only when told something changed.
  useLiveRefresh(
    () => {
      fetchAlerts();
      fetchSuggestions();
    },
    { topics: ["alerts", "suggestions"], interval: 15000, enabled: !isAdmin && activeTab === "alerts" }
  );

  useEffect(() => {
    if (activeTab === "alerts") {
      fetchAlerts();
      fetchSuggestions();
      fetchSchedules();
    }
    if (activeTab === "history") fetchHistory();
  }, [activeTab, activeHomeId]);

  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [historyMode, historyMonth, historyYear, historyDay, historyWeek]);

  const navigatePeriod = (direction) => {
    if (historyMode === "Day") {
      const d = new Date(historyYear, historyMonth - 1, historyDay + direction);
      setHistoryDay(d.getDate());
      setHistoryMonth(d.getMonth() + 1);
      setHistoryYear(d.getFullYear());
    } else if (historyMode === "Week") {
      setHistoryWeek(w => Math.max(1, w + direction));
    } else if (historyMode === "Month") {
      const newMonth = historyMonth + direction;
      if (newMonth < 1) { setHistoryMonth(12); setHistoryYear(y => y - 1); }
      else if (newMonth > 12) { setHistoryMonth(1); setHistoryYear(y => y + 1); }
      else setHistoryMonth(newMonth);
    } else {
      setHistoryYear(y => y + direction);
    }
  };

  const getPeriodLabel = () => {
    const date = new Date(historyYear, historyMonth - 1, historyDay);
    if (historyMode === "Day") {
      return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
    }
    if (historyMode === "Week") return t("history.week", { week: historyWeek, year: historyYear });
    if (historyMode === "Month") {
      return capitalize(date.toLocaleDateString(locale, { month: "long", year: "numeric" }));
    }
    return `${historyYear}`;
  };

  const getBarKey = () => {
    if (historyMode === "Year") return "month";
    if (historyMode === "Week") return "day";
    return "day";
  };

  // Sidebar items. The mockups ship four; the app has more screens than
  // that, so the extra ones are added here in the same style rather than
  // being left unreachable. The bottom tab bar takes the first four plus
  // "More", which opens the rest.
  const navItems = isAdmin
    ? [
        { key: "admin", icon: "admin_panel_settings", labelKey: "shell.admin" },
        { key: "profile", icon: "settings", labelKey: "shell.settings" },
      ]
    : [
        { key: "home", icon: "dashboard", labelKey: "shell.dashboard" },
        { key: "devices", icon: "devices", labelKey: "shell.devices" },
        { key: "alerts", icon: "notifications", labelKey: "shell.alerts" },
        { key: "history", icon: "monitoring", labelKey: "shell.history" },
        { key: "rooms", icon: "meeting_room", labelKey: "shell.rooms" },
        { key: "profile", icon: "settings", labelKey: "shell.settings" },
      ];

  const footerItems = [
    { key: "logout", icon: "logout", labelKey: "shell.logout", danger: true },
  ];

  const handleNavigate = (key) => {
    if (key === "logout") return onLogout();
    if (key === "rooms") {
      setTab("home");
      setShowRooms(true);
      return;
    }
    setShowRooms(false);
    if (key !== "devices") setDeviceToOpen(null);
    setTab(key);
  };

  const openDevice = (mac) => {
    setDeviceToOpen(mac);
    setShowRooms(false);
    setTab("devices");
  };

  const activeKey = showRooms && activeTab === "home" ? "rooms" : activeTab;
  const activeItem = navItems.find((i) => i.key === activeKey);

  return (
    <AppShell
      items={navItems}
      footerItems={footerItems}
      active={activeKey}
      onNavigate={handleNavigate}
      title={activeItem ? t(activeItem.labelKey) : "EnergiBox"}
      headerRight={
        <>
          {!isAdmin && homes && (
            <HomeSwitcher
              homes={homes}
              activeHomeId={activeHomeId}
              onSwitchHome={onSwitchHome}
              onHomesChanged={onHomesChanged}
              token={token}
            />
          )}
        </>
      }
    >
      {isAdmin ? (
        <Admin token={token} currentUserId={user?.id} />
      ) : (
        <>
          {activeTab === "home" && !showRooms && (
            <Overview
              token={token}
              homeId={activeHomeId}
              onOpenDevices={() => handleNavigate("devices")}
              onOpenDevice={openDevice}
            />
          )}
        {activeTab === "home" && showRooms && (
          <Rooms token={token} homeId={activeHomeId} onBack={() => handleNavigate("home")} />
        )}

        {/* ── DEVICES TAB ── */}
        {activeTab === "devices" && (
          <Devices token={token} homeId={activeHomeId} initialMac={deviceToOpen} key={deviceToOpen || "list"} />
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="max-w-7xl mx-auto py-lg space-y-md">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface">{t("history.title")}</h1>
                <p className="text-on-surface-variant mt-1">{t("history.subtitle")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="segmented">
                  {["Day", "Week", "Month", "Year"].map((m) => (
                    <button key={m} type="button" aria-pressed={historyMode === m} onClick={() => setHistoryMode(m)}>
                      {t(`history.mode.${m}`)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 glass-subtle rounded-full p-1">
                  <button type="button" className="btn-icon w-8 h-8" onClick={() => navigatePeriod(-1)} aria-label={t("history.prev")}>
                    <Icon name="chevron_left" />
                  </button>
                  <span className="font-label-sm text-label-sm text-on-surface min-w-[9rem] text-center">{getPeriodLabel()}</span>
                  <button type="button" className="btn-icon w-8 h-8" onClick={() => navigatePeriod(1)} aria-label={t("history.next")}>
                    <Icon name="chevron_right" />
                  </button>
                </div>
              </div>
            </div>

            {!historyData && (
              <div role="status" aria-label={t("common.loading")} className="space-y-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-sm">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
                </div>
                <Skeleton className="h-80" />
              </div>
            )}

            {historyData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-sm">
                  <StatTile icon="bolt" label={t("history.total")} value={fmt(historyData.total_kwh)} unit="kWh">
                    {historyData.change_vs_prev !== undefined && (
                      <span className={"inline-flex items-center gap-1 " + (historyData.change_vs_prev >= 0 ? "text-error" : "text-secondary")}>
                        <Icon name={historyData.change_vs_prev >= 0 ? "trending_up" : "trending_down"} style={{ fontSize: "16px" }} />
                        {t("history.vsPrev", { pct: Math.abs(historyData.change_vs_prev) })}
                      </span>
                    )}
                  </StatTile>
                  <StatTile
                    icon="avg_pace"
                    label={historyMode === "Year" ? t("history.avgMonth") : t("history.avgDay")}
                    value={fmt(historyData.avg_per_day_kwh)}
                    unit="kWh"
                  />
                  <StatTile icon="payments" label={t("history.estCost")} value={fmt(historyData.estimated_fcfa, 0)} unit="FCFA" dark />
                  <StatTile icon="calendar_today" label={t("history.costDay")} value={historyData.avg_fcfa_per_day == null ? "—" : fmt(historyData.avg_fcfa_per_day, 0)} unit="FCFA" />
                </div>

                <div className="glass rounded-2xl p-md">
                  <h3 className="font-headline-md text-[20px] leading-7 font-semibold text-on-surface mb-4">{t("history.chart")}</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={
                        historyMode === "Year"
                          ? historyData.bars.map((bar) => ({
                              ...bar,
                              month: capitalize(
                                new Date(2000, API_MONTHS.indexOf(bar.month), 1)
                                  .toLocaleDateString(locale, { month: "short" })
                                  .replace(".", "")
                              ),
                            }))
                          : historyData.bars
                      } margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(118,119,125,0.18)" vertical={false} />
                      <XAxis dataKey={getBarKey()} tick={{ fill: "#626369", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#626369", fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" width={64} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.45)" }}
                        contentStyle={{
                          borderRadius: "14px",
                          border: "1px solid rgba(255,255,255,0.8)",
                          background: "rgba(255,255,255,0.85)",
                          backdropFilter: "blur(12px)",
                          boxShadow: "0 10px 30px -12px rgba(19,27,46,0.25)",
                        }}
                        formatter={(v) => [`${fmt(v)} kWh`, t("history.chart")]}
                      />
                      <defs>
                        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00897b" />
                          <stop offset="100%" stopColor="#6bd8cb" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="kwh" radius={[8, 8, 0, 0]} fill="url(#tealGrad)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {applianceData.length > 0 && (
                  <div className="glass rounded-2xl p-md">
                    <h3 className="font-headline-md text-[20px] leading-7 font-semibold text-on-surface mb-4">{t("history.byAppliance")}</h3>
                    <ul className="space-y-4">
                      {applianceData.map((a, i) => (
                        <li key={i} className="space-y-1.5">
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-on-surface truncate flex-1 min-w-0">{a.name}</span>
                            <span className="font-data-label text-data-label text-on-surface whitespace-nowrap">{fmt(a.kwh)} kWh</span>
                            <span className="font-label-sm text-label-sm text-outline text-right w-12 shrink-0">{fmt(a.percentage, 1)}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${a.percentage}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {activeTab === "alerts" && (
          <div className="max-w-5xl mx-auto py-lg space-y-lg">
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{t("alerts.title")}</h1>

            <section className="space-y-sm">
              <SectionTitle icon="notifications">{t("alerts.active")}</SectionTitle>
              {!alertsLoaded ? (
                <div role="status" aria-label={t("common.loading")} className="space-y-sm">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : alerts.length === 0 ? (
                <EmptyCard icon="check_circle">{t("alerts.none")}</EmptyCard>
              ) : alerts.map((a, i) => {
                const tone = ALERT_TONES[a.type] || ALERT_TONES.idle_waste;
                return (
                  <div key={i} className="glass rounded-2xl p-4 flex items-start gap-4">
                    <span className={"icon-orb " + tone.orb}><Icon name={tone.icon} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="font-body-md text-body-md font-semibold text-on-surface">{a.appliance}</p>
                        <span className={"chip " + tone.chip}>{t(`detail.alert.${a.type}`)}</span>
                      </div>
                      <p className="text-[14px] leading-5 text-on-surface-variant mt-1">{a.message}</p>
                      <p className="font-data-label text-[12px] text-outline mt-2">{a.created_at}</p>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="space-y-sm">
              <SectionTitle icon="lightbulb">{t("sugg.title")}</SectionTitle>
              {suggestions.length === 0 ? (
                <EmptyCard icon="lightbulb">{t("sugg.none")}</EmptyCard>
              ) : suggestions.map((s2, i) => (
                <div key={i} className={"glass rounded-2xl p-4 " + (s2.status === "ignored" ? "opacity-70" : "")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-body-md text-body-md font-semibold text-on-surface">{s2.appliance}</p>
                    <span className={"chip " + (s2.status === "accepted" ? "chip-teal" : s2.status === "ignored" ? "" : "chip-amber")}>
                      {t(`sugg.status.${s2.status}`)}
                    </span>
                  </div>
                  <p className="text-[14px] leading-6 text-on-surface-variant mt-2">{s2.suggestion}</p>
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <span className="chip chip-teal text-[13px]">
                      <Icon name="savings" style={{ fontSize: "16px" }} />
                      {t("sugg.save", { amount: Number(s2.estimated_saving_fcfa).toLocaleString(locale) })}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {s2.status !== "ignored" && s2.monitored_point_id && (
                        <button type="button" className="btn-glass py-2" onClick={() => openCreateSchedule(s2.monitored_point_id)}>
                          <Icon name="schedule" style={{ fontSize: "18px" }} /> {t("sugg.schedule")}
                        </button>
                      )}
                      {s2.status === "pending" && (
                        <>
                          <button type="button" className="btn-glass py-2" onClick={() => ignoreSuggestion(s2.id)}>{t("sugg.ignore")}</button>
                          <button type="button" className="btn-primary py-2" onClick={() => acceptSuggestion(s2.id)}>
                            <Icon name="check" style={{ fontSize: "18px" }} /> {t("sugg.accept")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-sm">
              <div className="flex items-center justify-between">
                <SectionTitle icon="schedule">{t("sched.title")}</SectionTitle>
                <button type="button" className="btn-primary py-2" onClick={() => openCreateSchedule()}>
                  <Icon name="add" style={{ fontSize: "18px" }} /> {t("sched.create")}
                </button>
              </div>
              {schedules.length === 0 ? (
                <EmptyCard icon="schedule">{t("sched.none")}</EmptyCard>
              ) : schedules.map((sc, i) => (
                <div key={i} className={"glass rounded-2xl p-4 flex items-center gap-4 " + (sc.active ? "" : "opacity-70")}>
                  <span className="icon-orb"><Icon name="schedule" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-md text-body-md font-semibold text-on-surface">{sc.appliance}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="chip chip-teal font-data-label">
                        <Icon name="power_settings_new" style={{ fontSize: "14px" }} /> {sc.on_time?.slice(0, 5)}
                      </span>
                      <Icon name="arrow_forward" className="text-outline" style={{ fontSize: "16px" }} />
                      <span className="chip font-data-label">
                        <Icon name="power_off" style={{ fontSize: "14px" }} /> {sc.off_time?.slice(0, 5)}
                      </span>
                      <span className={"chip " + (sc.source === "ai" ? "chip-indigo" : "")}>{t(`sched.source.${sc.source}`)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="btn-icon" onClick={() => openEditSchedule(sc)} aria-label={t("sched.edit")} title={t("sched.edit")}>
                      <Icon name="edit" style={{ fontSize: "20px" }} />
                    </button>
                    <button type="button" className="btn-icon hover:text-error" onClick={() => deleteSchedule(sc)} aria-label={t("sched.delete")} title={t("sched.delete")}>
                      <Icon name="delete" style={{ fontSize: "20px" }} />
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {scheduleModal && (
              <Modal title={scheduleModal === "create" ? t("sched.create") : t("sched.edit")} onClose={() => setScheduleModal(null)}>
                <div className="space-y-4">
                  {scheduleModal === "create" && (
                    <label className="block">
                      <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("sched.device")}</span>
                      <select
                        className="glass-input"
                        value={scheduleForm.monitored_point_id}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, monitored_point_id: e.target.value })}
                      >
                        <option value="">{t("sched.selectDevice")}</option>
                        {scheduleDevices.map((d) => (
                          <option key={d.id} value={d.id}>{d.name} — {d.room}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div>
                    <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("sched.presets")}</span>
                    <div className="flex flex-wrap gap-2">
                      {SCHEDULE_PRESETS.map((preset) => {
                        const selected = scheduleForm.on_time === preset.on && scheduleForm.off_time === preset.off;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setScheduleForm({ ...scheduleForm, on_time: preset.on, off_time: preset.off })}
                            className={
                              "px-3 py-2 rounded-full font-label-sm text-label-sm transition-colors " +
                              (selected ? "bg-white/90 text-secondary ring-1 ring-secondary/40" : "glass-subtle text-on-surface-variant hover:bg-white/70")
                            }
                          >
                            {t(`sched.preset.${preset.key}`)} <span className="font-data-label text-[12px] opacity-80">{preset.on}–{preset.off}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("sched.onAt")}</span>
                      <input
                        type="time"
                        className="glass-input font-data-label"
                        value={scheduleForm.on_time}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, on_time: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("sched.offAt")}</span>
                      <input
                        type="time"
                        className="glass-input font-data-label"
                        value={scheduleForm.off_time}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, off_time: e.target.value })}
                      />
                    </label>
                  </div>
                  {scheduleError && <p className="text-error text-[14px]">{scheduleError}</p>}
                  <button type="button" className="btn-primary w-full py-3" onClick={submitScheduleForm}>
                    {scheduleModal === "create" ? t("common.create") : t("common.saveChanges")}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <Settings token={token} user={user} homeId={activeHomeId} onLogout={onLogout} onUpdateUser={onUpdateUser} />
        )}
        </>
      )}
    </AppShell>
  );
}

function HomeSwitcher({ homes, activeHomeId, onSwitchHome, onHomesChanged, token }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState("");

  const activeHome = homes.find((h) => h.id === activeHomeId);

  const createHome = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await axios.post(
        `${API}/homes?name=${encodeURIComponent(newName)}${newAddress ? `&address=${encodeURIComponent(newAddress)}` : ""}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await onHomesChanged();
      onSwitchHome(res.data.id);
      setAdding(false);
      setNewName("");
      setNewAddress("");
      setOpen(false);
    } catch (err) {
      setError(t("shell.createHomeError"));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-subtle text-on-surface hover:bg-white/70 transition-colors active:scale-95 duration-150 max-w-[180px]"
      >
        <Icon name="home" className="text-secondary" style={{ fontSize: "18px" }} />
        <span className="font-label-sm text-label-sm truncate">
          {activeHome?.name || "EnergiBox"}
        </span>
        <Icon
          name={open ? "expand_less" : "expand_more"}
          className="text-on-surface-variant"
          style={{ fontSize: "18px" }}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setAdding(false);
            }}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl glass-strong overflow-hidden">
            <p className="font-label-sm text-label-sm text-outline uppercase tracking-wider px-4 pt-4 pb-2">
              {t("shell.yourHomes")}
            </p>

            {homes.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onSwitchHome(h.id);
                  setOpen(false);
                }}
                className={
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors " +
                  (h.id === activeHomeId
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface hover:bg-white/70")
                }
              >
                <Icon name="home" fill={h.id === activeHomeId} />
                <div className="flex-1 min-w-0">
                  <p className="font-body-md text-body-md truncate">{h.name}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {h.room_count} {h.room_count === 1 ? t("shell.room") : t("shell.rooms")} ·{" "}
                    {h.device_count}{" "}
                    {h.device_count === 1 ? t("shell.device") : t("shell.devicesLower")}
                  </p>
                </div>
                {h.id === activeHomeId && <Icon name="check" style={{ fontSize: "18px" }} />}
              </button>
            ))}

            <div className="border-t border-white/70 p-4">
              {adding ? (
                <div className="space-y-2">
                  <input
                    className="glass-input py-2 px-3 font-body-md text-body-md"
                    placeholder={t("shell.homeName")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <input
                    className="glass-input py-2 px-3 font-body-md text-body-md"
                    placeholder={t("shell.homeAddress")}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                  {error && (
                    <p className="font-label-sm text-label-sm text-error">{error}</p>
                  )}
                  <button
                    type="button"
                    onClick={createHome}
                    className="btn-primary w-full py-2.5"
                  >
                    {t("shell.createHome")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="w-full flex items-center justify-center gap-2 text-secondary font-label-sm text-label-sm py-2 rounded-lg hover:bg-secondary/10 transition-colors"
                >
                  <Icon name="add" style={{ fontSize: "18px" }} />
                  {t("shell.addHome")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

