import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from "react-native";
import { api } from "../api";

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
        `/auth/login?email=${encodeURIComponent(email.trim())}&password=${encodeURIComponent(password)}`
      );
      onLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>⚡</Text>
        <Text style={styles.brand}>ENERGIBOX</Text>
        <Text style={styles.welcome}>Welcome Back</Text>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#aaa"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#aaa"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>LOGIN</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.signupLink} onPress={onGoToSignup}>
          <Text style={styles.signupLinkText}>
            Don't have an account? <Text style={styles.signupLinkBold}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0d7a6a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#00b09b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: { fontSize: 48, marginBottom: 8 },
  brand: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 4,
    color: "#00b09b",
    marginBottom: 6,
  },
  welcome: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 28,
  },
  inputWrap: { width: "100%", marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#444",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: "#333",
    borderWidth: 1.5,
    borderColor: "#eee",
  },
  error: {
    color: "#e74c3c",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    width: "100%",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#00b09b",
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#00b09b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 1,
  },
  signupLink: { marginTop: 20 },
  signupLinkText: { color: "#777", fontSize: 13 },
  signupLinkBold: { color: "#00b09b", fontWeight: "700" },
});
