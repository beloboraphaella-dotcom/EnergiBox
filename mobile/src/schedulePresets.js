/** One-tap schedules, identical to the web app's
 * (frontend/dashboard/src/utils/schedulePresets.js). The tariff has no
 * off-peak hours, so they follow the household's day: off overnight,
 * off while everyone is out, or on only in the evening. */
export const SCHEDULE_PRESETS = [
  { key: "night", on: "06:00", off: "22:00" },
  { key: "workday", on: "17:00", off: "08:00" },
  { key: "evening", on: "18:00", off: "23:00" },
];
