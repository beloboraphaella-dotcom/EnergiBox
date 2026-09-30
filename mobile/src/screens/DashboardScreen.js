import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { api } from "../api";
import Icon from "../components/Icon";
import GradientFill from "../components/GradientFill";
import { colors, spacing, type, glassCard, surfaceCard, glass } from "../theme";
import { useLanguage } from "../context/LanguageContext";
import { Chip, ErrorText, Field, GhostButton, GlassSheet, PrimaryButton } from "../components/GlassUI";
import Skeleton, { SkeletonList } from "../components/Skeleton";
import Switch from "../components/Switch";
import { useToast } from "../components/Toast";
import { useLiveRefresh } from "../live/LiveContext";
import { useDeviceToggle } from "../live/useDeviceToggle";
import { failure, success } from "../haptics";
import { deviceIcon } from "../utils";

// This card used to read "18:00 - 21:00 / High tariff period", mirroring
// an advisor constant. Cameroon's low-voltage tariff has no time-of-day
// pricing (see backend/tariff.py), so there is no expensive window to
// warn about. The slot now shows when the household actually draws the
// most, which is real and worth knowing.

const GAUGE_SIZE = 192;
const GAUGE_RADIUS = 45;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function formatWatts(watts, locale) {
  if (watts >= 1000) {
    return { value: (watts / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit: "kW" };
  }
  return { value: Math.round(watts).toLocaleString(locale), unit: "W" };
}

/** Catmull-Rom through every point as cubic Béziers — the same curve the
 * web page draws, so both platforms render the day identically. */
function buildSpline(pts) {
  if (pts.length === 0) return null;
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function DashboardScreen({ homeId, onOpenDevices, onOpenDevice, onOnlineCount }) {
  const { t, tn, locale } = useLanguage();
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [hourly, setHourly] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [allOffOpen, setAllOffOpen] = useState(false);
  const [switchingAll, setSwitchingAll] = useState(false);
  const { width } = useWindowDimensions();

  const setDeviceState = useCallback((mac, isOn) => {
    setDevices((list) => list.map((d) => (d.mac === mac ? { ...d, is_on: isOn } : d)));
  }, []);
  const { toggle, apply, busy } = useDeviceToggle(setDeviceState);

  const fetchAll = useCallback(async () => {
    if (!homeId) return;
    // Each request settles on its own, so one failing endpoint degrades a
    // single card rather than blanking the screen.
    const results = await Promise.allSettled([
      api.get(`/stats/overview?home_id=${homeId}`),
      api.get(`/devices?home_id=${homeId}`),
      api.get(`/history/hourly?home_id=${homeId}`),
    ]);
    if (results[0].status === "fulfilled") setOverview(results[0].value.data);
    if (results[1].status === "fulfilled") setDevices(apply(results[1].value.data));
    if (results[2].status === "fulfilled") setHourly(results[2].value.data);
    // The top app bar owns the connectivity indicator, so hand it the count.
    if (results[0].status === "fulfilled") {
      onOnlineCount?.(results[0].value.data?.devices?.online ?? 0);
    }
  }, [homeId, onOnlineCount, apply]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useLiveRefresh(fetchAll, { topics: ["devices", "alerts"], interval: 3000 });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const switchAllOff = async () => {
    setSwitchingAll(true);
    try {
      const res = await api.post(`/homes/${homeId}/all-off`);
      const switched = res.data.switched || [];
      setDevices((list) => list.map((d) => (switched.includes(d.mac) ? { ...d, is_on: false } : d)));
      success();
      toast.show(tn("allOff.done", switched.length), { tone: "success" });
      if (res.data.failed?.length) toast.show(tn("allOff.partial", res.data.failed.length), { tone: "error" });
    } catch (err) {
      failure();
      toast.show(err.response?.data?.detail || t("allOff.error"), { tone: "error" });
    }
    setSwitchingAll(false);
    setAllOffOpen(false);
    fetchAll();
  };

  if (!overview && devices.length === 0) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <SkeletonList label={t("common.loading")}>
          <Skeleton height={36} style={{ width: "60%" }} radius={12} />
          <Skeleton height={150} />
          <Skeleton height={250} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </SkeletonList>
      </ScrollView>
    );
  }

  const liveWatts = devices.reduce((sum, d) => sum + (d.watts || 0), 0);
  const live = formatWatts(liveWatts, locale);
  const peakWatts = Math.max(hourly?.max_watts || 0, liveWatts, 1);
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - Math.min(liveWatts / peakWatts, 1));

  const todayKwh = overview?.today?.kwh ?? 0;
  const change = overview?.today?.change_vs_yesterday ?? 0;
  const estimatedFcfa = overview?.month?.estimated_fcfa ?? 0;
  const projectedFcfa = overview?.month?.projected_fcfa ?? 0;
  const budgetFcfa = overview?.month?.budget_fcfa ?? null;

  // The household's own busiest hour, from today's readings. Distinct
  // from `peakWatts` above, which is the gauge's ceiling.
  const peakHour = hourly?.peak_hour ?? null;
  const peakHourWatts = hourly?.max_watts ?? 0;
  const peakDraw = formatWatts(peakHourWatts, locale);

  // Two device cards per row inside the page gutters.
  const cardWidth = (width - spacing.marginMobile * 2 - spacing.sm) / 2;
  const onDevices = devices.filter((d) => d.is_on);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">{t("overview.title")}</Text>
          <Text style={styles.subtitle}>{t("overview.subtitle")}</Text>
        </View>
      </View>

      {/* Money first: the month so far, its projection, and the budget. */}
      <BudgetCard
        estimated={estimatedFcfa}
        projected={projectedFcfa}
        budget={budgetFcfa}
        onEdit={() => setBudgetOpen(true)}
      />

      {/* Live gauge */}
      <View style={[glassCard, styles.gaugeCard]}>
        <View style={styles.liveRow}>
          <View style={[styles.statusDot, { backgroundColor: colors.error }]} />
          <Text style={styles.liveLabel}>{t("overview.live").toUpperCase()}</Text>
        </View>

        <View
          style={styles.gaugeWrap}
          accessible
          accessibilityLabel={`${t("overview.live")} : ${live.value} ${live.unit}`}
        >
          <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox="0 0 100 100">
            <Circle
              cx="50" cy="50" r={GAUGE_RADIUS} fill="none"
              stroke="rgba(255, 255, 255, 0.8)" strokeWidth="8"
            />
            <Defs>
              <LinearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.secondaryFixedDim} />
                <Stop offset="1" stopColor={colors.secondary} />
              </LinearGradient>
            </Defs>
            <Circle
              cx="50" cy="50" r={GAUGE_RADIUS} fill="none"
              stroke="url(#gaugeGradient)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${GAUGE_CIRCUMFERENCE.toFixed(1)}`}
              strokeDashoffset={dashOffset.toFixed(1)}
              transform="rotate(-90 50 50)"
            />
          </Svg>
          <View style={styles.gaugeCenter} pointerEvents="none">
            <Text style={styles.gaugeValue}>{live.value}</Text>
            <Text style={styles.gaugeUnit}>{live.unit} {t("overview.current")}</Text>
          </View>
        </View>
      </View>

      {/* Today's usage */}
      <View style={[surfaceCard, styles.statCard]}>
        <View style={styles.statTop}>
          <Text style={styles.statLabel}>{t("overview.todayUsage").toUpperCase()}</Text>
          <Icon name="electric_meter" size={24} color={colors.secondary} />
        </View>
        <View>
          <Text style={styles.statValue}>
            {todayKwh.toLocaleString(locale, { maximumFractionDigits: 1 })}
            <Text style={styles.statUnit}> kWh</Text>
          </Text>
          <View style={styles.statFootRow}>
            <Icon
              name={change <= 0 ? "trending_down" : "trending_up"}
              size={16}
              color={change <= 0 ? colors.secondary : colors.error}
            />
            <Text style={styles.statFoot}>
              {change > 0 ? "+" : ""}
              {change.toLocaleString(locale)}% {t("overview.vsYesterday")}
            </Text>
          </View>
        </View>
      </View>

      {/* Peak window */}
      <View style={[surfaceCard, styles.statCard]}>
        <View style={styles.statTop}>
          <Text style={styles.statLabel}>{t("overview.peakTime").toUpperCase()}</Text>
          <Icon name="schedule" size={24} color={colors.onTertiaryContainer} />
        </View>
        <View>
          <Text style={styles.peakValue}>
            {peakHour === null
              ? t("overview.peakNone")
              : `${String(peakHour).padStart(2, "0")}:00`}
          </Text>
          <View style={styles.statFootRow}>
            <Icon name="bolt" size={16} color={colors.onTertiaryContainer} />
            <Text style={styles.statFoot}>
              {peakHour === null
                ? t("overview.peakNoneHint")
                : t("overview.peakDraw", { watts: peakDraw.value, unit: peakDraw.unit })}
            </Text>
          </View>
        </View>
      </View>

      {/* Power curve */}
      <PowerChart hourly={hourly} width={width - spacing.marginMobile * 2 - spacing.md * 2} />

      {/* Active devices */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("overview.activeDevices")}</Text>
        <TouchableOpacity onPress={onOpenDevices} activeOpacity={0.7} hitSlop={12} accessibilityRole="button">
          <Text style={styles.viewAll}>{t("overview.viewAll")}</Text>
        </TouchableOpacity>
      </View>
      {onDevices.length > 0 && (
        <GhostButton
          icon="power_settings_new"
          label={t("allOff.button")}
          onPress={() => setAllOffOpen(true)}
          style={styles.allOff}
        />
      )}

      {devices.length === 0 ? (
        <View style={[surfaceCard, styles.emptyCard]}>
          <Text style={styles.emptyText}>{t("overview.noDevices")}</Text>
        </View>
      ) : (
        <View style={styles.deviceGrid}>
          {devices.slice(0, 8).map((device) => {
            const draw = formatWatts(device.watts || 0, locale);
            return (
              <TouchableOpacity
                key={device.id}
                onPress={() => onOpenDevice?.(device.mac)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t("overview.openDevice", { name: device.name })}
                style={[
                  surfaceCard,
                  styles.deviceCard,
                  { width: cardWidth },
                  !device.is_on && styles.deviceCardOff,
                ]}
              >
                <View style={styles.deviceTop}>
                  <View style={[glass.orb, styles.deviceOrb]}>
                    <Icon
                      name={deviceIcon(device.name, device.type)}
                      size={20}
                      color={device.is_on ? colors.secondary : colors.outline}
                    />
                  </View>
                  <View style={styles.switchSlot}>
                    <Switch
                      value={device.is_on}
                      disabled={busy[device.mac]}
                      onValueChange={() => toggle(device)}
                      label={t(device.is_on ? "devices.turnOffNamed" : "devices.turnOnNamed", { name: device.name })}
                    />
                  </View>
                </View>
                <View>
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {device.name}
                  </Text>
                  <Text
                    style={[
                      styles.deviceDraw,
                      { color: device.is_on ? colors.secondary : colors.outline },
                    ]}
                  >
                    {device.is_on ? `${draw.value} ${draw.unit}` : t("overview.off")}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <BudgetSheet
        visible={budgetOpen}
        homeId={homeId}
        current={budgetFcfa}
        projected={projectedFcfa}
        onClose={() => setBudgetOpen(false)}
        onSaved={() => {
          setBudgetOpen(false);
          fetchAll();
        }}
      />

      <GlassSheet visible={allOffOpen} title={t("allOff.title")} onClose={() => setAllOffOpen(false)}>
        <Text style={styles.sheetText}>{tn("allOff.confirm", onDevices.length)}</Text>
        <View style={styles.chipRow}>
          {onDevices.map((d) => (
            <Chip key={d.mac} tone="teal">{d.name}</Chip>
          ))}
        </View>
        <Text style={styles.sheetHint}>{t("allOff.hint")}</Text>
        <PrimaryButton
          icon="power_settings_new"
          label={switchingAll ? t("allOff.working") : t("allOff.button")}
          onPress={switchAllOff}
          disabled={switchingAll}
        />
        <GhostButton label={t("common.cancel")} onPress={() => setAllOffOpen(false)} />
      </GlassSheet>
    </ScrollView>
  );
}

/** The month in money: spent so far, the projection at the current pace,
 * and — once the household has set one — a bar against their budget.
 * Same card as the web dashboard's. */
function BudgetCard({ estimated, projected, budget, onEdit }) {
  const { t, locale } = useLanguage();
  const money = (v) => Math.round(v).toLocaleString(locale);
  const ratio = budget ? Math.min(estimated / budget, 1) : 0;
  const projectedRatio = budget ? Math.min(projected / budget, 1) : 0;
  const over = budget ? projected - budget : 0;
  const tone = !budget ? null : over > 0 ? "over" : projected > budget * 0.9 ? "near" : "ok";
  const barColor = tone === "over" ? "#ff8a80" : tone === "near" ? "#ffcc80" : colors.secondaryFixed;
  const noteColor = tone === "over" ? "#ffb4ab" : tone === "near" ? "#ffddb0" : colors.primaryFixedDim;

  return (
    <View style={styles.costCard}>
      <GradientFill kind="dark" />
      <View style={styles.budgetHead}>
        <Icon name="payments" size={22} color={colors.secondaryFixed} />
        <Text style={[styles.statLabel, { color: colors.primaryFixedDim }]}>{t("budget.thisMonth").toUpperCase()}</Text>
      </View>
      <Text style={styles.budgetValue}>
        {money(estimated)}
        <Text style={[styles.statUnit, { color: colors.primaryFixedDim }]}> FCFA</Text>
      </Text>
      <Text style={[styles.statFoot, { color: colors.primaryFixedDim }]}>
        {t("budget.projection", { amount: money(projected) })}
      </Text>

      {budget ? (
        <View style={styles.budgetBlock}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetOf}>{t("budget.of", { amount: money(budget) })}</Text>
            <TouchableOpacity onPress={onEdit} hitSlop={12} accessibilityRole="button">
              <Text style={styles.budgetEdit}>{t("budget.edit")}</Text>
            </TouchableOpacity>
          </View>
          <View
            style={styles.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("budget.of", { amount: money(budget) })}
            accessibilityValue={{ min: 0, max: budget, now: Math.round(estimated) }}
          >
            <View style={[styles.trackFill, { width: `${projectedRatio * 100}%`, backgroundColor: "rgba(255,255,255,0.25)" }]} />
            <View style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[styles.statFoot, { color: noteColor }]}>
            {tone === "over"
              ? t("budget.over", { amount: money(over) })
              : t("budget.left", { amount: money(Math.max(budget - estimated, 0)) })}
          </Text>
        </View>
      ) : (
        <View style={styles.budgetBlock}>
          <Text style={[styles.statFoot, { color: colors.primaryFixedDim }]}>{t("budget.none")}</Text>
          <GhostButton icon="savings" label={t("budget.set")} onPress={onEdit} style={styles.budgetSet} />
        </View>
      )}
    </View>
  );
}

function BudgetSheet({ visible, homeId, current, projected, onClose, onSaved }) {
  const { t, locale } = useLanguage();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(current ? String(current) : "");
      setError("");
    }
  }, [visible, current]);

  // Round figures a household is likely to pick, around the projection.
  const base = Math.max(5000, Math.ceil((projected || 10000) / 5000) * 5000);
  const suggestions = [base, base + 5000, base + 10000];

  const save = async (amount) => {
    if (amount !== 0 && (!Number.isFinite(amount) || amount < 0)) {
      setError(t("budget.errAmount"));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/homes/${homeId}/budget?amount=${amount}`);
      success();
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || t("budget.errSave"));
    }
    setSaving(false);
  };

  return (
    <GlassSheet visible={visible} title={t("budget.title")} onClose={onClose}>
      <Text style={styles.sheetText}>{t("budget.intro")}</Text>
      <View style={styles.chipRow}>
        {suggestions.map((amount) => {
          const picked = value === String(amount);
          return (
            <TouchableOpacity
              key={amount}
              onPress={() => setValue(String(amount))}
              accessibilityRole="button"
              accessibilityState={{ selected: picked }}
              style={[styles.pill, picked ? glass.pillActive : glass.pillIdle]}
            >
              <Text style={[styles.pillText, { color: picked ? colors.secondary : colors.onSurfaceVariant }]}>
                {amount.toLocaleString(locale)} FCFA
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Field
        label={t("budget.amount")}
        value={value}
        onChangeText={(v) => setValue(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder="15000"
      />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton
        label={saving ? t("common.saving") : t("common.save")}
        onPress={() => save(Math.round(Number(value)))}
        disabled={saving || !value}
      />
      {!!current && <GhostButton label={t("budget.remove")} onPress={() => save(0)} disabled={saving} />}
    </GlassSheet>
  );
}

function PowerChart({ hourly, width }) {
  const { t } = useLanguage();
  const HEIGHT = 200;
  const W = Math.max(width, 1);

  const points = hourly?.points ?? [];
  const measured = points.filter((p) => p.watts !== null && p.watts !== undefined);
  const maxWatts = Math.max(hourly?.max_watts || 0, 1);

  const coords = measured.map((p) => ({
    x: (p.hour / 23) * W,
    y: HEIGHT - (p.watts / maxWatts) * (HEIGHT - 20) - 10,
  }));

  const linePath = buildSpline(coords);
  const areaPath =
    linePath && coords.length
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT} L${coords[0].x.toFixed(1)},${HEIGHT} Z`
      : null;

  return (
    <View style={[surfaceCard, styles.chartCard]}>
      <Text style={styles.sectionTitle}>{t("overview.powerUsage")}</Text>

      <View style={{ height: HEIGHT, marginTop: spacing.md }}>
        {/* The web draws five faint horizontal rules behind the curve. */}
        <View style={styles.gridLines} pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.gridLine} />
          ))}
        </View>
        {linePath ? (
          <Svg width={W} height={HEIGHT}>
            <Defs>
              <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.secondary} stopOpacity="0.2" />
                <Stop offset="100%" stopColor={colors.secondary} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#chartGradient)" />
            <Path
              d={linePath}
              fill="none"
              stroke={colors.secondary}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.emptyText}>{t("overview.noData")}</Text>
          </View>
        )}
      </View>

      <View style={styles.axisRow}>
        {["00:00", "06:00", "12:00", "18:00", "23:59"].map((label) => (
          <Text key={label} style={styles.axisLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent: the ambient backdrop behind AppShell shows through.
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  headerText: { flex: 1, paddingRight: spacing.xs },
  title: { ...type.headlineLg, color: colors.onBackground },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant, marginTop: 4 },

  statusDot: { width: 8, height: 8, borderRadius: 4 },

  gaugeCard: { padding: spacing.md, alignItems: "center", justifyContent: "center" },
  liveRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
  },
  liveLabel: { ...type.labelSm, color: colors.outline, letterSpacing: 1 },
  gaugeWrap: {
    width: GAUGE_SIZE, height: GAUGE_SIZE, marginTop: spacing.sm,
    alignItems: "center", justifyContent: "center",
  },
  gaugeCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  gaugeValue: { ...type.displayMetrics, color: colors.onSurface },
  gaugeUnit: { ...type.dataLabel, color: colors.secondary, marginTop: 4 },

  statCard: { padding: spacing.md, gap: spacing.md },
  statTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  statLabel: { ...type.dataLabel, color: colors.outline },
  statValue: { ...type.headlineLg, color: colors.onBackground },
  statUnit: { ...type.bodyMd, color: colors.outline },
  statFootRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs },
  statFoot: { ...type.bodyMd, fontSize: 14, color: colors.outline },
  peakValue: { ...type.headlineMd, color: colors.onBackground },

  costCard: {
    ...glass.dark,
    padding: spacing.md,
    gap: 6,
    overflow: "hidden",
  },
  budgetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  budgetValue: { ...type.displayMetrics, fontSize: 40, lineHeight: 48, color: colors.inverseOnSurface },
  budgetBlock: { marginTop: spacing.sm, gap: 8 },
  budgetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  budgetOf: { ...type.labelSm, color: colors.inverseOnSurface },
  budgetEdit: { ...type.labelSm, color: colors.secondaryFixed },
  budgetSet: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.92)" },
  track: { height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  trackFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6 },
  allOff: { alignSelf: "flex-start" },
  sheetText: { ...type.bodyMd, color: colors.onSurfaceVariant },
  sheetHint: { ...type.bodyMd, fontSize: 14, lineHeight: 20, color: colors.outline },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  pillText: { ...type.dataLabel, fontSize: 14 },

  chartCard: { padding: spacing.md, marginTop: spacing.sm },
  gridLines: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  gridLine: { height: 1, backgroundColor: colors.outline, opacity: 0.2 },
  chartEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  axisLabel: { ...type.dataLabel, fontSize: 11, color: colors.outline },

  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: spacing.sm,
  },
  sectionTitle: { ...type.headlineMd, color: colors.onSurface },
  viewAll: { ...type.labelSm, color: colors.secondary },

  emptyCard: { padding: spacing.md, alignItems: "center" },
  emptyText: { ...type.bodyMd, color: colors.onSurfaceVariant },

  deviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  deviceCard: { height: 128, padding: spacing.sm, justifyContent: "space-between" },
  deviceCardOff: { opacity: 0.7 },
  deviceOrb: { width: 36, height: 36, borderRadius: 18 },
  deviceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  switchSlot: { marginTop: -8, marginRight: -8 },
  deviceName: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, fontSize: 16, color: colors.onSurface },
  deviceDraw: { ...type.dataLabel, fontSize: 12, marginTop: 4 },
});
