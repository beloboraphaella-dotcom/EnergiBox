import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../api";
import Icon from "../components/Icon";
import AuthLayout, { HeroButton, HeroError, HeroField } from "../components/AuthLayout";
import { useLanguage } from "../context/LanguageContext";
import { colors, spacing, type, fonts } from "../theme";
import { normalizeMac } from "../utils";

const STEPS = ["home", "rooms", "appliances", "done"];

export default function OnboardingScreen({ onComplete }) {
  const { t, tn } = useLanguage();
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
      setError(t("onb.errHomeName"));
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
      setError(t("onb.errCreateHome"));
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
      setError(t("onb.errRoomExists", { name: trimmed }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post(`/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`);
      setRooms((r) => [...r, res.data]);
      setNewRoomName("");
    } catch (err) {
      setError(err.response?.data?.detail || t("onb.errAddRoom"));
    }
    setSaving(false);
  };

  const addDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setError(t("onb.errDeviceFields"));
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setError(t("onb.errMac"));
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
      setError(err.response?.data?.detail || t("onb.errAddDevice"));
    }
    setSaving(false);
  };

  return (
    <AuthLayout>
      {/* Stepper */}
      <View style={styles.steps}>
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, i <= step ? styles.stepDotOn : styles.stepDotOff]}>
                {i < step ? (
                  <Icon name="check" size={16} color={colors.onSecondaryFixed} />
                ) : (
                  <Text style={[styles.stepDotText, { color: i <= step ? colors.onSecondaryFixed : "rgba(255,255,255,0.6)" }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, { color: i <= step ? "#ffffff" : "rgba(255,255,255,0.55)" }]}>{t(`onb.step.${label}`)}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: i < step ? colors.secondaryFixed : "rgba(255,255,255,0.2)" }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* STEP 0: Home */}
      {step === 0 && (
        <View>
          <StepTitle title={t("onb.home.title")} hint={t("onb.home.hint")} />
          <HeroField label={t("onb.homeName")} icon="home" placeholder={t("onb.homeNamePh")} value={homeName} onChangeText={setHomeName} />
          <HeroField label={t("onb.address")} icon="location_on" placeholder={t("onb.addressPh")} value={homeAddress} onChangeText={setHomeAddress} />
          <HeroError>{error}</HeroError>
          <HeroButton label={saving ? t("common.creating") : t("common.continue")} onPress={createHome} disabled={saving} />
        </View>
      )}

      {/* STEP 1: Rooms */}
      {step === 1 && (
        <View>
          <StepTitle title={t("onb.rooms.title")} hint={t("onb.rooms.hint")} />

          {rooms.length > 0 && (
            <View style={styles.chipRow}>
              {rooms.map((r) => <HeroChip key={r.id} icon="meeting_room">{r.name}</HeroChip>)}
            </View>
          )}

          <HeroField label={t("onb.roomName")} icon="meeting_room" placeholder={t("onb.roomNamePh")} value={newRoomName} onChangeText={setNewRoomName} onSubmitEditing={addRoom} />
          <HeroButton
            label={t("onb.addRoom")}
            icon="add"
            variant="ghost"
            onPress={addRoom}
            disabled={saving || !newRoomName.trim()}
            style={styles.addButton}
          />

          <HeroError>{error}</HeroError>
          <StepNav onBack={goBack} label={t("common.back")}>
            <HeroButton
              label={t("onb.continueRooms", { rooms: tn("count.room", rooms.length) })}
              onPress={() => setStep(2)}
              disabled={rooms.length === 0}
              style={styles.flex}
            />
          </StepNav>
        </View>
      )}

      {/* STEP 2: Appliances */}
      {step === 2 && (
        <View>
          <StepTitle title={t("onb.devices.title")} hint={t("onb.devices.hint")} />

          {devices.length > 0 && (
            <View style={styles.chipRow}>
              {devices.map((d) => (
                <HeroChip key={d.id} icon={d.type === "socket" ? "power" : "kitchen"}>{d.name}</HeroChip>
              ))}
            </View>
          )}

          <Text style={styles.label}>{t("onb.room")}</Text>
          <Text style={styles.helperText}>{t("onb.roomHelper")}</Text>
          <View style={styles.pickerRow}>
            {rooms.map((r) => (
              <Choice key={r.id} picked={newDevice.room_id === r.id} onPress={() => setNewDevice({ ...newDevice, room_id: r.id })}>
                {r.name}
              </Choice>
            ))}
          </View>

          <HeroField label={t("onb.deviceName")} icon="label" placeholder={t("onb.deviceNamePh")} value={newDevice.name} onChangeText={(v) => setNewDevice({ ...newDevice, name: v })} />

          <Text style={styles.label}>{t("onb.type")}</Text>
          <View style={styles.typeRow}>
            {["appliance", "socket"].map((type) => (
              <Choice
                key={type}
                icon={type === "socket" ? "power" : "kitchen"}
                picked={newDevice.type === type}
                onPress={() => setNewDevice({ ...newDevice, type })}
                style={styles.flex}
              >
                {type === "appliance" ? t("devices.appliance") : t("devices.socket")}
              </Choice>
            ))}
          </View>

          <HeroField
            label={t("onb.mac")}
            icon="router"
            placeholder="AA:BB:CC:DD:EE:FF"
            value={newDevice.mac}
            onChangeText={(v) => setNewDevice({ ...newDevice, mac: v.toUpperCase() })}
            autoCapitalize="characters"
            style={styles.mono}
          />

          <HeroError>{error}</HeroError>
          <HeroButton label={t("onb.pair")} icon="add_link" variant="ghost" onPress={addDevice} disabled={saving} style={styles.addButton} />

          <StepNav onBack={goBack} label={t("common.back")}>
            <HeroButton
              label={t("onb.finish", { devices: tn("count.device", devices.length) })}
              onPress={() => setStep(3)}
              disabled={devices.length === 0}
              style={styles.flex}
            />
          </StepNav>
        </View>
      )}

      {/* STEP 3: Done */}
      {step === 3 && (
        <View style={styles.done}>
          <View style={styles.doneOrb}>
            <Icon name="celebration" size={32} color={colors.onSecondaryFixed} />
          </View>
          <StepTitle
            center
            title={t("onb.done.title")}
            hint={t("onb.done.hint", {
              home: homeName,
              rooms: tn("count.room", rooms.length),
              devices: tn("count.device", devices.length),
            })}
          />
          <HeroButton label={t("onb.goDashboard")} onPress={onComplete} style={styles.fullWidth} />
        </View>
      )}
    </AuthLayout>
  );
}

