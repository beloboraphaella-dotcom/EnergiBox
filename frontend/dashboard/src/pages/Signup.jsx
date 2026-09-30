import { useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import AuthLayout, { HeroError, HeroField } from "../components/AuthLayout";

const API = "http://localhost:8000";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup({ onSignupSuccess, onBackToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSignup = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in every field");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/register`, {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      const loginRes = await axios.post(`${API}/auth/login`, {
        email: email.trim(),
        password,
      });
      onSignupSuccess(loginRes.data.access_token, loginRes.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not create account");
    }
    setLoading(false);
  };

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPass(!showPass)}
      aria-label={showPass ? "Hide password" : "Show password"}
      className="btn-icon w-8 h-8 text-white/80 hover:text-white hover:bg-white/15"
    >
      <Icon name={showPass ? "visibility_off" : "visibility"} style={{ fontSize: "20px" }} />
    </button>
  );

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Start measuring what your home really uses."
      footer={
        <button type="button" onClick={onBackToLogin} className="hover:text-white transition-colors">
          Already have an account? <strong className="text-white">Log in</strong>
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSignup();
        }}
      >
        <HeroField
          icon="person"
          type="text"
          placeholder="Full Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={passwordToggle}
        />
        <HeroField
          icon="lock_reset"
          type={showPass ? "text" : "password"}
          placeholder="Confirm Password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <HeroError>{error}</HeroError>

        <button type="submit" className="btn-primary w-full py-3 mt-2" disabled={loading}>
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
    </AuthLayout>
  );
}
