import { useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import AuthLayout, { HeroError, HeroField } from "../components/AuthLayout";

const API = "http://localhost:8000";

// Accepts colon, hyphen, dot or no separator (e.g. Windows "-", Cisco ".", raw
// hex) and normalizes to the canonical AA:BB:CC:DD:EE:FF form the EnergiBox
// firmware and MQTT topics actually use — otherwise a differently-formatted
// but valid MAC would be stored and silently never match the real device.
function normalizeMac(input) {
  const hex = input.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(":");
}

const STEPS = ["Home", "Rooms", "Appliances", "Done"];

export default function Onboarding({ token, onComplete }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [homeId, setHomeId] = useState(null);
  const [homeName, setHomeName] = useState("");
  const [homeAddress, setHomeAddress] = useState("");

  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");

  const [devices, setDevices] = useState([]);
  const [newDevice, setNewDevice] = useState({ room_id: "", name: "", type: "appliance", mac: "" });

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const createHome = async () => {
    if (!homeName.trim()) {
      setError("Give your home a name");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (homeId) {
        // Already created (user came back to this step) — update instead of duplicating
        await axios.put(
          `${API}/homes/${homeId}?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`,
          null,
          authHeaders
        );
      } else {
        const res = await axios.post(
          `${API}/homes?name=${encodeURIComponent(homeName)}${homeAddress ? `&address=${encodeURIComponent(homeAddress)}` : ""}`,
          null,
          authHeaders
        );
        setHomeId(res.data.id);
      }
      setStep(1);
    } catch (err) {
      setError("Could not create home. Try again.");
    }
    setSaving(false);
  };

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const addRoom = async () => {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    if (rooms.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A room named "${trimmed}" already exists in this home.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(
        `${API}/rooms?name=${encodeURIComponent(trimmed)}&home_id=${homeId}`,
        null,
        authHeaders
      );
      setRooms((r) => [...r, res.data]);
      setNewRoomName("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add room.");
    }
    setSaving(false);
  };

  const addDevice = async () => {
    const { room_id, name, type, mac } = newDevice;
    if (!room_id || !name.trim() || !mac.trim()) {
      setError("Room, name and MAC address are required.");
      return;
    }
    const normalizedMac = normalizeMac(mac.trim());
    if (!normalizedMac) {
      setError("Enter a valid MAC address — 12 hex digits, e.g. AA:BB:CC:DD:EE:FF.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(
        `${API}/monitored_points?room_id=${room_id}&name=${encodeURIComponent(name)}&type=${type}&mac_address=${encodeURIComponent(normalizedMac)}`,
        null,
        authHeaders
      );
      setDevices((d) => [...d, res.data]);
      setNewDevice({ room_id: "", name: "", type: "appliance", mac: "" });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add device. Check the MAC address.");
    }
    setSaving(false);
  };

  const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;

  return (
    <AuthLayout wide>
      {/* Stepper */}
      <ol className="flex items-center mb-lg">
        {STEPS.map((label, i) => (
          <li key={label} className={"flex items-center " + (i < STEPS.length - 1 ? "flex-1" : "")}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold border transition-colors " +
                  (i <= step
                    ? "bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim text-on-secondary-fixed border-white/60"
                    : "bg-white/10 text-white/60 border-white/25")
                }
              >
                {i < step ? <Icon name="check" style={{ fontSize: "18px" }} /> : i + 1}
              </span>
              <span className={"text-[12px] font-semibold " + (i <= step ? "text-white" : "text-white/55")}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={"flex-1 h-0.5 mx-2 mb-5 rounded-full " + (i < step ? "bg-secondary-fixed" : "bg-white/20")} />
            )}
          </li>
        ))}
      </ol>

      {/* STEP 0: Home */}
      {step === 0 && (
        <div className="space-y-4">
          <StepTitle title="Set up your home" hint="This is the first thing every EnergiBox account needs — you can add more homes later." />
          <HeroLabel text="Home Name">
            <HeroField icon="home" placeholder="e.g. My Home" value={homeName} onChange={(e) => setHomeName(e.target.value)} />
          </HeroLabel>
          <HeroLabel text="Address (optional)">
            <HeroField icon="location_on" placeholder="e.g. Yaoundé, Cameroun" value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} />
          </HeroLabel>
          <HeroError>{error}</HeroError>
          <button type="button" className="btn-primary w-full py-3" onClick={createHome} disabled={saving}>
            {saving ? "Creating…" : "Continue"}
          </button>
        </div>
      )}

      {/* STEP 1: Rooms */}
      {step === 1 && (
        <div className="space-y-4">
          <StepTitle title="Add your rooms" hint="Add every room you want to monitor. You need at least one to continue." />
          {rooms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <HeroChip key={r.id} icon="meeting_room">{r.name}</HeroChip>
              ))}
            </div>
          )}
          <HeroLabel text="Room Name">
            <div className="flex gap-2">
              <div className="flex-1">
                <HeroField
                  icon="meeting_room"
                  placeholder="e.g. Living Room"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRoom()}
                />
              </div>
              <button type="button" className="btn-glass px-4 bg-white/80" onClick={addRoom} disabled={saving || !newRoomName.trim()}>
                <Icon name="add" style={{ fontSize: "18px" }} /> Add
              </button>
            </div>
          </HeroLabel>
          <HeroError>{error}</HeroError>
          <StepNav onBack={goBack}>
            <button type="button" className="btn-primary flex-1 py-3" onClick={() => setStep(2)} disabled={rooms.length === 0}>
              Continue ({plural(rooms.length, "room")})
            </button>
          </StepNav>
        </div>
      )}

      {/* STEP 2: Appliances */}
      {step === 2 && (
        <div className="space-y-4">
          <StepTitle title="Add your appliances & sockets" hint="Pair each EnergiBox by its MAC address. You need at least one device to finish setup." />
          {devices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {devices.map((d) => (
                <HeroChip key={d.id} icon={d.type === "socket" ? "power" : "kitchen"}>{d.name}</HeroChip>
              ))}
            </div>
          )}
          <HeroLabel text="Room">
            <select
              className="glass-input-hero [&>option]:text-on-surface"
              value={newDevice.room_id}
              onChange={(e) => setNewDevice({ ...newDevice, room_id: e.target.value })}
            >
              <option value="">Select a room...</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </HeroLabel>
          <HeroLabel text="Name">
            <HeroField icon="label" placeholder="e.g. Fridge" value={newDevice.name} onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })} />
          </HeroLabel>
          <HeroLabel text="Type">
            <div className="grid grid-cols-2 gap-2">
              {["appliance", "socket"].map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={newDevice.type === type}
                  onClick={() => setNewDevice({ ...newDevice, type })}
                  className={
                    "flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold text-[14px] border transition-colors " +
                    (newDevice.type === type
                      ? "bg-white/90 text-secondary border-white"
                      : "bg-white/10 text-white/80 border-white/25 hover:bg-white/20")
                  }
                >
                  <Icon name={type === "socket" ? "power" : "kitchen"} style={{ fontSize: "18px" }} />
                  {type === "appliance" ? "Appliance" : "Socket"}
                </button>
              ))}
            </div>
          </HeroLabel>
          <HeroLabel text="EnergiBox MAC Address">
            <HeroField
              icon="router"
              placeholder="AA:BB:CC:DD:EE:FF"
              className="glass-input-hero pl-11 pr-11 font-data-label tracking-wider"
              value={newDevice.mac}
              onChange={(e) => setNewDevice({ ...newDevice, mac: e.target.value.toUpperCase() })}
            />
          </HeroLabel>
          <HeroError>{error}</HeroError>
          <button type="button" className="btn-glass w-full py-3 bg-white/80" onClick={addDevice} disabled={saving}>
            <Icon name="add_link" style={{ fontSize: "18px" }} /> Pair this device
          </button>
          <StepNav onBack={goBack}>
            <button type="button" className="btn-primary flex-1 py-3" onClick={() => setStep(3)} disabled={devices.length === 0}>
              Finish ({plural(devices.length, "device")})
            </button>
          </StepNav>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 3 && (
        <div className="text-center space-y-4">
          <span className="icon-orb w-16 h-16 mx-auto bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim text-on-secondary-fixed">
            <Icon name="celebration" style={{ fontSize: "32px" }} />
          </span>
          <StepTitle
            title="You're all set!"
            hint={`${homeName} is ready with ${plural(rooms.length, "room")} and ${plural(devices.length, "device")}.`}
          />
          <button type="button" className="btn-primary w-full py-3" onClick={onComplete}>
            Go to Dashboard
          </button>
        </div>
      )}
    </AuthLayout>
  );
}

function StepTitle({ title, hint }) {
  return (
    <div>
      <h2 className="font-headline-md text-[22px] leading-7 font-semibold text-white">{title}</h2>
      <p className="text-white/75 mt-1 text-[15px] leading-6">{hint}</p>
    </div>
  );
}

function HeroLabel({ text, children }) {
  return (
    <label className="block">
      <span className="block mb-1.5 font-label-sm text-label-sm text-white/80 uppercase tracking-wider">{text}</span>
      {children}
    </label>
  );
}

function HeroChip({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/30 px-3 py-1 text-[13px] font-semibold text-white">
      <Icon name={icon} style={{ fontSize: "16px" }} />
      {children}
    </span>
  );
}

function StepNav({ onBack, children }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="button" className="btn-glass px-4 py-3 bg-white/15 text-white border-white/30 hover:bg-white/25" onClick={onBack}>
        <Icon name="arrow_back" style={{ fontSize: "18px" }} /> Back
      </button>
      {children}
    </div>
  );
}
