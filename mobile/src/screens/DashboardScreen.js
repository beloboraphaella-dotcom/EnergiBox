import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { api } from "../api";
import Icon from "../components/Icon";
import { colors, spacing, radius, type, glassCard, surfaceCard } from "../theme";

// This card used to read "18:00 - 21:00 / High tariff period", mirroring
// an advisor constant. Cameroon's low-voltage tariff has no time-of-day
// pricing (see backend/tariff.py), so there is no expensive window to
// warn about. The slot now shows when the household actually draws the
// most, which is real and worth knowing.

const GAUGE_SIZE = 192;
const GAUGE_RADIUS = 45;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function deviceIcon(name = "") {
  const n = name.toLowerCase();
  if (/frig|fridge|réfrig|refrig|freezer|congel/.test(n)) return "kitchen";
  if (/clim|ac\b|air|cond/.test(n)) return "ac_unit";
  if (/heater|chauffe|boiler|ballon/.test(n)) return "water_heater";
  if (/light|lamp|lumi|ampoule/.test(n)) return "lightbulb";
  if (/tv|télé|tele|screen/.test(n)) return "tv";
  if (/fan|ventil/.test(n)) return "mode_fan";
  if (/pump|pompe/.test(n)) return "water_pump";
  return "power";
}

function formatWatts(watts) {
  if (watts >= 1000) return { value: (watts / 1000).toFixed(1), unit: "kW" };
  return { value: String(Math.round(watts)), unit: "W" };
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

export default function DashboardScreen({ homeId, onOpenDevices, onOnlineCount }) {
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [hourly, setHourly] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

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
    if (results[1].status === "fulfilled") setDevices(results[1].value.data);
    if (results[2].status === "fulfilled") setHourly(results[2].value.data);
    // The top app bar owns the connectivity indicator, so hand it the count.
    if (results[0].status === "fulfilled") {
      onOnlineCount?.(results[0].value.data?.devices?.online ?? 0);
    }
  }, [homeId, onOnlineCount]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const liveWatts = devices.reduce((sum, d) => sum + (d.watts || 0), 0);
  const live = formatWatts(liveWatts);
  const peakWatts = Math.max(hourly?.max_watts || 0, liveWatts, 1);
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - Math.min(liveWatts / peakWatts, 1));

  const todayKwh = overview?.today?.kwh ?? 0;
  const change = overview?.today?.change_vs_yesterday ?? 0;
  const estimatedFcfa = overview?.month?.estimated_fcfa ?? 0;
  const projectedFcfa = overview?.month?.projected_fcfa ?? 0;

  // The web lays the device grid out with CSS grid; here the card width is
  // computed so two fit per row inside the page gutters.
  // The household's own busiest hour, from today's readings. Distinct
  // from `peakWatts` above, which is the gauge's ceiling.
  const peakHour = hourly?.peak_hour ?? null;
  const peakHourWatts = hourly?.max_watts ?? 0;

  const cardWidth = (width - spacing.marginMobile * 2 - spacing.sm) / 2;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      {/* The mockup's connection badge is `hidden md:flex` — it does not
          appear on phones, where the top app bar carries a wifi button
          instead. */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Overview</Text>
          <Text style={styles.subtitle}>Real-time household energy metrics</Text>
        </View>
      </View>

      {/* Live gauge */}
      <View style={[glassCard, styles.gaugeCard]}>
        <View style={styles.liveRow}>
          <View style={[styles.statusDot, { backgroundColor: colors.error }]} />
          <Text style={styles.liveLabel}>LIVE</Text>
        </View>

        <View style={styles.gaugeWrap}>
          <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox="0 0 100 100">
            <Circle
              cx="50" cy="50" r={GAUGE_RADIUS} fill="none"
              stroke={colors.surfaceContainerLow} strokeWidth="8"
            />
            <Circle
              cx="50" cy="50" r={GAUGE_RADIUS} fill="none"
              stroke={colors.secondary} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${GAUGE_CIRCUMFERENCE.toFixed(1)}`}
              strokeDashoffset={dashOffset.toFixed(1)}
              transform="rotate(-90 50 50)"
            />
          </Svg>
          <View style={styles.gaugeCenter} pointerEvents="none">
            <Text style={styles.gaugeValue}>{live.value}</Text>
            <Text style={styles.gaugeUnit}>{live.unit} Current</Text>
          </View>
        </View>
      </View>

      {/* Today's usage */}
      <View style={[surfaceCard, styles.statCard]}>
        <View style={styles.statTop}>
          <Text style={styles.statLabel}>TODAY'S USAGE</Text>
          <Icon name="electric_meter" size={24} color={colors.secondary} />
        </View>
        <View>
          <Text style={styles.statValue}>
            {todayKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })}
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
              {change}% vs yesterday
            </Text>
          </View>
        </View>
      </View>

      {/* Estimated cost */}
      <View style={styles.costCard}>
        <View style={styles.statTop}>
          <Text style={[styles.statLabel, { color: colors.primaryFixedDim }]}>EST. COST</Text>
          <Icon name="payments" size={24} color={colors.secondaryFixed} />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.inverseOnSurface }]}>
            {estimatedFcfa.toLocaleString()}
            <Text style={[styles.statUnit, { color: colors.primaryFixedDim }]}> FCFA</Text>
          </Text>
          <Text style={[styles.statFoot, { color: colors.primaryFixedDim, marginTop: 8 }]}>
            Projected: {projectedFcfa.toLocaleString()} FCFA/mo
          </Text>
        </View>
      </View>

      {/* Peak window */}
      <View style={[surfaceCard, styles.statCard]}>
        <View style={styles.statTop}>
          <Text style={styles.statLabel}>PEAK TIME</Text>
          <Icon name="schedule" size={24} color={colors.tertiaryContainer} />
        </View>
        <View>
          <Text style={styles.peakValue}>
            {peakHour === null ? "No readings yet" : `${String(peakHour).padStart(2, "0")}:00`}
          </Text>
          <View style={styles.statFootRow}>
            <Icon name="bolt" size={16} color={colors.tertiaryContainer} />
            <Text style={styles.statFoot}>
              {peakHour === null
                ? "Busiest hour appears once data arrives"
                : `${formatWatts(peakHourWatts).value} ${formatWatts(peakHourWatts).unit} at its busiest`}
            </Text>
          </View>
        </View>
      </View>

      {/* Power curve */}
      <PowerChart hourly={hourly} width={width - spacing.marginMobile * 2 - spacing.md * 2} />

      {/* Active devices */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active Devices</Text>
        <TouchableOpacity onPress={onOpenDevices} activeOpacity={0.7}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={[surfaceCard, styles.emptyCard]}>
          <Text style={styles.emptyText}>No devices paired yet.</Text>
        </View>
      ) : (
        <View style={styles.deviceGrid}>
          {devices.slice(0, 8).map((device) => {
            const draw = formatWatts(device.watts || 0);
            return (
              <TouchableOpacity
                key={device.id}
                onPress={onOpenDevices}
                activeOpacity={0.7}
                style={[
                  surfaceCard,
                  styles.deviceCard,
                  { width: cardWidth },
                  !device.is_on && styles.deviceCardOff,
                ]}
              >
                <View style={styles.deviceTop}>
                  <Icon name={deviceIcon(device.name)} size={24} color={colors.onSurfaceVariant} />
                  <View
                    style={[
                      styles.toggle,
                      {
                        backgroundColor: device.is_on
                          ? colors.secondary
                          : "rgba(198, 198, 205, 0.5)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleKnob,
                        device.is_on ? styles.toggleKnobOn : styles.toggleKnobOff,
                      ]}
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
                    {device.is_on ? `${draw.value} ${draw.unit}` : "Off"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function PowerChart({ hourly, width }) {
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
      <Text style={styles.sectionTitle}>Power Usage</Text>

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
            <Text style={styles.emptyText}>No readings today yet.</Text>
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
  page: { flex: 1, backgroundColor: colors.background },
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
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    overflow: "hidden",
  },

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
  deviceCardOff: { opacity: 0.6 },
  deviceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  toggle: { width: 32, height: 16, borderRadius: radius.full, justifyContent: "center" },
  toggleKnob: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: "#ffffff",
    position: "absolute",
  },
  toggleKnobOn: { right: 2 },
  toggleKnobOff: { left: 2 },
  deviceName: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, fontSize: 16, color: colors.onSurface },
  deviceDraw: { ...type.dataLabel, fontSize: 12, marginTop: 4 },
});
