import React, { useState } from "react";
import { api } from "../api";
import AuthLayout, { HeroButton, HeroError, HeroField, HeroLink } from "../components/AuthLayout";

export default function LoginScreen({ onLogin, onGoToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
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
      setError(err.response?.data?.detail || "Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Welcome back — your home's energy, live."
      footer={<HeroLink prompt="Don't have an account?" action="Sign up" onPress={onGoToSignup} />}
    >
      <HeroField
        icon="mail"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <HeroField
        icon="lock"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        onSubmitEditing={handleLogin}
      />
      <HeroError>{error}</HeroError>
      <HeroButton label="Sign in" onPress={handleLogin} loading={loading} style={{ marginTop: 6 }} />
    </AuthLayout>
  );
}
