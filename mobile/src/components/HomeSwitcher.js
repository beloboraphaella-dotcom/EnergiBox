import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, FlatList
} from "react-native";
import { api } from "../api";
import Icon from "./Icon";
import { colors, radius, type } from "../theme";

export default function HomeSwitcher({ homes, activeHomeId, onSwitchHome, onHomesChanged }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState("");

  const activeHome = homes.find((h) => h.id === activeHomeId);

  const close = () => {
    setOpen(false);
    setAdding(false);
    setError("");
    setNewName("");
    setNewAddress("");
  };

  const createHome = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await api.post(
        `/homes?name=${encodeURIComponent(newName)}${newAddress ? `&address=${encodeURIComponent(newAddress)}` : ""}`
      );
      await onHomesChanged();
      onSwitchHome(res.data.id);
      close();
    } catch (err) {
      setError("Could not create home.");
    }
  };

  return (
    <View>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Icon name="home" size={18} color={colors.secondary} />
        <Text style={styles.triggerName} numberOfLines={1}>
          {activeHome?.name || "EnergiBox"}
        </Text>
        <Icon name="expand_more" size={18} color={colors.onSurfaceVariant} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Your Homes</Text>
            <FlatList
              data={homes}
              keyExtractor={(h) => String(h.id)}
              style={{ maxHeight: 280 }}
              renderItem={({ item: h }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onSwitchHome(h.id); close(); }}
                >
                  <Text style={styles.rowIcon}>🏠</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{h.name}</Text>
                    <Text style={styles.rowSub}>
                      {h.room_count} room{h.room_count !== 1 ? "s" : ""} · {h.device_count} device{h.device_count !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  {h.id === activeHomeId && <Text style={styles.rowCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />

            {adding ? (
              <View style={styles.addForm}>
                <TextInput style={styles.input} placeholder="Home name" placeholderTextColor="#94a3b8" value={newName} onChangeText={setNewName} />
                <TextInput style={styles.input} placeholder="Address (optional)" placeholderTextColor="#94a3b8" value={newAddress} onChangeText={setNewAddress} />
                {!!error && <Text style={styles.errorText}>{error}</Text>}
                <TouchableOpacity style={styles.createBtn} onPress={createHome}>
                  <Text style={styles.createBtnText}>Create Home</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)}>
                <Text style={styles.addBtnText}>+ Add another home</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 170,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.5)",
  },
  triggerName: { ...type.labelSm, color: colors.onSurface, flexShrink: 1 },
  // Drawn as a real shape (not a "▾" glyph) so it renders identically on
  // every device/font instead of risking a missing-glyph box on some phones.

  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-start" },
  sheet: { backgroundColor: "#fff", borderRadius: 16, margin: 14, marginTop: 60, padding: 14 },
  sheetTitle: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, marginBottom: 2 },
  rowIcon: { fontSize: 18 },
  rowName: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  rowSub: { fontSize: 11, color: "#94a3b8" },
  rowCheck: { color: "#3b82f6", fontWeight: "700" },

  addBtn: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", borderStyle: "dashed", marginTop: 6, alignItems: "center" },
  addBtnText: { color: "#3b82f6", fontWeight: "600", fontSize: 13 },
  addForm: { marginTop: 8, padding: 10, backgroundColor: "#f8fafc", borderRadius: 10 },
  input: { padding: 9, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0", fontSize: 13, marginBottom: 8, color: "#0f172a" },
  errorText: { color: "#ef4444", fontSize: 12, marginBottom: 8 },
  createBtn: { padding: 9, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center" },
  createBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
