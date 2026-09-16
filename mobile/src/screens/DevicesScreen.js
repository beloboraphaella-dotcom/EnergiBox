import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, useWindowDimensions,
  Modal, TextInput, Pressable
} from "react-native";
import { api } from "../api";
import Icon from "../components/Icon";
import { colors, spacing, radius, type, glassCard, surfaceCard } from "../theme";

// The "My Devices" mockup uses this teal for the primary action and the
// live-draw figures rather than the palette's `secondary` (#006a61). It is
// the one place the design system contradicts itself; reproduced as drawn.
const ACCENT = "#0D9488";

/** Accepts colon, hyphen, dot or no separator and normalises to the
 * AA:BB:CC:DD:EE:FF form the firmware and MQTT topics use. Mirrors
 * normalize_mac() in the backend and normalizeMac() on the web —
 * otherwise a valid but differently-formatted MAC gets stored and never
 * matches the real device. */
function normalizeMac(input) {
  const hex = input.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(":");
}

/** Material Symbols glyph for a device, from its name. Kept in step with
 * the same helper on the dashboard and on the web. */
function getIcon(name = "", type = "appliance") {
  const n = name.toLowerCase();
  if (/frig|fridge|réfrig|refrig|freezer|congel/.test(n)) return "kitchen";
  if (/clim|\bac\b|air|cond/.test(n)) return "ac_unit";
  if (/heater|chauffe|boiler|ballon/.test(n)) return "water_heater";
  if (/light|lamp|lumi|ampoule|bulb/.test(n)) return "lightbulb";
  if (/tv|télé|tele|screen|television/.test(n)) return "tv";
  if (/fan|ventil/.test(n)) return "mode_fan";
  if (/pump|pompe/.test(n)) return "water_pump";
  if (/wash|lave|linge/.test(n)) return "local_laundry_service";
  if (/micro|oven|four/.test(n)) return "microwave";
  if (/coffee|café|cafe/.test(n)) return "coffee_maker";
  if (/charger|\bev\b|battery|batterie/.test(n)) return "battery_charging_full";
  return type === "socket" ? "power" : "devices_other";
}

