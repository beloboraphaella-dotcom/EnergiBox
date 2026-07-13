import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

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

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ ...s.toggleTrack, background: checked ? "#3b82f6" : "#e2e8f0" }}
    >
      <div style={{ ...s.toggleThumb, left: checked ? "22px" : "2px" }} />
    </div>
  );
}

function Row({ icon, label, value, danger, onClick }) {
  return (
    <button style={s.row} onClick={onClick}>
      <span style={{ ...s.rowIconBox, background: danger ? "#fef2f2" : "#eff6ff" }}>
        {icon}
      </span>
      <span style={{ ...s.rowLabel, color: danger ? "#ef4444" : "#0f172a" }}>{label}</span>
      {value && <span style={s.rowValue}>{value}</span>}
      {!danger && <span style={s.rowArrow}>→</span>}
    </button>
  );
}

export default function Profile({ user, token, homeId, onLogout, onUpdateUser }) {
  const [activeModal, setActiveModal] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(
    localStorage.getItem("notificationsEnabled") !== "false"
  );
  const [tariff, setTariff] = useState(null);

  const [nameInput, setNameInput] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (activeModal === "tariff" && !tariff && homeId) {
      axios
        .get(`${API}/bill/estimate?home_id=${homeId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => setTariff(res.data))
        .catch(() => {});
    }
  }, [activeModal]);

  const closeModal = () => {
    setActiveModal(null);
    setProfileMsg("");
    setPwMsg("");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  };

  const toggleNotif = (val) => {
    setNotifEnabled(val);
    localStorage.setItem("notificationsEnabled", val ? "true" : "false");
  };

  const saveProfile = async () => {
    if (!nameInput.trim()) return;
    setProfileSaving(true);
    setProfileMsg("");
    try {
      await axios.put(`${API}/auth/profile?name=${encodeURIComponent(nameInput)}`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdateUser({ name: nameInput });
      setProfileMsg("success");
      setTimeout(closeModal, 800);
    } catch (err) {
      setProfileMsg("error");
    }
    setProfileSaving(false);
  };

  const savePassword = async () => {
    setPwMsg("");
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) {
      setPwMsg("mismatch");
      return;
    }
    setPwSaving(true);
    try {
      await axios.put(
        `${API}/auth/password?current_password=${encodeURIComponent(currentPw)}&new_password=${encodeURIComponent(newPw)}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPwMsg("success");
      setTimeout(closeModal, 900);
    } catch (err) {
      setPwMsg("error");
    }
    setPwSaving(false);
  };

  const initials = (user?.name || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Profile</h1>
        <p style={s.pageSub}>Manage your account and preferences</p>
      </div>

      {/* Profile card */}
      <div style={s.profileCard}>
        <div style={s.avatar}>{initials}</div>
        <div>
          <p style={s.profileName}>{user?.name || "User"}</p>
          <p style={s.profileEmail}>{user?.email || ""}</p>
        </div>
      </div>

      {/* Account */}
      <p style={s.sectionLabel}>Account</p>
      <div style={s.card}>
        <Row icon="👤" label="Manage Profile" onClick={() => setActiveModal("profile")} />
        <Row icon="🔒" label="Password & Security" onClick={() => setActiveModal("password")} />
        <Row
          icon="🔔"
          label="Notifications"
          value={<Toggle checked={notifEnabled} onChange={toggleNotif} />}
        />
        <Row icon="🌐" label="Language" value="English" onClick={() => setActiveModal("language")} />
      </div>

      {/* Preferences */}
      <p style={s.sectionLabel}>Preferences</p>
      <div style={s.card}>
        <Row icon="🎨" label="Theme" value="Light" onClick={() => setActiveModal("theme")} />
        <Row icon="💰" label="Energy Tariff" onClick={() => setActiveModal("tariff")} />
      </div>

      {/* Support */}
      <p style={s.sectionLabel}>Support</p>
      <div style={s.card}>
        <Row icon="❓" label="Help Center" onClick={() => setActiveModal("help")} />
        <Row icon="ℹ️" label="About Us" onClick={() => setActiveModal("about")} />
      </div>

      {/* Log out */}
      <div style={s.card}>
        <Row icon="🚪" label="Log Out" danger onClick={onLogout} />
      </div>

      {/* ── Manage Profile modal ── */}
      {activeModal === "profile" && (
        <Modal title="Manage Profile" onClose={closeModal}>
          <label style={s.label}>Full Name</label>
          <input
            style={s.input}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <label style={s.label}>Email</label>
          <input style={{ ...s.input, color: "#94a3b8" }} value={user?.email || ""} disabled />
          {profileMsg === "error" && <p style={s.errorText}>Could not save changes. Try again.</p>}
          {profileMsg === "success" && <p style={s.successText}>Profile updated ✓</p>}
          <button style={s.saveBtn} onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? "Saving..." : "Save Changes"}
          </button>
        </Modal>
      )}

      {/* ── Password modal ── */}
      {activeModal === "password" && (
        <Modal title="Password & Security" onClose={closeModal}>
          <label style={s.label}>Current Password</label>
          <input
            type="password"
            style={s.input}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
          <label style={s.label}>New Password</label>
          <input
            type="password"
            style={s.input}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <label style={s.label}>Confirm New Password</label>
          <input
            type="password"
            style={s.input}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {pwMsg === "mismatch" && <p style={s.errorText}>New passwords don't match.</p>}
          {pwMsg === "error" && <p style={s.errorText}>Current password is incorrect.</p>}
          {pwMsg === "success" && <p style={s.successText}>Password updated ✓</p>}
          <button style={s.saveBtn} onClick={savePassword} disabled={pwSaving}>
            {pwSaving ? "Updating..." : "Update Password"}
          </button>
        </Modal>
      )}

      {/* ── Language modal ── */}
      {activeModal === "language" && (
        <Modal title="Language" onClose={closeModal}>
          <p style={s.infoText}>EnergiBox currently supports <strong>English</strong> only.</p>
          <p style={s.infoTextMuted}>More languages are coming soon.</p>
        </Modal>
      )}

      {/* ── Theme modal ── */}
      {activeModal === "theme" && (
        <Modal title="Theme" onClose={closeModal}>
          <p style={s.infoText}>EnergiBox currently uses the <strong>Light</strong> theme.</p>
          <p style={s.infoTextMuted}>Dark mode is coming soon.</p>
        </Modal>
      )}

      {/* ── Tariff modal ── */}
      {activeModal === "tariff" && (
        <Modal title="Energy Tariff" onClose={closeModal}>
          {tariff ? (
            <>
              <div style={s.tariffRow}>
                <span style={s.infoTextMuted}>Rate per kWh</span>
                <span style={s.tariffValue}>{tariff.tariff_per_kwh} FCFA</span>
              </div>
              <div style={s.tariffRow}>
                <span style={s.infoTextMuted}>Consumed this month</span>
                <span style={s.tariffValue}>{tariff.kwh_consumed} kWh</span>
              </div>
              <div style={s.tariffRow}>
                <span style={s.infoTextMuted}>Estimated bill</span>
                <span style={s.tariffValue}>{tariff.estimated_bill_fcfa?.toLocaleString()} FCFA</span>
              </div>
            </>
          ) : (
            <p style={s.infoTextMuted}>Loading tariff info...</p>
          )}
        </Modal>
      )}

      {/* ── Help modal ── */}
      {activeModal === "help" && (
        <Modal title="Help Center" onClose={closeModal}>
          <p style={s.infoText}><strong>Alerts</strong> notify you when an appliance spikes or runs longer than usual.</p>
          <p style={s.infoText}><strong>AI Suggestions</strong> recommend schedules to help you save on your bill.</p>
          <p style={s.infoText}><strong>History</strong> lets you track consumption by day, week, month or year.</p>
          <p style={s.infoTextMuted}>Need more help? Contact support@energibox.io</p>
        </Modal>
      )}

      {/* ── About modal ── */}
      {activeModal === "about" && (
        <Modal title="About EnergiBox" onClose={closeModal}>
          <p style={s.infoText}>
            <strong>EnergiBox</strong> is a smart home energy monitoring system that tracks
            appliance consumption in real time, estimates your bill, and uses AI to suggest
            ways to save energy.
          </p>
          <p style={s.infoTextMuted}>Version 1.0.0</p>
        </Modal>
      )}
    </div>
  );
}

