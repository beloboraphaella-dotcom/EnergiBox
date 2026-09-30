import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, FlatList
} from "react-native";
import { api } from "../api";
import Icon from "./Icon";
import { colors, radius, type, glass } from "../theme";
import { useLanguage } from "../context/LanguageContext";

export default function HomeSwitcher({ homes, activeHomeId, onSwitchHome, onHomesChanged }) {
  const { t } = useLanguage();
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
      setError(t("shell.createHomeError"));
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
            <Text style={styles.sheetTitle}>{t("shell.yourHomes")}</Text>
            <FlatList
              data={homes}
              keyExtractor={(h) => String(h.id)}
              style={{ maxHeight: 280 }}
              renderItem={({ item: h }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onSwitchHome(h.id); close(); }}
                >
                  <View style={styles.rowOrb}>
                    <Icon name="home" size={18} color={colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{h.name}</Text>
                    <Text style={styles.rowSub}>
                      {h.room_count} {h.room_count === 1 ? t("shell.room") : t("shell.rooms")}
                      {" · "}
                      {h.device_count}{" "}
                      {h.device_count === 1 ? t("shell.device") : t("shell.devicesLower")}
                    </Text>
                  </View>
                  {h.id === activeHomeId && <Icon name="check" size={20} color={colors.secondary} />}
                </TouchableOpacity>
              )}
            />

            {adding ? (
              <View style={styles.addForm}>
                <TextInput style={styles.input} placeholder={t("shell.homeName")} placeholderTextColor={colors.outline} value={newName} onChangeText={setNewName} />
                <TextInput style={styles.input} placeholder={t("shell.homeAddress")} placeholderTextColor={colors.outline} value={newAddress} onChangeText={setNewAddress} />
                {!!error && <Text style={styles.errorText}>{error}</Text>}
                <TouchableOpacity style={styles.createBtn} onPress={createHome}>
                  <Text style={styles.createBtnText}>{t("shell.createHome")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)}>
                <Icon name="add" size={18} color={colors.secondary} />
                <Text style={styles.addBtnText}>{t("shell.addHome")}</Text>
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
    ...glass.pillIdle,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
  },
  triggerName: { ...type.labelSm, color: colors.onSurface, flexShrink: 1 },

  overlay: { flex: 1, backgroundColor: glass.scrim, justifyContent: "flex-start" },
  // The menu opens on a scrim, not on the backdrop, so it stays near opaque.
  sheet: {
    ...glass.strong,
    backgroundColor: "rgba(248, 250, 255, 0.95)",
    borderRadius: 20, margin: 14, marginTop: 72, padding: 14,
  },
  sheetTitle: { ...type.labelSm, color: colors.outline, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, marginBottom: 2 },
  rowOrb: { ...glass.orb, width: 36, height: 36, borderRadius: 18 },
  rowName: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, fontSize: 14, color: colors.onSurface },
  rowSub: { ...type.labelSm, fontFamily: type.bodyMd.fontFamily, color: colors.outline },

  addBtn: {
    ...glass.ghostButton,
    borderStyle: "dashed", borderColor: "rgba(0, 106, 97, 0.35)",
    marginTop: 8, paddingVertical: 10,
  },
  addBtnText: { ...glass.ghostButtonText, fontSize: 14, color: colors.secondary },
  addForm: { ...glass.subtle, marginTop: 8, padding: 10, gap: 8 },
  input: { ...type.bodyMd, fontSize: 14, ...glass.input, paddingVertical: 10 },
  errorText: { ...type.labelSm, color: colors.error },
  createBtn: { ...glass.primaryButton, paddingVertical: 11 },
  createBtnText: glass.primaryButtonText,
});
