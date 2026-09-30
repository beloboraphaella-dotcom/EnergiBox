import React, { useState } from "react";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import AuthLayout, { HeroButton, HeroError, HeroField, HeroLink } from "../components/AuthLayout";

export default function LoginScreen({ onLogin, onGoToSignup }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError(t("auth.errMissingLogin"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post(
        "/auth/login",
        { email: email.trim(), password }
      );
      onLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || t("auth.errInvalid"));
    }
    setLoading(false);
  };

  return (
    <AuthLayout
      title={t("auth.signInTitle")}
      subtitle={t("auth.signInSubtitle")}
      footer={<HeroLink prompt={t("auth.noAccount")} action={t("auth.signUp")} onPress={onGoToSignup} />}
    >
      <HeroField
        icon="mail"
        placeholder={t("auth.email")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <HeroField
        icon="lock"
        placeholder={t("auth.password")}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        onSubmitEditing={handleLogin}
      />
      <HeroError>{error}</HeroError>
      <HeroButton label={t("auth.signIn")} onPress={handleLogin} loading={loading} style={{ marginTop: 6 }} />
    </AuthLayout>
  );
}