export default function DevicesScreen({ homeId }) {
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedMac, setSelectedMac] = useState(null);
  const [togglingMacs, setTogglingMacs] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });
  const [deviceError, setDeviceError] = useState("");
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();

  const fetchAll = useCallback(async () => {
    if (!homeId) return;
    const results = await Promise.allSettled([
      api.get(`/devices?home_id=${homeId}`),
      api.get(`/rooms?home_id=${homeId}`),
    ]);
    if (results[0].status === "fulfilled") setDevices(results[0].value.data);
    if (results[1].status === "fulfilled") setRooms(results[1].value.data);
  }, [homeId]);

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

  const toggleDevice = async (d) => {
    if (togglingMacs[d.mac]) return;
    const nextIsOn = !d.is_on;
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: true }));
    try {
      await api.post(`/control/${d.mac}?command=${nextIsOn ? "ON" : "OFF"}`);
      setDevices((prev) => prev.map((x) => (x.mac === d.mac ? { ...x, is_on: nextIsOn } : x)));
      setTimeout(fetchAll, 500);
    } catch (err) {
      // The command never reached the relay, so leave the switch alone
      // rather than showing a state the device never entered.
    }
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: false }));
  };

  const closeAdd = () => {
    setAddOpen(false);
    setDeviceError("");
    setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
  };

  const submitNewDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setDeviceError("Room, name and MAC address are required.");
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setDeviceError("Enter a valid MAC address — 12 hex digits, e.g. AA:BB:CC:DD:EE:FF.");
      return;
    }
    setSaving(true);
    setDeviceError("");
    try {
      await api.post(
        `/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}` +
        `&type=${type}&mac_address=${encodeURIComponent(normalizedMac)}`
      );
      await fetchAll();
      closeAdd();
    } catch (err) {
      setDeviceError(err.response?.data?.detail || "Could not add device. Check the MAC address.");
    }
    setSaving(false);
  };

  if (selectedMac) {
    return (
      <DeviceDetail
        mac={selectedMac}
        homeId={homeId}
        onBack={() => { setSelectedMac(null); fetchAll(); }}
      />
    );
  }

  // The mockup filters by room, not by connectivity.
  const filtered = filter === "all" ? devices : devices.filter((d) => d.room_id === filter);
  const activeCount = devices.filter((d) => d.is_on).length;
  const totalKw = devices.reduce((sum, d) => sum + (d.watts || 0), 0) / 1000;

  // The web lays the grid out with CSS grid; here the card width is
  // computed so the cards fill the gutters exactly.
  const cardWidth = width - spacing.marginMobile * 2;
  const statWidth = (width - spacing.marginMobile * 2 - spacing.sm) / 2;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Devices</Text>
        <Text style={styles.subtitle}>Manage and monitor all connected appliances.</Text>
      </View>

      <TouchableOpacity
        style={styles.addButton}
        activeOpacity={0.8}
        onPress={() => setAddOpen(true)}
      >
        <Icon name="add" size={20} color="#ffffff" />
        <Text style={styles.addButtonLabel}>Add New Box</Text>
      </TouchableOpacity>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { width: statWidth }]}>
          <Text style={styles.statLabel}>Total Devices</Text>
          <Text style={styles.statValue}>{devices.length}</Text>
        </View>
        <View style={[styles.statCard, { width: statWidth }]}>
          <Text style={styles.statLabel}>Active Now</Text>
          <Text style={[styles.statValue, { color: ACCENT }]}>{activeCount}</Text>
        </View>
      </View>

      <View style={styles.drawCard}>
        <Text style={styles.statLabel}>Total Current Draw</Text>
        <View style={styles.drawRow}>
          <Text style={styles.drawValue}>
            {totalKw.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </Text>
          <Text style={styles.drawUnit}>kW</Text>
        </View>
      </View>

      {/* Room filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {[{ id: "all", name: "All Rooms" }, ...rooms.map((r) => ({ id: r.id, name: r.name }))].map(
          (room) => {
            const isActive = filter === room.id;
            return (
              <TouchableOpacity
                key={String(room.id)}
                onPress={() => setFilter(room.id)}
                activeOpacity={0.7}
                style={[styles.filterPill, isActive ? styles.filterPillActive : styles.filterPillIdle]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    { color: isActive ? colors.onSecondaryContainer : colors.onSurface },
                  ]}
                >
                  {room.name}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </ScrollView>

      {/* Device cards */}
      {filtered.length === 0 ? (
        <View style={[surfaceCard, styles.emptyCard]}>
          <Text style={styles.emptyText}>
            {devices.length === 0
              ? "No devices paired yet. Add your first EnergiBox."
              : "No devices in this room."}
          </Text>
        </View>
      ) : (
        filtered.map((d) => {
          const isOn = d.is_on;
          return (
            <TouchableOpacity
              key={d.id}
              onPress={() => setSelectedMac(d.mac)}
              activeOpacity={0.8}
              style={[glassCard, styles.deviceCard, { width: cardWidth }, !isOn && styles.deviceCardOff]}
            >
              <View style={styles.deviceTop}>
                <View style={[styles.iconCircle, !isOn && styles.iconCircleOff]}>
                  <Icon
                    name={getIcon(d.name, d.type)}
                    size={22}
                    color={isOn ? colors.onSurface : colors.outline}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => toggleDevice(d)}
                  disabled={togglingMacs[d.mac]}
                  activeOpacity={0.7}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isOn }}
                  style={[
                    styles.toggle,
                    { backgroundColor: isOn ? colors.secondary : colors.outlineVariant },
                    togglingMacs[d.mac] && { opacity: 0.5 },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      isOn ? styles.toggleKnobOn : styles.toggleKnobOff,
                      { borderColor: isOn ? colors.secondary : colors.outlineVariant },
                    ]}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.deviceMiddle}>
                <Text
                  style={[
                    styles.deviceName,
                    { color: isOn ? colors.onBackground : colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  {d.name}
                </Text>
                <View style={styles.roomRow}>
                  <View
                    style={[
                      styles.roomDot,
                      { backgroundColor: d.status === "online" ? ACCENT : colors.outlineVariant },
                    ]}
                  />
                  <Text
                    style={[
                      styles.roomLabel,
                      { color: isOn ? colors.onSurfaceVariant : colors.outline },
                    ]}
                  >
                    {d.room}
                  </Text>
                </View>
              </View>

              <View style={styles.deviceBottom}>
                <Text style={[styles.drawCaption, { color: isOn ? colors.onSurfaceVariant : colors.outline }]}>
                  Current Draw
                </Text>
                <Text style={[styles.deviceDraw, { color: isOn ? ACCENT : colors.onSurfaceVariant }]}>
                  {Math.round(d.watts || 0)} W
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Add device. The mockup shows this button on mobile but the app
          never had the flow — devices could only be paired during
          onboarding. Same fields and same endpoint as the web form. */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <Pressable style={styles.modalScrim} onPress={closeAdd}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Box</Text>
              <TouchableOpacity onPress={closeAdd} activeOpacity={0.7} style={styles.modalClose}>
                <Icon name="close" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Room</Text>
              <View style={styles.chipRow}>
                {rooms.map((r) => {
                  const picked = String(newDevice.room_id) === String(r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => setNewDevice({ ...newDevice, room_id: r.id })}
                      activeOpacity={0.7}
                      style={[styles.filterPill, picked ? styles.filterPillActive : styles.filterPillIdle]}
                    >
                      <Text
                        style={[
                          styles.filterLabel,
                          { color: picked ? colors.onSecondaryContainer : colors.onSurface },
                        ]}
                      >
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={newDevice.name}
                onChangeText={(v) => setNewDevice({ ...newDevice, name: v })}
                placeholder="Fridge, Air conditioner…"
                placeholderTextColor={colors.outline}
              />

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.chipRow}>
                {[
                  { id: "appliance", label: "Appliance" },
                  { id: "socket", label: "Socket" },
                ].map((opt) => {
                  const picked = newDevice.type === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setNewDevice({ ...newDevice, type: opt.id })}
                      activeOpacity={0.7}
                      style={[styles.filterPill, picked ? styles.filterPillActive : styles.filterPillIdle]}
                    >
                      <Text
                        style={[
                          styles.filterLabel,
                          { color: picked ? colors.onSecondaryContainer : colors.onSurface },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>EnergiBox MAC address</Text>
              <TextInput
                style={[styles.input, { fontFamily: type.dataLabel.fontFamily }]}
                value={newDevice.mac}
                onChangeText={(v) => setNewDevice({ ...newDevice, mac: v })}
                placeholder="AA:BB:CC:DD:EE:FF"
                placeholderTextColor={colors.outline}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              {deviceError ? <Text style={styles.fieldError}>{deviceError}</Text> : null}

              <TouchableOpacity
                onPress={submitNewDevice}
                disabled={saving}
                activeOpacity={0.8}
                style={[styles.submitButton, saving && { opacity: 0.6 }]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onSecondary} />
                ) : (
                  <Text style={styles.submitLabel}>Add New Box</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const ALERT_ICONS = {
  spike: "warning",
  extended_runtime: "schedule",
  idle_waste: "energy_savings_leaf",
};

const ALERT_TITLES = {
  spike: "Consumption spike",
  extended_runtime: "Extended runtime",
  idle_waste: "Unusual standby draw",
};

/** Device detail, from the "Refrigerator Details" mockup.
 *
 * The mockup is marked class="dark", but the design system has no dark
 * values — every `dark:` token resolves to a light colour. Rendered as
 * drawn it puts pale blue text on white, so the light palette, which is
 * the real design, is what this reproduces.
 *
 * Its two insight cards describe data the platform does not collect:
 * comparing against similar models needs a fleet baseline nobody gathers,
 * and door-open history needs a sensor the hardware lacks. That slot shows
 * this device's real alerts instead. */
function DeviceDetail({ mac, homeId, onBack }) {
  const [device, setDevice] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState("24h");
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState("");
  const { width } = useWindowDimensions();

  const fetchDevice = useCallback(async () => {
    try {
      const res = await api.get(`/devices/${mac}`);
      setDevice(res.data);
    } catch (err) {
      setError("Could not load this device.");
    }
  }, [mac]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get(`/devices/${mac}/history?range=${range}`);
      setHistory(res.data);
    } catch (err) {
      // The chart falls back to its empty state; the rest of the screen stays.
    }
  }, [mac, range]);

  useEffect(() => {
    fetchDevice();
    const interval = setInterval(fetchDevice, 3000);
    return () => clearInterval(interval);
  }, [fetchDevice]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const togglePower = async () => {
    if (!device || toggling) return;
    const nextIsOn = !device.is_on;
    setToggling(true);
    setError("");
    try {
      await api.post(`/control/${mac}?command=${nextIsOn ? "ON" : "OFF"}`);
      setDevice((prev) => ({ ...prev, is_on: nextIsOn }));
      setTimeout(fetchDevice, 500);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not switch the device.");
    }
    setToggling(false);
  };

  if (!device) {
    return (
      <View style={styles.detailLoading}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.backRow}>
          <Icon name="arrow_back" size={20} color={colors.onSurfaceVariant} />
          <Text style={styles.backLabel}>Back to devices</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.emptyText}>{error}</Text> : <ActivityIndicator color={colors.secondary} />}
      </View>
    );
  }

  const isOn = device.is_on;
  const cost = history?.cost;
  const alerts = device.recent_alerts ?? [];
  const chartWidth = width - spacing.marginMobile * 2 - spacing.md * 2;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {/* Task header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.iconButton}>
          <Icon name="arrow_back" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <View style={styles.detailTitleWrap}>
          <Icon name={getIcon(device.name, device.type)} size={22} color={colors.secondary} />
          <Text style={styles.detailTitle} numberOfLines={1}>{device.name}</Text>
        </View>
        <TouchableOpacity
          onPress={togglePower}
          disabled={toggling}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOn }}
          style={[
            styles.bigToggle,
            { backgroundColor: isOn ? colors.secondary : colors.outlineVariant },
            toggling && { opacity: 0.5 },
          ]}
        >
          <View
            style={[
              styles.bigToggleKnob,
              isOn ? styles.bigToggleKnobOn : styles.bigToggleKnobOff,
              { borderColor: isOn ? colors.secondary : colors.surfaceTint },
            ]}
          />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Icon name="error" size={20} color={colors.onErrorContainer} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Current draw */}
      <View style={[glassCard, styles.detailCard]}>
        <View style={styles.detailCardTop}>
          <Text style={styles.detailCardLabel}>Current Draw</Text>
          <Icon name="bolt" size={24} color={colors.secondary} />
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricValue}>{Math.round(device.watts || 0)}</Text>
          <Text style={styles.metricUnit}>W</Text>
        </View>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isOn ? colors.secondaryFixed : colors.outline },
            ]}
          />
          <Text style={styles.statusText}>
            {device.status !== "online" ? "Device offline" : isOn ? "Drawing power" : "Idle"}
          </Text>
        </View>
      </View>

      {/* Monthly cost */}
      <View style={styles.costCardDetail}>
        <Text style={styles.costLabel}>Estimated Monthly Cost</Text>
        <View style={styles.metricRow}>
          <Text style={[styles.metricValue, { color: colors.inverseOnSurface }]}>
            {(cost?.estimated_fcfa ?? 0).toLocaleString()}
          </Text>
          <Text style={[styles.metricUnit, { color: colors.secondaryFixed }]}>FCFA</Text>
        </View>
        <View style={styles.costSplit}>
          <View style={styles.costItem}>
            <Text style={styles.costItemLabel}>Daily Avg</Text>
            <Text style={styles.costItemValue}>
              {(cost?.daily_avg_fcfa ?? 0).toLocaleString()} FCFA
            </Text>
          </View>
          <View style={styles.costItem}>
            <Text style={styles.costItemLabel}>Projected Usage</Text>
            <Text style={styles.costItemValue}>{(cost?.projected_kwh ?? 0).toLocaleString()} kWh</Text>
          </View>
        </View>
      </View>

      {/* History */}
      <View style={[glassCard, styles.detailCard]}>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Consumption History</Text>
          <View style={styles.rangeTabs}>
            {["24h", "7d", "30d"].map((r) => {
              const picked = range === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRange(r)}
                  activeOpacity={0.7}
                  style={[styles.rangeTab, picked && styles.rangeTabActive]}
                >
                  <Text
                    style={[
                      styles.rangeTabLabel,
                      { color: picked ? colors.onSecondaryContainer : colors.onSurfaceVariant },
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <HistoryBars history={history} width={chartWidth} />
      </View>

      {/* This device's alerts */}
      {alerts.length === 0 ? (
        <View style={[glassCard, styles.insightCard]}>
          <View style={[styles.insightIcon, { backgroundColor: colors.surfaceContainerLow }]}>
            <Icon name="check_circle" size={22} color={colors.secondary} />
          </View>
          <View style={styles.insightBody}>
            <Text style={styles.insightTitle}>No alerts</Text>
            <Text style={styles.insightText}>This device has not triggered any alert.</Text>
          </View>
        </View>
      ) : (
        alerts.map((a, i) => (
          <View key={i} style={[glassCard, styles.insightCard]}>
            <View
              style={[
                styles.insightIcon,
                {
                  backgroundColor:
                    a.type === "spike" ? "rgba(255, 218, 214, 0.35)" : colors.surfaceContainerLow,
                },
              ]}
            >
              <Icon
                name={ALERT_ICONS[a.type] || "notifications"}
                size={22}
                color={a.type === "spike" ? colors.error : colors.secondary}
              />
            </View>
            <View style={styles.insightBody}>
              <Text style={styles.insightTitle}>{ALERT_TITLES[a.type] || a.type}</Text>
              <Text style={styles.insightText}>{a.message}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** The mockup's bar chart. Built from Views rather than SVG, exactly as
 * the mockup builds it from divs. */
function HistoryBars({ history, width }) {
  const buckets = history?.buckets ?? [];
  const measured = buckets.filter((b) => b.watts !== null && b.watts !== undefined);
  const max = Math.max(history?.max_watts || 0, 1);
  const HEIGHT = 200;

  if (measured.length === 0) {
    return (
      <View style={[styles.chartEmpty, { height: HEIGHT }]}>
        <Text style={styles.emptyText}>No readings for this period yet.</Text>
      </View>
    );
  }

  const peak = measured.reduce((best, b) => (b.watts > best.watts ? b : best), measured[0]);
  const last = buckets.length - 1;
  const tickIndexes = [0, Math.floor(last / 3), Math.floor((2 * last) / 3), last];
  const axisWidth = 44;
  const barsWidth = Math.max(width - axisWidth, 1);
  const barWidth = Math.max(barsWidth / buckets.length - 2, 2);

  return (
    <View>
      <View style={[styles.chartRow, { height: HEIGHT }]}>
        <View style={styles.axisColumn}>
          <Text style={styles.axisText}>{Math.round(max)}W</Text>
          <Text style={styles.axisText}>{Math.round(max / 2)}W</Text>
          <Text style={styles.axisText}>0W</Text>
        </View>

        <View style={[styles.barsRow, { width: barsWidth }]}>
          {buckets.map((b, i) => {
            const pct = b.watts === null ? 0 : Math.max((b.watts / max) * 100, 2);
            const isPeak = b.watts !== null && b.label === peak.label;
            return (
              <View
                key={i}
                style={{
                  width: barWidth,
                  height: `${pct}%`,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  backgroundColor:
                    b.watts === null
                      ? "rgba(198, 198, 205, 0.2)"
                      : isPeak
                        ? colors.tertiaryFixedDim
                        : "rgba(0, 106, 97, 0.8)",
                }}
              />
            );
          })}
        </View>
      </View>

      <View style={[styles.axisRowDetail, { marginLeft: axisWidth }]}>
        {tickIndexes.map((i) => (
          <Text key={i} style={styles.axisText}>{buckets[i]?.label ?? ""}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailLoading: { flex: 1, padding: spacing.marginMobile, gap: spacing.md },
  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  backLabel: { ...type.labelSm, color: colors.onSurfaceVariant },

  detailHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  iconButton: { padding: 6, borderRadius: radius.full },
  detailTitleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  detailTitle: { ...type.headlineMd, color: colors.onSurface, flexShrink: 1 },

  bigToggle: { width: 48, height: 24, borderRadius: radius.full, justifyContent: "center" },
  bigToggleKnob: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#ffffff", borderWidth: 4, position: "absolute",
  },
  bigToggleKnobOn: { right: 0 },
  bigToggleKnobOff: { left: 0 },

  errorBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.xs,
    backgroundColor: "rgba(255, 218, 214, 0.4)",
    borderWidth: 1, borderColor: colors.errorContainer,
    borderRadius: radius.lg, padding: spacing.sm,
  },
  errorText: { ...type.labelSm, color: colors.onErrorContainer, flex: 1 },

  detailCard: { padding: spacing.md, gap: spacing.sm, minHeight: 160 },
  detailCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  detailCardLabel: { ...type.bodyLg, color: colors.onSurfaceVariant },
  metricRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  metricValue: { ...type.displayMetrics, color: colors.onSurface },
  metricUnit: { ...type.dataLabel, color: colors.secondary, marginBottom: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusText: { ...type.labelSm, color: colors.onSurfaceVariant },

  costCardDetail: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.xl,
    padding: spacing.md, gap: spacing.sm, minHeight: 160,
  },
  costLabel: { ...type.bodyLg, color: colors.primaryFixedDim },
  costSplit: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  costItem: {
    flex: 1, borderLeftWidth: 2, borderLeftColor: "rgba(0, 106, 97, 0.3)",
    paddingLeft: spacing.sm,
  },
  costItemLabel: { ...type.labelSm, color: colors.primaryFixedDim },
  costItemValue: { ...type.bodyMd, color: colors.inverseOnSurface, marginTop: 4 },

  historyHeader: { gap: spacing.sm },
  sectionTitle: { ...type.headlineMd, color: colors.onSurface },
  rangeTabs: {
    flexDirection: "row", alignSelf: "flex-start",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg, padding: 4,
  },
  rangeTab: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.DEFAULT },
  rangeTabActive: { backgroundColor: colors.secondaryContainer },
  rangeTabLabel: { ...type.labelSm },

  chartRow: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.sm },
  axisColumn: { width: 44, height: "100%", justifyContent: "space-between", paddingBottom: 2 },
  axisText: { ...type.dataLabel, fontSize: 11, color: colors.onSurfaceVariant, opacity: 0.6 },
  barsRow: { flexDirection: "row", alignItems: "flex-end", height: "100%", gap: 2 },
  axisRowDetail: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  chartEmpty: { alignItems: "center", justifyContent: "center" },

  insightCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  insightIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  insightBody: { flex: 1 },
  insightTitle: { ...type.bodyMd, color: colors.onSurface },
  insightText: { ...type.labelSm, color: colors.onSurfaceVariant, marginTop: 4 },

  modalScrim: { flex: 1, backgroundColor: "rgba(11, 28, 48, 0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.3)",
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "rgba(198, 198, 205, 0.2)",
  },
  modalTitle: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },
  modalClose: { padding: 8, borderRadius: radius.full },
  modalBody: { padding: spacing.md, gap: spacing.xs, paddingBottom: spacing.xl },
  fieldLabel: { ...type.labelSm, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  input: {
    ...type.bodyMd,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.5)",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm, paddingVertical: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  fieldError: { ...type.labelSm, color: colors.error, marginTop: spacing.xs },
  submitButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingVertical: 14, alignItems: "center",
    marginTop: spacing.sm,
  },
  submitLabel: { ...type.labelSm, color: colors.onSecondary },

  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },

  header: { marginBottom: spacing.xs },
  title: { ...type.headlineLg, color: colors.onBackground, marginBottom: 4 },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant },

  addButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs,
    backgroundColor: ACCENT,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderRadius: radius.full, alignSelf: "flex-start",
  },
  addButtonLabel: { ...type.labelSm, color: "#ffffff" },

  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    ...glassCard, padding: spacing.sm,
  },
  statLabel: { ...type.labelSm, color: colors.onSurfaceVariant, marginBottom: 4 },
  statValue: { ...type.headlineMd, color: colors.onBackground },

  drawCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.xl,
    padding: spacing.sm,
  },
  drawRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  drawValue: { ...type.headlineLg, color: colors.onBackground },
  drawUnit: { ...type.dataLabel, color: colors.onSurfaceVariant },

  filterRow: { gap: spacing.xs, paddingVertical: spacing.xs },
  filterPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1,
  },
  filterPillActive: { backgroundColor: colors.secondaryContainer, borderColor: "transparent" },
  filterPillIdle: { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
  filterLabel: { ...type.labelSm },

  deviceCard: { padding: 20, gap: spacing.sm },
  deviceCardOff: { opacity: 0.8 },
  deviceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: "rgba(198, 198, 205, 0.5)",
    alignItems: "center", justifyContent: "center",
  },
  iconCircleOff: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: "rgba(198, 198, 205, 0.3)",
  },
  toggle: { width: 40, height: 20, borderRadius: radius.full, justifyContent: "center" },
  toggleKnob: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ffffff", borderWidth: 4, position: "absolute",
  },
  toggleKnobOn: { right: 0 },
  toggleKnobOff: { left: 0 },

  deviceMiddle: { gap: 2 },
  deviceName: { ...type.bodyLg, fontFamily: type.labelSm.fontFamily, fontSize: 18 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  roomDot: { width: 8, height: 8, borderRadius: 4 },
  roomLabel: { ...type.labelSm },

  deviceBottom: {
    paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: "rgba(198, 198, 205, 0.3)",
  },
  drawCaption: { ...type.labelSm },
  deviceDraw: { ...type.dataLabel, marginTop: 2 },

  emptyCard: { padding: spacing.md, alignItems: "center" },
  emptyText: { ...type.bodyMd, color: colors.onSurfaceVariant, textAlign: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  pageHeader: { padding: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  pageSub: { fontSize: 13, color: "#64748b" },
  pageSubBold: { fontWeight: "700", color: "#3b82f6" },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "#f1f5f9" },
  filterBtnActive: { backgroundColor: "#3b82f6" },
  filterBtnText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  filterBtnTextActive: { color: "#fff" },

  deviceRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
  },
  deviceIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center" },
  deviceIcon: { fontSize: 20 },
  deviceInfo: { flex: 1 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  deviceRoom: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  deviceStatus: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  deviceRight: { alignItems: "flex-end", gap: 6 },
  deviceKw: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  typeTag: { backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  typeTagText: { fontSize: 9, fontWeight: "700", color: "#3b82f6", textTransform: "uppercase" },

  backBtn: { color: "#3b82f6", fontSize: 14, fontWeight: "600", marginBottom: 16 },
  detailIcon: { fontSize: 36 },
  detailName: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  detailRoom: { fontSize: 13, color: "#94a3b8", marginTop: 2 },

  powerCard: {
    backgroundColor: "#3b82f6", borderRadius: 18, padding: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20,
  },
  powerLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  powerWatts: { fontSize: 28, fontWeight: "700", color: "#fff" },
  powerUnit: { fontSize: 14, fontWeight: "400" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5, marginBottom: 10 },
  runtimeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  runtimeCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center" },
  runtimeLabel: { fontSize: 11, color: "#94a3b8", marginBottom: 4 },
  runtimeValue: { fontSize: 16, fontWeight: "700", color: "#0f172a" },

  card: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  infoLabel: { fontSize: 13, color: "#94a3b8" },
  infoValue: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
});
