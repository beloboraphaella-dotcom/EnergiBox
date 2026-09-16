import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator,
} from "react-native";
import { api } from "../api";
import Icon from "../components/Icon";
import { colors, spacing, radius, type, glassCard } from "../theme";
import { useLanguage } from "../context/LanguageContext";

/** Settings, from the "Settings & Configuration" mockup.
 *
 * Three of its four panels describe controls the platform cannot honour,
 * so each shows what is actually true instead of a control that silently
 * does nothing — the same choice the web page makes:
 *
 *   - Box Setup asks for WiFi SSID, signal strength and firmware. No
 *     EnergiBox reports any of those; its MQTT payload carries watts and
 *     nothing else. The panel lists the paired boxes with the
 *     connectivity the backend really tracks.
 *   - Billing Rates offers an editable FCFA/kWh field. Cameroon's
 *     low-voltage tariff is progressive by monthly volume, which a single
 *     number cannot express. The published bands are shown read-only,
 *     with the one the app actually bills at called out.
 *   - Usage Alerts offers threshold sliders. alert_engine has no user
 *     thresholds; it compares against a computed baseline. The panel
 *     states the rules that really fire.
 *
 * Account Settings works and is wired.
 */
function Panel({ icon, title, children }) {
  return (
    <View style={[glassCard, styles.panel]}>
      <View style={styles.panelHead}>
        <Icon name={icon} size={22} color={colors.secondary} />
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function NotCollected({ children }) {
  return (
    <View style={styles.note}>
      <Icon name="info" size={20} color={colors.onSurfaceVariant} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export default function SettingsScreen({ user, homeId, onLogout, onUpdateUser }) {
  const { t, language, setLanguage } = useLanguage();
  const [devices, setDevices] = useState([]);
  const [tariffs, setTariffs] = useState(null);

  const [nameInput, setNameInput] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get("/tariffs"),
      homeId ? api.get(`/devices?home_id=${homeId}`) : Promise.reject(),
    ]);
    if (results[0].status === "fulfilled") setTariffs(results[0].value.data);
    if (results[1].status === "fulfilled") setDevices(results[1].value.data);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    if (!nameInput.trim()) return;
    setProfileSaving(true);
    setProfileMsg("");
    try {
      await api.put("/auth/profile", { name: nameInput.trim() });
      onUpdateUser?.({ name: nameInput.trim() });
      setProfileMsg("success");
    } catch (err) {
      setProfileMsg(err.response?.data?.detail || t("settings.saveError"));
    }
    setProfileSaving(false);
  };

  const savePassword = async () => {
    if (!currentPw || !newPw) return;
    setPwSaving(true);
    setPwMsg("");
    try {
      await api.put("/auth/password", { current_password: currentPw, new_password: newPw });
      setPwMsg("success");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      setPwMsg(err.response?.data?.detail || t("settings.pwError"));
    }
    setPwSaving(false);
  };

  const bands = tariffs?.bands?.residential ?? [];
  // How far the schedule is confirmed by real bills. Bands starting
  // beyond that are published figures and are labelled as such.
  const verified = tariffs?.verified;

  const RULES = [
    { icon: "warning", key: "spike" },
    { icon: "schedule", key: "runtime" },
    { icon: "energy_savings_leaf", key: "idle" },
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
      </View>

      {/* Box setup */}
      <Panel icon="router" title={t("settings.boxSetup")}>
        {devices.length === 0 ? (
          <Text style={styles.body}>{t("settings.noBoxes")}</Text>
        ) : (
          devices.map((d) => {
            const online = d.status === "online";
            return (
              <View key={d.id} style={styles.boxRow}>
                <View style={styles.boxRowTop}>
                  <Icon
                    name={online ? "wifi" : "wifi_off"}
                    size={22}
                    color={online ? colors.secondary : colors.outline}
                  />
                  <Text style={styles.boxName} numberOfLines={1}>{d.name}</Text>
                  <Text
                    style={[
                      styles.boxStatus,
                      { color: online ? colors.secondary : colors.outline },
                    ]}
                  >
                    {online ? t("settings.online") : t("settings.offline")}
                  </Text>
                </View>
                {/* MAC and last contact on their own line: side by side they
                    collide at phone widths. */}
                <View style={styles.boxRowBottom}>
                  <Text style={styles.boxMac}>{d.mac}</Text>
                  {d.last_seen ? (
                    <Text style={styles.boxSeen}>
                      {new Date(d.last_seen.replace(" ", "T")).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        <NotCollected>{t("settings.boxNotCollected")}</NotCollected>
      </Panel>

      {/* Billing */}
      <Panel icon="payments" title={t("settings.billing")}>
        <Text style={styles.body}>{t("settings.billingIntro")}</Text>

        <View style={styles.bandTable}>
          {bands.map((band, i) => {
            const isVerified = verified && band.from_kwh <= verified.up_to_kwh;
            return (
              <View
                key={i}
                style={[
                  styles.bandRow,
                  i > 0 && styles.bandRowDivider,
                  isVerified && styles.bandRowApplied,
                ]}
              >
                <Text style={styles.bandRange}>
                  {/* The last band is open-ended: the API sends to_kwh
                      as null, which must not be printed. */}
                  {band.to_kwh == null || band.to_kwh >= 2000
                    ? `${band.from_kwh}+ kWh`
                    : `${band.from_kwh} – ${band.to_kwh} kWh`}
                </Text>
                <View style={styles.bandRight}>
                  {isVerified ? (
                    <Text style={styles.bandApplied}>{t("settings.appliedBand")}</Text>
                  ) : null}
                  <Text style={styles.bandPrice}>{band.fcfa_per_kwh} FCFA</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* How the bands apply is the part that changes what a household
            should do, so it is stated rather than implied. */}
        <View style={styles.info}>
          <Icon name="info" size={20} color={colors.onSecondaryContainer} />
          <Text style={styles.infoText}>{t("settings.billingThreshold")}</Text>
        </View>

        {tariffs?.vat && tariffs.vat.charged === false ? (
          <Text style={styles.sourceText}>{t("settings.billingNoVat")}</Text>
        ) : null}

        {tariffs?.source ? (
          <Text style={styles.sourceText}>
            {t("settings.tariffSource", {
              regulator: tariffs.source.regulator,
              decision: tariffs.source.decision,
            })}
            {verified
              ? " " +
                t("settings.tariffVerified", {
                  bills: verified.bills,
                  period: verified.period,
                  upTo: verified.up_to_kwh,
                })
              : ""}
          </Text>
        ) : null}
      </Panel>

      {/* Alerts */}
      <Panel icon="tune" title={t("settings.alerts")}>
        {RULES.map((rule) => (
          <View key={rule.key} style={styles.ruleRow}>
            <View style={styles.ruleIcon}>
              <Icon name={rule.icon} size={20} color={colors.secondary} />
            </View>
            <View style={styles.ruleBody}>
              <Text style={styles.ruleTitle}>{t(`settings.rule.${rule.key}.title`)}</Text>
              <Text style={styles.ruleText}>{t(`settings.rule.${rule.key}.body`)}</Text>
            </View>
          </View>
        ))}
        <NotCollected>{t("settings.alertsNotConfigurable")}</NotCollected>
      </Panel>

      {/* Account */}
      <Panel icon="manage_accounts" title={t("settings.account")}>
        <Text style={styles.sectionLabel}>{t("settings.profile").toUpperCase()}</Text>
        <Text style={styles.fieldLabel}>{t("settings.fullName")}</Text>
        <TextInput
          style={styles.input}
          value={nameInput}
          onChangeText={setNameInput}
          placeholderTextColor={colors.outline}
        />
        <Text style={styles.fieldLabel}>{t("settings.email")}</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={user?.email || ""}
          editable={false}
        />
        <Text style={styles.hint}>{t("settings.emailFixed")}</Text>
        <TouchableOpacity
          onPress={saveProfile}
          disabled={profileSaving}
          activeOpacity={0.8}
          style={[styles.primaryButton, profileSaving && { opacity: 0.6 }]}
        >
          {profileSaving ? (
            <ActivityIndicator color={colors.onSecondary} />
          ) : (
            <Text style={styles.primaryLabel}>{t("settings.saveProfile")}</Text>
          )}
        </TouchableOpacity>
        {profileMsg ? (
          <Text
            style={[
              styles.msg,
              { color: profileMsg === "success" ? colors.secondary : colors.error },
            ]}
          >
            {profileMsg === "success" ? t("settings.saved") : profileMsg}
          </Text>
        ) : null}

        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
          {t("settings.security").toUpperCase()}
        </Text>
        <Text style={styles.fieldLabel}>{t("settings.currentPassword")}</Text>
        <TextInput
          style={styles.input}
          value={currentPw}
          onChangeText={setCurrentPw}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.outline}
        />
        <Text style={styles.fieldLabel}>{t("settings.newPassword")}</Text>
        <TextInput
          style={styles.input}
          value={newPw}
          onChangeText={setNewPw}
          secureTextEntry
          placeholder={t("settings.newPassword")}
          placeholderTextColor={colors.outline}
        />
        <TouchableOpacity
          onPress={savePassword}
          disabled={pwSaving}
          activeOpacity={0.8}
          style={[styles.outlineButton, pwSaving && { opacity: 0.6 }]}
        >
          <Text style={styles.outlineLabel}>
            {pwSaving ? t("settings.saving") : t("settings.updatePassword")}
          </Text>
        </TouchableOpacity>
        {pwMsg ? (
          <Text
            style={[
              styles.msg,
              { color: pwMsg === "success" ? colors.secondary : colors.error },
            ]}
          >
            {pwMsg === "success" ? t("settings.pwSaved") : pwMsg}
          </Text>
        ) : null}

        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
          {t("settings.language").toUpperCase()}
        </Text>
        <View style={styles.langRow}>
          {[
            { id: "en", label: "English" },
            { id: "fr", label: "Français" },
          ].map((opt) => {
            const selected = language === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setLanguage(opt.id)}
                activeOpacity={0.8}
                style={[styles.langChip, selected && styles.langChipOn]}
              >
                <Text style={[styles.langLabel, selected && styles.langLabelOn]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={onLogout} activeOpacity={0.7} style={styles.logoutRow}>
          <Icon name="logout" size={18} color={colors.error} />
          <Text style={styles.logoutLabel}>{t("shell.logout")}</Text>
        </TouchableOpacity>
      </Panel>

      <Text style={styles.version}>{t("settings.version", { version: "1.0" })}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.md },

  title: { ...type.headlineLg, color: colors.onSurface },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  body: { ...type.bodyMd, color: colors.onSurfaceVariant },

  panel: { padding: spacing.md, gap: spacing.sm },
  panelHead: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: "rgba(198, 198, 205, 0.2)",
    paddingBottom: spacing.sm, marginBottom: spacing.xs,
  },
  panelTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },

  note: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.2)",
    borderRadius: radius.lg, padding: 12,
  },
  noteText: { ...type.labelSm, color: colors.onSurfaceVariant, flex: 1, lineHeight: 18 },

  boxRow: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.2)",
    borderRadius: radius.lg, padding: 12,
  },
  boxRowTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  boxName: { ...type.bodyMd, color: colors.onSurface, flex: 1 },
  boxStatus: { ...type.labelSm },
  boxRowBottom: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between",
    gap: spacing.xs, marginTop: 4, paddingLeft: 30,
  },
  boxMac: { ...type.dataLabel, fontSize: 12, color: colors.onSurfaceVariant },
  boxSeen: { ...type.labelSm, fontSize: 12, color: colors.outline },

  bandTable: {
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.3)",
    borderRadius: radius.lg, overflow: "hidden",
  },
  bandRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surfaceContainerLow,
  },
  bandRowDivider: { borderTopWidth: 1, borderTopColor: "rgba(198, 198, 205, 0.2)" },
  bandRowApplied: { backgroundColor: colors.secondaryContainer },
  bandRange: { ...type.bodyMd, color: colors.onSurfaceVariant },
  bandRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  bandApplied: { ...type.labelSm, fontSize: 11, color: colors.onSecondaryContainer },
  bandPrice: { ...type.dataLabel, color: colors.onSurface },

  info: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.xs,
    backgroundColor: "rgba(134, 242, 228, 0.3)",
    borderWidth: 1, borderColor: "rgba(134, 242, 228, 0.55)",
    borderRadius: radius.lg, padding: 12,
  },
  infoText: { ...type.labelSm, color: colors.onSecondaryContainer, flex: 1, lineHeight: 18 },
  sourceText: { ...type.labelSm, color: colors.outline, lineHeight: 18 },

  langRow: { flexDirection: "row", gap: spacing.xs, marginTop: 6 },
  langChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  langChipOn: { backgroundColor: colors.secondaryContainer, borderColor: "transparent" },
  langLabel: { ...type.labelSm, color: colors.onSurface },
  langLabelOn: { color: colors.onSecondaryContainer },

  ruleRow: { flexDirection: "row", gap: spacing.xs + 4, alignItems: "flex-start" },
  ruleIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center", justifyContent: "center",
  },
  ruleBody: { flex: 1 },
  ruleTitle: { ...type.bodyMd, color: colors.onSurface },
  ruleText: { ...type.labelSm, color: colors.onSurfaceVariant, marginTop: 4, lineHeight: 18 },

  sectionLabel: { ...type.labelSm, color: colors.onSurface, letterSpacing: 1 },
  fieldLabel: { ...type.labelSm, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  input: {
    ...type.bodyMd, color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.5)",
    borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: 12,
  },
  inputDisabled: { opacity: 0.6 },
  hint: { ...type.labelSm, color: colors.outline },

  primaryButton: {
    backgroundColor: colors.secondary, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: "center", marginTop: spacing.xs,
  },
  primaryLabel: { ...type.labelSm, color: colors.onSecondary },
  outlineButton: {
    borderWidth: 1, borderColor: colors.secondary, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: "center", marginTop: spacing.xs,
  },
  outlineLabel: { ...type.labelSm, color: colors.secondary },
  msg: { ...type.labelSm, marginTop: 4 },

  logoutRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
    gap: spacing.xs, marginTop: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "rgba(198, 198, 205, 0.2)",
  },
  logoutLabel: { ...type.labelSm, color: colors.error },

  version: { ...type.labelSm, color: colors.onSurfaceVariant, textAlign: "center", marginTop: spacing.sm },
});
