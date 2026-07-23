import { useState, useEffect } from "react";
import axios from "axios";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";

const API = "http://localhost:8000";

// Registered once, at module load — before React ever mounts or fires an
// effect — so even the very first request the app makes is covered. A 401
// from any endpoint means the token expired or is invalid; force a clean
// logout instead of letting each screen guess why its request failed.
// `logoutHandler` is swapped for the real one by App() on every render.
let logoutHandler = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("activeHomeId");
  window.location.reload();
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logoutHandler();
    }
    return Promise.reject(error);
  }
);

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppInner />
      </LanguageProvider>
    </ThemeProvider>
  );
}

function AppInner() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null")
  );
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
  const [homes, setHomes] = useState(null); // null = not loaded yet
  const [activeHomeId, setActiveHomeId] = useState(
    localStorage.getItem("activeHomeId") ? Number(localStorage.getItem("activeHomeId")) : null
  );

  const fetchHomes = async (tok) => {
    try {
      const res = await axios.get(`${API}/homes`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      setHomes(res.data);
      setActiveHomeId((prev) => {
        const stillValid = res.data.some((h) => h.id === prev);
        const next = stillValid ? prev : (res.data[0]?.id ?? null);
        if (next) localStorage.setItem("activeHomeId", String(next));
        return next;
      });
    } catch (err) {
      if (err.response?.status !== 401) {
        setHomes([]);
      }
      // 401 is handled by the module-level interceptor above (forces logout)
    }
  };

  useEffect(() => {
    if (token && user?.role !== "admin") {
      fetchHomes(token);
    }
  }, [token]);

  const handleAuthSuccess = (newToken, userData) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeHomeId");
    setToken(null);
    setUser(null);
    setHomes(null);
    setActiveHomeId(null);
    setAuthView("login");
  };

  // Keep the module-level interceptor pointed at this render's handleLogout
  // (which closes over the current setState functions).
  useEffect(() => {
    logoutHandler = handleLogout;
  });

  const handleUpdateUser = (updates) => {
    const newUser = { ...user, ...updates };
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
  };

  const handleSwitchHome = (homeId) => {
    localStorage.setItem("activeHomeId", String(homeId));
    setActiveHomeId(homeId);
  };

  if (!token) {
    return authView === "signup" ? (
      <Signup onSignupSuccess={handleAuthSuccess} onBackToLogin={() => setAuthView("login")} />
    ) : (
      <Login onLogin={handleAuthSuccess} onGoToSignup={() => setAuthView("signup")} />
    );
  }

  if (user?.role === "admin") {
    return (
      <Dashboard token={token} user={user} onLogout={handleLogout} onUpdateUser={handleUpdateUser} />
    );
  }

  if (homes === null) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingLogo}>⚡</span>
      </div>
    );
  }

  if (homes.length === 0) {
    return <Onboarding token={token} onComplete={() => fetchHomes(token)} />;
  }

  return (
    <Dashboard
      token={token}
      user={user}
      homes={homes}
      activeHomeId={activeHomeId}
      onSwitchHome={handleSwitchHome}
      onHomesChanged={() => fetchHomes(token)}
      onLogout={handleLogout}
      onUpdateUser={handleUpdateUser}
    />
  );
}

const styles = {
  loading: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f8fafc",
  },
  loadingLogo: { fontSize: "40px" },
};

export default App;
