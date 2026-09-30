import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import Icon from "../components/Icon";
import { colors, spacing, type, glass } from "../theme";
import {
  Chip, EmptyCard, ErrorText, GhostButton, GlassSheet, IconButton,
  Orb, PrimaryButton, SectionTitle,
} from "../components/GlassUI";
import Skeleton, { SkeletonList } from "../components/Skeleton";
import TimeField from "../components/TimeField";
import { confirm } from "../components/confirm";
import { useLiveRefresh } from "../live/LiveContext";
import { SCHEDULE_PRESETS } from "../schedulePresets";

/** Alerts, advisor suggestions and schedules on one screen, as on the web
 * (frontend/dashboard/src/pages/Dashboard.jsx, "alerts" tab). */

// One tone per alert type, matching the web's alert list.
const TONES = {
  spike: { icon: "warning", tone: "red", color: colors.error, orb: "rgba(255, 218, 214, 0.75)" },
  extended_runtime: { icon: "timer", tone: "amber", color: colors.onTertiaryFixedVariant, orb: "rgba(255, 221, 184, 0.75)" },
  idle_waste: { icon: "nights_stay", tone: "indigo", color: colors.onPrimaryFixedVariant, orb: null },
  anomaly_high: { icon: "query_stats", tone: "amber", color: colors.onTertiaryFixedVariant, orb: "rgba(255, 221, 184, 0.75)" },
  anomaly_low: { icon: "trending_down", tone: "indigo", color: colors.onPrimaryFixedVariant, orb: null },
};

const STATUS_TONE = { accepted: "teal", ignored: null, pending: "amber" };

// What the web's <input type="time"> produces, and what the API stores.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const EMPTY_FORM = { monitored_point_id: "", on_time: "22:00", off_time: "05:00" };

