import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform
} from "react-native";
import { api } from "../api";
import { normalizeMac } from "../utils";

const STEPS = ["Home", "Rooms", "Appliances", "Done"];

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [homeId, setHomeId] = useState(null);
  const [homeName, setHomeName] = useState("");
  const [homeAddress, setHomeAddress] = useState("");

  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");

  const [devices, setDevices] = useState([]);
  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });

  const createHome = async () => {
    if (!homeName.trim()) {
      setError("Give your home a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (homeId) {
        await api.put(
          `/homes/${homeId}?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`
        );
      } else {
        const res = await api.post(
          `/homes?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`
        );
        setHomeId(res.data.id);
      }
      setStep(1);
    } catch (err) {
      setError("Could not create home. Try again.");
    }
    setSaving(false);
  };

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const addRoom = async () => {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    if (rooms.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A room named "${trimmed}" already exists in this home.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post(`/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`);
      setRooms((r) => [...r, res.data]);
      setNewRoomName("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add room.");
    }
    setSaving(false);
  };

  const addDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setError("Room, name and MAC address are required.");
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setError("Enter a valid MAC address — 12 hex digits, e.g. AA:BB:CC:DD:EE:FF.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post(
        `/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}&type=${type}&mac_address=${encodeURIComponent(normalizedMac)}`
      );
      setDevices((d) => [...d, res.data]);
      setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add device. Check the MAC address.");
    }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.logo}>⚡</Text>
            <Text style={styles.brand}>EnergiBox</Text>
          </View>

          <View style={styles.steps}>
            {STEPS.map((label, i) => (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepDot, { backgroundColor: i <= step ? "#3b82f6" : "#e2e8f0" }]}>
                  <Text style={[styles.stepDotText, { color: i <= step ? "#fff" : "#94a3b8" }]}>
                    {i < step ? "✓" : i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: i <= step ? "#0f172a" : "#94a3b8" }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* STEP 0: Home */}
          {step === 0 && (
            <View>
              <Text style={styles.title}>Set up your home</Text>
              <Text style={styles.subtitle}>This is the first thing every EnergiBox account needs — you can add more homes later.</Text>
              <Text style={styles.label}>Home Name</Text>
              <TextInput style={styles.input} placeholder="e.g. My Home" placeholderTextColor="#aaa" value={homeName} onChangeText={setHomeName} />
              <Text style={styles.label}>Address (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Yaoundé, Cameroun" placeholderTextColor="#aaa" value={homeAddress} onChangeText={setHomeAddress} />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity style={styles.primaryBtn} onPress={createHome} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? "Creating..." : "Continue"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 1: Rooms */}
          {step === 1 && (
            <View>
              <Text style={styles.title}>Add your rooms</Text>
              <Text style={styles.subtitle}>Add every room you want to monitor. You need at least one to continue.</Text>

              {rooms.length > 0 && (
                <View style={styles.chipRow}>
                  {rooms.map((r) => (
                    <View key={r.id} style={styles.chip}><Text style={styles.chipText}>🏠 {r.name}</Text></View>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Room Name</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="e.g. Living Room"
                  placeholderTextColor="#aaa"
                  value={newRoomName}
                  onChangeText={setNewRoomName}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addRoom} disabled={saving || !newRoomName.trim()}>
                  <Text style={styles.addBtnText}>✓ Confirm Room</Text>
                </TouchableOpacity>
              </View>

              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.navRow}>
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                  <Text style={styles.backBtnText}>‹ Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.navPrimary, rooms.length === 0 && styles.disabledBtn]}
                  onPress={() => setStep(2)}
                  disabled={rooms.length === 0}
                >
                  <Text style={styles.primaryBtnText}>Continue ({rooms.length} room{rooms.length !== 1 ? "s" : ""})</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 2: Appliances */}
          {step === 2 && (
            <View>
              <Text style={styles.title}>Add your appliances & sockets</Text>
              <Text style={styles.subtitle}>Pair each EnergiBox by its MAC address. You need at least one device to finish setup.</Text>

              {devices.length > 0 && (
                <View style={styles.chipRow}>
                  {devices.map((d) => (
                    <View key={d.id} style={styles.chip}>
                      <Text style={styles.chipText}>{d.type === "socket" ? "🔌" : "📦"} {d.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Room</Text>
              <Text style={styles.helperText}>Tap the room this device is in — required before you can confirm it.</Text>
              <View style={styles.pickerRow}>
                {rooms.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.pickerChoice, newDevice.room_id === r.id && styles.pickerChoiceActive]}
                    onPress={() => setNewDevice({ ...newDevice, room_id: r.id })}
                  >
                    <Text style={[styles.pickerChoiceText, newDevice.room_id === r.id && styles.pickerChoiceTextActive]}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Fridge"
                placeholderTextColor="#aaa"
                value={newDevice.name}
                onChangeText={(v) => setNewDevice({ ...newDevice, name: v })}
              />

              <Text style={styles.label}>Type</Text>
              <View style={styles.typeRow}>
                {["appliance", "socket"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChoice, newDevice.type === t && styles.typeChoiceActive]}
                    onPress={() => setNewDevice({ ...newDevice, type: t })}
                  >
                    <Text style={[styles.typeChoiceText, newDevice.type === t && styles.typeChoiceTextActive]}>
                      {t === "appliance" ? "Appliance" : "Socket"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>EnergiBox MAC Address</Text>
              <TextInput
                style={styles.input}
                placeholder="AA:BB:CC:DD:EE:FF"
                placeholderTextColor="#aaa"
                value={newDevice.mac}
                onChangeText={(v) => setNewDevice({ ...newDevice, mac: v.toUpperCase() })}
                autoCapitalize="characters"
              />

              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity style={[styles.addBtn, styles.fullWidthBtn]} onPress={addDevice} disabled={saving}>
                <Text style={styles.addBtnText}>✓ Confirm Device</Text>
              </TouchableOpacity>

              <View style={styles.navRow}>
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                  <Text style={styles.backBtnText}>‹ Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.navPrimary, devices.length === 0 && styles.disabledBtn]}
                  onPress={() => setStep(3)}
                  disabled={devices.length === 0}
                >
                  <Text style={styles.primaryBtnText}>Finish ({devices.length} device{devices.length !== 1 ? "s" : ""})</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3: Done */}
          {step === 3 && (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.doneEmoji}>🎉</Text>
              <Text style={styles.title}>You're all set!</Text>
              <Text style={[styles.subtitle, { textAlign: "center" }]}>
                {homeName} is ready with {rooms.length} room{rooms.length !== 1 ? "s" : ""} and {devices.length} device{devices.length !== 1 ? "s" : ""}.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onComplete}>
                <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 440 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  logo: { fontSize: 22 },
  brand: { fontSize: 18, fontWeight: "700", color: "#1e40af" },

  steps: { flexDirection: "row", alignItems: "center", marginBottom: 24, justifyContent: "space-between" },
  stepItem: { alignItems: "center", flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepDotText: { fontSize: 12, fontWeight: "700" },
  stepLabel: { fontSize: 10, fontWeight: "600" },

  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#94a3b8", marginBottom: 18, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6 },
  helperText: { fontSize: 12, color: "#94a3b8", marginBottom: 8, marginTop: -2 },
  input: {
    width: "100%", padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: "#e2e8f0", fontSize: 14, marginBottom: 14, color: "#0f172a",
  },
  errorText: { color: "#ef4444", fontSize: 12, marginBottom: 12 },
  primaryBtn: { width: "100%", padding: 14, borderRadius: 10, backgroundColor: "#3b82f6", alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  disabledBtn: { opacity: 0.5 },

  navRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, backgroundColor: "#f1f5f9" },
  backBtnText: { color: "#64748b", fontWeight: "600", fontSize: 14 },
  navPrimary: { flex: 1 },

  inlineRow: { flexDirection: "row", gap: 8, marginBottom: 14, alignItems: "stretch" },
  inlineInput: { flex: 1, marginBottom: 0 },
  addBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" },
  addBtnText: { color: "#3b82f6", fontWeight: "600", fontSize: 13 },
  fullWidthBtn: { width: "100%", marginBottom: 12 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: "#f1f5f9", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  chipText: { fontSize: 12, fontWeight: "600", color: "#374151" },

  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  pickerChoice: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#f1f5f9" },
  pickerChoiceActive: { backgroundColor: "#3b82f6" },
  pickerChoiceText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  pickerChoiceTextActive: { color: "#fff" },

  typeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  typeChoice: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: "#f1f5f9", alignItems: "center" },
  typeChoiceActive: { backgroundColor: "#3b82f6" },
  typeChoiceText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  typeChoiceTextActive: { color: "#fff" },

  doneEmoji: { fontSize: 48, marginBottom: 12 },
});
