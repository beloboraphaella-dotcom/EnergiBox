import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function Login({ onLogin, onGoToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(
        `${API}/auth/login?email=${email}&password=${password}`
      );
      onLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError("Invalid email or password");
    }
    setLoading(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div style={styles.page}>
      {/* Background blobs */}
      <div style={styles.blobBottomLeft} />
      <div style={styles.blobBottomRight} />

      {/* Hexagon card */}
      <div style={styles.hexWrap}>
        {/* Avatar hexagon on top */}
        <div style={styles.avatarHex}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" fill="#1a5c4a" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="#1a5c4a" />
          </svg>
        </div>

        {/* Main hexagon card */}
        <div style={styles.card}>
          <h2 style={styles.title}>Sign In</h2>

          {/* Email input */}
          <div style={styles.inputWrap}>
            <div style={styles.iconBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="#555" strokeWidth="1.5" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={styles.divider} />
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Password input */}
          <div style={styles.inputWrap}>
            <div style={styles.iconBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#555" strokeWidth="1.5" />
                <path d="M8 11V7a4 4 0 018 0v4" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={styles.divider} />
            <input
              style={styles.input}
              type={showPass ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={() => setShowPass(!showPass)}
              style={styles.eyeBtn}
            >
              {showPass ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="#0099aa" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke="#0099aa" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M1 1l22 22" stroke="#0099aa" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#0099aa" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="3" stroke="#0099aa" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          {/* Login button */}
          <button
            style={{ ...styles.button, opacity: loading ? 0.8 : 1 }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "LOGGING IN..." : "LOGIN"}
          </button>

          {/* Footer row */}
          <div style={styles.footer}>
            <label style={styles.remember}>
              <input type="checkbox" style={{ marginRight: "6px" }} />
              Remember me
            </label>
            <span style={styles.forgot}>Forgot password?</span>
          </div>

          <div style={styles.signupRow}>
            <span style={styles.signupText} onClick={onGoToSignup}>
              Don't have an account? <strong>Sign up</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #00b09b 0%, #1a8a6a 30%, #0d7a6a 60%, #0a5c6a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Segoe UI', sans-serif",
  },
  blobBottomLeft: {
    position: "absolute",
    width: "320px",
    height: "280px",
    borderRadius: "50% 50% 50% 70%",
    background: "rgba(0, 180, 140, 0.35)",
    bottom: "-60px",
    left: "-40px",
    pointerEvents: "none",
  },
  blobBottomRight: {
    position: "absolute",
    width: "380px",
    height: "320px",
    borderRadius: "70% 50% 50% 50%",
    background: "rgba(0, 150, 180, 0.25)",
    bottom: "-80px",
    right: "-60px",
    pointerEvents: "none",
  },
  hexWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  avatarHex: {
    width: "72px",
    height: "72px",
    background: "rgba(255,255,255,0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "2px solid rgba(255,255,255,0.4)",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "-36px",
    zIndex: 2,
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
    background: "rgba(200, 240, 225, 0.35)",
  },
  card: {
    background: "rgba(200, 240, 225, 0.22)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1.5px solid rgba(255,255,255,0.3)",
    borderRadius: "28px",
    padding: "60px 36px 32px",
    width: "340px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 8px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)",
    clipPath: "polygon(25% 0%, 75% 0%, 100% 15%, 100% 85%, 75% 100%, 25% 100%, 0% 85%, 0% 15%)",
    paddingTop: "70px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "400",
    color: "#ffffff",
    margin: "0 0 28px",
    letterSpacing: "1px",
    textShadow: "0 1px 4px rgba(0,0,0,0.2)",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.92)",
    borderRadius: "30px",
    marginBottom: "16px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  iconBox: {
    padding: "13px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  divider: {
    width: "1px",
    height: "24px",
    background: "#ccc",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: "none",
    background: "transparent",
    padding: "13px 14px",
    fontSize: "14px",
    color: "#333",
    outline: "none",
  },
  eyeBtn: {
    background: "transparent",
    border: "none",
    padding: "0 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  error: {
    color: "#ffe0e0",
    fontSize: "13px",
    marginBottom: "8px",
    textAlign: "center",
  },
  button: {
    width: "100%",
    padding: "14px",
    borderRadius: "30px",
    background: "linear-gradient(135deg, #0d5c6e, #0a7a7a)",
    color: "#fff",
    fontWeight: "700",
    fontSize: "15px",
    border: "none",
    cursor: "pointer",
    letterSpacing: "2px",
    marginTop: "8px",
    boxShadow: "0 4px 20px rgba(0,80,100,0.4)",
    transition: "transform 0.1s",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    marginTop: "16px",
    alignItems: "center",
  },
  remember: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.8)",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
  },
  forgot: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.8)",
    cursor: "pointer",
  },
  signupRow: {
    marginTop: "14px",
    textAlign: "center",
  },
  signupText: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
  },
};