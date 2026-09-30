import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../context/LanguageContext";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import { deviceIcon } from "../utils/deviceIcon";
import Skeleton from "../components/Skeleton";
import Switch from "../components/Switch";
import { useToast } from "../components/Toast";
import { useLiveRefresh } from "../live/LiveContext";
import { useDeviceToggle } from "../live/useDeviceToggle";

const API = "http://localhost:8000";
export default function Rooms({ token, homeId, onBack }) {
  const { t, tn, locale } = useLanguage();
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [modal, setModal] = useState(null); // null | "add" | { edit: room }
  const [roomName, setRoomName] = useState("");
  const [roomError, setRoomError] = useState("");
  const [saving, setSaving] = useState(false);
  const [switchingOff, setSwitchingOff] = useState(false);
  const toast = useToast();

  const setDeviceState = useCallback((mac, isOn) => {
    setDevices((list) => list.map((d) => (d.mac === mac ? { ...d, is_on: isOn } : d)));
  }, []);
  const { toggle, apply, busy } = useDeviceToggle(token, setDeviceState);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchRooms = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/rooms/consumption?home_id=${homeId}`, authHeaders);
      setRooms(res.data);
    } catch (err) {}
    setLoading(false);
  };

  const fetchDevices = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/devices?home_id=${homeId}`, authHeaders);
      setDevices(apply(res.data));
    } catch (err) {}
  };

  useEffect(() => {
    fetchRooms();
    fetchDevices();
  }, [homeId]);

  useLiveRefresh(() => { fetchRooms(); fetchDevices(); }, { topics: ["devices"], interval: 3000 });

  /** Leaving a room: everything in it off, in one request. */
  const switchRoomOff = async (room) => {
    setSwitchingOff(true);
    try {
      const res = await axios.post(`${API}/homes/${homeId}/all-off?room_id=${room.id}`, null, authHeaders);
      const switched = res.data.switched || [];
      setDevices((list) => list.map((d) => (switched.includes(d.mac) ? { ...d, is_on: false } : d)));
      toast.show(tn("allOff.done", switched.length), { tone: "success" });
      if (res.data.failed?.length) toast.show(tn("allOff.partial", res.data.failed.length), { tone: "error" });
    } catch (err) {
      toast.show(err.response?.data?.detail || t("allOff.error"), { tone: "error" });
    }
    setSwitchingOff(false);
    fetchDevices();
  };

  const closeModal = () => {
    setModal(null);
    setRoomName("");
    setRoomError("");
  };

  const openAdd = () => {
    setRoomName("");
    setRoomError("");
    setModal("add");
  };

  const openEdit = (room) => {
    setRoomName(room.name);
    setRoomError("");
    setModal({ edit: room });
  };

  const submitRoom = async () => {
    const trimmed = roomName.trim();
    if (!trimmed) {
      setRoomError(t("rooms.errNameRequired"));
      return;
    }
    const duplicate = rooms.some((r) =>
      r.name.toLowerCase() === trimmed.toLowerCase() &&
      !(modal !== "add" && r.id === modal.edit.id)
    );
    if (duplicate) {
      setRoomError(t("onb.errRoomExists", { name: trimmed }));
      return;
    }
    setSaving(true);
    setRoomError("");
    try {
      if (modal === "add") {
        await axios.post(`${API}/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`, null, authHeaders);
      } else {
        await axios.put(`${API}/rooms/${modal.edit.id}?name=${encodeURIComponent(trimmed)}`, null, authHeaders);
      }
      await fetchRooms();
      closeModal();
    } catch (err) {
      setRoomError(err.response?.data?.detail || t("rooms.errSave"));
    }
    setSaving(false);
  };

  const deleteRoom = async (room) => {
    if (room.device_count > 0) {
      window.alert(t("rooms.errNotEmpty", { name: room.name, devices: tn("count.device", room.device_count) }));
      return;
    }
    if (!window.confirm(t("rooms.confirmDelete", { name: room.name }))) return;
    try {
      await axios.delete(`${API}/rooms/${room.id}`, authHeaders);
      fetchRooms();
    } catch (err) {
      window.alert(err.response?.data?.detail || t("rooms.errDelete"));
    }
  };

  if (selectedRoomId) {
    const room = rooms.find((r) => r.id === selectedRoomId);
    const roomDevices = devices.filter((d) => d.room_id === selectedRoomId);
    const roomKw = (room?.watts ?? roomDevices.reduce((sum, d) => sum + (d.watts || 0), 0)) / 1000;
    return (
      <div className="max-w-5xl mx-auto py-lg space-y-md">
        <button type="button" onClick={() => setSelectedRoomId(null)} className="btn-glass px-4 py-2">
          <Icon name="arrow_back" style={{ fontSize: "18px" }} />
          {t("rooms.backToRooms").replace(/^‹\s*/, "")}
        </button>

        <div className="flex items-center gap-4">
          <span className="icon-orb w-14 h-14">
            <Icon name="meeting_room" style={{ fontSize: "28px" }} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{room?.name || t("rooms.fallbackName")}</h1>
            <p className="text-on-surface-variant">
              {tn("count.device", roomDevices.length)}
            </p>
          </div>
          {room && roomDevices.some((d) => d.is_on) && (
            <button type="button" className="btn-glass py-2" onClick={() => switchRoomOff(room)} disabled={switchingOff}>
              <Icon name="power_settings_new" style={{ fontSize: "18px" }} />
              {switchingOff ? t("allOff.working") : t("allOff.room")}
            </button>
          )}
        </div>

        <div className="glass-dark rounded-2xl p-md relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-secondary-fixed/25 rounded-full blur-2xl" />
          <p className="font-data-label text-data-label uppercase text-primary-fixed-dim relative">
            {t("rooms.roomConsumption")}
          </p>
          <p className="font-display-metrics text-display-metrics mt-2 relative">
            {roomKw.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="font-body-lg text-body-lg text-primary-fixed-dim">kW</span>
          </p>
        </div>

        <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-outline pt-2">
          {t("rooms.devicesInRoom")}
        </h2>
        {roomDevices.length === 0 ? (
          <div className="glass rounded-2xl p-lg text-center text-on-surface-variant">
            {t("rooms.noDevicesInRoom")}
          </div>
        ) : (
          <div className="space-y-sm">
            {roomDevices.map((d) => (
              <div key={d.mac} className="glass rounded-2xl p-4 flex items-center gap-4">
                <span className={"icon-orb " + (d.is_on ? "" : "text-outline shadow-none")}>
                  <Icon name={deviceIcon(d.name, d.type)} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-body-md text-body-md font-semibold text-on-surface truncate">{d.name}</p>
                    <span className="chip chip-indigo">{d.type === "socket" ? t("devices.socket") : t("devices.appliance")}</span>
                  </div>
                  <p className={"flex items-center gap-1.5 text-[13px] mt-0.5 " + (d.status === "online" ? "text-secondary" : "text-outline")}>
                    <span className={"w-1.5 h-1.5 rounded-full " + (d.status === "online" ? "bg-secondary" : "bg-outline-variant")} />
                    {d.status === "online" ? t("devices.online") : t("devices.offline")}
                  </p>
                </div>
                <p className="font-data-label text-data-label text-on-surface whitespace-nowrap">
                  {(d.watts / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW
                </p>
                <Switch
                  checked={d.is_on}
                  disabled={busy[d.mac]}
                  onChange={() => toggle(d)}
                  label={t(d.is_on ? "devices.turnOffNamed" : "devices.turnOnNamed", { name: d.name })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-lg space-y-md">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="btn-glass px-4 py-2 mb-4">
            <Icon name="arrow_back" style={{ fontSize: "18px" }} />
            {t("rooms.backToHome").replace(/^‹\s*/, "")}
          </button>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{t("rooms.title")}</h1>
          <p className="text-on-surface-variant mt-1">{t("rooms.subtitle")}</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary px-6 py-3 self-start sm:self-auto">
          <Icon name="add" style={{ fontSize: "20px" }} />
          {t("rooms.addRoom").replace(/^\+\s*/, "")}
        </button>
      </div>

      {loading ? (
        <div role="status" aria-label={t("rooms.loading")} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-sm">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className="glass rounded-2xl p-lg text-center">
          <p className="text-on-surface-variant mb-4">{t("rooms.noRooms")}</p>
          <button type="button" onClick={openAdd} className="btn-primary">{t("rooms.addFirst")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-sm">
          {rooms.map((room) => (
            <div
              key={room.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedRoomId(room.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedRoomId(room.id);
                }
              }}
              className="glass glass-hover rounded-2xl p-5 cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="icon-orb">
                  <Icon name="meeting_room" />
                </span>
                <div className="flex gap-1 -mr-2 -mt-2">
                  <button
                    type="button"
                    className="btn-icon w-11 h-11"
                    onClick={(e) => { e.stopPropagation(); openEdit(room); }}
                    title={t("rooms.rename")}
                    aria-label={t("rooms.rename")}
                  >
                    <Icon name="edit" style={{ fontSize: "18px" }} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon w-11 h-11 hover:text-error"
                    onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}
                    title={t("rooms.delete")}
                    aria-label={t("rooms.delete")}
                  >
                    <Icon name="delete" style={{ fontSize: "18px" }} />
                  </button>
                </div>
              </div>
              <p className="font-body-lg text-body-lg font-semibold text-on-surface">{room.name}</p>
              <p className="font-headline-md text-headline-md text-secondary mt-1">
                {Number(room.kw).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="font-body-md text-body-md text-outline">kW</span>
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 pt-3 border-t border-white/70">
                {tn("count.device", room.device_count)}
              </p>
            </div>
          ))}
        </div>
      )}

      {(modal === "add" || modal?.edit) && (
        <Modal title={modal === "add" ? t("rooms.addModal") : t("rooms.renameModal")} onClose={closeModal}>
          <label className="block">
            <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("onb.roomName")}</span>
            <input
              className="glass-input font-body-md text-body-md"
              placeholder={t("onb.roomNamePh")}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitRoom()}
              autoFocus
            />
          </label>
          {roomError && <p className="text-error text-[14px] mt-2">{roomError}</p>}
          <button type="button" className="btn-primary w-full py-3 mt-md" onClick={submitRoom} disabled={saving}>
            {saving ? t("common.saving") : modal === "add" ? t("rooms.createRoom") : t("common.saveChanges")}
          </button>
        </Modal>
      )}
    </div>
  );
}
