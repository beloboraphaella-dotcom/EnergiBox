import React, { useState } from "react";
import { api } from "../api";
import { EMAIL_REGEX } from "../utils";
import { useLanguage } from "../context/LanguageContext";
import AuthLayout, { HeroButton, HeroError, HeroField, HeroLink } from "../components/AuthLayout";

export default function SignupScreen({ onSignupSuccess, onBackToLogin }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError(t("auth.errAllFields"));
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t("auth.errEmail"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth.errPasswordLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.errPasswordMatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post(
        "/auth/register",
        { name: name.trim(), email: email.trim(), password }
      );
      const loginRes = await api.post(
        "/auth/login",
        { email: email.trim(), password }
      );
      onSignupSuccess(loginRes.data.access_token, loginRes.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || t("auth.errCreate"));
    }
    setLoading(false);
  };

  return (
    <AuthLayout
      title={t("auth.signUpTitle")}
      subtitle={t("auth.signUpSubtitle")}
      footer={<HeroLink prompt={t("auth.haveAccount")} action={t("auth.logIn")} onPress={onBackToLogin} />}
    >
      <HeroField icon="person" placeholder={t("auth.fullName")} value={name} onChangeText={setName} autoComplete="name" />
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
        autoComplete="new-password"
      />
      <HeroField
        icon="lock_reset"
        placeholder={t("auth.confirmPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secure
        autoComplete="new-password"
        onSubmitEditing={handleSignup}
      />
      <HeroError>{error}</HeroError>
      <HeroButton label={t("auth.signUp")} onPress={handleSignup} loading={loading} style={{ marginTop: 6 }} />
    </AuthLayout>
  );
}
