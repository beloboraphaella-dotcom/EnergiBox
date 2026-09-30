import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { colors, spacing, type, glass } from "../theme";
import { IconButton, Segmented, StatTile } from "../components/GlassUI";
import Icon from "../components/Icon";
import Skeleton, { SkeletonList } from "../components/Skeleton";

/** Consumption history, as on the web (Dashboard.jsx, "history" tab): the
 * same modes, the same endpoints, the same figures. */

const MODES = ["Day", "Week", "Month", "Year"];

// The API labels a year's bars with English month abbreviations; this is
// their order, so each can be re-rendered in the reader's language.
const API_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Appliance series, identical to the web's.
const COLORS = ["#00897b", "#5b6ee1", "#e0930b", "#0ea5c6", "#d9486b", "#64748b"];

const CHART_HEIGHT = 180;

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export default function HistoryScreen({ homeId }) {
  const { t, locale } = useLanguage();
  const now = new Date();
  const [mode, setMode] = useState("Month");
  const [day, setDay] = useState(now.getDate());
  const [week, setWeek] = useState(1);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [appliances, setAppliances] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fmt = (value, digits = 1) =>
    Number(value ?? 0).toLocaleString(locale, { maximumFractionDigits: digits });

  const fetchHistory = useCallback(async () => {
    if (!homeId) return;
    const hid = `home_id=${homeId}`;
    try {
      let res;
      if (mode === "Week") {
        res = await api.get(`/history/weekly?${hid}`);
      } else if (mode === "Year") {
        res = await api.get(`/history/yearly?${hid}&year=${year}`);
      } else {
        res = await api.get(`/history/daily?${hid}&month=${month}&year=${year}`);
      }
      setData(res.data);
      const byAppliance = await api.get(`/history/by-appliance?${hid}&month=${month}&year=${year}`);
      setAppliances(byAppliance.data);
    } catch (err) {
      // Keep the last figures rather than blanking the screen.
    }
  }, [homeId, mode, month, year]);

  useEffect(() => { fetchHistory(); }, [fetchHistory, day, week]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  const navigate = (direction) => {
    if (mode === "Day") {
      const d = new Date(year, month - 1, day + direction);
      setDay(d.getDate());
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
    } else if (mode === "Week") {
      setWeek((w) => Math.max(1, w + direction));
    } else if (mode === "Month") {
      const next = month + direction;
      if (next < 1) { setMonth(12); setYear((y) => y - 1); }
      else if (next > 12) { setMonth(1); setYear((y) => y + 1); }
      else setMonth(next);
    } else {
      setYear((y) => y + direction);
    }
  };

  const periodLabel = () => {
    const date = new Date(year, month - 1, day);
    if (mode === "Day") return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
    if (mode === "Week") return t("history.week", { week, year });
    if (mode === "Month") return capitalize(date.toLocaleDateString(locale, { month: "long", year: "numeric" }));
    return `${year}`;
  };

  const bars = (data?.bars ?? []).map((bar) => ({
    kwh: bar.kwh,
    label:
      mode === "Year"
        ? capitalize(
            new Date(2000, API_MONTHS.indexOf(bar.month), 1)
              .toLocaleDateString(locale, { month: "short" })
              .replace(".", "")
          )
        : String(bar.day).slice(-2),
  }));
  const maxKwh = Math.max(...bars.map((b) => b.kwh), 0.001);
  // Label every bar when they fit, every other one when they do not.
  const labelEvery = bars.length > 12 ? Math.ceil(bars.length / 8) : 1;
  const change = data?.change_vs_prev;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <View>
        <Text style={styles.title}>{t("history.title")}</Text>
        <Text style={styles.subtitle}>{t("history.subtitle")}</Text>
      </View>

      <Segmented
        options={MODES.map((m) => ({ value: m, label: t(`history.mode.${m}`) }))}
        value={mode}
        onChange={setMode}
      />

      <View style={[glass.subtle, styles.period]}>
        <IconButton icon="chevron_left" onPress={() => navigate(-1)} label={t("history.prev")} />
        <Text style={styles.periodLabel}>{periodLabel()}</Text>
        <IconButton icon="chevron_right" onPress={() => navigate(1)} label={t("history.next")} />
      </View>

      {!data && (
        <SkeletonList label={t("common.loading")}>
          <View style={styles.tiles}>
            <Skeleton height={110} style={styles.flexTile} />
            <Skeleton height={110} style={styles.flexTile} />
          </View>
          <Skeleton height={260} />
        </SkeletonList>
      )}

      {data && (
        <>
          <View style={styles.tiles}>
            <StatTile icon="bolt" label={t("history.total")} value={fmt(data.total_kwh)} unit="kWh">
              {change !== undefined && (
                <View style={styles.changeRow}>
                  <Icon
                    name={change >= 0 ? "trending_up" : "trending_down"}
                    size={16}
                    color={change >= 0 ? colors.error : colors.secondary}
                  />
                  <Text style={[styles.change, { color: change >= 0 ? colors.error : colors.secondary }]}>
                    {t("history.vsPrev", { pct: fmt(Math.abs(change)) })}
                  </Text>
                </View>
              )}
            </StatTile>
            <StatTile
              icon="speed"
              label={mode === "Year" ? t("history.avgMonth") : t("history.avgDay")}
              value={fmt(data.avg_per_day_kwh)}
              unit="kWh"
            />
          </View>
          <View style={styles.tiles}>
            <StatTile icon="payments" label={t("history.estCost")} value={fmt(data.estimated_fcfa, 0)} unit="FCFA" dark />
            <StatTile
              icon="calendar_today"
              label={t("history.costDay")}
              value={data.avg_fcfa_per_day == null ? "—" : fmt(data.avg_fcfa_per_day, 0)}
              unit="FCFA"
            />
          </View>

          <View style={[glass.card, styles.card]}>
            <Text style={styles.cardTitle}>{t("history.chart")}</Text>
            <View style={styles.chart}>
              <View style={styles.axis}>
                <Text style={styles.axisText}>{fmt(maxKwh)} kWh</Text>
                <Text style={styles.axisText}>0</Text>
              </View>
              <View style={styles.bars}>
                {bars.map((bar, i) => {
                  const h = Math.max((bar.kwh / maxKwh) * CHART_HEIGHT, 2);
                  return (
                    <View key={i} style={styles.barCol}>
                      <View style={{ height: h, width: "100%", borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: "hidden" }}>
                        <Svg width="100%" height="100%" preserveAspectRatio="none">
                          <Defs>
                            <LinearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
                              <Stop offset="0" stopColor="#00897b" />
                              <Stop offset="1" stopColor="#6bd8cb" stopOpacity={0.85} />
                            </LinearGradient>
                          </Defs>
                          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bar)" />
                        </Svg>
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {i % labelEvery === 0 ? bar.label : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {appliances.length > 0 && (
            <View style={[glass.card, styles.card]}>
              <Text style={styles.cardTitle}>{t("history.byAppliance")}</Text>
              {appliances.map((a, i) => (
                <View key={i} style={styles.appliance}>
                  <View style={styles.applianceTop}>
                    <View style={[styles.dot, { backgroundColor: COLORS[i % COLORS.length] }]} />
                    <Text style={styles.applianceName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.applianceKwh}>{fmt(a.kwh)} kWh</Text>
                    <Text style={styles.appliancePct}>{fmt(a.percentage)}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${a.percentage}%`, backgroundColor: COLORS[i % COLORS.length] }]} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flexTile: { flex: 1 },
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant, marginTop: 4 },

  period: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 9999, paddingHorizontal: 4, alignSelf: "stretch",
  },
  periodLabel: { ...type.labelSm, fontSize: 14, color: colors.onSurface },

  tiles: { flexDirection: "row", gap: spacing.sm },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  change: { ...type.labelSm, fontSize: 13 },

  card: { padding: spacing.md, gap: spacing.sm },
  cardTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },

  chart: { flexDirection: "row", gap: 6 },
  axis: { height: CHART_HEIGHT, justifyContent: "space-between" },
  axisText: { ...type.dataLabel, fontSize: 10, color: colors.outline },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3, height: CHART_HEIGHT + 18 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  barLabel: { ...type.dataLabel, fontSize: 10, color: colors.outline, marginTop: 4, height: 14 },

  appliance: { gap: 6 },
  applianceTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  applianceName: { ...type.bodyMd, color: colors.onSurface, flex: 1 },
  applianceKwh: { ...type.dataLabel, fontSize: 13, color: colors.onSurface },
  appliancePct: { ...type.labelSm, color: colors.outline, width: 44, textAlign: "right" },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 0.6)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});
