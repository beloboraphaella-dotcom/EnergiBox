/** One-tap schedules. Cameroon's low-voltage tariff has no off-peak
 * hours (see backend/tariff.py), so the presets follow the household's
 * day rather than a price window: switch off overnight, while everyone is
 * out, or outside the evening. Kept in step with the mobile app. */
export const SCHEDULE_PRESETS = [
  { key: "night", on: "06:00", off: "22:00" },
  { key: "workday", on: "17:00", off: "08:00" },
  { key: "evening", on: "18:00", off: "23:00" },
];
