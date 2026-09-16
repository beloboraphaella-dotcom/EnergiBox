import React from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { colors } from "../theme";

/** The mockups use Material Symbols, which has no React Native font.
 * @expo/vector-icons ships MaterialIcons, the previous generation of the
 * same set — the glyph names below all exist in both, so the icon a
 * screen asks for is the icon the mockup showed. A handful of Symbols
 * names were renamed between the two generations; those are remapped
 * here, and anything unknown falls back to a neutral glyph rather than
 * rendering an empty box. */
const RENAMED = {
  electric_meter: "bolt",
  water_heater: "heat-pump",
  mode_fan: "cyclone",
  water_pump: "water-drop",
  more_horiz: "more-horiz",
  trending_down: "trending-down",
  trending_up: "trending-up",
  admin_panel_settings: "admin-panel-settings",
  meeting_room: "meeting-room",
  monitoring: "insights",
  power_settings_new: "power-settings-new",
  arrow_back: "arrow-back",
  expand_more: "expand-more",
  expand_less: "expand-less",
  light_mode: "light-mode",
  dark_mode: "dark-mode",
  ac_unit: "ac-unit",
  manage_accounts: "manage-accounts",
};

export default function Icon({ name, size = 24, color = colors.onSurfaceVariant, style }) {
  const glyph = RENAMED[name] || name.replace(/_/g, "-");
  const known = Object.prototype.hasOwnProperty.call(MaterialIcons.glyphMap, glyph);
  return (
    <MaterialIcons
      name={known ? glyph : "circle"}
      size={size}
      color={color}
      style={style}
    />
  );
}
