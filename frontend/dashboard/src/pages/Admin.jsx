import { useState, useEffect } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Admin({ token, currentUserId }) {
  const { t } = useLanguage();
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
      setError(t("admin.errLoad"));
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
    if (!window.confirm(t("admin.confirmDelete", { name: u.name, email: u.email }))) return;
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
      setFormError(t("admin.errRequired"));
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError(t("auth.errEmail"));
      return;
    }
    if (password.length < 6) {
      setFormError(t("auth.errPasswordLength"));
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
      setFormError(err.response?.data?.detail || t("auth.errCreate"));
    }
    setSaving(false);
  };

  const submitResetPassword = async () => {
    if (newPassword.length < 6) {
      setFormError(t("auth.errPasswordLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(t("auth.errPasswordMatch"));
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
      setFormError(err.response?.data?.detail || t("admin.errReset"));
    }
    setSaving(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-lg space-y-md">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{t("admin.title")}</h1>
          <p className="text-on-surface-variant mt-1">{t("admin.subtitle")}</p>
        </div>
        <div className="segmented self-start">
          {[
            { id: "accounts", label: t("admin.tab.accounts"), icon: "group" },
            { id: "overview", label: t("admin.tab.overview"), icon: "monitoring" },
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
            <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{t("admin.userAccounts")}</h2>
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Icon name="person_add" style={{ fontSize: "18px" }} /> {t("admin.createAccount")}
            </button>
          </div>
          {users.length === 0 ? (
            <p className="p-md text-on-surface-variant">{t("admin.noUsers")}</p>
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
                        {u.id === currentUserId && <span className="chip chip-teal">{t("admin.you")}</span>}
                      </p>
                      <p className="text-[14px] text-on-surface-variant truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"chip " + (u.role === "admin" ? "chip-indigo" : "")}>{t(`admin.role.${u.role}`)}</span>
                    <span className={"chip " + (u.is_suspended ? "chip-red" : "chip-teal")}>
                      {u.is_suspended ? t("admin.suspended") : t("admin.active")}
                    </span>
                    <button type="button" className="btn-glass py-1.5 px-3 text-[13px]" onClick={() => openResetPassword(u)} title={t("admin.resetPassword")}>
                      <Icon name="key" style={{ fontSize: "16px" }} /> {t("admin.resetPassword")}
                    </button>
                    <button
                      type="button"
                      className="btn-glass py-1.5 px-3 text-[13px]"
                      onClick={() => toggleSuspend(u)}
                      disabled={u.id === currentUserId}
                    >
                      <Icon name={u.is_suspended ? "lock_open" : "block"} style={{ fontSize: "16px" }} />
                      {u.is_suspended ? t("admin.reinstate") : t("admin.suspend")}
                    </button>
                    <button
                      type="button"
                      className="btn-danger p-2"
                      onClick={() => removeUser(u)}
                      disabled={u.id === currentUserId}
                      title={t("admin.deleteAccount")}
                      aria-label={t("admin.deleteAccount")}
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
            { label: t("admin.stat.users"), icon: "group", value: stats.users.active, of: `/ ${stats.users.total}` },
            { label: t("admin.stat.boxes"), icon: "router", value: stats.energiboxes.online, of: `/ ${stats.energiboxes.total}` },
            { label: t("admin.stat.alerts"), icon: "notifications", value: stats.alerts.last_7_days, of: t("admin.stat.total", { count: stats.alerts.total }) },
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
        <Modal title={t("admin.createAccount")} onClose={closeModal}>
          <div className="space-y-4">
            <Field label={t("auth.fullName")}>
              <input
                className="glass-input"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              />
            </Field>
            <Field label={t("auth.email")}>
              <input
                className="glass-input"
                type="email"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
              />
            </Field>
            <Field label={t("auth.password")}>
              <input
                className="glass-input"
                type="text"
                placeholder={t("admin.passwordPh")}
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
              />
            </Field>
            <p className="text-[13px] text-on-surface-variant">
              {t("admin.createHint")}
            </p>
            {formError && <p className="text-error text-[14px]">{formError}</p>}
            <button type="button" className="btn-primary w-full py-3" onClick={submitCreate} disabled={saving}>
              {saving ? t("common.creating") : t("admin.createAccount")}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reset Password modal ── */}
      {modal?.resetPw && (
        <Modal title={t("admin.resetPassword")} onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-[14px] text-on-surface-variant glass-subtle rounded-xl p-3">
              {t("admin.resetIntro", { name: modal.resetPw.name, email: modal.resetPw.email })}
            </p>
            <Field label={t("admin.newPassword")}>
              <input
                className="glass-input"
                type="text"
                placeholder={t("admin.passwordPh")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field label={t("admin.confirmNewPassword")}>
              <input
                className="glass-input"
                type="text"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
            {formError && <p className="text-error text-[14px]">{formError}</p>}
            <button type="button" className="btn-primary w-full py-3" onClick={submitResetPassword} disabled={saving}>
              {saving ? t("common.saving") : t("admin.resetPassword")}
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
