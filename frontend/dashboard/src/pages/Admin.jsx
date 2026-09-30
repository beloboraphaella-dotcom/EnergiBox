import { useState, useEffect } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";

const API = "http://localhost:8000";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    <div className="max-w-7xl mx-auto py-lg space-y-md">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Admin</h1>
          <p className="text-on-surface-variant mt-1">Platform statistics and user management</p>
        </div>
        <div className="segmented self-start">
          {[
            { id: "accounts", label: "Accounts", icon: "group" },
            { id: "overview", label: "Overview", icon: "monitoring" },
          ].map((tb) => (
            <button
              key={tb.id}
              type="button"
              aria-pressed={tab === tb.id}
              onClick={() => setTab(tb.id)}
              className="inline-flex items-center gap-1.5"
            >
              <Icon name={tb.icon} style={{ fontSize: "18px" }} />
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="glass rounded-2xl p-md flex items-center gap-3 text-error">
          <Icon name="error" /> {error}
        </div>
      )}

      {tab === "accounts" && (
        <section className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-md py-4 border-b border-white/70">
            <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-outline">User Accounts</h2>
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Icon name="person_add" style={{ fontSize: "18px" }} /> Create Account
            </button>
          </div>
          {users.length === 0 ? (
            <p className="p-md text-on-surface-variant">No users found.</p>
          ) : (
            <ul className="divide-y divide-white/70">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col lg:flex-row lg:items-center gap-3 px-md py-4 hover:bg-white/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="icon-orb w-10 h-10 font-semibold text-[15px]">
                      {(u.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-body-md text-body-md font-semibold text-on-surface flex items-center gap-2">
                        <span className="truncate">{u.name}</span>
                        {u.id === currentUserId && <span className="chip chip-teal">you</span>}
                      </p>
                      <p className="text-[14px] text-on-surface-variant truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"chip " + (u.role === "admin" ? "chip-indigo" : "")}>{u.role}</span>
                    <span className={"chip " + (u.is_suspended ? "chip-red" : "chip-teal")}>
                      {u.is_suspended ? "Suspended" : "Active"}
                    </span>
                    <button type="button" className="btn-glass py-1.5 px-3 text-[13px]" onClick={() => openResetPassword(u)} title="Reset password">
                      <Icon name="key" style={{ fontSize: "16px" }} /> Reset Password
                    </button>
                    <button
                      type="button"
                      className="btn-glass py-1.5 px-3 text-[13px]"
                      onClick={() => toggleSuspend(u)}
                      disabled={u.id === currentUserId}
                    >
                      <Icon name={u.is_suspended ? "lock_open" : "block"} style={{ fontSize: "16px" }} />
                      {u.is_suspended ? "Reinstate" : "Suspend"}
                    </button>
                    <button
                      type="button"
                      className="btn-danger p-2"
                      onClick={() => removeUser(u)}
                      disabled={u.id === currentUserId}
                      title="Delete account"
                      aria-label="Delete account"
                    >
                      <Icon name="delete" style={{ fontSize: "18px" }} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "overview" && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
          {[
            { label: "Active Users", icon: "group", value: stats.users.active, of: `/ ${stats.users.total}` },
            { label: "EnergiBoxes Online", icon: "router", value: stats.energiboxes.online, of: `/ ${stats.energiboxes.total}` },
            { label: "Alerts (7 days)", icon: "notifications", value: stats.alerts.last_7_days, of: `/ ${stats.alerts.total} total` },
          ].map((card) => (
            <div key={card.label} className="glass rounded-2xl p-md">
              <div className="flex items-center justify-between mb-4">
                <span className="font-data-label text-data-label uppercase text-outline">{card.label}</span>
                <span className="icon-orb w-9 h-9"><Icon name={card.icon} style={{ fontSize: "20px" }} /></span>
              </div>
              <p className="font-headline-lg text-headline-lg text-on-surface">
                {card.value} <span className="font-body-md text-body-md text-outline">{card.of}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Account modal ── */}
      {modal === "create" && (
        <Modal title="Create Account" onClose={closeModal}>
          <div className="space-y-4">
            <Field label="Full Name">
              <input
                className="glass-input"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className="glass-input"
                type="email"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
              />
            </Field>
            <Field label="Password">
              <input
                className="glass-input"
                type="text"
                placeholder="At least 6 characters"
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
              />
            </Field>
            <p className="text-[13px] text-on-surface-variant">
              This creates a regular account — share this password with them so they can log in and change it.
            </p>
            {formError && <p className="text-error text-[14px]">{formError}</p>}
            <button type="button" className="btn-primary w-full py-3" onClick={submitCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Account"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reset Password modal ── */}
      {modal?.resetPw && (
        <Modal title="Reset Password" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-[14px] text-on-surface-variant glass-subtle rounded-xl p-3">
              Set a new password for <strong className="text-on-surface">{modal.resetPw.name}</strong> ({modal.resetPw.email}).
              Use this when they've lost access to their account or forgotten their credentials.
            </p>
            <Field label="New Password">
              <input
                className="glass-input"
                type="text"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                className="glass-input"
                type="text"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
            {formError && <p className="text-error text-[14px]">{formError}</p>}
            <button type="button" className="btn-primary w-full py-3" onClick={submitResetPassword} disabled={saving}>
              {saving ? "Saving..." : "Reset Password"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