export default function AlertsScreen({ homeId }) {
  const { t, locale } = useLanguage();
  const [alerts, setAlerts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState(null); // null | "create" | { edit: schedule }
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const fetchAll = useCallback(async () => {
    if (!homeId) return;
    const [a, s, sc] = await Promise.allSettled([
      api.get(`/alerts?home_id=${homeId}`),
      api.get(`/suggestions?home_id=${homeId}`),
      api.get(`/schedules?home_id=${homeId}`),
    ]);
    // Each list degrades on its own, as the web's cards do.
    if (a.status === "fulfilled") setAlerts(a.value.data);
    if (s.status === "fulfilled") setSuggestions(s.value.data);
    if (sc.status === "fulfilled") setSchedules(sc.value.data);
    setLoaded(true);
  }, [homeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // New alerts and suggestions appear while the screen is open.
  useLiveRefresh(fetchAll, { topics: ["alerts", "suggestions"], interval: 15000 });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const accept = async (id) => {
    await api.put(`/suggestions/${id}/accept`);
    fetchAll();
  };

  const ignore = async (id) => {
    await api.put(`/suggestions/${id}/ignore`);
    fetchAll();
  };

  const deleteSchedule = async (sc) => {
    const ok = await confirm(t("sched.confirmDelete", { name: sc.appliance }), {
      confirmLabel: t("sched.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await api.delete(`/schedules/${sc.id}`);
    fetchAll();
  };

  /** `pointId` preselects the device, when the schedule is offered from a
   * suggestion about it. */
  const openCreate = async (pointId = "") => {
    setFormError("");
    setForm({ ...EMPTY_FORM, monitored_point_id: pointId });
    try {
      const res = await api.get(`/devices?home_id=${homeId}`);
      setDevices(res.data);
    } catch (err) {
      setDevices([]);
    }
    setSheet("create");
  };

  const openEdit = (sc) => {
    setFormError("");
    setForm({
      monitored_point_id: sc.monitored_point_id,
      on_time: sc.on_time.slice(0, 5),
      off_time: sc.off_time.slice(0, 5),
    });
    setSheet({ edit: sc });
  };

  const submit = async () => {
    const { monitored_point_id, on_time, off_time } = form;
    if (sheet === "create" && !monitored_point_id) {
      setFormError(t("sched.errDevice"));
      return;
    }
    if (!TIME_RE.test(on_time) || !TIME_RE.test(off_time)) {
      setFormError(t("sched.errTime"));
      return;
    }
    try {
      if (sheet === "create") {
        await api.post(
          `/schedules?monitored_point_id=${monitored_point_id}&on_time=${on_time}&off_time=${off_time}&source=manual`
        );
      } else {
        await api.put(`/schedules/${sheet.edit.id}?on_time=${on_time}&off_time=${off_time}`);
      }
      setSheet(null);
      fetchAll();
    } catch (err) {
      setFormError(t("sched.errSave"));
    }
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <Text style={styles.title}>{t("alerts.title")}</Text>

      {/* ── Alerts ── */}
      <SectionTitle icon="notifications">{t("alerts.active")}</SectionTitle>
      {!loaded ? (
        <SkeletonList label={t("common.loading")}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </SkeletonList>
      ) : alerts.length === 0 ? (
        <EmptyCard icon="check_circle">{t("alerts.none")}</EmptyCard>
      ) : (
        alerts.map((a, i) => {
          const tone = TONES[a.type] || TONES.idle_waste;
          return (
            <View key={i} style={[glass.card, styles.row]}>
              <Orb icon={tone.icon} color={tone.color} background={tone.orb} size={40} />
              <View style={styles.body}>
                {/* Wraps rather than squeezes: French alert labels run long
                    enough to push the appliance name down to an ellipsis. */}
                <View style={styles.cardTop}>
                  <Text style={styles.appliance} numberOfLines={1}>{a.appliance}</Text>
                  <Chip tone={tone.tone}>{t(`detail.alert.${a.type}`)}</Chip>
                </View>
                <Text style={styles.message}>{a.message}</Text>
                <Text style={styles.time}>{a.created_at}</Text>
              </View>
            </View>
          );
        })
      )}

      {/* ── Suggestions ── */}
      <SectionTitle icon="lightbulb">{t("sugg.title")}</SectionTitle>
      {suggestions.length === 0 ? (
        <EmptyCard icon="lightbulb">{t("sugg.none")}</EmptyCard>
      ) : (
        suggestions.map((s, i) => (
          <View key={i} style={[glass.card, styles.card, s.status === "ignored" && styles.muted]}>
            <View style={styles.cardTop}>
              <Text style={styles.appliance} numberOfLines={1}>{s.appliance}</Text>
              {s.ai_written && <Chip tone="indigo" icon="auto_awesome">{t("sugg.aiWritten")}</Chip>}
              <Chip tone={STATUS_TONE[s.status]}>{t(`sugg.status.${s.status}`)}</Chip>
            </View>
            <Text style={styles.message}>{s.suggestion}</Text>
            <Chip tone="teal" icon="savings" style={styles.start}>
              {t("sugg.save", { amount: Number(s.estimated_saving_fcfa).toLocaleString(locale) })}
            </Chip>
            {s.status !== "ignored" && !!s.monitored_point_id && (
              <GhostButton
                icon="schedule"
                label={t("sugg.schedule")}
                onPress={() => openCreate(s.monitored_point_id)}
                style={styles.start}
              />
            )}
            {s.status === "pending" && (
              <View style={styles.buttons}>
                <GhostButton label={t("sugg.ignore")} onPress={() => ignore(s.id)} style={styles.flex} />
                <PrimaryButton label={t("sugg.accept")} icon="check" onPress={() => accept(s.id)} style={styles.flex} />
              </View>
            )}
          </View>
        ))
      )}

      {/* ── Schedules ── */}
      <View style={styles.sectionHeader}>
        <SectionTitle icon="schedule">{t("sched.title")}</SectionTitle>
        <PrimaryButton label={t("sched.create")} icon="add" onPress={() => openCreate()} style={styles.smallButton} />
      </View>
      {schedules.length === 0 ? (
        <EmptyCard icon="schedule">{t("sched.none")}</EmptyCard>
      ) : (
        schedules.map((sc) => (
          <View key={sc.id} style={[glass.card, styles.row, !sc.active && styles.muted]}>
            <Orb icon="schedule" size={40} />
            <View style={styles.body}>
              <Text style={styles.appliance} numberOfLines={1}>{sc.appliance}</Text>
              <View style={styles.chips}>
                <Chip tone="teal" icon="power_settings_new">{sc.on_time?.slice(0, 5)}</Chip>
                <Icon name="arrow_forward" size={16} color={colors.outline} />
                <Chip icon="power_off">{sc.off_time?.slice(0, 5)}</Chip>
                <Chip tone={sc.source === "ai" ? "indigo" : null}>{t(`sched.source.${sc.source}`)}</Chip>
              </View>
            </View>
            <IconButton icon="edit" onPress={() => openEdit(sc)} label={t("sched.edit")} />
            <IconButton icon="delete" onPress={() => deleteSchedule(sc)} label={t("sched.delete")} />
          </View>
        ))
      )}

      <GlassSheet
        visible={!!sheet}
        title={sheet === "create" ? t("sched.create") : t("sched.edit")}
        onClose={() => setSheet(null)}
      >
        {sheet === "create" && (
          <View style={styles.pickerBlock}>
            <Text style={styles.fieldLabel}>{t("sched.device")}</Text>
            <View style={styles.picker}>
              {devices.map((d) => {
                const picked = String(form.monitored_point_id) === String(d.id);
                return (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => setForm({ ...form, monitored_point_id: d.id })}
                    style={[styles.pill, picked ? glass.pillActive : glass.pillIdle]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pillText, picked && { color: colors.secondary }]}>
                      {d.name} — {d.room}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        <View style={styles.pickerBlock}>
          <Text style={styles.fieldLabel}>{t("sched.presets")}</Text>
          <View style={styles.picker}>
            {SCHEDULE_PRESETS.map((preset) => {
              const picked = form.on_time === preset.on && form.off_time === preset.off;
              return (
                <TouchableOpacity
                  key={preset.key}
                  onPress={() => setForm({ ...form, on_time: preset.on, off_time: preset.off })}
                  style={[styles.pill, picked ? glass.pillActive : glass.pillIdle]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, picked && { color: colors.secondary }]}>
                    {t(`sched.preset.${preset.key}`)}{"  "}
                    <Text style={styles.presetTimes}>{preset.on}–{preset.off}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.timeRow}>
          <TimeField
            label={t("sched.onAt")}
            value={form.on_time}
            onChange={(v) => setForm({ ...form, on_time: v })}
          />
          <TimeField
            label={t("sched.offAt")}
            value={form.off_time}
            onChange={(v) => setForm({ ...form, off_time: v })}
          />
        </View>
        <ErrorText>{formError}</ErrorText>
        <PrimaryButton
          label={sheet === "create" ? t("common.create") : t("common.saveChanges")}
          onPress={submit}
        />
      </GlassSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  presetTimes: { ...type.dataLabel, fontSize: 12, color: colors.outline },
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface, marginBottom: spacing.xs },
  flex: { flex: 1 },
  start: { alignSelf: "flex-start" },
  muted: { opacity: 0.7 },

  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.sm },
  card: { padding: spacing.sm, gap: spacing.xs },
  body: { flex: 1, gap: 4 },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  appliance: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, color: colors.onSurface, maxWidth: "100%" },
  message: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: colors.onSurfaceVariant },
  time: { ...type.dataLabel, fontSize: 11, color: colors.outline, marginTop: 2 },
  buttons: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },

  sectionHeader: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    justifyContent: "space-between", gap: spacing.xs, marginTop: spacing.sm,
  },
  smallButton: { paddingVertical: 8, paddingHorizontal: 14 },

  pickerBlock: { gap: 6 },
  fieldLabel: { ...type.labelSm, color: colors.onSurfaceVariant },
  picker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 11 },
  pillText: { ...type.labelSm, fontSize: 13, color: colors.onSurface },
  timeRow: { flexDirection: "row", gap: spacing.sm },
  mono: { fontFamily: type.dataLabel.fontFamily, letterSpacing: 1 },
});
