import React, { useState } from "react";
import { api } from "../api";
import { EMAIL_REGEX } from "../utils";
import AuthLayout, { HeroButton, HeroError, HeroField, HeroLink } from "../components/AuthLayout";

export default function SignupScreen({ onSignupSuccess, onBackToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
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
      setError(err.response?.data?.detail || "Could not create account. Try again.");
    }
    setLoading(false);
  };

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Start measuring what your home really uses."
      footer={<HeroLink prompt="Already have an account?" action="Log in" onPress={onBackToLogin} />}
    >
      <HeroField icon="person" placeholder="Full Name" value={name} onChangeText={setName} autoComplete="name" />
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
        autoComplete="new-password"
      />
      <HeroField
        icon="lock_reset"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secure
        autoComplete="new-password"
        onSubmitEditing={handleSignup}
      />
      <HeroError>{error}</HeroError>
      <HeroButton label="Sign up" onPress={handleSignup} loading={loading} style={{ marginTop: 6 }} />
    </AuthLayout>
  );
}
