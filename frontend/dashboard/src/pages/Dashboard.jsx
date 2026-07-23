import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from "recharts";
import Profile from "./Profile";
import Devices from "./Devices";
import Rooms from "./Rooms";
import Admin from "./Admin";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";
const COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function Modal({ title, onClose, children }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>{title}</h3>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>{children}</div>
      </div>
    </div>
  );
}

export default function Dashboard({
  token, user, onLogout, onUpdateUser,
  homes = [], activeHomeId, onSwitchHome, onHomesChanged,
}) {
  const { t } = useLanguage();
  const isAdmin = user?.role === "admin";
  const [activeTab, setTab] = useState(isAdmin ? "admin" : "home");
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [roomsData, setRoomsData] = useState([]);
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

  const fetchDashboard = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/dashboard?${hid()}`, authHeaders);
      setDashboard(res.data);
    } catch (err) {}
  };

  const fetchAlerts = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/alerts?${hid()}`, authHeaders);
      setAlerts(res.data);
    } catch (err) {}
  };

  const fetchSuggestions = async () => {
    if (!activeHomeId) return;
    try {
      const res = await axios.get(`${API}/suggestions?${hid()}`, authHeaders);
      setSuggestions(res.data);
    } catch (err) {}
  };

  const fetchOverview = async () => {
    if (!activeHomeId) return;
    try {
      const [overRes, roomRes] = await Promise.all([
        axios.get(`${API}/stats/overview?${hid()}`, authHeaders),
        axios.get(`${API}/rooms/consumption?${hid()}`, authHeaders)
      ]);
      setOverviewData(overRes.data);
      setRoomsData(roomRes.data);
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

  const deleteSchedule = async (id) => {
    await axios.delete(`${API}/schedules/${id}`, authHeaders);
    fetchSchedules();
  };

  const openCreateSchedule = async () => {
    setScheduleError("");
    setScheduleForm({ monitored_point_id: "", on_time: "22:00", off_time: "05:00" });
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
      setScheduleError("Pick a device.");
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
      setScheduleError("Could not save schedule.");
    }
  };

  const controlDevice = async (mac, command) => {
    await axios.post(`${API}/control/${mac}?command=${command}`, null, authHeaders);
    setTimeout(fetchDashboard, 500);
  };

  useEffect(() => {
    if (isAdmin) return; // admins never load household consumption data
    fetchDashboard();
    fetchOverview();
    const interval = setInterval(fetchDashboard, 2000);
    return () => clearInterval(interval);
  }, [isAdmin, activeHomeId]);

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
    if (historyMode === "Day") return `${MONTH_NAMES[historyMonth-1]} ${historyDay}, ${historyYear}`;
    if (historyMode === "Week") return `Week ${historyWeek}, ${historyYear}`;
    if (historyMode === "Month") return `${MONTH_NAMES[historyMonth-1]} ${historyYear}`;
    return `${historyYear}`;
  };

  const getBarKey = () => {
    if (historyMode === "Year") return "month";
    if (historyMode === "Week") return "day";
    return "day";
  };

  const navTabs = isAdmin
    ? [{ id: "admin", icon: "🛡", label: t("nav.admin") }]
    : [
        { id: "home",    icon: "⚡", label: t("nav.home") },
        { id: "devices", icon: "🔌", label: t("nav.devices") },
        { id: "history", icon: "📊", label: t("nav.history") },
        { id: "alerts",  icon: "🔔", label: t("nav.alerts") },
        { id: "profile", icon: "👤", label: t("nav.profile") },
      ];

  return (
    <div style={s.page}>

      {/* SIDEBAR */}
      <div style={s.sidebar}>
        {isAdmin ? (
          <div style={s.sidebarHeader}>
            <span style={s.sidebarLogo}>⚡</span>
            <span style={s.sidebarBrand}>EnergiBox</span>
          </div>
        ) : (
          <HomeSwitcher
            homes={homes}
            activeHomeId={activeHomeId}
            onSwitchHome={onSwitchHome}
            onHomesChanged={onHomesChanged}
            token={token}
          />
        )}
        <nav style={s.nav}>
          {navTabs.map(tab => (
            <button key={tab.id} style={{
              ...s.navBtn,
              background: activeTab === tab.id ? "#eff6ff" : "transparent",
              color: activeTab === tab.id ? "#3b82f6" : "#666",
              borderLeft: activeTab === tab.id ? "3px solid #3b82f6" : "3px solid transparent",
              fontWeight: activeTab === tab.id ? "600" : "400",
            }} onClick={() => { setTab(tab.id); setShowRooms(false); }}>
              <span style={s.navIcon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <button style={s.logoutBtn} onClick={onLogout}>🚪 {t("nav.logout")}</button>
      </div>

      {/* MAIN */}
      <div style={s.main}>
        {isAdmin ? (
          <Admin token={token} currentUserId={user?.id} />
        ) : (
          <>
        {/* ── HOME TAB ── */}
{activeTab === "home" && showRooms && (
  <Rooms token={token} homeId={activeHomeId} onBack={() => setShowRooms(false)} />
)}
{activeTab === "home" && !showRooms && dashboard && (
  <div>
    {/* Header */}
<div style={s.homeHeader}>
  <div>
    <p style={s.greeting}>
      {new Date().getHours() < 12 ? t("home.goodMorning") :
       new Date().getHours() < 18 ? t("home.goodAfternoon") : t("home.goodEvening")}
    </p>
    <h1 style={s.greetingName}>
      {user?.name?.split(" ")[0] || "User"}
    </h1>
  </div>
  <div style={s.headerRight}>
    <div style={s.bellWrap}>
      <span style={s.bellIcon}>🔔</span>
      {dashboard.unread_alerts > 0 && localStorage.getItem("notificationsEnabled") !== "false" && (
        <span style={s.bellBadge}>{dashboard.unread_alerts}</span>
      )}
    </div>
  </div>
</div>

    {/* Hero card */}
    <div style={s.heroCard}>
      <div style={s.heroLeft}>
        <div style={s.heroTopRow}>
          <div>
            <p style={s.heroLabel}>⚡ {t("home.currentConsumption")}</p>
            <p style={s.heroWatts}>
              {(dashboard.appliances.reduce((sum, a) => sum + a.watts, 0) / 1000).toFixed(2)} <span style={{fontSize:"18px", fontWeight:"400"}}>kW</span>
            </p>
          </div>
          <span style={s.liveBadge}>● {t("home.live")}</span>
        </div>
        {/* Mini line chart */}
        <div style={s.miniChartWrap}>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={dashboard.appliances.map((a, i) => ({name: a.name, watts: a.watts}))}>
              <Line type="monotone" dataKey="watts" stroke="rgba(255,255,255,0.8)" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={s.heroDivider}/>
      <div style={s.heroRight}>
        <p style={s.heroLabel}>📋 {t("home.estimatedBill")}</p>
        <p style={s.heroBill}>{dashboard.bill.estimated_fcfa.toLocaleString()} FCFA</p>
        <p style={s.heroMonth}>{t("home.thisMonth")}</p>
        <div style={s.projectedBadge}>
          📈 {t("home.projected")}: {overviewData?.month?.projected_fcfa?.toLocaleString() || "—"} FCFA
        </div>
      </div>
    </div>

    {/* My Rooms */}
    <div style={s.section}>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>{t("home.myRooms")}</h2>
        <button style={s.viewAllBtn} onClick={() => setShowRooms(true)}>{t("home.seeRooms")}</button>
      </div>
      {roomsData.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={{ color: "var(--app-text-muted)", marginBottom: "12px" }}>{t("home.noRoomsYet")}</p>
          <button style={s.addBtnSmall} onClick={() => setShowRooms(true)}>{t("home.addFirstRoom")}</button>
        </div>
      ) : (
        <div style={s.roomsRow}>
          {roomsData.map((room, i) => (
            <div key={i} style={{
              ...s.roomCard,
              borderTop: `3px solid ${COLORS[i % COLORS.length]}`
            }}>
              <div style={s.roomTop}>
                <span style={s.roomIcon}>🏠</span>
              </div>
              <p style={{...s.roomName, color: COLORS[i % COLORS.length]}}>{room.name}</p>
              <p style={s.roomKw}>{room.kw} kW</p>
              <p style={s.roomDevices}>{room.device_count} Device{room.device_count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* AI Recommendation banner */}
    {suggestions.filter(s2 => s2.status === "pending").length > 0 && (
      <div style={s.aiBanner}>
        <div style={s.aiBannerLeft}>
          <span style={{fontSize:"28px"}}>🤖</span>
          <div>
            <p style={s.aiBannerTitle}>{t("home.aiRecommendation")}</p>
            <p style={s.aiBannerText}>
              {t("home.saveUpTo")}{" "}
              <strong>
                {suggestions
                  .filter(s2 => s2.status === "pending")
                  .reduce((sum, s2) => sum + s2.estimated_saving_fcfa, 0)
                  .toLocaleString()} FCFA
              </strong>{" "}
              {t("home.withActions")}
            </p>
          </div>
        </div>
        <button style={s.aiBannerBtn} onClick={() => setTab("alerts")}>
          {t("home.viewRecommendations")}
        </button>
      </div>
    )}

    {/* Recent Alerts */}
    {alerts.length > 0 && (
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>{t("home.recentAlerts")}</h2>
          <button style={s.viewAllBtn} onClick={() => setTab("alerts")}>{t("home.viewAll")}</button>
        </div>
        {alerts.slice(0, 2).map((a, i) => (
          <div key={i} style={s.recentAlertCard}>
            <div style={{
              ...s.recentAlertIcon,
              background: a.type === "spike" ? "#fef2f2" : "#eff6ff",
            }}>
              {a.type === "spike" ? "⚠️" : "ℹ️"}
            </div>
            <div style={s.recentAlertText}>
              <p style={s.recentAlertTitle}>{a.message.slice(0, 50)}...</p>
              <p style={s.recentAlertTime}>{a.created_at}</p>
            </div>
            <span style={{
              ...s.alertBadge,
              background: a.type === "spike" ? "#fef2f2" : "#eff6ff",
              color: a.type === "spike" ? "#ef4444" : "#3b82f6",
            }}>
              {a.type === "spike" ? "High" : "Info"}
            </span>
          </div>
        ))}
      </div>
    )}

    {/* Bottom stats bar */}
    {overviewData && (
      <div style={s.bottomBar}>
        {[
          { icon:"🔌", value:overviewData.devices.total, label:t("home.totalDevices"), sub:t("devices.online"), subColor:"#16a34a" },
          { icon:"📶", value:overviewData.devices.online, label:t("home.onlineDevices"), sub:null },
          { icon:"🛡", value:overviewData.devices.active_alerts, label:t("home.alertsLabel"), sub:t("home.active"), subColor:"#ef4444" },
          { icon:"🌿", value:`${overviewData.month.kwh} kWh`, label:t("home.thisMonthKwh"), sub:`▲ ${overviewData.month.change_vs_last_month}%`, subColor:"#16a34a" },
        ].map((item, i) => (
          <div key={i} style={s.bottomBarItem}>
            <span style={s.bottomBarIcon}>{item.icon}</span>
            <p style={s.bottomBarValue}>{item.value}</p>
            <p style={s.bottomBarLabel}>{item.label}</p>
            {item.sub && <p style={{...s.bottomBarSub, color: item.subColor}}>{item.sub}</p>}
          </div>
        ))}
      </div>
    )}
  </div>
)}

        {/* ── DEVICES TAB ── */}
        {activeTab === "devices" && <Devices token={token} homeId={activeHomeId} />}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div>
            <div style={s.pageHeader}>
              <div>
                <h1 style={s.pageTitle}>Consumption History</h1>
                <p style={s.pageSub}>Track your energy usage over time</p>
              </div>
            </div>

            {/* Mode selector */}
            <div style={s.modeSelector}>
              {["Day", "Week", "Month", "Year"].map(m => (
                <button key={m} style={{
                  ...s.modeBtn,
                  background: historyMode === m ? "#3b82f6" : "transparent",
                  color: historyMode === m ? "#fff" : "#666",
                }} onClick={() => setHistoryMode(m)}>
                  {m}
                </button>
              ))}
            </div>

            {/* Period navigator */}
            <div style={s.periodNav}>
              <button style={s.navArrow} onClick={() => navigatePeriod(-1)}>‹</button>
              <span style={s.periodLabel}>{getPeriodLabel()}</span>
              <button style={s.navArrow} onClick={() => navigatePeriod(1)}>›</button>
            </div>

            {historyData && (
              <>
                {/* Stats */}
                <div style={s.statsRow}>
                  <div style={s.statCard}>
                    <div style={s.statIcon}>⚡</div>
                    <div>
                      <p style={s.statLabel}>Total Consumption</p>
                      <p style={s.statValue}>{historyData.total_kwh} kWh</p>
                      {historyData.change_vs_prev !== undefined && (
                        <p style={{
                          ...s.statChange,
                          color: historyData.change_vs_prev >= 0 ? "#ef4444" : "#16a34a"
                        }}>
                          {historyData.change_vs_prev >= 0 ? "▲" : "▼"} {Math.abs(historyData.change_vs_prev)}% vs prev
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={s.statCard}>
                    <div style={{...s.statIcon, background:"#eff6ff", color:"#3b82f6"}}>📊</div>
                    <div>
                      <p style={s.statLabel}>
                        {historyMode === "Year" ? "Average per Month" : "Average per Day"}
                      </p>
                      <p style={s.statValue}>{historyData.avg_per_day_kwh} kWh</p>
                    </div>
                  </div>
                </div>

                {/* Bar chart */}
                <div style={s.chartCard}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={historyData.bars} margin={{top:10, right:10, left:0, bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" vertical={false}/>
                      <XAxis
                        dataKey={getBarKey()}
                        tick={{fill:"#aaa", fontSize:11}}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{fill:"#aaa", fontSize:11}}
                        axisLine={false}
                        tickLine={false}
                        unit=" kWh"
                      />
                      <Tooltip
                        contentStyle={{borderRadius:"12px", border:"none", boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}
                        formatter={(v) => [`${v} kWh`, "Consumption"]}
                      />
                      <defs>
                        <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6"/>
                          <stop offset="100%" stopColor="#93c5fd"/>
                        </linearGradient>
                      </defs>
                      <Bar dataKey="kwh" radius={[6,6,0,0]} fill="url(#blueGrad)"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Consumption by appliance */}
                {applianceData.length > 0 && (
                  <div style={s.chartCard}>
                    <h3 style={s.chartTitle}>Consumption by Appliance</h3>
                    {applianceData.map((a, i) => (
                      <div key={i} style={s.applianceRow}>
                        <div style={{...s.applianceDot, background:COLORS[i % COLORS.length]}}/>
                        <span style={s.applianceName}>{a.name}</span>
                        <div style={s.progressWrap}>
                          <div style={{
                            ...s.progressBar,
                            width:`${a.percentage}%`,
                            background:COLORS[i % COLORS.length],
                          }}/>
                        </div>
                        <span style={s.applianceKwh}>{a.kwh} kWh</span>
                        <span style={s.appliancePct}>{a.percentage}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost overview */}
                <div style={s.costCard}>
                  <div style={s.costHeader}>
                    <h3 style={s.chartTitle}>Cost Overview</h3>
                    <span style={s.fcfaBadge}>FCFA</span>
                  </div>
                  <div style={s.costRow}>
                    <div>
                      <p style={s.costLabel}>Estimated Cost</p>
                      <p style={s.costValue}>{historyData.estimated_fcfa?.toLocaleString()} FCFA</p>
                    </div>
                    <div>
                      <p style={s.costLabel}>Average per Day</p>
                      <p style={s.costValue}>{historyData.avg_fcfa_per_day?.toLocaleString() || "—"} FCFA</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {activeTab === "alerts" && (
          <div>
            <div style={s.pageHeader}>
              <h1 style={s.pageTitle}>Alerts & Schedules</h1>
            </div>

            <h2 style={s.sectionTitle}>🔔 Active Alerts</h2>
            {alerts.length === 0 ? (
              <div style={s.emptyCard}><p style={{color:"#aaa"}}>✅ No alerts — everything is normal</p></div>
            ) : alerts.map((a, i) => (
              <div key={i} style={{...s.alertCard, borderLeftColor:
                a.type==="spike" ? "#ef4444" : a.type==="extended_runtime" ? "#f59e0b" : "#3b82f6"
              }}>
                <div style={s.alertTop}>
                  <span style={s.alertAppliance}>{a.appliance}</span>
                  <span style={{...s.alertBadge,
                    background: a.type==="spike" ? "#fef2f2" : a.type==="extended_runtime" ? "#fffbeb" : "#eff6ff",
                    color: a.type==="spike" ? "#ef4444" : a.type==="extended_runtime" ? "#f59e0b" : "#3b82f6",
                  }}>{a.type.replace("_"," ")}</span>
                </div>
                <p style={s.alertMsg}>{a.message}</p>
                <p style={s.alertTime}>{a.created_at}</p>
              </div>
            ))}

            <h2 style={{...s.sectionTitle, marginTop:"28px"}}>💡 AI Suggestions</h2>
            {suggestions.length === 0 ? (
              <div style={s.emptyCard}><p style={{color:"#aaa"}}>No suggestions yet</p></div>
            ) : suggestions.map((s2, i) => (
              <div key={i} style={s.suggCard}>
                <div style={s.suggTop}>
                  <span style={s.suggAppliance}>{s2.appliance}</span>
                  <span style={{...s.statusPill,
                    background: s2.status==="accepted" ? "#dcfce7" : s2.status==="ignored" ? "#f3f4f6" : "#fffbeb",
                    color: s2.status==="accepted" ? "#16a34a" : s2.status==="ignored" ? "#9ca3af" : "#f59e0b",
                  }}>{s2.status}</span>
                </div>
                <p style={s.suggText}>{s2.suggestion}</p>
                <p style={s.suggSaving}>💰 Save {s2.estimated_saving_fcfa} FCFA/month</p>
                {s2.status === "pending" && (
                  <div style={s.suggBtns}>
                    <button style={s.acceptBtn} onClick={() => acceptSuggestion(s2.id)}>✅ Accept</button>
                    <button style={s.ignoreBtn} onClick={() => ignoreSuggestion(s2.id)}>Ignore</button>
                  </div>
                )}
              </div>
            ))}

            <div style={{...s.sectionHeader, marginTop:"28px"}}>
              <h2 style={s.sectionTitle}>🕐 Active Schedules</h2>
              <button style={s.viewAllBtn} onClick={openCreateSchedule}>+ Create Schedule</button>
            </div>
            {schedules.length === 0 ? (
              <div style={s.emptyCard}><p style={{color:"#aaa"}}>No schedules yet</p></div>
            ) : schedules.map((sc, i) => (
              <div key={i} style={s.scheduleCard}>
                <div style={s.scheduleLeft}>
                  <p style={s.scheduleAppliance}>{sc.appliance}</p>
                  <p style={s.scheduleTimes}>ON {sc.on_time} → OFF {sc.off_time}</p>
                  <span style={{...s.statusPill,
                    background: sc.source==="ai" ? "#eff6ff" : "#f3f4f6",
                    color: sc.source==="ai" ? "#3b82f6" : "#666",
                    fontSize:"11px"
                  }}>{sc.source}</span>
                </div>
                <div style={{display:"flex", gap:"8px"}}>
                  <button style={s.editScheduleBtn} onClick={() => openEditSchedule(sc)}>✎</button>
                  <button style={s.deleteBtn} onClick={() => deleteSchedule(sc.id)}>🗑</button>
                </div>
              </div>
            ))}

            {scheduleModal && (
              <Modal title={scheduleModal === "create" ? "Create Schedule" : "Edit Schedule"} onClose={() => setScheduleModal(null)}>
                {scheduleModal === "create" && (
                  <>
                    <label style={s.modalLabel}>Device</label>
                    <select
                      style={s.modalInput}
                      value={scheduleForm.monitored_point_id}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, monitored_point_id: e.target.value })}
                    >
                      <option value="">Select a device...</option>
                      {scheduleDevices.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} — {d.room}</option>
                      ))}
                    </select>
                  </>
                )}
                <label style={s.modalLabel}>Turn ON at</label>
                <input
                  type="time"
                  style={s.modalInput}
                  value={scheduleForm.on_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, on_time: e.target.value })}
                />
                <label style={s.modalLabel}>Turn OFF at</label>
                <input
                  type="time"
                  style={s.modalInput}
                  value={scheduleForm.off_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, off_time: e.target.value })}
                />
                {scheduleError && <p style={{color:"#ef4444", fontSize:"12px", margin:"-8px 0 12px"}}>{scheduleError}</p>}
                <button style={s.modalSaveBtn} onClick={submitScheduleForm}>
                  {scheduleModal === "create" ? "Create" : "Save Changes"}
                </button>
              </Modal>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <Profile token={token} user={user} homeId={activeHomeId} onLogout={onLogout} onUpdateUser={onUpdateUser} />
        )}
          </>
        )}
      </div>
    </div>
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
      setError("Could not create home.");
    }
  };

  return (
    <div style={s.switcherWrap}>
      <button style={s.switcherTrigger} onClick={() => setOpen((v) => !v)}>
        <span style={s.sidebarLogo}>⚡</span>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <p style={s.switcherHomeName}>{activeHome?.name || "EnergiBox"}</p>
          <p style={s.switcherHint}>{t("nav.switchHome")} ▾</p>
        </div>
      </button>

      {open && (
        <div style={s.switcherOverlay} onClick={() => { setOpen(false); setAdding(false); }}>
          <div style={s.switcherSheet} onClick={(e) => e.stopPropagation()}>
            <p style={s.switcherTitle}>Your Homes</p>
            {homes.map((h) => (
              <button
                key={h.id}
                style={s.switcherRow}
                onClick={() => { onSwitchHome(h.id); setOpen(false); }}
              >
                <span style={s.switcherRowIcon}>🏠</span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={s.switcherRowName}>{h.name}</p>
                  <p style={s.switcherRowSub}>{h.room_count} room{h.room_count !== 1 ? "s" : ""} · {h.device_count} device{h.device_count !== 1 ? "s" : ""}</p>
                </div>
                {h.id === activeHomeId && <span style={s.switcherCheck}>✓</span>}
              </button>
            ))}

            {adding ? (
              <div style={s.switcherAddForm}>
                <input style={s.switcherInput} placeholder="Home name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input style={s.switcherInput} placeholder="Address (optional)" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
                {error && <p style={{ color: "#ef4444", fontSize: "12px", margin: "0 0 8px" }}>{error}</p>}
                <button style={s.switcherCreateBtn} onClick={createHome}>Create Home</button>
              </div>
            ) : (
              <button style={s.switcherAddBtn} onClick={() => setAdding(true)}>+ Add another home</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { display:"flex", minHeight:"100vh", background:"var(--app-page-bg)", fontFamily:"'Segoe UI', sans-serif" },
  sidebar: { width:"220px", background:"var(--app-surface-bg)", borderRight:"1px solid var(--app-border-strong)", display:"flex", flexDirection:"column", flexShrink:0, boxShadow:"2px 0 8px rgba(0,0,0,0.04)" },
  sidebarHeader: { display:"flex", alignItems:"center", gap:"10px", padding:"24px 20px", borderBottom:"1px solid var(--app-border)" },
  sidebarLogo: { fontSize:"22px" },
  sidebarBrand: { fontSize:"18px", fontWeight:"700", color:"#1e40af" },

  switcherWrap: { borderBottom:"1px solid var(--app-border)", position:"relative" },
  switcherTrigger: { width:"100%", display:"flex", alignItems:"center", gap:"10px", padding:"20px", border:"none", background:"transparent", cursor:"pointer" },
  switcherHomeName: { fontSize:"15px", fontWeight:"700", color:"var(--app-text-primary)", margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  switcherHint: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },
  switcherOverlay: { position:"fixed", inset:0, background:"rgba(15,23,42,0.35)", zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"flex-start" },
  switcherSheet: { background:"var(--app-surface-bg)", borderRadius:"16px", margin:"14px", width:"280px", boxShadow:"0 20px 50px rgba(0,0,0,0.25)", padding:"14px", maxHeight:"80vh", overflowY:"auto" },
  switcherTitle: { fontSize:"11px", fontWeight:"700", color:"var(--app-text-muted)", textTransform:"uppercase", letterSpacing:"0.5px", margin:"4px 0 10px" },
  switcherRow: { width:"100%", display:"flex", alignItems:"center", gap:"10px", padding:"10px", border:"none", borderRadius:"10px", background:"transparent", cursor:"pointer", marginBottom:"2px" },
  switcherRowIcon: { fontSize:"18px" },
  switcherRowName: { fontSize:"13px", fontWeight:"700", color:"var(--app-text-primary)", margin:0 },
  switcherRowSub: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },
  switcherCheck: { color:"#3b82f6", fontWeight:"700" },
  switcherAddBtn: { width:"100%", padding:"10px", borderRadius:"10px", border:"1px dashed var(--app-border-strong)", background:"transparent", color:"#3b82f6", cursor:"pointer", fontWeight:"600", fontSize:"13px", marginTop:"6px" },
  switcherAddForm: { marginTop:"8px", padding:"10px", background:"var(--app-page-bg)", borderRadius:"10px" },
  switcherInput: { width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:"8px", border:"1px solid var(--app-border-strong)", fontSize:"13px", marginBottom:"8px", outline:"none", background:"var(--app-surface-bg)", color:"var(--app-text-primary)" },
  switcherCreateBtn: { width:"100%", padding:"9px", borderRadius:"8px", background:"#3b82f6", color:"#fff", border:"none", cursor:"pointer", fontWeight:"600", fontSize:"13px" },
  nav: { flex:1, padding:"12px 0", display:"flex", flexDirection:"column", gap:"2px" },
  navBtn: { display:"flex", alignItems:"center", gap:"12px", padding:"11px 20px", border:"none", cursor:"pointer", fontSize:"14px", textAlign:"left", transition:"all .15s", borderRadius:"0" },
  navIcon: { fontSize:"18px", flexShrink:0 },
  logoutBtn: { padding:"16px 20px", border:"none", borderTop:"1px solid var(--app-border)", background:"transparent", cursor:"pointer", color:"#ef4444", fontSize:"14px", fontWeight:"500", textAlign:"left" },
  main: { flex:1, padding:"32px", overflowY:"auto" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"24px" },
  pageTitle: { fontSize:"26px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 4px" },
  pageSub: { fontSize:"14px", color:"var(--app-text-muted)", margin:0 },
  alertPill: { background:"#fef3c7", color:"#d97706", padding:"8px 16px", borderRadius:"20px", fontSize:"13px", fontWeight:"600", border:"1px solid #fde68a" },
  billCard: { background:"linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius:"20px", padding:"28px 32px", marginBottom:"24px", display:"flex", justifyContent:"space-between", alignItems:"center", boxShadow:"0 8px 32px rgba(59,130,246,0.3)" },
  billLabel: { color:"rgba(255,255,255,0.8)", fontSize:"13px", margin:"0 0 8px" },
  billAmt: { color:"#fff", fontSize:"40px", fontWeight:"700", margin:"0 0 4px" },
  billSub: { color:"rgba(255,255,255,0.7)", fontSize:"13px", margin:0 },
  sectionTitle: { fontSize:"17px", fontWeight:"600", color:"var(--app-text-primary)", marginBottom:"14px" },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"16px", marginBottom:"24px" },
  appCard: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"20px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  appTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" },
  appIconBox: { fontSize:"24px", width:"44px", height:"44px", background:"#eff6ff", borderRadius:"12px", display:"flex", alignItems:"center", justifyContent:"center" },
  statusPill: { padding:"4px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" },
  appName: { fontSize:"13px", color:"var(--app-text-secondary)", margin:"0 0 4px", fontWeight:"500" },
  appWatts: { fontSize:"24px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 2px" },
  appTime: { fontSize:"11px", color:"var(--app-text-muted)", margin:"0 0 14px" },
  toggleRow: { display:"flex", gap:"8px" },
  onBtn: { flex:1, padding:"8px", borderRadius:"8px", background:"#dcfce7", color:"#16a34a", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"13px" },
  offBtn: { flex:1, padding:"8px", borderRadius:"8px", background:"#fee2e2", color:"#ef4444", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"13px" },
  modeSelector: { display:"flex", background:"var(--app-surface-bg)", borderRadius:"12px", padding:"4px", marginBottom:"20px", width:"fit-content", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  modeBtn: { padding:"8px 20px", border:"none", borderRadius:"10px", cursor:"pointer", fontSize:"14px", fontWeight:"500", transition:"all .15s" },
  periodNav: { display:"flex", alignItems:"center", gap:"16px", marginBottom:"20px" },
  navArrow: { width:"36px", height:"36px", borderRadius:"8px", border:"1px solid var(--app-border-strong)", background:"var(--app-surface-bg)", cursor:"pointer", fontSize:"18px", display:"flex", alignItems:"center", justifyContent:"center" },
  periodLabel: { fontSize:"16px", fontWeight:"600", color:"var(--app-text-primary)", minWidth:"200px", textAlign:"center" },
  statsRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px", marginBottom:"20px" },
  statCard: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"20px", display:"flex", alignItems:"center", gap:"14px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  statIcon: { width:"44px", height:"44px", borderRadius:"12px", background:"#fef3c7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", flexShrink:0 },
  statLabel: { fontSize:"12px", color:"var(--app-text-muted)", margin:"0 0 4px", fontWeight:"500" },
  statValue: { fontSize:"20px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 2px" },
  statChange: { fontSize:"12px", margin:0, fontWeight:"500" },
  chartCard: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"20px", marginBottom:"20px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  chartTitle: { fontSize:"15px", fontWeight:"600", color:"var(--app-text-primary)", margin:"0 0 16px" },
  applianceRow: { display:"flex", alignItems:"center", gap:"12px", marginBottom:"14px" },
  applianceDot: { width:"10px", height:"10px", borderRadius:"50%", flexShrink:0 },
  applianceName: { fontSize:"13px", color:"var(--app-text-primary)", fontWeight:"500", width:"120px", flexShrink:0 },
  progressWrap: { flex:1, height:"8px", background:"var(--app-border)", borderRadius:"4px", overflow:"hidden" },
  progressBar: { height:"100%", borderRadius:"4px", transition:"width .5s" },
  applianceKwh: { fontSize:"13px", color:"var(--app-text-primary)", fontWeight:"600", width:"70px", textAlign:"right", flexShrink:0 },
  appliancePct: { fontSize:"12px", color:"var(--app-text-muted)", width:"40px", textAlign:"right", flexShrink:0 },
  costCard: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"20px", marginBottom:"20px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  costHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" },
  fcfaBadge: { background:"#eff6ff", color:"#3b82f6", padding:"4px 10px", borderRadius:"8px", fontSize:"12px", fontWeight:"700" },
  costRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" },
  costLabel: { fontSize:"12px", color:"var(--app-text-muted)", margin:"0 0 6px" },
  costValue: { fontSize:"22px", fontWeight:"700", color:"var(--app-text-primary)", margin:0 },
  alertCard: { background:"var(--app-surface-bg)", borderRadius:"14px", padding:"16px 20px", marginBottom:"12px", borderLeft:"4px solid #ef4444", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" },
  alertTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" },
  alertAppliance: { fontSize:"14px", fontWeight:"700", color:"var(--app-text-primary)" },
  alertBadge: { padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"600", textTransform:"capitalize" },
  alertMsg: { fontSize:"13px", color:"var(--app-text-secondary)", margin:"0 0 6px" },
  alertTime: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },
  suggCard: { background:"var(--app-surface-bg)", borderRadius:"14px", padding:"16px 20px", marginBottom:"12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)" },
  suggTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" },
  suggAppliance: { fontSize:"14px", fontWeight:"700", color:"var(--app-text-primary)" },
  suggText: { fontSize:"13px", color:"var(--app-text-secondary)", margin:"0 0 8px", lineHeight:"1.5" },
  suggSaving: { fontSize:"13px", fontWeight:"600", color:"var(--app-text-primary)", margin:"0 0 12px" },
  suggBtns: { display:"flex", gap:"8px" },
  acceptBtn: { padding:"8px 16px", borderRadius:"8px", background:"#3b82f6", color:"#fff", border:"none", cursor:"pointer", fontSize:"13px", fontWeight:"600" },
  ignoreBtn: { padding:"8px 16px", borderRadius:"8px", background:"var(--app-border)", color:"var(--app-text-secondary)", border:"1px solid var(--app-border-strong)", cursor:"pointer", fontSize:"13px", fontWeight:"600" },
  scheduleCard: { background:"var(--app-surface-bg)", borderRadius:"14px", padding:"16px 20px", marginBottom:"12px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)" },
  scheduleLeft: { display:"flex", flexDirection:"column", gap:"4px" },
  scheduleAppliance: { fontSize:"14px", fontWeight:"700", color:"var(--app-text-primary)", margin:0 },
  scheduleTimes: { fontSize:"13px", color:"var(--app-text-secondary)", margin:0 },
  deleteBtn: { background:"#fee2e2", border:"none", borderRadius:"8px", padding:"8px 12px", cursor:"pointer", fontSize:"16px" },
  editScheduleBtn: { background:"#eff6ff", color:"#3b82f6", border:"none", borderRadius:"8px", padding:"8px 12px", cursor:"pointer", fontSize:"14px" },

  overlay: { position:"fixed", inset:0, background:"rgba(15,23,42,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" },
  modal: { background:"var(--app-surface-bg)", borderRadius:"18px", width:"380px", maxWidth:"100%", maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" },
  modalHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 20px", borderBottom:"1px solid var(--app-border)" },
  modalTitle: { fontSize:"16px", fontWeight:"700", color:"var(--app-text-primary)", margin:0 },
  modalClose: { border:"none", background:"var(--app-border)", borderRadius:"8px", width:"28px", height:"28px", cursor:"pointer", color:"var(--app-text-secondary)" },
  modalBody: { padding:"20px" },
  modalLabel: { display:"block", fontSize:"12px", fontWeight:"600", color:"var(--app-text-secondary)", margin:"0 0 6px" },
  modalInput: { width:"100%", boxSizing:"border-box", padding:"10px 14px", borderRadius:"10px", border:"1px solid var(--app-border-strong)", fontSize:"14px", marginBottom:"16px", outline:"none", background:"var(--app-surface-bg)", color:"var(--app-text-primary)" },
  modalSaveBtn: { width:"100%", padding:"12px", borderRadius:"10px", background:"#3b82f6", color:"#fff", border:"none", cursor:"pointer", fontWeight:"700", fontSize:"14px" },
  emptyCard: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"48px 24px", textAlign:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
  addBtn: { padding:"10px 20px", background:"#3b82f6", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer", fontWeight:"600", fontSize:"14px" },
  addBtnSmall: { padding:"10px 18px", borderRadius:"10px", background:"#3b82f6", color:"#fff", border:"none", cursor:"pointer", fontWeight:"600", fontSize:"13px" },
  chartCardHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" },
  // Home header
homeHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"24px" },
greeting: { fontSize:"14px", color:"var(--app-text-muted)", margin:"0 0 2px" },
greetingName: { fontSize:"28px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 2px" },
greetingSubtitle: { fontSize:"13px", color:"var(--app-text-muted)", margin:0 },
headerRight: { display:"flex", alignItems:"center", gap:"12px" },
bellWrap: { position:"relative", cursor:"pointer" },
bellIcon: { fontSize:"24px" },
bellBadge: { position:"absolute", top:"-4px", right:"-4px", background:"#ef4444", color:"#fff", fontSize:"10px", fontWeight:"700", width:"16px", height:"16px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center" },
weatherCard: { display:"flex", alignItems:"center", gap:"8px", background:"var(--app-surface-bg)", padding:"8px 14px", borderRadius:"12px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1px solid var(--app-border)" },
weatherTemp: { fontSize:"14px", fontWeight:"700", color:"var(--app-text-primary)", margin:0 },
weatherCity: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },

// Hero card
heroCard: { background:"linear-gradient(135deg, #1d4ed8, #3b82f6)", borderRadius:"20px", padding:"24px", marginBottom:"20px", display:"flex", gap:"24px", boxShadow:"0 8px 32px rgba(59,130,246,0.3)", color:"#fff" },
heroLeft: { flex:1 },
heroTopRow: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"8px" },
heroLabel: { fontSize:"12px", color:"rgba(255,255,255,0.7)", margin:"0 0 6px" },
heroWatts: { fontSize:"36px", fontWeight:"700", color:"#fff", margin:"0 0 2px" },
heroPower: { fontSize:"12px", color:"rgba(255,255,255,0.7)", margin:0 },
liveBadge: { background:"rgba(255,255,255,0.2)", color:"#fff", padding:"4px 12px", borderRadius:"20px", fontSize:"12px", fontWeight:"600", flexShrink:0 },
miniChartWrap: { marginTop:"8px" },
heroDivider: { width:"1px", background:"rgba(255,255,255,0.2)" },
heroRight: { flex:1, paddingLeft:"24px" },
heroBill: { fontSize:"28px", fontWeight:"700", color:"#fff", margin:"0 0 2px" },
heroMonth: { fontSize:"12px", color:"rgba(255,255,255,0.7)", margin:"0 0 12px" },
projectedBadge: { background:"rgba(255,255,255,0.15)", color:"#fff", padding:"6px 12px", borderRadius:"10px", fontSize:"12px" },

// 4 stat cards
statsGrid: { display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"12px", marginBottom:"24px" },
statMiniCard: { background:"var(--app-surface-bg)", borderRadius:"14px", padding:"16px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)", textAlign:"center" },
statMiniIcon: { fontSize:"22px", marginBottom:"8px" },
statMiniLabel: { fontSize:"11px", color:"var(--app-text-muted)", margin:"0 0 4px", fontWeight:"500" },
statMiniValue: { fontSize:"16px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 4px" },
statMiniChange: { fontSize:"11px", margin:0, fontWeight:"500" },

// Rooms
section: { marginBottom:"24px" },
sectionHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" },
viewAllBtn: { background:"none", border:"none", color:"#3b82f6", cursor:"pointer", fontSize:"13px", fontWeight:"600" },
roomsRow: { display:"flex", gap:"14px", overflowX:"auto", paddingBottom:"8px" },
roomCard: { background:"var(--app-surface-bg)", borderRadius:"14px", padding:"16px", minWidth:"150px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)", flexShrink:0 },
roomTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" },
roomIcon: { fontSize:"22px" },
roomToggle: { background:"var(--app-border)", border:"none", borderRadius:"8px", padding:"4px 8px", cursor:"pointer", fontSize:"14px" },
roomName: { fontSize:"14px", fontWeight:"700", margin:"0 0 4px" },
roomKw: { fontSize:"18px", fontWeight:"700", color:"var(--app-text-primary)", margin:"0 0 2px" },
roomDevices: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },

// AI Banner
aiBanner: { background:"linear-gradient(135deg, #eff6ff, #dbeafe)", borderRadius:"16px", padding:"20px 24px", marginBottom:"24px", display:"flex", justifyContent:"space-between", alignItems:"center", border:"1px solid #bfdbfe" },
aiBannerLeft: { display:"flex", alignItems:"center", gap:"16px" },
aiBannerTitle: { fontSize:"13px", color:"#1d4ed8", fontWeight:"600", margin:"0 0 4px" },
aiBannerText: { fontSize:"14px", color:"#1e40af", margin:0 },
aiBannerBtn: { background:"#3b82f6", color:"#fff", border:"none", borderRadius:"10px", padding:"10px 18px", cursor:"pointer", fontSize:"13px", fontWeight:"600", whiteSpace:"nowrap" },

// Recent alerts
recentAlertCard: { background:"var(--app-surface-bg)", borderRadius:"12px", padding:"14px 16px", marginBottom:"10px", display:"flex", alignItems:"center", gap:"14px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)" },
recentAlertIcon: { width:"40px", height:"40px", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px", flexShrink:0 },
recentAlertText: { flex:1 },
recentAlertTitle: { fontSize:"13px", fontWeight:"600", color:"var(--app-text-primary)", margin:"0 0 3px" },
recentAlertTime: { fontSize:"11px", color:"var(--app-text-muted)", margin:0 },

// Bottom bar
bottomBar: { background:"var(--app-surface-bg)", borderRadius:"16px", padding:"16px", display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"8px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", border:"1px solid var(--app-border)", marginBottom:"24px" },
bottomBarItem: { textAlign:"center", padding:"8px" },
bottomBarIcon: { fontSize:"24px" },
bottomBarValue: { fontSize:"18px", fontWeight:"700", color:"var(--app-text-primary)", margin:"4px 0 2px" },
bottomBarLabel: { fontSize:"11px", color:"var(--app-text-muted)", margin:"0 0 2px" },
bottomBarSub: { fontSize:"11px", fontWeight:"600", margin:0 },
};