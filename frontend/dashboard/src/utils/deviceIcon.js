/** Material Symbols name for a device, picked from its name. The backend
 * only stores "appliance" or "socket", so there is nothing better to key
 * off yet. Names are matched in English and French. */
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
