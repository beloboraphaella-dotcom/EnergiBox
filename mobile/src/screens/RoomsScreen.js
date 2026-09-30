import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, useWindowDimensions } from "react-native";
import { api } from "../api";
import { useLanguage } from "../context/LanguageContext";
import GradientFill from "../components/GradientFill";
import { colors, spacing, type, glass } from "../theme";
import {
  EmptyCard, ErrorText, Field, GhostButton, GlassSheet, IconButton, Orb, PrimaryButton,
} from "../components/GlassUI";
import { confirm, notify } from "../components/confirm";
import { deviceIcon } from "../utils";
import Skeleton, { SkeletonList } from "../components/Skeleton";
import Switch from "../components/Switch";
import { useToast } from "../components/Toast";
import { useLiveRefresh } from "../live/LiveContext";
import { useDeviceToggle } from "../live/useDeviceToggle";
import { failure, success } from "../haptics";

/** Rooms, as on the web (pages/Rooms.jsx): a grid of rooms with their live
 * draw, a detail view listing each room's devices, and add / rename /
 * delete. */
export default function RoomsScreen({ homeId }) {
  const { t, tn, locale } = useLanguage();
  const { width } = useWindowDimensions();
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState(null); // null | "add" | { edit: room }
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [switchingOff, setSwitchingOff] = useState(false);
  const toast = useToast();

  const setDeviceState = useCallback((mac, isOn) => {
    setDevices((list) => list.map((d) => (d.mac === mac ? { ...d, is_on: isOn } : d)));
  }, []);
  const { toggle, apply, busy } = useDeviceToggle(setDeviceState);

  const fetchAll = useCallback(async () => {
    if (!homeId) return;
    const [r, d] = await Promise.allSettled([
      api.get(`/rooms/consumption?home_id=${homeId}`),
      api.get(`/devices?home_id=${homeId}`),
    ]);
    if (r.status === "fulfilled") setRooms(r.value.data);
    if (d.status === "fulfilled") setDevices(apply(d.value.data));
    setLoading(false);
  }, [homeId, apply]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useLiveRefresh(fetchAll, { topics: ["devices"], interval: 5000 });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const kw = (watts) => (watts / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Leaving a room: everything in it off, in one request. */
  const switchRoomOff = async (room) => {
    setSwitchingOff(true);
    try {
      const res = await api.post(`/homes/${homeId}/all-off?room_id=${room.id}`);
      const switched = res.data.switched || [];
      setDevices((list) => list.map((d) => (switched.includes(d.mac) ? { ...d, is_on: false } : d)));
      success();
      toast.show(tn("allOff.done", switched.length), { tone: "success" });
      if (res.data.failed?.length) toast.show(tn("allOff.partial", res.data.failed.length), { tone: "error" });
    } catch (err) {
      failure();
      toast.show(err.response?.data?.detail || t("allOff.error"), { tone: "error" });
    }
    setSwitchingOff(false);
    fetchAll();
  };

  const openAdd = () => {
    setName("");
    setError("");
    setSheet("add");
  };

  const openEdit = (room) => {
    setName(room.name);
    setError("");
    setSheet({ edit: room });
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("rooms.errNameRequired"));
      return;
    }
    const clash = rooms.some(
      (r) => r.name.toLowerCase() === trimmed.toLowerCase() && !(sheet !== "add" && r.id === sheet.edit.id)
    );
    if (clash) {
      setError(t("onb.errRoomExists", { name: trimmed }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (sheet === "add") {
        await api.post(`/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`);
      } else {
        await api.put(`/rooms/${sheet.edit.id}?name=${encodeURIComponent(trimmed)}`);
      }
      await fetchAll();
      setSheet(null);
    } catch (err) {
      setError(err.response?.data?.detail || t("rooms.errSave"));
    }
    setSaving(false);
  };

  const remove = async (room) => {
    if (room.device_count > 0) {
      notify(t("rooms.errNotEmpty", { name: room.name, devices: tn("count.device", room.device_count) }));
      return;
    }
    const ok = await confirm(t("rooms.confirmDelete", { name: room.name }), {
      confirmLabel: t("rooms.delete"),
      cancelLabel: t("common.back"),
    });
    if (!ok) return;
    try {
      await api.delete(`/rooms/${room.id}`);
      fetchAll();
    } catch (err) {
      notify(err.response?.data?.detail || t("rooms.errDelete"));
    }
  };

  const nameSheet = (
    <GlassSheet
      visible={!!sheet}
      title={sheet === "add" ? t("rooms.addModal") : t("rooms.renameModal")}
      onClose={() => setSheet(null)}
    >
      <Field
        label={t("onb.roomName")}
        placeholder={t("onb.roomNamePh")}
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        autoFocus
      />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton
        label={saving ? t("common.saving") : sheet === "add" ? t("rooms.createRoom") : t("common.saveChanges")}
        onPress={submit}
        disabled={saving}
      />
    </GlassSheet>
  );

  // ── One room ──
  if (selectedId) {
    const room = rooms.find((r) => r.id === selectedId);
    const roomDevices = devices.filter((d) => d.room_id === selectedId);
    const watts = room?.watts ?? roomDevices.reduce((sum, d) => sum + (d.watts || 0), 0);
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <GhostButton
          label={t("rooms.backToRooms").replace(/^‹\s*/, "")}
          icon="arrow_back"
          onPress={() => setSelectedId(null)}
          compact
          style={styles.start}
        />
        <View style={styles.detailHead}>
          <Orb icon="meeting_room" size={52} />
          <View>
            <Text style={styles.title}>{room?.name || t("rooms.fallbackName")}</Text>
            <Text style={styles.subtitle}>{tn("count.device", roomDevices.length)}</Text>
          </View>
        </View>

        {room && roomDevices.some((d) => d.is_on) && (
          <GhostButton
            icon="power_settings_new"
            label={switchingOff ? t("allOff.working") : t("allOff.room")}
            onPress={() => switchRoomOff(room)}
            disabled={switchingOff}
            style={styles.start}
          />
        )}

        <View style={[glass.dark, styles.darkCard]}>
          <GradientFill kind="dark" />
          <Text style={styles.darkLabel}>{t("rooms.roomConsumption").toUpperCase()}</Text>
          <Text style={styles.darkValue}>
            {kw(watts)} <Text style={styles.darkUnit}>kW</Text>
          </Text>
        </View>

        <Text style={styles.sectionLabel}>{t("rooms.devicesInRoom").toUpperCase()}</Text>
        {roomDevices.length === 0 ? (
          <EmptyCard icon="devices">{t("rooms.noDevicesInRoom")}</EmptyCard>
        ) : (
          roomDevices.map((d) => (
            <View key={d.mac} style={[glass.card, styles.deviceRow]}>
              <Orb icon={deviceIcon(d.name, d.type)} size={40} color={d.is_on ? colors.secondary : colors.outline} />
              <View style={styles.flex}>
                <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: d.status === "online" ? colors.secondary : colors.outlineVariant }]} />
                  <Text style={[styles.status, { color: d.status === "online" ? colors.secondary : colors.outline }]}>
                    {d.status === "online" ? t("devices.online") : t("devices.offline")}
                  </Text>
                </View>
              </View>
              <Text style={styles.kw}>{kw(d.watts || 0)} kW</Text>
              <Switch
                value={d.is_on}
                disabled={busy[d.mac]}
                onValueChange={() => toggle(d)}
                label={t(d.is_on ? "devices.turnOffNamed" : "devices.turnOnNamed", { name: d.name })}
              />
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  // ── All rooms ──
  const cardWidth = (width - spacing.marginMobile * 2 - spacing.sm) / 2;
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <View>
        <Text style={styles.title}>{t("rooms.title")}</Text>
        <Text style={styles.subtitle}>{t("rooms.subtitle")}</Text>
      </View>
      <PrimaryButton
        label={t("rooms.addRoom").replace(/^\+\s*/, "")}
        icon="add"
        onPress={openAdd}
        style={styles.start}
      />

      {loading ? (
        <SkeletonList label={t("rooms.loading")} style={styles.grid}>
          <Skeleton height={150} style={{ width: cardWidth }} />
          <Skeleton height={150} style={{ width: cardWidth }} />
        </SkeletonList>
      ) : rooms.length === 0 ? (
        <EmptyCard icon="meeting_room">{t("rooms.noRooms")}</EmptyCard>
      ) : (
        <View style={styles.grid}>
          {rooms.map((room) => (
            <TouchableOpacity
              key={room.id}
              activeOpacity={0.85}
              onPress={() => setSelectedId(room.id)}
              accessibilityRole="button"
              accessibilityLabel={`${room.name}, ${kw(room.watts || 0)} kW, ${tn("count.device", room.device_count)}`}
              style={[glass.card, styles.roomCard, { width: cardWidth }]}
            >
              <View style={styles.roomTop}>
                <Orb icon="meeting_room" size={40} />
                <View style={styles.roomActions}>
                  <IconButton icon="edit" onPress={() => openEdit(room)} label={t("rooms.rename")} />
                  <IconButton icon="delete" onPress={() => remove(room)} label={t("rooms.delete")} />
                </View>
              </View>
              <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
              <Text style={styles.roomKw}>
                {kw(room.watts || 0)} <Text style={styles.roomUnit}>kW</Text>
              </Text>
              <Text style={styles.roomCount}>{tn("count.device", room.device_count)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {nameSheet}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface },
  subtitle: { ...type.bodyMd, color: colors.onSurfaceVariant, marginTop: 4 },
  start: { alignSelf: "flex-start" },
  flex: { flex: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roomCard: { padding: spacing.sm, gap: 4 },
  roomTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  roomActions: { flexDirection: "row", marginRight: -8, marginTop: -6 },
  roomName: { ...type.bodyLg, fontFamily: type.labelSm.fontFamily, color: colors.onSurface },
  roomKw: { ...type.headlineMd, color: colors.secondary },
  roomUnit: { ...type.bodyMd, fontSize: 14, color: colors.outline },
  roomCount: {
    ...type.labelSm, color: colors.onSurfaceVariant,
    marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: glass.divider,
  },

  detailHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  darkCard: { padding: spacing.md, gap: 6 },
  darkLabel: { ...type.dataLabel, fontSize: 12, color: colors.primaryFixedDim },
  darkValue: { ...type.displayMetrics, color: "#ffffff" },
  darkUnit: { ...type.bodyLg, color: colors.primaryFixedDim },
  sectionLabel: { ...type.labelSm, color: colors.outline, letterSpacing: 1, marginTop: spacing.xs },

  deviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  deviceName: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, color: colors.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { ...type.labelSm },
  kw: { ...type.dataLabel, fontSize: 12, color: colors.onSurface },
});
