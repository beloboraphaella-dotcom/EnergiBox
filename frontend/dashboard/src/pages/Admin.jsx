import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function Admin({ token, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

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

  return (
    <div>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Admin</h1>
        <p style={s.pageSub}>Platform statistics and user management</p>
      </div>

      {error && <div style={s.emptyCard}><p style={{ color: "#ef4444" }}>{error}</p></div>}

      {stats && (
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
      )}

      <p style={s.sectionLabel}>User Accounts</p>
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
              <span style={{ ...s.rolePill, background: u.role === "admin" ? "#eff6ff" : "#f1f5f9", color: u.role === "admin" ? "#3b82f6" : "#64748b" }}>
                {u.role}
              </span>
              <span style={{ ...s.statusPill, background: u.is_suspended ? "#fef2f2" : "#dcfce7", color: u.is_suspended ? "#ef4444" : "#16a34a" }}>
                {u.is_suspended ? "Suspended" : "Active"}
              </span>
              <button style={s.actionBtn} onClick={() => toggleSuspend(u)} disabled={u.id === currentUserId}>
                {u.is_suspended ? "Reinstate" : "Suspend"}
              </button>
              <button style={s.deleteBtn} onClick={() => removeUser(u)} disabled={u.id === currentUserId}>🗑</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const s = {
  pageHeader: { marginBottom: "20px" },
  pageTitle: { fontSize: "26px", fontWeight: "700", color: "#0f172a", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "#94a3b8", margin: 0 },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "24px" },
  statCard: { background: "#fff", borderRadius: "16px", padding: "18px", border: "1px solid #f1f5f9", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  statLabel: { fontSize: "12px", color: "#94a3b8", margin: "0 0 6px", fontWeight: "500" },
  statValue: { fontSize: "22px", fontWeight: "700", color: "#0f172a", margin: 0 },
  statSub: { fontSize: "13px", fontWeight: "500", color: "#94a3b8" },

  sectionLabel: { fontSize: "12px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" },
  card: { background: "#fff", borderRadius: "16px", padding: "8px 18px", border: "1px solid #f1f5f9", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  emptyCard: { background: "#fff", borderRadius: "16px", padding: "24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", marginBottom: "20px" },
  emptyText: { color: "#aaa", fontSize: "13px", padding: "14px 0" },

  userRow: { display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid #f1f5f9" },
  userName: { fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: "0 0 2px", display: "flex", alignItems: "center", gap: "6px" },
  userEmail: { fontSize: "12px", color: "#94a3b8", margin: 0 },
  youTag: { fontSize: "10px", fontWeight: "700", color: "#3b82f6", background: "#eff6ff", padding: "2px 6px", borderRadius: "6px" },
  rolePill: { padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", textTransform: "capitalize", flexShrink: 0 },
  statusPill: { padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", flexShrink: 0 },
  actionBtn: { padding: "8px 14px", borderRadius: "8px", background: "#f1f5f9", color: "#374151", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "12px", flexShrink: 0 },
  deleteBtn: { background: "#fee2e2", border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "14px", flexShrink: 0 },
};
