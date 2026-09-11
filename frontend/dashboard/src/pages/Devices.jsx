import { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";

// Accepts colon, hyphen, dot or no separator and normalizes to the canonical
// AA:BB:CC:DD:EE:FF form the EnergiBox firmware and MQTT topics actually use —
// otherwise a differently-formatted but valid MAC would be stored and
// silently never match the real device.
function normalizeMac(input) {
  const hex = input.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(":");
}

function getIcon(name = "", type = "appliance") {
  if (type === "socket") return "🔌";
  const n = name.toLowerCase();
  if (n.includes("ac") || n.includes("air")) return "❄️";
  if (n.includes("fridge") || n.includes("refrigerator")) return "🧊";
  if (n.includes("wash")) return "🧺";
  if (n.includes("light") || n.includes("lamp") || n.includes("bulb")) return "💡";
  if (n.includes("tv") || n.includes("television")) return "📺";
  if (n.includes("charger") || n.includes("ev")) return "🔌";
  if (n.includes("battery")) return "🔋";
  if (n.includes("water") || n.includes("heater")) return "🚿";
  if (n.includes("microwave") || n.includes("oven")) return "🍽️";
  if (n.includes("coffee")) return "☕";
  if (n.includes("fan")) return "🌀";
  return "📦";
}

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

export default function Devices({ token, homeId }) {
  const { t } = useLanguage();
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedMac, setSelectedMac] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // "device"
  const [togglingMacs, setTogglingMacs] = useState({});

  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });
  const [deviceError, setDeviceError] = useState("");
  const [saving, setSaving] = useState(false);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDevices = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/devices?home_id=${homeId}`, authHeaders);
      setDevices(res.data);
    } catch (err) {}
    setLoading(false);
  };

  const fetchRooms = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/rooms?home_id=${homeId}`, authHeaders);
      setRooms(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, [homeId]);

  const toggleDevice = async (e, d) => {
    e.stopPropagation();
    if (togglingMacs[d.mac]) return;
    const nextIsOn = !d.is_on;
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: true }));
    try {
      await axios.post(`${API}/control/${d.mac}?command=${nextIsOn ? "ON" : "OFF"}`, null, authHeaders);
      setDevices((prev) => prev.map((x) => (x.mac === d.mac ? { ...x, is_on: nextIsOn } : x)));
      setTimeout(fetchDevices, 500);
    } catch (err) {}
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: false }));
  };

  if (selectedMac) {
    return <DeviceDetail mac={selectedMac} rooms={rooms} token={token} homeId={homeId} onBack={() => { setSelectedMac(null); fetchDevices(); }} />;
  }

  const filtered = devices.filter((d) => {
    if (filter === "online") return d.status === "online";
    if (filter === "offline") return d.status !== "online";
    return true;
  });

  const totalKw = devices.reduce((sum, d) => sum + (d.watts || 0), 0) / 1000;

  const closeModals = () => {
    setActiveModal(null);
    setDeviceError("");
    setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
  };

  const submitNewDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setDeviceError("Room, name and MAC address are required.");
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setDeviceError("Enter a valid MAC address — 12 hex digits, e.g. AA:BB:CC:DD:EE:FF.");
      return;
    }
    setSaving(true);
    setDeviceError("");
    try {
      await axios.post(
        `${API}/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}&type=${type}&mac_address=${encodeURIComponent(normalizedMac)}`,
        null, authHeaders
      );
      await fetchDevices();
      closeModals();
    } catch (err) {
      setDeviceError(err.response?.data?.detail || "Could not add device. Check the MAC address.");
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("devices.title")}</h1>
          <p style={s.pageSub}>{t("devices.subtitle")}</p>
        </div>
        <button style={s.addBtn} onClick={() => setActiveModal("device")} title="Add Appliance / Socket">+</button>
      </div>

      <div style={s.filterRow}>
        {[
          { id: "all", label: `${t("devices.all")} (${devices.length})` },
          { id: "online", label: t("devices.online") },
          { id: "offline", label: t("devices.offline") },
        ].map((f) => (
          <button
            key={f.id}
            style={{
              ...s.filterBtn,
              background: filter === f.id ? "#3b82f6" : "var(--app-border)",
              color: filter === f.id ? "#fff" : "var(--app-text-secondary)",
            }}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={s.listHeader}>
        <h2 style={s.listTitle}>{t("devices.myHome")}</h2>
        <p style={s.powerUse}>
          {t("devices.powerUse")} <span style={s.powerUseVal}>{totalKw.toFixed(2)} kW</span>
        </p>
      </div>

      {loading ? (
        <div style={s.emptyCard}><p style={{ color: "var(--app-text-muted)" }}>{t("devices.loading")}</p></div>
      ) : filtered.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={{ color: "var(--app-text-muted)", marginBottom: "12px" }}>{t("devices.noDevices")}</p>
          <button style={s.addBtnSmall} onClick={() => setActiveModal("device")}>{t("devices.addFirstDevice")}</button>
        </div>
      ) : (
        filtered.map((d) => (
          <div
            key={d.mac}
            style={s.deviceRow}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedMac(d.mac)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedMac(d.mac); } }}
          >
            <span style={s.deviceIconBox}>{getIcon(d.name, d.type)}</span>
            <div style={s.deviceInfo}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <p style={s.deviceName}>{d.name}</p>
                <span style={s.typeTag}>{d.type === "socket" ? "Socket" : "Appliance"}</span>
              </div>
              <p style={s.deviceRoom}>{d.room}</p>
              <p style={{ ...s.deviceStatus, color: d.status === "online" ? "#16a34a" : "#ef4444" }}>
                {d.status === "online" ? t("devices.online") : t("devices.offline")}
              </p>
            </div>
            <div style={s.deviceRight}>
              <p style={s.deviceKw}>{(d.watts / 1000).toFixed(2)} kW</p>
              <button
                style={{
                  ...s.statePill,
                  border: "none", cursor: "pointer",
                  background: d.is_on ? "#dcfce7" : "#fee2e2",
                  color: d.is_on ? "#16a34a" : "#ef4444",
                }}
                onClick={(e) => toggleDevice(e, d)}
                disabled={!!togglingMacs[d.mac]}
                title={d.is_on ? "Turn off" : "Turn on"}
              >
                {d.is_on ? "On" : "Off"}
              </button>
            </div>
            <span style={s.chevron}>›</span>
          </div>
        ))
      )}

      {/* ── Add Device modal ── */}
      {activeModal === "device" && (
        <Modal title="Add Appliance or Socket" onClose={closeModals}>
          <label style={s.label}>Room</label>
          <select
            style={s.input}
            value={newDevice.room_id}
            onChange={(e) => setNewDevice({ ...newDevice, room_id: e.target.value })}
          >
            <option value="">Select a room...</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {rooms.length === 0 && (
            <p style={s.infoTextMuted}>No rooms yet — go to Home → See Rooms to add one first.</p>
          )}

          <label style={s.label}>Name</label>
          <input
            style={s.input}
            placeholder="e.g. Living Room TV"
            value={newDevice.name}
            onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
          />

          <label style={s.label}>Type</label>
          <div style={s.typeRow}>
            {["appliance", "socket"].map((t) => (
              <button
                key={t}
                style={{
                  ...s.typeChoice,
                  background: newDevice.type === t ? "#3b82f6" : "var(--app-border)",
                  color: newDevice.type === t ? "#fff" : "var(--app-text-secondary)",
                }}
                onClick={() => setNewDevice({ ...newDevice, type: t })}
              >
                {t === "appliance" ? "Appliance (fixed device)" : "Socket (shared / mobile use)"}
              </button>
            ))}
          </div>

          <label style={s.label}>EnergiBox MAC Address</label>
          <input
            style={s.input}
            placeholder="AA:BB:CC:DD:EE:FF"
            value={newDevice.mac}
            onChange={(e) => setNewDevice({ ...newDevice, mac: e.target.value.toUpperCase() })}
          />
          <p style={s.infoTextMuted}>
            If this EnergiBox hasn't connected before, it's registered offline and comes
            online automatically the first time it publishes over MQTT.
          </p>

          {deviceError && <p style={s.errorText}>{deviceError}</p>}
          <button style={s.saveBtn} onClick={submitNewDevice} disabled={saving}>
            {saving ? "Adding..." : "Add Device"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function DeviceDetail({ mac, rooms, token, homeId, onBack }) {
  const { t } = useLanguage();
  const [device, setDevice] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [onTime, setOnTime] = useState("07:00");
  const [offTime, setOffTime] = useState("22:00");
  const [toggling, setToggling] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [editScheduleOnTime, setEditScheduleOnTime] = useState("");
  const [editScheduleOffTime, setEditScheduleOffTime] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("appliance");
  const [editRoomId, setEditRoomId] = useState("");

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDevice = async () => {
    try {
      const res = await axios.get(`${API}/devices/${mac}`, authHeaders);
      setDevice(res.data);
    } catch (err) {}
  };

  const fetchSchedules = async () => {
    try {
      const res = await axios.get(`${API}/schedules?home_id=${homeId}`, authHeaders);
      setSchedules(res.data);
    } catch (err) {}
  };

  const fetchAlerts = async () => {
    try {
      const res = await axios.get(`${API}/alerts?home_id=${homeId}`, authHeaders);
      setAlerts(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchDevice();
    fetchSchedules();
    fetchAlerts();
    const interval = setInterval(fetchDevice, 3000);
    return () => clearInterval(interval);
  }, [mac]);

  const togglePower = async () => {
    if (toggling) return;
    const nextIsOn = !device.is_on;
    setToggling(true);
    try {
      await axios.post(`${API}/control/${mac}?command=${nextIsOn ? "ON" : "OFF"}`, null, authHeaders);
      setDevice((prev) => (prev ? { ...prev, is_on: nextIsOn } : prev));
      setTimeout(fetchDevice, 500);
    } catch (err) {}
    setToggling(false);
  };

  const addSchedule = async () => {
    if (!device) return;
    await axios.post(
      `${API}/schedules?monitored_point_id=${device.id}&on_time=${onTime}&off_time=${offTime}&source=manual`,
      null, authHeaders
    );
    fetchSchedules();
  };

  const deleteSchedule = async (id) => {
    await axios.delete(`${API}/schedules/${id}`, authHeaders);
    fetchSchedules();
  };

  const startEditSchedule = (sc) => {
    setEditingScheduleId(sc.id);
    setEditScheduleOnTime(sc.on_time.slice(0, 5));
    setEditScheduleOffTime(sc.off_time.slice(0, 5));
  };

  const cancelEditSchedule = () => setEditingScheduleId(null);

  const saveScheduleEdit = async (id) => {
    await axios.put(
      `${API}/schedules/${id}?on_time=${editScheduleOnTime}&off_time=${editScheduleOffTime}`,
      null, authHeaders
    );
    setEditingScheduleId(null);
    fetchSchedules();
  };

  const openEdit = () => {
    setEditName(device.name);
    setEditType(device.type);
    setEditRoomId(String(device.room_id));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    await axios.put(
      `${API}/monitored_points/${device.id}?name=${encodeURIComponent(editName)}&type=${editType}&room_id=${editRoomId}`,
      null, authHeaders
    );
    setEditOpen(false);
    fetchDevice();
  };

  const deleteDevice = async () => {
    if (!window.confirm(`Delete ${device.name}? This removes its history, alerts and schedules.`)) return;
    await axios.delete(`${API}/monitored_points/${device.id}`, authHeaders);
    onBack();
  };

  if (!device) {
    return (
      <div style={s.emptyCard}><p style={{ color: "#aaa" }}>Loading device...</p></div>
    );
  }

  const deviceSchedules = schedules.filter((sc) => sc.monitored_point_id === device.id);
  const deviceAlerts = alerts.filter((a) => a.appliance === device.name).slice(0, 3);

  return (
    <div>
      <button style={s.backBtn} onClick={onBack}>{t("devices.backToDevices")}</button>

      <div style={s.detailHeader}>
        <span style={s.detailIcon}>{getIcon(device.name, device.type)}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h1 style={s.detailName}>{device.name}</h1>
            <span style={s.typeTag}>{device.type === "socket" ? "Socket" : "Appliance"}</span>
          </div>
          <p style={s.detailRoom}>📍 {device.room}</p>
        </div>
        <span style={{
          ...s.statePill,
          marginLeft: "auto",
          background: device.status === "online" ? "#dcfce7" : "#fee2e2",
          color: device.status === "online" ? "#16a34a" : "#ef4444",
        }}>
          {device.status === "online" ? t("devices.online") : t("devices.offline")}
        </span>
      </div>

      {/* Power card */}
      <div style={s.powerCard}>
        <div>
          <p style={s.powerLabel}>Current Power</p>
          <p style={s.powerWatts}>{device.watts} <span style={{ fontSize: "16px", fontWeight: 400 }}>W</span></p>
        </div>
        <button
          style={{ ...s.powerToggle, background: device.is_on ? "#3b82f6" : "var(--app-border-strong)" }}
          onClick={togglePower}
          disabled={toggling}
        >
          <span style={{ ...s.powerToggleThumb, left: device.is_on ? "26px" : "3px" }} />
        </button>
      </div>

      {/* Mini chart */}
      {device.recent_readings?.length > 1 && (
        <div style={s.chartCard}>
          <p style={s.chartTitle}>Recent Activity</p>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={device.recent_readings}>
              <XAxis dataKey="timestamp" hide />
              <Tooltip formatter={(v) => [`${v} W`, "Power"]} labelFormatter={() => ""} />
              <Line type="monotone" dataKey="watts" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Runtime stats */}
      <p style={s.sectionLabel}>Runtime</p>
      <div style={s.runtimeRow}>
        <div style={s.runtimeCard}>
          <p style={s.runtimeLabel}>Today</p>
          <p style={s.runtimeValue}>{device.runtime.today_hours}h</p>
        </div>
        <div style={s.runtimeCard}>
          <p style={s.runtimeLabel}>Past 7 Days</p>
          <p style={s.runtimeValue}>{device.runtime.past_7_days_hours}h</p>
        </div>
        <div style={s.runtimeCard}>
          <p style={s.runtimeLabel}>Past 30 Days</p>
          <p style={s.runtimeValue}>{device.runtime.past_30_days_hours}h</p>
        </div>
      </div>

      {/* Schedule */}
      <p style={s.sectionLabel}>Schedule</p>
      <div style={s.card}>
        {deviceSchedules.length === 0 ? (
          <p style={s.emptyText}>No schedules for this device yet</p>
        ) : (
          deviceSchedules.map((sc) =>
            editingScheduleId === sc.id ? (
              <div key={sc.id} style={s.scheduleRow}>
                <input type="time" style={s.timeInput} value={editScheduleOnTime} onChange={(e) => setEditScheduleOnTime(e.target.value)} />
                <span style={{ color: "var(--app-text-muted)" }}>→</span>
                <input type="time" style={s.timeInput} value={editScheduleOffTime} onChange={(e) => setEditScheduleOffTime(e.target.value)} />
                <button style={s.addScheduleBtn} onClick={() => saveScheduleEdit(sc.id)}>Save</button>
                <button style={s.cancelBtn} onClick={cancelEditSchedule}>Cancel</button>
              </div>
            ) : (
              <div key={sc.id} style={s.scheduleRow}>
                <div>
                  <p style={s.scheduleTimes}>ON {sc.on_time} → OFF {sc.off_time}</p>
                  <span style={{
                    ...s.sourceTag,
                    background: sc.source === "ai" ? "#eff6ff" : "var(--app-border)",
                    color: sc.source === "ai" ? "#3b82f6" : "var(--app-text-secondary)",
                  }}>{sc.source}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button style={s.scheduleEditBtn} onClick={() => startEditSchedule(sc)}>✎</button>
                  <button style={s.deleteBtn} onClick={() => deleteSchedule(sc.id)}>🗑</button>
                </div>
              </div>
            )
          )
        )}
        <div style={s.addScheduleRow}>
          <input type="time" style={s.timeInput} value={onTime} onChange={(e) => setOnTime(e.target.value)} />
          <span style={{ color: "var(--app-text-muted)" }}>→</span>
          <input type="time" style={s.timeInput} value={offTime} onChange={(e) => setOffTime(e.target.value)} />
          <button style={s.addScheduleBtn} onClick={addSchedule}>+ Add</button>
        </div>
      </div>

      {/* Alerts */}
      {deviceAlerts.length > 0 && (
        <>
          <p style={s.sectionLabel}>Recent Alerts</p>
          <div style={s.card}>
            {deviceAlerts.map((a, i) => (
              <div key={i} style={s.alertRow}>
                <p style={s.alertMsg}>{a.message}</p>
                <p style={s.alertTime}>{a.created_at}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Device info */}
      <p style={s.sectionLabel}>Device Info</p>
      <div style={s.card}>
        <div style={s.infoRow}><span style={s.infoLabel}>MAC Address</span><span style={s.infoValue}>{device.mac}</span></div>
        <div style={s.infoRow}><span style={s.infoLabel}>Last Seen</span><span style={s.infoValue}>{device.last_seen || "—"}</span></div>
      </div>

      <div style={s.editDeleteRow}>
        <button style={s.editBtn} onClick={openEdit}>✎ Edit Device</button>
        <button style={s.dangerBtn} onClick={deleteDevice}>🗑 Delete Device</button>
      </div>

      {editOpen && (
        <Modal title="Edit Device" onClose={() => setEditOpen(false)}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={editName} onChange={(e) => setEditName(e.target.value)} />

          <label style={s.label}>Room</label>
          <select style={s.input} value={editRoomId} onChange={(e) => setEditRoomId(e.target.value)}>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <label style={s.label}>Type</label>
          <div style={s.typeRow}>
            {["appliance", "socket"].map((t) => (
              <button
                key={t}
                style={{
                  ...s.typeChoice,
                  background: editType === t ? "#3b82f6" : "var(--app-border)",
                  color: editType === t ? "#fff" : "var(--app-text-secondary)",
                }}
                onClick={() => setEditType(t)}
              >
                {t === "appliance" ? "Appliance" : "Socket"}
              </button>
            ))}
          </div>

          <button style={s.saveBtn} onClick={saveEdit}>Save Changes</button>
        </Modal>
      )}
    </div>
  );
}

const s = {
  pageHeader: { marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "var(--app-text-muted)", margin: 0 },

  addBtn: { width: "40px", height: "40px", borderRadius: "12px", background: "#3b82f6", color: "#fff", border: "none", fontSize: "22px", fontWeight: "600", cursor: "pointer", lineHeight: 1, boxShadow: "0 4px 14px rgba(59,130,246,0.35)" },
  addBtnSmall: { padding: "10px 18px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px" },
  addMenu: { position: "absolute", top: "48px", right: 0, background: "var(--app-surface-bg)", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid var(--app-border)", overflow: "hidden", zIndex: 20, minWidth: "220px" },
  addMenuItem: { display: "block", width: "100%", textAlign: "left", padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", fontWeight: "500", color: "var(--app-text-primary)", borderBottom: "1px solid var(--app-border)" },

  typeTag: { fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px", background: "#eff6ff", color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.3px" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--app-surface-bg)", borderRadius: "18px", width: "380px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--app-border)" },
  modalTitle: { fontSize: "16px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },
  modalClose: { border: "none", background: "var(--app-border)", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", color: "var(--app-text-secondary)" },
  modalBody: { padding: "20px" },
  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--app-text-secondary)", margin: "0 0 6px" },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--app-border-strong)", fontSize: "14px", marginBottom: "16px", outline: "none", background: "var(--app-surface-bg)", color: "var(--app-text-primary)" },
  errorText: { color: "#ef4444", fontSize: "12px", margin: "-8px 0 12px" },
  infoTextMuted: { fontSize: "12px", color: "var(--app-text-muted)", margin: "-8px 0 16px" },
  saveBtn: { width: "100%", padding: "12px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px" },
  typeRow: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" },
  typeChoice: { padding: "10px 14px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", textAlign: "left" },
  roomManageRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--app-border)" },

  editDeleteRow: { display: "flex", gap: "10px", marginBottom: "24px" },
  editBtn: { flex: 1, padding: "12px", borderRadius: "10px", background: "#eff6ff", color: "#3b82f6", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px" },
  dangerBtn: { flex: 1, padding: "12px", borderRadius: "10px", background: "#fef2f2", color: "#ef4444", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px" },

  filterRow: { display: "flex", gap: "8px", marginBottom: "20px" },
  filterBtn: { padding: "8px 16px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600" },

  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  listTitle: { fontSize: "17px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },
  powerUse: { fontSize: "13px", color: "var(--app-text-secondary)", margin: 0 },
  powerUseVal: { fontWeight: "700", color: "#3b82f6" },

  deviceRow: {
    width: "100%", display: "flex", alignItems: "center", gap: "14px",
    background: "var(--app-surface-bg)", borderRadius: "14px", padding: "14px 16px", marginBottom: "10px",
    border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    cursor: "pointer", textAlign: "left",
  },
  deviceIconBox: {
    width: "44px", height: "44px", borderRadius: "12px", background: "#eff6ff",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0,
  },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceName: { fontSize: "14px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  deviceRoom: { fontSize: "12px", color: "var(--app-text-muted)", margin: "0 0 2px" },
  deviceStatus: { fontSize: "11px", fontWeight: "600", margin: 0 },
  deviceRight: { textAlign: "right", flexShrink: 0 },
  deviceKw: { fontSize: "14px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 6px" },
  statePill: { padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "700" },
  chevron: { fontSize: "20px", color: "var(--app-text-muted)", flexShrink: 0 },
  emptyCard: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid var(--app-border)" },

  backBtn: { border: "none", background: "none", color: "#3b82f6", fontSize: "14px", fontWeight: "600", cursor: "pointer", padding: 0, marginBottom: "16px" },
  detailHeader: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" },
  detailIcon: { fontSize: "36px" },
  detailName: { fontSize: "22px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  detailRoom: { fontSize: "13px", color: "var(--app-text-muted)", margin: 0 },

  powerCard: {
    background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", borderRadius: "18px", padding: "22px 24px",
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", color: "#fff",
    boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
  },
  powerLabel: { fontSize: "12px", color: "rgba(255,255,255,0.75)", margin: "0 0 4px" },
  powerWatts: { fontSize: "30px", fontWeight: "700", margin: 0 },
  powerToggle: { width: "52px", height: "28px", borderRadius: "20px", border: "none", position: "relative", cursor: "pointer" },
  powerToggleThumb: { width: "22px", height: "22px", borderRadius: "50%", background: "var(--app-surface-bg)", position: "absolute", top: "3px", transition: "left .15s", pointerEvents: "none" },

  chartCard: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "16px 16px 4px", marginBottom: "20px", border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  chartTitle: { fontSize: "13px", fontWeight: "600", color: "var(--app-text-secondary)", margin: "0 0 4px" },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  runtimeRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" },
  runtimeCard: { background: "var(--app-surface-bg)", borderRadius: "14px", padding: "14px", textAlign: "center", border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  runtimeLabel: { fontSize: "11px", color: "var(--app-text-muted)", margin: "0 0 4px" },
  runtimeValue: { fontSize: "18px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },

  card: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "8px 18px", marginBottom: "20px", border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  emptyText: { color: "#aaa", fontSize: "13px", padding: "14px 0" },
  scheduleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--app-border)" },
  scheduleTimes: { fontSize: "13px", fontWeight: "600", color: "var(--app-text-primary)", margin: "0 0 4px" },
  sourceTag: { fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px", textTransform: "capitalize" },
  deleteBtn: { background: "#fee2e2", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", fontSize: "14px" },
  scheduleEditBtn: { background: "#eff6ff", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", fontSize: "14px" },
  cancelBtn: { padding: "8px 14px", borderRadius: "8px", background: "var(--app-border)", color: "var(--app-text-primary)", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap" },
  addScheduleRow: { display: "flex", alignItems: "center", gap: "8px", padding: "14px 0" },
  timeInput: { flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--app-border-strong)", fontSize: "13px", background: "var(--app-surface-bg)", color: "var(--app-text-primary)" },
  addScheduleBtn: { padding: "8px 14px", borderRadius: "8px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap" },

  alertRow: { padding: "12px 0", borderBottom: "1px solid var(--app-border)" },
  alertMsg: { fontSize: "13px", color: "var(--app-text-primary)", margin: "0 0 4px" },
  alertTime: { fontSize: "11px", color: "var(--app-text-muted)", margin: 0 },

  infoRow: { display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--app-border)" },
  infoLabel: { fontSize: "13px", color: "var(--app-text-muted)" },
  infoValue: { fontSize: "13px", fontWeight: "600", color: "var(--app-text-primary)" },
};