const s = {
  pageHeader: { marginBottom: "24px" },
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "#0f172a", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "#94a3b8", margin: 0 },

  profileCard: {
    background: "#fff", borderRadius: "16px", padding: "20px", marginBottom: "24px",
    display: "flex", alignItems: "center", gap: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9",
  },
  avatar: {
    width: "56px", height: "56px", borderRadius: "50%", flexShrink: 0,
    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "18px", fontWeight: "700",
  },
  profileName: { fontSize: "16px", fontWeight: "700", color: "#0f172a", margin: "0 0 2px" },
  profileEmail: { fontSize: "13px", color: "#94a3b8", margin: 0 },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  card: {
    background: "#fff", borderRadius: "16px", marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", overflow: "hidden",
  },
  row: {
    width: "100%", display: "flex", alignItems: "center", gap: "12px",
    padding: "14px 18px", border: "none", borderBottom: "1px solid #f1f5f9",
    background: "transparent", cursor: "pointer", textAlign: "left",
  },
  rowIconBox: {
    width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
  },
  rowLabel: { flex: 1, fontSize: "14px", fontWeight: "500" },
  rowValue: { fontSize: "13px", color: "#94a3b8", marginRight: "4px" },
  rowArrow: { fontSize: "14px", color: "#cbd5e1" },

  toggleTrack: { width: "40px", height: "22px", borderRadius: "20px", position: "relative", cursor: "pointer", transition: "background .15s" },
  toggleThumb: { width: "18px", height: "18px", borderRadius: "50%", background: "#fff", position: "absolute", top: "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left .15s" },

  overlay: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px",
  },
  modal: {
    background: "#fff", borderRadius: "18px", width: "380px", maxWidth: "100%",
    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 20px", borderBottom: "1px solid #f1f5f9",
  },
  modalTitle: { fontSize: "16px", fontWeight: "700", color: "#0f172a", margin: 0 },
  modalClose: { border: "none", background: "#f1f5f9", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", color: "#64748b" },
  modalBody: { padding: "20px" },

  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "#64748b", margin: "0 0 6px" },
  input: {
    width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: "10px",
    border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "16px", outline: "none",
  },
  saveBtn: {
    width: "100%", padding: "12px", borderRadius: "10px", background: "#3b82f6", color: "#fff",
    border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px",
  },
  errorText: { color: "#ef4444", fontSize: "12px", margin: "-8px 0 12px" },
  successText: { color: "#16a34a", fontSize: "12px", margin: "-8px 0 12px" },
  infoText: { fontSize: "14px", color: "#374151", lineHeight: "1.6", margin: "0 0 12px" },
  infoTextMuted: { fontSize: "13px", color: "#94a3b8", margin: 0 },
  tariffRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  tariffValue: { fontSize: "14px", fontWeight: "700", color: "#0f172a" },
};
