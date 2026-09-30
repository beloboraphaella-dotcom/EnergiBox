import { useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import { useLanguage } from "../context/LanguageContext";
import AuthLayout, { HeroError, HeroField } from "../components/AuthLayout";

const API = "http://localhost:8000";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup({ onSignupSuccess, onBackToLogin }) {
  const { t } = useLanguage();
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
      setError(t("auth.errAllFields"));
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t("auth.errEmail"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.errPasswordMatch"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth.errPasswordLength"));
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
      setError(err.response?.data?.detail || t("auth.errCreate"));
    }
    setLoading(false);
  };

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPass(!showPass)}
      aria-label={showPass ? t("common.hidePassword") : t("common.showPassword")}
      className="btn-icon w-8 h-8 text-white/80 hover:text-white hover:bg-white/15"
    >
      <Icon name={showPass ? "visibility_off" : "visibility"} style={{ fontSize: "20px" }} />
    </button>
  );

  return (
    <AuthLayout
      title={t("auth.signUpTitle")}
      subtitle={t("auth.signUpSubtitle")}
      footer={
        <button type="button" onClick={onBackToLogin} className="hover:text-white transition-colors">
          {t("auth.haveAccount")} <strong className="text-white">{t("auth.logIn")}</strong>
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
          placeholder={t("auth.fullName")}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <HeroField
          icon="mail"
          type="email"
          placeholder={t("auth.email")}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <HeroField
          icon="lock"
          type={showPass ? "text" : "password"}
          placeholder={t("auth.password")}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={passwordToggle}
        />
        <HeroField
          icon="lock_reset"
          type={showPass ? "text" : "password"}
          placeholder={t("auth.confirmPassword")}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <HeroError>{error}</HeroError>

        <button type="submit" className="btn-primary w-full py-3 mt-2" disabled={loading}>
          {loading ? t("auth.creatingAccount") : t("auth.signUp")}
        </button>
      </form>
    </AuthLayout>
  );
}
