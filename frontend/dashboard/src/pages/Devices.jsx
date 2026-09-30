import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../context/LanguageContext";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import { deviceIcon } from "../utils/deviceIcon";

const API = "http://localhost:8000";

// Accepts colon, hyphen, dot or no separator and normalizes to the canonical
// AA:BB:CC:DD:EE:FF form the EnergiBox firmware and MQTT topics actually use —
// otherwise a differently-formatted but valid MAC would be stored and
// silently never match the real device.
function normalizeMac(input) {
  const hex = input.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(":");
}

/** Material Symbols glyph for a device, from its name. The backend only
 * stores "appliance" or "socket", so the name is the only signal. Kept in
 * step with the same helper on the dashboard and in the mobile app. */

export default function Devices({ token, homeId }) {
  const { t, language } = useLanguage();
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedMac, setSelectedMac] = useState(null);
  const [controlling, setControlling] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [togglingMacs, setTogglingMacs] = useState({});

  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });
  const [deviceError, setDeviceError] = useState("");
  const [saving, setSaving] = useState(false);

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDevices = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/devices?home_id=${homeId}`, authHeaders);
      setDevices(res.data);
    } catch (err) {
      // Left alone deliberately: a failed poll keeps the last good list on
      // screen instead of blanking it.
    }
  };

  const fetchRooms = async () => {
    if (!homeId) return;
    try {
      const res = await axios.get(`${API}/rooms?home_id=${homeId}`, authHeaders);
      setRooms(res.data);
    } catch (err) {
      // Same reasoning as fetchDevices.
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, [homeId]);

  const toggleDevice = async (e, d) => {
    e.stopPropagation();
    if (togglingMacs[d.mac]) return;
    const nextIsOn = !d.is_on;
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: true }));
    try {
      await axios.post(`${API}/control/${d.mac}?command=${nextIsOn ? "ON" : "OFF"}`, null, authHeaders);
      setDevices((prev) => prev.map((x) => (x.mac === d.mac ? { ...x, is_on: nextIsOn } : x)));
      setTimeout(fetchDevices, 500);
    } catch (err) {
      // The command did not reach the relay, so leave the switch as it was
      // rather than showing a state the device never entered.
    }
    setTogglingMacs((prev) => ({ ...prev, [d.mac]: false }));
  };

  const closeModals = () => {
    setActiveModal(null);
    setDeviceError("");
    setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
  };

  const submitNewDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setDeviceError(t("devices.errRequired"));
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setDeviceError(t("devices.errMac"));
      return;
    }
    setSaving(true);
    setDeviceError("");
    try {
      await axios.post(
        `${API}/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}&type=${type}&mac_address=${encodeURIComponent(normalizedMac)}`,
        null, authHeaders
      );
      await fetchDevices();
      closeModals();
    } catch (err) {
      setDeviceError(err.response?.data?.detail || t("devices.errAdd"));
    }
    setSaving(false);
  };

  if (selectedMac && controlling) {
    return (
      <DeviceControl
        mac={selectedMac}
        token={token}
        onBack={() => setControlling(false)}
      />
    );
  }

  if (selectedMac) {
    return (
      <DeviceDetail
        mac={selectedMac}
        rooms={rooms}
        token={token}
        homeId={homeId}
        onBack={() => { setSelectedMac(null); setControlling(false); fetchDevices(); }}
        onOpenControl={() => setControlling(true)}
      />
    );
  }

  // The mockup filters by room, not by connectivity.
  const filtered = filter === "all" ? devices : devices.filter((d) => d.room_id === filter);
  const activeCount = devices.filter((d) => d.is_on).length;
  const totalWatts = devices.reduce((sum, d) => sum + (d.watts || 0), 0);
  const totalKw = totalWatts / 1000;

  return (
    <div className="max-w-7xl mx-auto py-lg">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-lg gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background md:hidden mb-1">
            {t("devices.title")}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t("devices.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveModal("device")}
          className="btn-primary px-6 py-3"
        >
          <Icon name="add" style={{ fontSize: "20px" }} />
          {t("devices.addBox")}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-lg">
        <div className="glass rounded-2xl p-4 flex flex-col">
          <span className="font-label-sm text-label-sm text-on-surface-variant mb-1">
            {t("devices.total")}
          </span>
          <span className="font-headline-md text-headline-md text-on-background">
            {devices.length}
          </span>
        </div>
        <div className="glass rounded-2xl p-4 flex flex-col">
          <span className="font-label-sm text-label-sm text-on-surface-variant mb-1">
            {t("devices.activeNow")}
          </span>
          <span className="font-headline-md text-headline-md text-[#0D9488]">{activeCount}</span>
        </div>
        <div className="glass-subtle rounded-2xl p-4 flex flex-col col-span-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant mb-1">
            {t("devices.totalDraw")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-headline-lg text-on-background">
              {totalKw.toLocaleString(locale, { maximumFractionDigits: 1 })}
            </span>
            <span className="font-data-label text-data-label text-on-surface-variant">kW</span>
          </div>
        </div>
      </div>

      {/* Room filters */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar">
        {[{ id: "all", name: t("devices.allRooms") }, ...rooms.map((r) => ({ id: r.id, name: r.name }))].map(
          (room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setFilter(room.id)}
              className={
                "px-4 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap transition-colors " +
                (filter === room.id
                  ? "bg-white/85 text-secondary border border-white shadow-[0_4px_12px_-6px_rgba(0,106,97,0.45)]"
                  : "glass-subtle text-on-surface-variant hover:bg-white/70")
              }
            >
              {room.name}
            </button>
          )
        )}
      </div>

      {/* Device grid */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-md text-center text-on-surface-variant">
          {devices.length === 0 ? t("devices.empty") : t("devices.emptyRoom")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-sm">
          {filtered.map((d) => {
            const isOn = d.is_on;
            return (
              <div
                key={d.id}
                onClick={() => setSelectedMac(d.mac)}
                className={
                  "glass rounded-2xl p-5 hover:shadow-[0_4px_12px_rgba(0,106,97,0.05)] transition-shadow group relative cursor-pointer " +
                  (isOn ? "" : "opacity-75")
                }
              >
                <div className="flex justify-between items-start mb-4">
                  <div
                    className={
                      "w-10 h-10 rounded-full flex items-center justify-center " +
                      (isOn
                        ? "bg-white/75 text-secondary border border-white shadow-[0_4px_12px_-6px_rgba(0,106,97,0.35)]"
                        : "bg-white/40 text-outline border border-white/70")
                    }
                  >
                    <Icon name={deviceIcon(d.name, d.type)} />
                  </div>

                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={(e) => toggleDevice(e, d)}
                    disabled={togglingMacs[d.mac]}
                    aria-label={isOn ? t("devices.turnOff") : t("devices.turnOn")}
                    aria-pressed={isOn}
                    className="relative inline-block w-10 h-5 shrink-0 disabled:opacity-50"
                  >
                    <span
                      className={
                        "block h-5 w-10 rounded-full transition-colors duration-300 " +
                        (isOn ? "bg-secondary" : "bg-outline-variant")
                      }
                    />
                    <span
                      className={
                        "absolute top-0 w-5 h-5 rounded-full bg-white border-4 transition-all duration-300 " +
                        (isOn ? "right-0 border-secondary" : "left-0 border-outline-variant")
                      }
                    />
                  </button>
                </div>

                <div className="mb-4">
                  <h3
                    className={
                      "font-body-lg text-body-lg font-semibold truncate " +
                      (isOn ? "text-on-background" : "text-on-surface-variant")
                    }
                  >
                    {d.name}
                  </h3>
                  <p
                    className={
                      "font-label-sm text-label-sm flex items-center gap-1 " +
                      (isOn ? "text-on-surface-variant" : "text-outline")
                    }
                  >
                    <span
                      className={
                        "w-2 h-2 rounded-full " +
                        (d.status === "online" ? "bg-[#0D9488]" : "bg-outline-variant")
                      }
                    />
                    {d.room}
                  </p>
                </div>

                <div className="flex justify-between items-end mt-auto pt-4 border-t border-white/70">
                  <div>
                    <p
                      className={
                        "font-label-sm text-label-sm " +
                        (isOn ? "text-on-surface-variant" : "text-outline")
                      }
                    >
                      {t("devices.currentDraw")}
                    </p>
                    <p
                      className={
                        "font-data-label text-data-label " +
                        (isOn ? "text-[#0D9488]" : "text-on-surface-variant")
                      }
                    >
                      {Math.round(d.watts || 0)} W
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedMac(d.mac); }}
                    aria-label={t("devices.edit")}
                    className="p-1.5 rounded text-outline hover:text-on-surface hover:bg-white/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="edit" style={{ fontSize: "18px" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add device */}
      {activeModal === "device" && (
        <Modal title={t("devices.addBox")} onClose={closeModals}>
          <div className="space-y-4">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.room")}
              </label>
              <select
                value={newDevice.room_id}
                onChange={(e) => setNewDevice({ ...newDevice, room_id: e.target.value })}
                className="glass-input font-body-md text-body-md"
              >
                <option value="">{t("devices.selectRoom")}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.name")}
              </label>
              <input
                value={newDevice.name}
                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                placeholder={t("devices.namePlaceholder")}
                className="glass-input font-body-md text-body-md"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.type")}
              </label>
              <select
                value={newDevice.type}
                onChange={(e) => setNewDevice({ ...newDevice, type: e.target.value })}
                className="glass-input font-body-md text-body-md"
              >
                <option value="appliance">{t("devices.appliance")}</option>
                <option value="socket">{t("devices.socket")}</option>
              </select>
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.mac")}
              </label>
              <input
                value={newDevice.mac}
                onChange={(e) => setNewDevice({ ...newDevice, mac: e.target.value })}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="glass-input font-data-label text-data-label"
              />
            </div>

            {deviceError && (
              <p className="font-label-sm text-label-sm text-error">{deviceError}</p>
            )}

            <button
              type="button"
              onClick={submitNewDevice}
              disabled={saving}
              className="btn-primary w-full py-3 disabled:opacity-60"
            >
              {saving ? t("devices.adding") : t("devices.addBox")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Device detail, from the "Refrigerator Details" mockup.
 *
 * The mockup is marked class="dark", but the design system has no dark
 * values — every `dark:` token in it resolves to a light colour (for
 * instance dark:bg-surface-container-lowest is #ffffff). Rendering it as
 * drawn would put pale blue text on white. The light palette is the real
 * design, so that is what this reproduces.
 *
 * Two of its cards describe data the platform does not collect. The
 * mockup's "Efficiency Status" compares against similar models, which
 * needs a fleet baseline nobody gathers, and "Door Alert History" needs a
 * door sensor the hardware does not have. That slot shows this device's
 * actual alerts instead — spikes, extended runtime and idle waste, which
 * the alert engine really produces. */
function DeviceDetail({ mac, rooms, token, homeId, onBack, onOpenControl }) {
  const { t, language } = useLanguage();
  const [device, setDevice] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState("24h");
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", type: "appliance", room_id: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDevice = async () => {
    try {
      const res = await axios.get(`${API}/devices/${mac}`, authHeaders);
      setDevice(res.data);
    } catch (err) {
      setError(t("detail.loadError"));
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/devices/${mac}/history?range=${range}`, authHeaders);
      setHistory(res.data);
    } catch (err) {
      // The chart degrades to its empty state; the rest of the page stays.
    }
  };

  useEffect(() => {
    fetchDevice();
    const interval = setInterval(fetchDevice, 3000);
    return () => clearInterval(interval);
  }, [mac]);

  useEffect(() => { fetchHistory(); }, [mac, range]);

  useEffect(() => {
    if (device && !editing) {
      setEdit({ name: device.name, type: device.type, room_id: device.room_id });
    }
  }, [device?.id]);

  const togglePower = async () => {
    if (!device || toggling) return;
    const nextIsOn = !device.is_on;
    setToggling(true);
    setError("");
    try {
      await axios.post(`${API}/control/${mac}?command=${nextIsOn ? "ON" : "OFF"}`, null, authHeaders);
      setDevice((prev) => ({ ...prev, is_on: nextIsOn }));
      setTimeout(fetchDevice, 500);
    } catch (err) {
      setError(err.response?.data?.detail || t("detail.toggleError"));
    }
    setToggling(false);
  };

  const saveEdit = async () => {
    setError("");
    try {
      await axios.put(
        `${API}/monitored_points/${device.id}?name=${encodeURIComponent(edit.name)}&type=${edit.type}&room_id=${edit.room_id}`,
        null, authHeaders
      );
      setEditing(false);
      await fetchDevice();
    } catch (err) {
      setError(err.response?.data?.detail || t("detail.saveError"));
    }
  };

  const deleteDevice = async () => {
    try {
      await axios.delete(`${API}/monitored_points/${device.id}`, authHeaders);
      onBack();
    } catch (err) {
      setError(err.response?.data?.detail || t("detail.deleteError"));
    }
  };

  if (!device) {
    return (
      <div className="max-w-7xl mx-auto py-lg">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mb-lg hover:text-on-surface transition-colors"
        >
          <Icon name="arrow_back" style={{ fontSize: "18px" }} />
          {t("detail.back")}
        </button>
        <p className="text-on-surface-variant">{error || t("detail.loading")}</p>
      </div>
    );
  }

  const isOn = device.is_on;
  const cost = history?.cost;
  const alerts = device.recent_alerts ?? [];

  return (
    <div className="max-w-7xl mx-auto py-lg space-y-lg">
      {/* Task header */}
      <div className="flex items-center justify-between gap-sm flex-wrap">
        <div className="flex items-center gap-sm min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("detail.back")}
            className="p-2 rounded-full hover:bg-white/60 transition-colors text-on-surface-variant"
          >
            <Icon name="arrow_back" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Icon name={deviceIcon(device.name, device.type)} className="text-secondary" />
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface truncate">
              {device.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {isOn ? t("detail.active") : t("detail.standby")}
          </span>
          <button
            type="button"
            onClick={togglePower}
            disabled={toggling}
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? t("devices.turnOff") : t("devices.turnOn")}
            className="relative inline-block w-12 h-6 shrink-0 disabled:opacity-50"
          >
            <span
              className={
                "block h-6 w-12 rounded-full transition-colors duration-300 " +
                (isOn ? "bg-secondary" : "bg-outline-variant")
              }
            />
            <span
              className={
                "absolute top-0 w-6 h-6 rounded-full bg-white border-4 transition-all duration-300 " +
                (isOn ? "right-0 border-secondary" : "left-0 border-surface-tint")
              }
            />
          </button>
          <button
            type="button"
            onClick={() => onOpenControl?.()}
            aria-label={t("control.open")}
            title={t("control.open")}
            className="p-2 rounded-full text-on-surface-variant hover:bg-white/60 transition-colors"
          >
            <Icon name="power_settings_new" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t("devices.edit")}
            className="p-2 rounded-full text-on-surface-variant hover:bg-white/60 transition-colors"
          >
            <Icon name="edit" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-error-container/40 border border-error-container rounded-lg p-sm flex items-start gap-3">
          <Icon name="error" className="text-on-error-container" style={{ fontSize: "20px" }} />
          <p className="font-label-sm text-label-sm text-on-error-container">{error}</p>
        </div>
      )}

      {/* Bento: current draw + cost */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-md">
        <div className="col-span-1 md:col-span-5 glass rounded-2xl p-md flex flex-col justify-between min-h-[200px]">
          <div className="flex justify-between items-start">
            <h2 className="font-body-lg text-body-lg text-on-surface-variant">
              {t("detail.currentDraw")}
            </h2>
            <Icon name="bolt" fill className="text-secondary" />
          </div>
          <div className="flex items-end gap-2 mt-auto">
            <span className="font-display-metrics text-display-metrics text-on-surface">
              {Math.round(device.watts || 0)}
            </span>
            <span className="font-data-label text-data-label text-secondary mb-2">W</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span
              className={
                "w-2 h-2 rounded-full " + (isOn ? "bg-secondary pulse-dot" : "bg-outline")
              }
            />
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {device.status !== "online"
                ? t("detail.offline")
                : isOn
                  ? t("detail.running")
                  : t("detail.idle")}
            </p>
          </div>
        </div>

        <div className="col-span-1 md:col-span-7 glass-dark rounded-2xl p-md flex flex-col justify-between min-h-[200px] relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-secondary-fixed/20 rounded-full blur-2xl" />
          <div className="relative z-10">
            <h2 className="font-body-lg text-body-lg text-primary-fixed-dim">
              {t("detail.monthlyCost")}
            </h2>
            <div className="flex items-end gap-2 mt-sm">
              <span className="font-display-metrics text-display-metrics text-inverse-on-surface">
                {(cost?.estimated_fcfa ?? 0).toLocaleString(locale)}
              </span>
              <span className="font-data-label text-data-label text-secondary-fixed mb-2">FCFA</span>
            </div>
            <div className="mt-lg grid grid-cols-2 gap-sm">
              <div className="border-l-2 border-secondary/30 pl-sm">
                <p className="font-label-sm text-label-sm text-primary-fixed-dim">
                  {t("detail.dailyAvg")}
                </p>
                <p className="font-body-md text-body-md text-inverse-on-surface mt-base">
                  {(cost?.daily_avg_fcfa ?? 0).toLocaleString(locale)} FCFA
                </p>
              </div>
              <div className="border-l-2 border-secondary/30 pl-sm">
                <p className="font-label-sm text-label-sm text-primary-fixed-dim">
                  {t("detail.projectedUsage")}
                </p>
                <p className="font-body-md text-body-md text-inverse-on-surface mt-base">
                  {(cost?.projected_kwh ?? 0).toLocaleString(locale)} kWh
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="glass rounded-2xl p-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-lg gap-sm">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
            {t("detail.history")}
          </h2>
          <div className="segmented">
            {["24h", "7d", "30d"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={
                  "px-4 py-1 rounded font-label-sm text-label-sm transition-colors " +
                  (range === r
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant hover:text-on-surface")
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <HistoryBars history={history} />
      </div>

      {/* This device's alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {alerts.length === 0 ? (
          <div className="glass rounded-2xl p-md flex items-center gap-md md:col-span-2">
            <div className="icon-orb w-12 h-12">
              <Icon name="check_circle" />
            </div>
            <div>
              <h3 className="font-body-md text-body-md text-on-surface">
                {t("detail.noAlerts")}
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                {t("detail.noAlertsHint")}
              </p>
            </div>
          </div>
        ) : (
          alerts.map((a, i) => (
            <div key={i} className="glass rounded-2xl p-md flex items-center gap-md">
              <div
                className={
                  "w-12 h-12 rounded-full flex items-center justify-center shrink-0 " +
                  (a.type === "spike"
                    ? "bg-error-container/70 text-error border border-white/70"
                    : "bg-white/65 text-secondary border border-white/80")
                }
              >
                <Icon name={ALERT_ICONS[a.type] || "notifications"} />
              </div>
              <div className="min-w-0">
                <h3 className="font-body-md text-body-md text-on-surface">
                  {t(`detail.alert.${a.type}`)}
                </h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                  {a.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Danger zone */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn-danger"
        >
          <Icon name="delete" style={{ fontSize: "18px" }} />
          {t("detail.delete")}
        </button>
      </div>

      {editing && (
        <Modal title={t("detail.editTitle")} onClose={() => setEditing(false)}>
          <div className="space-y-4">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.name")}
              </label>
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className="glass-input font-body-md text-body-md"
              />
            </div>
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.room")}
              </label>
              <select
                value={edit.room_id}
                onChange={(e) => setEdit({ ...edit, room_id: Number(e.target.value) })}
                className="glass-input font-body-md text-body-md"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant block mb-2">
                {t("devices.type")}
              </label>
              <select
                value={edit.type}
                onChange={(e) => setEdit({ ...edit, type: e.target.value })}
                className="glass-input font-body-md text-body-md"
              >
                <option value="appliance">{t("devices.appliance")}</option>
                <option value="socket">{t("devices.socket")}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={saveEdit}
              className="btn-primary w-full py-3"
            >
              {t("detail.save")}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title={t("detail.delete")} onClose={() => setConfirmDelete(false)}>
          <p className="font-body-md text-body-md text-on-surface-variant mb-md">
            {t("detail.deleteConfirm", { name: device.name })}
          </p>
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-glass flex-1 py-3"
            >
              {t("detail.cancel")}
            </button>
            <button
              type="button"
              onClick={deleteDevice}
              className="btn-primary btn-danger-solid flex-1 py-3"
            >
              {t("detail.delete")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const ALERT_ICONS = {
  spike: "warning",
  extended_runtime: "schedule",
  idle_waste: "energy_savings_leaf",
};

/** The mockup's bar chart, built with divs exactly as it is there rather
 * than in SVG, so the hover tooltip and the rounded tops come for free. */
function HistoryBars({ history }) {
  const { t } = useLanguage();
  const buckets = history?.buckets ?? [];
  const measured = buckets.filter((b) => b.watts !== null && b.watts !== undefined);
  const max = Math.max(history?.max_watts || 0, 1);

  if (measured.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-on-surface-variant font-label-sm text-label-sm">
        {t("detail.noData")}
      </div>
    );
  }

  const peak = measured.reduce((best, b) => (b.watts > best.watts ? b : best), measured[0]);
  // The mockup labels four evenly spaced ticks along the axis.
  const tickIndexes = [0, Math.floor((buckets.length - 1) / 3), Math.floor((2 * (buckets.length - 1)) / 3), buckets.length - 1];

  return (
    <>
      <div className="relative h-64 w-full flex items-end justify-between gap-1 pt-8 pb-6 border-b border-white/70">
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between font-data-label text-data-label text-on-surface-variant opacity-60 pb-6 pointer-events-none">
          <span>{Math.round(max)}W</span>
          <span>{Math.round(max / 2)}W</span>
          <span>0W</span>
        </div>

        <div className="absolute inset-0 flex flex-col justify-between pb-6 z-0 pointer-events-none border-t border-white/70">
          <div className="w-full border-b border-white/70 flex-1" />
          <div className="w-full border-b border-white/70 flex-1" />
        </div>

        <div className="w-full flex justify-between items-end h-full z-10 pl-12 pr-2 gap-[2px]">
          {buckets.map((b, i) => {
            const pct = b.watts === null ? 0 : Math.max((b.watts / max) * 100, 2);
            const isPeak = b.watts !== null && b.label === peak.label;
            return (
              <div
                key={i}
                className={
                  "w-full max-w-[40px] rounded-t-sm relative group transition-colors " +
                  (b.watts === null
                    ? "bg-outline-variant/20"
                    : isPeak
                      ? "bg-tertiary-fixed-dim/90 hover:bg-tertiary-fixed-dim"
                      : "bg-secondary/80 hover:bg-secondary")
                }
                style={{ height: `${pct}%` }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface font-label-sm text-label-sm px-2 py-1 rounded transition-opacity whitespace-nowrap pointer-events-none">
                  {b.watts === null ? "—" : `${Math.round(b.watts)}W`} · {b.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pl-12 pr-2 mt-2 font-data-label text-data-label text-on-surface-variant opacity-60">
        {tickIndexes.map((i) => (
          <span key={i}>{buckets[i]?.label ?? ""}</span>
        ))}
      </div>
    </>
  );
}


/** Full-screen remote control, from the "Contrôle à Distance" mockup.
 *
 * Reached from the device detail rather than straight from the list: the
 * detail already carries a small switch, and this screen exists for the
 * large touch target, so it sits one level deeper instead of competing
 * with the detail for the same entry point.
 *
 * The mockup lays a decorative photograph across the background at 3%
 * opacity, served from a temporary Google URL that will stop resolving.
 * Purely ornamental, so it is dropped rather than baked in as a link that
 * will break. */
function DeviceControl({ mac, token, onBack }) {
  const { t, language } = useLanguage();
  const [device, setDevice] = useState(null);
  const [history, setHistory] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState("");

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDevice = async () => {
    try {
      const res = await axios.get(`${API}/devices/${mac}`, authHeaders);
      setDevice(res.data);
    } catch (err) {
      setError(t("detail.loadError"));
    }
  };

  useEffect(() => {
    fetchDevice();
    const interval = setInterval(fetchDevice, 3000);
    return () => clearInterval(interval);
  }, [mac]);

  useEffect(() => {
    // Only feeds the draw bar's ceiling, so once per device is enough.
    axios
      .get(`${API}/devices/${mac}/history?range=24h`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setHistory(res.data))
      .catch(() => {});
  }, [mac, token]);

  const togglePower = async () => {
    if (!device || toggling) return;
    const nextIsOn = !device.is_on;
    setToggling(true);
    setError("");
    try {
      await axios.post(`${API}/control/${mac}?command=${nextIsOn ? "ON" : "OFF"}`, null, authHeaders);
      setDevice((prev) => ({ ...prev, is_on: nextIsOn }));
      setTimeout(fetchDevice, 500);
    } catch (err) {
      setError(err.response?.data?.detail || t("detail.toggleError"));
    }
    setToggling(false);
  };

  if (!device) {
    return (
      <div className="max-w-3xl mx-auto py-lg">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors"
        >
          <Icon name="arrow_back" style={{ fontSize: "18px" }} />
          {t("control.back")}
        </button>
        <p className="text-on-surface-variant mt-lg">{error || t("detail.loading")}</p>
      </div>
    );
  }

  const isOn = device.is_on;
  const watts = device.watts || 0;
  const draw = watts >= 1000
    ? { value: (watts / 1000).toFixed(1), unit: "kW" }
    : { value: Math.round(watts).toString(), unit: "W" };
  // The bar reads against the busiest this device has been in 24h, the
  // only ceiling the data actually supplies.
  const ceiling = Math.max(history?.max_watts || 0, watts, 1);
  const drawPct = Math.min((watts / ceiling) * 100, 100);

  const totalMinutes = Math.round((device.runtime?.today_hours ?? 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <div className="max-w-3xl mx-auto py-lg flex flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-sm flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors self-start"
      >
        <Icon name="arrow_back" style={{ fontSize: "18px" }} />
        {t("control.back")}
      </button>

      {/* Main control card */}
      <section className="glass rounded-3xl p-md md:p-lg flex flex-col items-center justify-center relative overflow-hidden mb-lg">
        <div
          className={
            "absolute w-96 h-96 blur-[100px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500 z-0 pointer-events-none " +
            (isOn ? "bg-secondary/10" : "bg-surface-variant/20")
          }
        />

        <div className="z-10 text-center mb-xl">
          <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold mb-2">
            {device.name}
          </h2>
          <div className="flex items-center justify-center gap-2">
            <Icon
              name="power"
              fill
              className={isOn ? "text-secondary" : "text-on-surface-variant"}
            />
            <p className="font-body-lg text-body-lg text-on-surface-variant font-medium">
              {device.status !== "online"
                ? t("control.deviceOffline")
                : isOn
                  ? t("control.deviceOn")
                  : t("control.deviceOff")}
            </p>
          </div>
        </div>

        <div className="z-10 mb-xl">
          <button
            type="button"
            onClick={togglePower}
            disabled={toggling}
            aria-label={t("control.togglePower")}
            aria-pressed={isOn}
            className={
              "relative w-48 h-24 rounded-full toggle-bg p-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-secondary/30 shadow-inner flex items-center disabled:opacity-60 " +
              (isOn ? "bg-secondary glow-active" : "bg-surface-variant")
            }
          >
            <div
              className={
                "toggle-knob w-20 h-20 bg-white rounded-full shadow-md flex items-center justify-center transform " +
                (isOn ? "translate-x-24" : "translate-x-0")
              }
            >
              <Icon
                name="power_settings_new"
                className={
                  "text-4xl font-bold transition-colors duration-300 " +
                  (isOn ? "text-secondary" : "text-on-surface-variant")
                }
              />
            </div>
          </button>
        </div>

        <div className="z-10 bg-error-container/30 border border-error-container/50 rounded-lg p-sm flex items-start gap-3 w-full max-w-md">
          <Icon name="info" className="text-on-error-container mt-0.5" />
          <p className="font-label-sm text-label-sm text-on-error-container leading-relaxed">
            {error || t("control.safetyNote")}
          </p>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-sm md:gap-md">
        <div className="glass rounded-2xl p-md">
          <div className="flex items-center gap-2 mb-sm text-on-surface-variant">
            <Icon name="schedule" style={{ fontSize: "16px" }} />
            <h3 className="font-label-sm text-label-sm uppercase tracking-wider">
              {t("control.activeTime")}
            </h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-metrics text-display-metrics text-on-surface">{hours}</span>
            <span className="font-body-md text-body-md text-on-surface-variant font-medium">h</span>
            <span className="font-display-metrics text-display-metrics text-on-surface ml-2">
              {minutes}
            </span>
            <span className="font-body-md text-body-md text-on-surface-variant font-medium">m</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-md relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 translate-x-4 -translate-y-4 pointer-events-none">
            <Icon name="bolt" className="text-9xl" />
          </div>
          <div className="flex items-center gap-2 mb-sm text-on-surface-variant relative z-10">
            <Icon name="monitoring" style={{ fontSize: "16px" }} />
            <h3 className="font-label-sm text-label-sm uppercase tracking-wider">
              {t("control.currentUsage")}
            </h3>
          </div>
          <div className="flex items-baseline gap-2 relative z-10">
            <span
              className={
                "font-display-metrics text-display-metrics " +
                (isOn ? "text-secondary" : "text-on-surface-variant")
              }
            >
              {draw.value}
            </span>
            <span
              className={
                "font-body-md text-body-md font-medium " +
                (isOn ? "text-secondary" : "text-on-surface-variant")
              }
            >
              {draw.unit}
            </span>
          </div>
          <div className="mt-2 relative z-10">
            <div className="w-full bg-surface-variant h-1.5 rounded-full overflow-hidden">
              <div
                className={
                  "h-full rounded-full transition-all duration-500 " +
                  (isOn ? "bg-secondary" : "bg-on-surface-variant")
                }
                style={{ width: `${drawPct}%` }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
