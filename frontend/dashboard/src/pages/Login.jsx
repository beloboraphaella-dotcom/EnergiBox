import { useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import AuthLayout, { HeroError, HeroField } from "../components/AuthLayout";

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
      const res = await axios.post(`${API}/auth/login`, {
        email: email.trim(),
        password,
      });
      onLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError("Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Welcome back — your home's energy, live."
      footer={
        <button type="button" onClick={onGoToSignup} className="hover:text-white transition-colors">
          Don't have an account? <strong className="text-white">Sign up</strong>
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <HeroField
          icon="mail"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <HeroField
          icon="lock"
          type={showPass ? "text" : "password"}
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? "Hide password" : "Show password"}
              className="btn-icon w-8 h-8 text-white/80 hover:text-white hover:bg-white/15"
            >
              <Icon name={showPass ? "visibility_off" : "visibility"} style={{ fontSize: "20px" }} />
            </button>
          }
        />

        <HeroError>{error}</HeroError>

        <button type="submit" className="btn-primary w-full py-3 mt-2" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
