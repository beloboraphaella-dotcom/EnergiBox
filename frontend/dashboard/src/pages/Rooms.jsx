import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";
const COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

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

export default function Rooms({ token, homeId, onBack }) {
  const { t } = useLanguage();
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [modal, setModal] = useState(null); // null | "add" | { edit: room }
  const [roomName, setRoomName] = useState("");
  const [roomError, setRoomError] = useState("");
  const [saving, setSaving] = useState(false);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchRooms = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/rooms/consumption?home_id=${homeId}`, authHeaders);
      setRooms(res.data);
    } catch (err) {}
    setLoading(false);
  };

  const fetchDevices = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/devices?home_id=${homeId}`, authHeaders);
      setDevices(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchRooms();
    fetchDevices();
    const interval = setInterval(() => { fetchRooms(); fetchDevices(); }, 3000);
    return () => clearInterval(interval);
  }, [homeId]);

  const toggleDevice = async (e, d) => {
    e.stopPropagation();
    try {
      await axios.post(`${API}/control/${d.mac}?command=${d.is_on ? "OFF" : "ON"}`, null, authHeaders);
      setTimeout(fetchDevices, 500);
    } catch (err) {}
  };

  const closeModal = () => {
    setModal(null);
    setRoomName("");
    setRoomError("");
  };

  const openAdd = () => {
    setRoomName("");
    setRoomError("");
    setModal("add");
  };

  const openEdit = (room) => {
    setRoomName(room.name);
    setRoomError("");
    setModal({ edit: room });
  };

  const submitRoom = async () => {
    const trimmed = roomName.trim();
    if (!trimmed) {
      setRoomError("Room name is required.");
      return;
    }
    const duplicate = rooms.some((r) =>
      r.name.toLowerCase() === trimmed.toLowerCase() &&
      !(modal !== "add" && r.id === modal.edit.id)
    );
    if (duplicate) {
      setRoomError(`A room named "${trimmed}" already exists in this home.`);
      return;
    }
    setSaving(true);
    setRoomError("");
    try {
      if (modal === "add") {
        await axios.post(`${API}/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`, null, authHeaders);
      } else {
        await axios.put(`${API}/rooms/${modal.edit.id}?name=${encodeURIComponent(trimmed)}`, null, authHeaders);
      }
      await fetchRooms();
      closeModal();
    } catch (err) {
      setRoomError(err.response?.data?.detail || "Could not save room. Try again.");
    }
    setSaving(false);
  };

  const deleteRoom = async (room) => {
    if (room.device_count > 0) {
      window.alert(
        `"${room.name}" has ${room.device_count} device${room.device_count !== 1 ? "s" : ""} in it. ` +
        `Move or delete ${room.device_count !== 1 ? "them" : "it"} from the Devices tab before deleting this room.`
      );
      return;
    }
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/rooms/${room.id}`, authHeaders);
      fetchRooms();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Could not delete room.");
    }
  };

  if (selectedRoomId) {
    const room = rooms.find((r) => r.id === selectedRoomId);
    const roomDevices = devices.filter((d) => d.room_id === selectedRoomId);
    return (
      <div>
        <button style={s.backBtn} onClick={() => setSelectedRoomId(null)}>{t("rooms.backToRooms")}</button>

        <div style={s.detailHeader}>
          <span style={s.detailIcon}>🏠</span>
          <div>
            <h1 style={s.detailName}>{room?.name || "Room"}</h1>
            <p style={s.detailSub}>{roomDevices.length} device{roomDevices.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div style={s.powerCard}>
          <div>
            <p style={s.powerLabel}>{t("rooms.roomConsumption")}</p>
            <p style={s.powerWatts}>
              {((room?.watts ?? roomDevices.reduce((sum, d) => sum + (d.watts || 0), 0)) / 1000).toFixed(2)}{" "}
              <span style={{ fontSize: "16px", fontWeight: 400 }}>kW</span>
            </p>
          </div>
        </div>

        <p style={s.sectionLabel}>{t("rooms.devicesInRoom")}</p>
        {roomDevices.length === 0 ? (
          <div style={s.emptyCard}><p style={{ color: "var(--app-text-muted)" }}>{t("rooms.noDevicesInRoom")}</p></div>
        ) : (
          roomDevices.map((d) => (
            <div key={d.mac} style={s.deviceRow}>
              <span style={s.deviceIconBox}>{getIcon(d.name, d.type)}</span>
              <div style={s.deviceInfo}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <p style={s.deviceName}>{d.name}</p>
                  <span style={s.typeTag}>{d.type === "socket" ? "Socket" : "Appliance"}</span>
                </div>
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
                  title={d.is_on ? "Turn off" : "Turn on"}
                >
                  {d.is_on ? "On" : "Off"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <button style={s.backBtn} onClick={onBack}>{t("rooms.backToHome")}</button>
          <h1 style={s.pageTitle}>{t("rooms.title")}</h1>
          <p style={s.pageSub}>{t("rooms.subtitle")}</p>
        </div>
        <button style={s.addBtn} onClick={openAdd}>{t("rooms.addRoom")}</button>
      </div>

      {loading ? (
        <div style={s.emptyCard}><p style={{ color: "var(--app-text-muted)" }}>{t("rooms.loading")}</p></div>
      ) : rooms.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={{ color: "var(--app-text-muted)", marginBottom: "12px" }}>{t("rooms.noRooms")}</p>
          <button style={s.addBtnSmall} onClick={openAdd}>{t("rooms.addFirst")}</button>
        </div>
      ) : (
        <div style={s.roomsGrid}>
          {rooms.map((room, i) => (
            <div
              key={room.id}
              style={{ ...s.roomCard, borderTop: `3px solid ${COLORS[i % COLORS.length]}` }}
              onClick={() => setSelectedRoomId(room.id)}
            >
              <div style={s.roomTop}>
                <span style={s.roomIcon}>🏠</span>
                <div style={s.roomActions}>
                  <button style={s.roomActionBtn} onClick={(e) => { e.stopPropagation(); openEdit(room); }} title="Rename room">✎</button>
                  <button style={s.roomActionBtn} onClick={(e) => { e.stopPropagation(); deleteRoom(room); }} title="Delete room">🗑</button>
                </div>
              </div>
              <p style={{ ...s.roomName, color: COLORS[i % COLORS.length] }}>{room.name}</p>
              <p style={s.roomKw}>{room.kw} kW</p>
              <p style={s.roomDevices}>{room.device_count} Device{room.device_count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}

      {(modal === "add" || modal?.edit) && (
        <Modal title={modal === "add" ? "Add Room" : "Rename Room"} onClose={closeModal}>
          <label style={s.label}>Room Name</label>
          <input
            style={s.input}
            placeholder="e.g. Living Room"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          {roomError && <p style={s.errorText}>{roomError}</p>}
          <button style={s.saveBtn} onClick={submitRoom} disabled={saving}>
            {saving ? "Saving..." : modal === "add" ? "Create Room" : "Save Changes"}
          </button>
        </Modal>
      )}
    </div>
  );
}

const s = {
  pageHeader: { marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "var(--app-text-muted)", margin: 0 },
  backBtn: { border: "none", background: "none", color: "#3b82f6", fontSize: "14px", fontWeight: "600", cursor: "pointer", padding: 0, marginBottom: "10px", display: "block" },

  addBtn: { padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "600", fontSize: "14px", height: "fit-content" },
  addBtnSmall: { padding: "10px 18px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px" },

  emptyCard: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid var(--app-border)" },

  roomsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" },
  roomCard: { background: "var(--app-surface-bg)", borderRadius: "14px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: "1px solid var(--app-border)", cursor: "pointer" },
  roomTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  roomIcon: { fontSize: "22px" },
  roomActions: { display: "flex", gap: "6px" },
  roomActionBtn: { border: "none", background: "var(--app-border)", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer", fontSize: "12px", color: "var(--app-text-secondary)" },
  roomName: { fontSize: "14px", fontWeight: "700", margin: "0 0 4px" },
  roomKw: { fontSize: "18px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  roomDevices: { fontSize: "11px", color: "var(--app-text-muted)", margin: 0 },

  detailHeader: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" },
  detailIcon: { fontSize: "36px" },
  detailName: { fontSize: "22px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  detailSub: { fontSize: "13px", color: "var(--app-text-muted)", margin: 0 },

  powerCard: {
    background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", borderRadius: "18px", padding: "22px 24px",
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", color: "#fff",
    boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
  },
  powerLabel: { fontSize: "12px", color: "rgba(255,255,255,0.75)", margin: "0 0 4px" },
  powerWatts: { fontSize: "30px", fontWeight: "700", margin: 0 },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },

  deviceRow: {
    width: "100%", display: "flex", alignItems: "center", gap: "14px",
    background: "var(--app-surface-bg)", borderRadius: "14px", padding: "14px 16px", marginBottom: "10px",
    border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  },
  deviceIconBox: {
    width: "44px", height: "44px", borderRadius: "12px", background: "#eff6ff",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0,
  },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceName: { fontSize: "14px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  deviceStatus: { fontSize: "11px", fontWeight: "600", margin: 0 },
  deviceRight: { textAlign: "right", flexShrink: 0 },
  deviceKw: { fontSize: "14px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 6px" },
  statePill: { padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: "700" },
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
  saveBtn: { width: "100%", padding: "12px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px" },
};
