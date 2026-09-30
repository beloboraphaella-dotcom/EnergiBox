import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../context/LanguageContext";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import { deviceIcon } from "../utils/deviceIcon";

const API = "http://localhost:8000";
export default function Rooms({ token, homeId, onBack }) {
  const { t } = useLanguage();
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [modal, setModal] = useState(null); // null | "add" | { edit: room }
  const [roomName, setRoomName] = useState("");
  const [roomError, setRoomError] = useState("");
  const [saving, setSaving] = useState(false);

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
      setDevices(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchRooms();
    fetchDevices();
    const interval = setInterval(() => { fetchRooms(); fetchDevices(); }, 3000);
    return () => clearInterval(interval);
  }, [homeId]);

  const toggleDevice = async (e, d) => {
    e.stopPropagation();
    try {
      await axios.post(`${API}/control/${d.mac}?command=${d.is_on ? "OFF" : "ON"}`, null, authHeaders);
      setTimeout(fetchDevices, 500);
    } catch (err) {}
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
      setRoomError("Room name is required.");
      return;
    }
    const duplicate = rooms.some((r) =>
      r.name.toLowerCase() === trimmed.toLowerCase() &&
      !(modal !== "add" && r.id === modal.edit.id)
    );
    if (duplicate) {
      setRoomError(`A room named "${trimmed}" already exists in this home.`);
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
      setRoomError(err.response?.data?.detail || "Could not save room. Try again.");
    }
    setSaving(false);
  };

  const deleteRoom = async (room) => {
    if (room.device_count > 0) {
      window.alert(
        `"${room.name}" has ${room.device_count} device${room.device_count !== 1 ? "s" : ""} in it. ` +
        `Move or delete ${room.device_count !== 1 ? "them" : "it"} from the Devices tab before deleting this room.`
      );
      return;
    }
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/rooms/${room.id}`, authHeaders);
      fetchRooms();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Could not delete room.");
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
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{room?.name || "Room"}</h1>
            <p className="text-on-surface-variant">
              {roomDevices.length} device{roomDevices.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="glass-dark rounded-2xl p-md relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-secondary-fixed/25 rounded-full blur-2xl" />
          <p className="font-data-label text-data-label uppercase text-primary-fixed-dim relative">
            {t("rooms.roomConsumption")}
          </p>
          <p className="font-display-metrics text-display-metrics mt-2 relative">
            {roomKw.toFixed(2)}{" "}
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
                    <span className="chip chip-indigo">{d.type === "socket" ? "Socket" : "Appliance"}</span>
                  </div>
                  <p className={"flex items-center gap-1.5 text-[13px] mt-0.5 " + (d.status === "online" ? "text-secondary" : "text-outline")}>
                    <span className={"w-1.5 h-1.5 rounded-full " + (d.status === "online" ? "bg-secondary" : "bg-outline-variant")} />
                    {d.status === "online" ? t("devices.online") : t("devices.offline")}
                  </p>
                </div>
                <p className="font-data-label text-data-label text-on-surface whitespace-nowrap">
                  {(d.watts / 1000).toFixed(2)} kW
                </p>
                <button
                  type="button"
                  onClick={(e) => toggleDevice(e, d)}
                  title={d.is_on ? "Turn off" : "Turn on"}
                  aria-pressed={d.is_on}
                  className={"chip cursor-pointer " + (d.is_on ? "chip-teal" : "chip-red")}
                >
                  <Icon name="power_settings_new" style={{ fontSize: "14px" }} />
                  {d.is_on ? "On" : "Off"}
                </button>
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
        <div className="glass rounded-2xl p-lg text-center text-on-surface-variant">{t("rooms.loading")}</div>
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
              onKeyDown={(e) => e.key === "Enter" && setSelectedRoomId(room.id)}
              className="glass glass-hover rounded-2xl p-5 cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="icon-orb">
                  <Icon name="meeting_room" />
                </span>
                <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="btn-icon w-8 h-8"
                    onClick={(e) => { e.stopPropagation(); openEdit(room); }}
                    title="Rename room"
                    aria-label="Rename room"
                  >
                    <Icon name="edit" style={{ fontSize: "18px" }} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon w-8 h-8 hover:text-error"
                    onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}
                    title="Delete room"
                    aria-label="Delete room"
                  >
                    <Icon name="delete" style={{ fontSize: "18px" }} />
                  </button>
                </div>
              </div>
              <p className="font-body-lg text-body-lg font-semibold text-on-surface">{room.name}</p>
              <p className="font-headline-md text-headline-md text-secondary mt-1">
                {room.kw} <span className="font-body-md text-body-md text-outline">kW</span>
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 pt-3 border-t border-white/70">
                {room.device_count} Device{room.device_count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {(modal === "add" || modal?.edit) && (
        <Modal title={modal === "add" ? "Add Room" : "Rename Room"} onClose={closeModal}>
          <label className="block">
            <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">Room Name</span>
            <input
              className="glass-input font-body-md text-body-md"
              placeholder="e.g. Living Room"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitRoom()}
              autoFocus
            />
          </label>
          {roomError && <p className="text-error text-[14px] mt-2">{roomError}</p>}
          <button type="button" className="btn-primary w-full py-3 mt-md" onClick={submitRoom} disabled={saving}>
            {saving ? "Saving..." : modal === "add" ? "Create Room" : "Save Changes"}
          </button>
        </Modal>
      )}
    </div>
  );
}
