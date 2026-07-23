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
