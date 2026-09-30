// Accepts colon, hyphen, dot or no separator and normalizes to the canonical
// AA:BB:CC:DD:EE:FF form the EnergiBox firmware and MQTT topics actually use —
// otherwise a differently-formatted but valid MAC would be stored and
// silently never match the real device.
export function normalizeMac(input) {
  const hex = input.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(":");
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Icon name for a device, picked from its name — the same rules as the
 * web's utils/deviceIcon.js, in English and French. Icon.js maps the few
 * Material Symbols names MaterialIcons spells differently. */
export function deviceIcon(name = "", type = "appliance") {
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
