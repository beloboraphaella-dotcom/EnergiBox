import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";
const MAC_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

const STEPS = ["Home", "Rooms", "Appliances", "Done"];

export default function Onboarding({ token, onComplete }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [homeId, setHomeId] = useState(null);
  const [homeName, setHomeName] = useState("");
  const [homeAddress, setHomeAddress] = useState("");

  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");

  const [devices, setDevices] = useState([]);
  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const createHome = async () => {
    if (!homeName.trim()) {
      setError("Give your home a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (homeId) {
        // Already created (user came back to this step) — update instead of duplicating
        await axios.put(
          `${API}/homes/${homeId}?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`,
          null,
          authHeaders
        );
      } else {
        const res = await axios.post(
          `${API}/homes?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`,
          null,
          authHeaders
        );
        setHomeId(res.data.id);
      }
      setStep(1);
    } catch (err) {
      setError("Could not create home. Try again.");
    }
    setSaving(false);
  };

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const addRoom = async () => {
    if (!newRoomName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(
        `${API}/rooms?name=${encodeURIComponent(newRoomName)}&home_id=${homeId}`,
        null,
        authHeaders
      );
      setRooms((r) => [...r, res.data]);
      setNewRoomName("");
    } catch (err) {
      setError("Could not add room.");
    }
    setSaving(false);
  };

  const addDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setError("Room, name and MAC address are required.");
      return;
    }
    if (!MAC_REGEX.test(mac.trim())) {
      setError("MAC address must look like AA:BB:CC:DD:EE:FF.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(
        `${API}/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}&type=${type}&mac_address=${encodeURIComponent(mac)}`,
        null,
        authHeaders
      );
      setDevices((d) => [...d, res.data]);
      setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add device. Check the MAC address.");
    }
    setSaving(false);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <span style={s.logo}>⚡</span>
          <h1 style={s.brand}>EnergiBox</h1>
        </div>

        <div style={s.steps}>
          {STEPS.map((label, i) => (
            <div key={label} style={s.stepItem}>
              <div style={{ ...s.stepDot, background: i <= step ? "#3b82f6" : "#e2e8f0", color: i <= step ? "#fff" : "#94a3b8" }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span style={{ ...s.stepLabel, color: i <= step ? "#0f172a" : "#94a3b8" }}>{label}</span>
              {i < STEPS.length - 1 && <div style={{ ...s.stepLine, background: i < step ? "#3b82f6" : "#e2e8f0" }} />}
            </div>
          ))}
        </div>

        {/* STEP 0: Home */}
        {step === 0 && (
          <div>
            <h2 style={s.title}>Set up your home</h2>
            <p style={s.subtitle}>This is the first thing every EnergiBox account needs — you can add more homes later.</p>
            <label style={s.label}>Home Name</label>
            <input style={s.input} placeholder="e.g. My Home" value={homeName} onChange={(e) => setHomeName(e.target.value)} />
            <label style={s.label}>Address (optional)</label>
            <input style={s.input} placeholder="e.g. Yaoundé, Cameroun" value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} />
            {error && <p style={s.errorText}>{error}</p>}
            <button style={s.primaryBtn} onClick={createHome} disabled={saving}>
              {saving ? "Creating..." : "Continue"}
            </button>
          </div>
        )}

        {/* STEP 1: Rooms */}
        {step === 1 && (
          <div>
            <h2 style={s.title}>Add your rooms</h2>
            <p style={s.subtitle}>Add every room you want to monitor. You need at least one to continue.</p>

            {rooms.length > 0 && (
              <div style={s.chipRow}>
                {rooms.map((r) => <span key={r.id} style={s.chip}>🏠 {r.name}</span>)}
              </div>
            )}

            <label style={s.label}>Room Name</label>
            <div style={s.inlineRow}>
              <input
                style={{ ...s.input, marginBottom: 0, flex: 1 }}
                placeholder="e.g. Living Room"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRoom()}
              />
              <button style={s.addBtn} onClick={addRoom} disabled={saving || !newRoomName.trim()}>✓ Confirm Room</button>
            </div>

            {error && <p style={s.errorText}>{error}</p>}
            <div style={s.navRow}>
              <button style={s.backBtn} onClick={goBack}>‹ Back</button>
              <button style={{ ...s.primaryBtn, width: "auto", flex: 1 }} onClick={() => setStep(2)} disabled={rooms.length === 0}>
                Continue ({rooms.length} room{rooms.length !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Appliances */}
        {step === 2 && (
          <div>
            <h2 style={s.title}>Add your appliances & sockets</h2>
            <p style={s.subtitle}>Pair each EnergiBox by its MAC address. You need at least one device to finish setup.</p>

            {devices.length > 0 && (
              <div style={s.chipRow}>
                {devices.map((d) => <span key={d.id} style={s.chip}>{d.type === "socket" ? "🔌" : "📦"} {d.name}</span>)}
              </div>
            )}

            <label style={s.label}>Room</label>
            <select style={s.input} value={newDevice.room_id} onChange={(e) => setNewDevice({ ...newDevice, room_id: e.target.value })}>
              <option value="">Select a room...</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>

            <label style={s.label}>Name</label>
            <input style={s.input} placeholder="e.g. Fridge" value={newDevice.name} onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })} />

            <label style={s.label}>Type</label>
            <div style={s.typeRow}>
              {["appliance", "socket"].map((t) => (
                <button
                  key={t}
                  style={{ ...s.typeChoice, background: newDevice.type === t ? "#3b82f6" : "#f1f5f9", color: newDevice.type === t ? "#fff" : "#64748b" }}
                  onClick={() => setNewDevice({ ...newDevice, type: t })}
                >
                  {t === "appliance" ? "Appliance" : "Socket"}
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

            {error && <p style={s.errorText}>{error}</p>}
            <button style={{ ...s.addBtn, width: "100%", marginBottom: "12px" }} onClick={addDevice} disabled={saving}>✓ Confirm Device</button>
            <div style={s.navRow}>
              <button style={s.backBtn} onClick={goBack}>‹ Back</button>
              <button style={{ ...s.primaryBtn, width: "auto", flex: 1 }} onClick={() => setStep(3)} disabled={devices.length === 0}>
                Finish ({devices.length} device{devices.length !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "48px", margin: "0 0 12px" }}>🎉</p>
            <h2 style={s.title}>You're all set!</h2>
            <p style={s.subtitle}>
              {homeName} is ready with {rooms.length} room{rooms.length !== 1 ? "s" : ""} and {devices.length} device{devices.length !== 1 ? "s" : ""}.
            </p>
            <button style={s.primaryBtn} onClick={onComplete}>Go to Dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "20px" },
  card: { background: "#fff", borderRadius: "24px", padding: "36px", width: "440px", maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.08)" },
  header: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "28px" },
  logo: { fontSize: "22px" },
  brand: { fontSize: "18px", fontWeight: "700", color: "#1e40af", margin: 0 },

  steps: { display: "flex", alignItems: "center", marginBottom: "28px" },
  stepItem: { display: "flex", alignItems: "center", flex: 1 },
  stepDot: { width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700", flexShrink: 0 },
  stepLabel: { fontSize: "11px", fontWeight: "600", marginLeft: "6px", whiteSpace: "nowrap" },
  stepLine: { flex: 1, height: "2px", margin: "0 8px" },

  title: { fontSize: "20px", fontWeight: "700", color: "#0f172a", margin: "0 0 6px" },
  subtitle: { fontSize: "13px", color: "#94a3b8", margin: "0 0 20px", lineHeight: "1.5" },
  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "#64748b", margin: "0 0 6px" },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "14px", outline: "none" },
  errorText: { color: "#ef4444", fontSize: "12px", margin: "-6px 0 12px" },
  primaryBtn: { width: "100%", padding: "13px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px" },
  addBtn: { padding: "11px 18px", borderRadius: "10px", background: "#eff6ff", color: "#3b82f6", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap" },
  navRow: { display: "flex", gap: "10px", alignItems: "stretch" },
  backBtn: { padding: "13px 18px", borderRadius: "10px", background: "#f1f5f9", color: "#64748b", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "14px", whiteSpace: "nowrap" },
  inlineRow: { display: "flex", gap: "8px", marginBottom: "14px", alignItems: "center" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" },
  chip: { background: "#f1f5f9", color: "#374151", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
  typeRow: { display: "flex", gap: "8px", marginBottom: "14px" },
  typeChoice: { flex: 1, padding: "10px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
};
