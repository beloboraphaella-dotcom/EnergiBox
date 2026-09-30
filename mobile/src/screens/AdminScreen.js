import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { colors, spacing, type, glass } from "../theme";
import {
  Chip, EmptyCard, ErrorText, Field, GhostButton, GlassSheet, PrimaryButton, Segmented, StatTile,
} from "../components/GlassUI";
import { confirm } from "../components/confirm";
import { EMAIL_REGEX } from "../utils";

/** Platform administration, as on the web (pages/Admin.jsx). An admin
 * account owns no home, so without this screen the mobile app sent every
 * admin who signed in to the onboarding flow. */
export default function AdminScreen({ currentUserId }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("accounts");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState(null); // null | "create" | { resetPw: user }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fetchAll = useCallback(async () => {
    const [u, s] = await Promise.allSettled([api.get("/admin/users"), api.get("/admin/stats")]);
    if (u.status === "fulfilled") {
      setUsers(u.value.data);
      setError("");
    } else {
      setError(t("admin.errLoad"));
    }
    if (s.status === "fulfilled") setStats(s.value.data);
  }, [t]);

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const toggleSuspend = async (u) => {
    await api.put(`/admin/users/${u.id}/suspend?suspended=${!u.is_suspended}`);
    fetchAll();
  };

  const remove = async (u) => {
    const ok = await confirm(t("admin.confirmDelete", { name: u.name, email: u.email }), {
      confirmLabel: t("admin.deleteAccount"),
      cancelLabel: t("common.back"),
    });
    if (!ok) return;
    await api.delete(`/admin/users/${u.id}`);
    fetchAll();
  };

  const closeSheet = () => {
    setSheet(null);
    setFormError("");
  };

  const openCreate = () => {
    setAccount({ name: "", email: "", password: "" });
    setFormError("");
    setSheet("create");
  };

  const openReset = (u) => {
    setNewPassword("");
    setConfirmPassword("");
    setFormError("");
    setSheet({ resetPw: u });
  };

  const submitCreate = async () => {
    const { name, email, password } = account;
    if (!name.trim() || !email.trim() || !password) return setFormError(t("admin.errRequired"));
    if (!EMAIL_REGEX.test(email.trim())) return setFormError(t("auth.errEmail"));
    if (password.length < 6) return setFormError(t("auth.errPasswordLength"));
    setSaving(true);
    setFormError("");
    try {
      await api.post("/admin/users", { name: name.trim(), email: email.trim(), password });
      await fetchAll();
      closeSheet();
    } catch (err) {
      setFormError(err.response?.data?.detail || t("auth.errCreate"));
    }
    setSaving(false);
  };

  const submitReset = async () => {
    if (newPassword.length < 6) return setFormError(t("auth.errPasswordLength"));
    if (newPassword !== confirmPassword) return setFormError(t("auth.errPasswordMatch"));
    setSaving(true);
    setFormError("");
    try {
      await api.put(`/admin/users/${sheet.resetPw.id}/reset-password`, { new_password: newPassword });
      closeSheet();
    } catch (err) {
      setFormError(err.response?.data?.detail || t("admin.errReset"));
    }
    setSaving(false);
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <View>
        <Text style={styles.title}>{t("admin.title")}</Text>
        <Text style={styles.subtitle}>{t("admin.subtitle")}</Text>
      </View>

      <Segmented
        options={[
          { value: "accounts", label: t("admin.tab.accounts"), icon: "group" },
          { value: "overview", label: t("admin.tab.overview"), icon: "monitoring" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!!error && <EmptyCard icon="error">{error}</EmptyCard>}

      {tab === "accounts" && (
        <View style={[glass.card, styles.list]}>
          <View style={styles.listHead}>
            <Text style={styles.listTitle}>{t("admin.userAccounts").toUpperCase()}</Text>
            <PrimaryButton label={t("admin.createAccount")} icon="person_add" onPress={openCreate} style={styles.small} />
          </View>
          {users.length === 0 ? (
            <Text style={styles.empty}>{t("admin.noUsers")}</Text>
          ) : (
            users.map((u, i) => {
              const isMe = u.id === currentUserId;
              return (
                <View key={u.id} style={[styles.user, i > 0 && styles.divider]}>
                  <View style={styles.userHead}>
                    <View style={[glass.orb, styles.initial]}>
                      <Text style={styles.initialText}>{(u.name || "?").trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                        {isMe && <Chip tone="teal">{t("admin.you")}</Chip>}
                      </View>
                      <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Chip tone={u.role === "admin" ? "indigo" : null}>{t(`admin.role.${u.role}`)}</Chip>
                    <Chip tone={u.is_suspended ? "red" : "teal"}>
                      {u.is_suspended ? t("admin.suspended") : t("admin.active")}
                    </Chip>
                  </View>
                  <View style={styles.actions}>
                    <GhostButton compact icon="key" label={t("admin.resetPassword")} onPress={() => openReset(u)} />
                    <GhostButton
                      compact
                      icon={u.is_suspended ? "lock_open" : "block"}
                      label={u.is_suspended ? t("admin.reinstate") : t("admin.suspend")}
                      onPress={() => toggleSuspend(u)}
                      disabled={isMe}
                    />
                    <GhostButton compact danger icon="delete" onPress={() => remove(u)} disabled={isMe} />
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {tab === "overview" && stats && (
        <View style={styles.stats}>
          <StatTile icon="group" label={t("admin.stat.users")} value={stats.users.active} unit={`/ ${stats.users.total}`} />
          <StatTile icon="router" label={t("admin.stat.boxes")} value={stats.energiboxes.online} unit={`/ ${stats.energiboxes.total}`} />
          <StatTile
            icon="notifications"
            label={t("admin.stat.alerts")}
            value={stats.alerts.last_7_days}
            unit={t("admin.stat.total", { count: stats.alerts.total })}
          />
        </View>
      )}

      <GlassSheet visible={sheet === "create"} title={t("admin.createAccount")} onClose={closeSheet}>
        <Field label={t("auth.fullName")} value={account.name} onChangeText={(v) => setAccount({ ...account, name: v })} />
        <Field
          label={t("auth.email")}
          value={account.email}
          onChangeText={(v) => setAccount({ ...account, email: v })}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label={t("auth.password")}
          placeholder={t("admin.passwordPh")}
          value={account.password}
          onChangeText={(v) => setAccount({ ...account, password: v })}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>{t("admin.createHint")}</Text>
        <ErrorText>{formError}</ErrorText>
        <PrimaryButton
          label={saving ? t("common.creating") : t("admin.createAccount")}
          onPress={submitCreate}
          disabled={saving}
        />
      </GlassSheet>

      <GlassSheet visible={!!sheet?.resetPw} title={t("admin.resetPassword")} onClose={closeSheet}>
        {sheet?.resetPw && (
          <Text style={[glass.subtle, styles.intro]}>
            {t("admin.resetIntro", { name: sheet.resetPw.name, email: sheet.resetPw.email })}
          </Text>
        )}
        <Field
          label={t("admin.newPassword")}
          placeholder={t("admin.passwordPh")}
          value={newPassword}
          onChangeText={setNewPassword}
          autoCapitalize="none"
        />
        <Field
          label={t("admin.confirmNewPassword")}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
        />
        <ErrorText>{formError}</ErrorText>
        <PrimaryButton
          label={saving ? t("common.saving") : t("admin.resetPassword")}
          onPress={submitReset}
          disabled={saving}
        />
      </GlassSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant, marginTop: 4 },
  flex: { flex: 1 },

  list: { overflow: "hidden" },
  listHead: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
    gap: spacing.xs, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: glass.divider,
  },
  listTitle: { ...type.labelSm, color: colors.outline, letterSpacing: 1 },
  small: { paddingVertical: 8, paddingHorizontal: 14 },
  empty: { ...type.bodyMd, color: colors.onSurfaceVariant, padding: spacing.sm },

  user: { padding: spacing.sm, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: glass.divider },
  userHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  initial: { width: 40, height: 40, borderRadius: 20 },
  initialText: { ...type.labelSm, fontSize: 15, color: colors.secondary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, color: colors.onSurface, flexShrink: 1 },
  email: { ...type.bodyMd, fontSize: 14, color: colors.onSurfaceVariant },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },

  stats: { gap: spacing.sm },
  hint: { ...type.labelSm, fontFamily: type.bodyMd.fontFamily, fontSize: 13, color: colors.onSurfaceVariant },
  intro: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: colors.onSurfaceVariant, padding: 12, overflow: "hidden" },
});
