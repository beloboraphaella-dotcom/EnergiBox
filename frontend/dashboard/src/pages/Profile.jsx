import { useState } from "react";
import axios from "axios";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

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
      <span style={{ ...s.rowLabel, color: danger ? "#ef4444" : "var(--app-text-primary)" }}>{label}</span>
      {value && <span style={s.rowValue}>{value}</span>}
      {!danger && <span style={s.rowArrow}>→</span>}
    </button>
  );
}

export default function Profile({ user, token, onLogout, onUpdateUser }) {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [activeModal, setActiveModal] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(
    localStorage.getItem("notificationsEnabled") !== "false"
  );

  const [nameInput, setNameInput] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

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
      await axios.put(`${API}/auth/profile`, { name: nameInput.trim() }, {
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
        `${API}/auth/password`,
        { current_password: currentPw, new_password: newPw },
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
        <h1 style={s.pageTitle}>{t("profile.title")}</h1>
        <p style={s.pageSub}>{t("profile.subtitle")}</p>
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
      <p style={s.sectionLabel}>{t("profile.account")}</p>
      <div style={s.card}>
        <Row icon="👤" label={t("profile.manageProfile")} onClick={() => setActiveModal("profile")} />
        <Row icon="🔒" label={t("profile.passwordSecurity")} onClick={() => setActiveModal("password")} />
        <Row
          icon="🔔"
          label={t("profile.notifications")}
          value={<Toggle checked={notifEnabled} onChange={toggleNotif} />}
        />
        <Row
          icon="🌐"
          label={t("profile.language")}
          value={language === "fr" ? "Français" : "English"}
          onClick={() => setActiveModal("language")}
        />
      </div>

      {/* Preferences */}
      <p style={s.sectionLabel}>{t("profile.preferences")}</p>
      <div style={s.card}>
        <Row
          icon={theme === "dark" ? "🌙" : "🎨"}
          label={t("profile.theme")}
          value={theme === "dark" ? t("profile.themeDark") : t("profile.themeLight")}
          onClick={() => setActiveModal("theme")}
        />
      </div>

      {/* Support */}
      <p style={s.sectionLabel}>{t("profile.support")}</p>
      <div style={s.card}>
        <Row icon="❓" label={t("profile.helpCenter")} onClick={() => setActiveModal("help")} />
        <Row icon="ℹ️" label={t("profile.aboutUs")} onClick={() => setActiveModal("about")} />
      </div>

      {/* Log out */}
      <div style={s.card}>
        <Row icon="🚪" label={t("profile.logOut")} danger onClick={onLogout} />
      </div>

      {/* ── Manage Profile modal ── */}
      {activeModal === "profile" && (
        <Modal title={t("profile.manageProfile")} onClose={closeModal}>
          <label style={s.label}>{t("profile.fullName")}</label>
          <input
            style={s.input}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <label style={s.label}>{t("profile.email")}</label>
          <input style={{ ...s.input, color: "var(--app-text-muted)" }} value={user?.email || ""} disabled />
          {profileMsg === "error" && <p style={s.errorText}>{t("profile.couldNotSave")}</p>}
          {profileMsg === "success" && <p style={s.successText}>{t("profile.profileUpdated")}</p>}
          <button style={s.saveBtn} onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? t("profile.saving") : t("profile.saveChanges")}
          </button>
        </Modal>
      )}

      {/* ── Password modal ── */}
      {activeModal === "password" && (
        <Modal title={t("profile.passwordSecurity")} onClose={closeModal}>
          <label style={s.label}>{t("profile.currentPassword")}</label>
          <input
            type="password"
            style={s.input}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
          <label style={s.label}>{t("profile.newPassword")}</label>
          <input
            type="password"
            style={s.input}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <label style={s.label}>{t("profile.confirmNewPassword")}</label>
          <input
            type="password"
            style={s.input}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {pwMsg === "mismatch" && <p style={s.errorText}>{t("profile.passwordsDontMatch")}</p>}
          {pwMsg === "error" && <p style={s.errorText}>{t("profile.currentPasswordIncorrect")}</p>}
          {pwMsg === "success" && <p style={s.successText}>{t("profile.passwordUpdated")}</p>}
          <button style={s.saveBtn} onClick={savePassword} disabled={pwSaving}>
            {pwSaving ? t("profile.updating") : t("profile.updatePassword")}
          </button>
        </Modal>
      )}

      {/* ── Language modal ── */}
      {activeModal === "language" && (
        <Modal title={t("profile.language")} onClose={closeModal}>
          <p style={s.infoText}>{t("profile.chooseLanguage")}</p>
          <div style={s.choiceRow}>
            {[
              { code: "en", label: "English", flag: "🇬🇧" },
              { code: "fr", label: "Français", flag: "🇫🇷" },
            ].map((opt) => (
              <button
                key={opt.code}
                style={{
                  ...s.choiceBtn,
                  background: language === opt.code ? "#3b82f6" : "var(--app-page-bg)",
                  color: language === opt.code ? "#fff" : "var(--app-text-primary)",
                }}
                onClick={() => setLanguage(opt.code)}
              >
                <span style={{ marginRight: "8px" }}>{opt.flag}</span>{opt.label}
                {language === opt.code && <span style={{ marginLeft: "8px" }}>✓</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Theme modal ── */}
      {activeModal === "theme" && (
        <Modal title={t("profile.theme")} onClose={closeModal}>
          <p style={s.infoText}>{t("profile.chooseTheme")}</p>
          <div style={s.choiceRow}>
            {[
              { code: "light", label: t("profile.themeLight"), icon: "☀️" },
              { code: "dark", label: t("profile.themeDark"), icon: "🌙" },
            ].map((opt) => (
              <button
                key={opt.code}
                style={{
                  ...s.choiceBtn,
                  background: theme === opt.code ? "#3b82f6" : "var(--app-page-bg)",
                  color: theme === opt.code ? "#fff" : "var(--app-text-primary)",
                }}
                onClick={() => setTheme(opt.code)}
              >
                <span style={{ marginRight: "8px" }}>{opt.icon}</span>{opt.label}
                {theme === opt.code && <span style={{ marginLeft: "8px" }}>✓</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Help modal ── */}
      {activeModal === "help" && (
        <Modal title={t("profile.helpCenter")} onClose={closeModal}>
          <p style={s.infoText}><strong>Alerts</strong> notify you when an appliance spikes or runs longer than usual.</p>
          <p style={s.infoText}><strong>AI Suggestions</strong> recommend schedules to help you save on your bill.</p>
          <p style={s.infoText}><strong>History</strong> lets you track consumption by day, week, month or year.</p>
          <p style={s.infoTextMuted}>Need more help? Contact support@energibox.io</p>
        </Modal>
      )}

      {/* ── About modal ── */}
      {activeModal === "about" && (
        <Modal title={t("profile.aboutUs")} onClose={closeModal}>
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
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "var(--app-text-muted)", margin: 0 },

  profileCard: {
    background: "var(--app-surface-bg)", borderRadius: "16px", padding: "20px", marginBottom: "24px",
    display: "flex", alignItems: "center", gap: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid var(--app-border)",
  },
  avatar: {
    width: "56px", height: "56px", borderRadius: "50%", flexShrink: 0,
    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "18px", fontWeight: "700",
  },
  profileName: { fontSize: "16px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px" },
  profileEmail: { fontSize: "13px", color: "var(--app-text-muted)", margin: 0 },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  card: {
    background: "var(--app-surface-bg)", borderRadius: "16px", marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid var(--app-border)", overflow: "hidden",
  },
  row: {
    width: "100%", display: "flex", alignItems: "center", gap: "12px",
    padding: "14px 18px", border: "none", borderBottom: "1px solid var(--app-border)",
    background: "transparent", cursor: "pointer", textAlign: "left",
  },
  rowIconBox: {
    width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
  },
  rowLabel: { flex: 1, fontSize: "14px", fontWeight: "500", color: "var(--app-text-primary)" },
  rowValue: { fontSize: "13px", color: "var(--app-text-muted)", marginRight: "4px" },
  rowArrow: { fontSize: "14px", color: "#cbd5e1" },

  toggleTrack: { width: "40px", height: "22px", borderRadius: "20px", position: "relative", cursor: "pointer", transition: "background .15s" },
  toggleThumb: { width: "18px", height: "18px", borderRadius: "50%", background: "#fff", position: "absolute", top: "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left .15s" },

  overlay: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px",
  },
  modal: {
    background: "var(--app-surface-bg)", borderRadius: "18px", width: "380px", maxWidth: "100%",
    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 20px", borderBottom: "1px solid var(--app-border)",
  },
  modalTitle: { fontSize: "16px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },
  modalClose: { border: "none", background: "var(--app-border)", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", color: "var(--app-text-secondary)" },
  modalBody: { padding: "20px" },

  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--app-text-secondary)", margin: "0 0 6px" },
  input: {
    width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: "10px",
    border: "1px solid var(--app-border-strong)", fontSize: "14px", marginBottom: "16px", outline: "none",
    background: "var(--app-surface-bg)", color: "var(--app-text-primary)",
  },
  saveBtn: {
    width: "100%", padding: "12px", borderRadius: "10px", background: "#3b82f6", color: "#fff",
    border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px",
  },
  errorText: { color: "#ef4444", fontSize: "12px", margin: "-8px 0 12px" },
  successText: { color: "#16a34a", fontSize: "12px", margin: "-8px 0 12px" },
  infoText: { fontSize: "14px", color: "var(--app-text-secondary)", lineHeight: "1.6", margin: "0 0 12px" },
  infoTextMuted: { fontSize: "13px", color: "var(--app-text-muted)", margin: 0 },
  choiceRow: { display: "flex", flexDirection: "column", gap: "8px" },
  choiceBtn: {
    display: "flex", alignItems: "center", padding: "12px 14px", borderRadius: "10px",
    border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600", textAlign: "left",
  },
};
