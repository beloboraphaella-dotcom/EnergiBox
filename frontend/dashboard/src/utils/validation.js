// src/utils/validation.js
// Small helpers used by the forms of the EnergiBox web application.

export function isValidEmail(email) {
    if (typeof email !== "string") return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  }
  
  export function isValidPassword(password) {
    if (typeof password !== "string") return false;
    return password.length >= 8;
  }
  
  export function isValidRoomName(name) {
    if (typeof name !== "string") return false;
    const n = name.trim();
    return n.length >= 2 && n.length <= 40;
  }
  
  export function formatWatts(watts) {
    if (typeof watts !== "number" || Number.isNaN(watts)) return "—";
    if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
    return `${Math.round(watts)} W`;
  }
  
  export function formatEnergy(kwh) {
    if (typeof kwh !== "number" || Number.isNaN(kwh)) return "—";
    return `${kwh.toFixed(2)} kWh`;
  }
  
  export function estimateCost(kwh, tariffPerKwh = 79) {
    if (typeof kwh !== "number" || kwh < 0) return 0;
    return Math.round(kwh * tariffPerKwh);
  }
  
  export function isOverConsuming(currentWatts, baselineWatts, marginPercent = 20) {
    if (typeof currentWatts !== "number" || typeof baselineWatts !== "number") return false;
    if (baselineWatts <= 0) return false;
    return currentWatts > baselineWatts * (1 + marginPercent / 100);
  }