function StepTitle({ title, hint, center }) {
  return (
    <View style={styles.stepTitle}>
      <Text style={[styles.title, center && styles.center]}>{title}</Text>
      <Text style={[styles.subtitle, center && styles.center]}>{hint}</Text>
    </View>
  );
}

function HeroChip({ icon, children }) {
  return (
    <View style={styles.chip}>
      <Icon name={icon} size={14} color="#ffffff" />
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
}

function Choice({ picked, onPress, icon, children, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.choice, picked && styles.choiceOn, style]}>
      {icon && <Icon name={icon} size={16} color={picked ? colors.secondary : "rgba(255,255,255,0.85)"} />}
      <Text style={[styles.choiceText, picked && styles.choiceTextOn]}>{children}</Text>
    </TouchableOpacity>
  );
}

function StepNav({ onBack, label, children }) {
  return (
    <View style={styles.navRow}>
      <HeroButton label={label} icon="arrow_back" variant="ghost" onPress={onBack} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  fullWidth: { alignSelf: "stretch" },

  steps: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.md },
  stepItem: { alignItems: "center", gap: 4, width: 64 },
  stepDot: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  stepDotOn: { backgroundColor: colors.secondaryFixedDim, borderColor: "rgba(255,255,255,0.6)" },
  stepDotOff: { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.25)" },
  stepDotText: { fontFamily: fonts.label, fontSize: 13 },
  stepLabel: { fontFamily: fonts.label, fontSize: 11 },
  stepLine: { flex: 1, height: 2, borderRadius: 1, marginTop: 14, marginHorizontal: -8 },

  stepTitle: { marginBottom: spacing.sm },
  title: { ...type.headlineMd, fontSize: 21, lineHeight: 28, color: "#ffffff" },
  subtitle: { ...type.bodyMd, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.78)", marginTop: 4 },

  label: {
    ...type.labelSm, color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6,
  },
  helperText: { ...type.labelSm, fontFamily: fonts.body, color: "rgba(255,255,255,0.65)", marginBottom: 8 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4,
  },
  chipText: { fontFamily: fonts.label, fontSize: 13, color: "#ffffff" },

  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  choice: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  choiceOn: { backgroundColor: "rgba(255,255,255,0.92)", borderColor: "#ffffff" },
  choiceText: { fontFamily: fonts.label, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  choiceTextOn: { color: colors.secondary },

  mono: { fontFamily: fonts.mono, letterSpacing: 1 },
  addButton: { marginBottom: spacing.sm },
  navRow: { flexDirection: "row", gap: 8, marginTop: 4 },

  done: { alignItems: "center" },
  doneOrb: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.secondaryFixedDim, marginBottom: spacing.sm,
  },
});
