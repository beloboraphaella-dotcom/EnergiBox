import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function Admin({ token, currentUserId }) {
  const [tab, setTab] = useState("accounts"); // "accounts" | "overview"
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const [modal, setModal] = useState(null); // null | "create" | { resetPw: user }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [newAccount, setNewAccount] = useState({ name: "", email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`, authHeaders);
      setUsers(res.data);
    } catch (err) {
      setError("Could not load users — admin access required.");
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/admin/stats`, authHeaders);
      setStats(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const toggleSuspend = async (u) => {
    await axios.put(`${API}/admin/users/${u.id}/suspend?suspended=${!u.is_suspended}`, null, authHeaders);
    fetchUsers();
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Permanently delete ${u.name} (${u.email})? This removes their home, rooms and devices.`)) return;
    await axios.delete(`${API}/admin/users/${u.id}`, authHeaders);
    fetchUsers();
    fetchStats();
  };

  const closeModal = () => {
    setModal(null);
    setFormError("");
    setNewAccount({ name: "", email: "", password: "" });
    setNewPassword("");
    setConfirmPassword("");
  };

  const openCreate = () => {
    setNewAccount({ name: "", email: "", password: "" });
    setFormError("");
    setModal("create");
  };

  const openResetPassword = (u) => {
    setNewPassword("");
    setConfirmPassword("");
    setFormError("");
    setModal({ resetPw: u });
  };

  const submitCreate = async () => {
    const { name, email, password } = newAccount;
    if (!name.trim() || !email.trim() || !password) {
      setFormError("Name, email and password are all required.");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await axios.post(
        `${API}/admin/users`,
        { name: name.trim(), email: email.trim(), password },
        authHeaders
      );
      await fetchUsers();
      await fetchStats();
      closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Could not create account. Try again.");
    }
    setSaving(false);
  };

  const submitResetPassword = async () => {
    if (newPassword.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await axios.put(
        `${API}/admin/users/${modal.resetPw.id}/reset-password`,
        { new_password: newPassword },
        authHeaders
      );
      closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Could not reset password. Try again.");
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Admin</h1>
        <p style={s.pageSub}>Platform statistics and user management</p>
      </div>

      {error && <div style={s.emptyCard}><p style={{ color: "#ef4444" }}>{error}</p></div>}

      <div style={s.tabRow}>
        {[
          { id: "accounts", label: "Accounts" },
          { id: "overview", label: "Overview" },
        ].map((tb) => (
          <button
            key={tb.id}
            style={{
              ...s.tabBtn,
              background: tab === tb.id ? "#3b82f6" : "var(--app-border)",
              color: tab === tb.id ? "#fff" : "var(--app-text-secondary)",
            }}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && (
        <>
          <div style={s.sectionHeader}>
            <p style={s.sectionLabel}>User Accounts</p>
            <button style={s.createBtn} onClick={openCreate}>+ Create Account</button>
          </div>
          <div style={s.card}>
            {users.length === 0 ? (
              <p style={s.emptyText}>No users found.</p>
            ) : (
              users.map((u) => (
                <div key={u.id} style={s.userRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.userName}>
                      {u.name}
                      {u.id === currentUserId && <span style={s.youTag}>you</span>}
                    </p>
                    <p style={s.userEmail}>{u.email}</p>
                  </div>
                  <span style={{ ...s.rolePill, background: u.role === "admin" ? "#eff6ff" : "var(--app-border)", color: u.role === "admin" ? "#3b82f6" : "var(--app-text-secondary)" }}>
                    {u.role}
                  </span>
                  <span style={{ ...s.statusPill, background: u.is_suspended ? "#fef2f2" : "#dcfce7", color: u.is_suspended ? "#ef4444" : "#16a34a" }}>
                    {u.is_suspended ? "Suspended" : "Active"}
                  </span>
                  <button style={s.actionBtn} onClick={() => openResetPassword(u)} title="Reset password">🔑 Reset Password</button>
                  <button style={s.actionBtn} onClick={() => toggleSuspend(u)} disabled={u.id === currentUserId}>
                    {u.is_suspended ? "Reinstate" : "Suspend"}
                  </button>
                  <button style={s.deleteBtn} onClick={() => removeUser(u)} disabled={u.id === currentUserId}>🗑</button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === "overview" && stats && (
        <>
          <p style={s.sectionLabel}>Platform Overview</p>
          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <p style={s.statLabel}>Active Users</p>
              <p style={s.statValue}>{stats.users.active} <span style={s.statSub}>/ {stats.users.total}</span></p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>EnergiBoxes Online</p>
              <p style={s.statValue}>{stats.energiboxes.online} <span style={s.statSub}>/ {stats.energiboxes.total}</span></p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Alerts (7 days)</p>
              <p style={s.statValue}>{stats.alerts.last_7_days} <span style={s.statSub}>/ {stats.alerts.total} total</span></p>
            </div>
          </div>
        </>
      )}

      {/* ── Create Account modal ── */}
      {modal === "create" && (
        <Modal title="Create Account" onClose={closeModal}>
          <label style={s.label}>Full Name</label>
          <input
            style={s.input}
            value={newAccount.name}
            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
          />
          <label style={s.label}>Email</label>
          <input
            style={s.input}
            type="email"
            value={newAccount.email}
            onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
          />
          <label style={s.label}>Password</label>
          <input
            style={s.input}
            type="text"
            placeholder="At least 6 characters"
            value={newAccount.password}
            onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
          />
          <p style={s.infoTextMuted}>This creates a regular account — share this password with them so they can log in and change it.</p>
          {formError && <p style={s.errorText}>{formError}</p>}
          <button style={s.saveBtn} onClick={submitCreate} disabled={saving}>
            {saving ? "Creating..." : "Create Account"}
          </button>
        </Modal>
      )}

      {/* ── Reset Password modal ── */}
      {modal?.resetPw && (
        <Modal title="Reset Password" onClose={closeModal}>
          <p style={s.infoText}>
            Set a new password for <strong>{modal.resetPw.name}</strong> ({modal.resetPw.email}).
            Use this when they've lost access to their account or forgotten their credentials.
          </p>
          <label style={s.label}>New Password</label>
          <input
            style={s.input}
            type="text"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <label style={s.label}>Confirm New Password</label>
          <input
            style={s.input}
            type="text"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {formError && <p style={s.errorText}>{formError}</p>}
          <button style={s.saveBtn} onClick={submitResetPassword} disabled={saving}>
            {saving ? "Saving..." : "Reset Password"}
          </button>
        </Modal>
      )}
    </div>
  );
}

const s = {
  pageHeader: { marginBottom: "20px" },
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "var(--app-text-muted)", margin: 0 },

  tabRow: { display: "flex", gap: "8px", marginBottom: "20px" },
  tabBtn: { padding: "9px 20px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600" },

  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  createBtn: { padding: "9px 16px", borderRadius: "8px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "13px" },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "24px" },
  statCard: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "18px", border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  statLabel: { fontSize: "12px", color: "var(--app-text-muted)", margin: "0 0 6px", fontWeight: "500" },
  statValue: { fontSize: "22px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },
  statSub: { fontSize: "13px", fontWeight: "500", color: "var(--app-text-muted)" },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  card: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "8px 18px", border: "1px solid var(--app-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  emptyCard: { background: "var(--app-surface-bg)", borderRadius: "16px", padding: "24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid var(--app-border)", marginBottom: "20px" },
  emptyText: { color: "#aaa", fontSize: "13px", padding: "14px 0" },

  userRow: { display: "flex", alignItems: "center", gap: "10px", padding: "14px 0", borderBottom: "1px solid var(--app-border)", flexWrap: "wrap" },
  userName: { fontSize: "14px", fontWeight: "700", color: "var(--app-text-primary)", margin: "0 0 2px", display: "flex", alignItems: "center", gap: "6px" },
  userEmail: { fontSize: "12px", color: "var(--app-text-muted)", margin: 0 },
  youTag: { fontSize: "10px", fontWeight: "700", color: "#3b82f6", background: "#eff6ff", padding: "2px 6px", borderRadius: "6px" },
  rolePill: { padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", textTransform: "capitalize", flexShrink: 0 },
  statusPill: { padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", flexShrink: 0 },
  actionBtn: { padding: "8px 14px", borderRadius: "8px", background: "var(--app-border)", color: "var(--app-text-primary)", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "12px", flexShrink: 0, whiteSpace: "nowrap" },
  deleteBtn: { background: "#fee2e2", border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "14px", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { background: "var(--app-surface-bg)", borderRadius: "18px", width: "380px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--app-border)" },
  modalTitle: { fontSize: "16px", fontWeight: "700", color: "var(--app-text-primary)", margin: 0 },
  modalClose: { border: "none", background: "var(--app-border)", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", color: "var(--app-text-secondary)" },
  modalBody: { padding: "20px" },
  label: { display: "block", fontSize: "12px", fontWeight: "600", color: "var(--app-text-secondary)", margin: "0 0 6px" },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--app-border-strong)", fontSize: "14px", marginBottom: "16px", outline: "none", background: "var(--app-surface-bg)", color: "var(--app-text-primary)" },
  infoText: { fontSize: "13px", color: "var(--app-text-secondary)", lineHeight: "1.5", margin: "0 0 14px" },
  infoTextMuted: { fontSize: "12px", color: "var(--app-text-muted)", margin: "-8px 0 16px" },
  errorText: { color: "#ef4444", fontSize: "12px", margin: "-8px 0 12px" },
  saveBtn: { width: "100%", padding: "12px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "14px" },
};
