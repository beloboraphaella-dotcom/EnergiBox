import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { usePreferences } from "../context/PreferencesContext";

/** The colour glass needs to be glass: the web's `.app-backdrop` and
 * `.app-backdrop-hero`, drawn once in SVG behind everything else.
 *
 * `variant="hero"` is the deep teal of the sign-in, sign-up and
 * onboarding screens; the default is the light wash under the app. The
 * gradients are sized in viewBox units and stretched to the screen, so
 * the orbs keep their place on any aspect ratio. */
const PALETTES = {
  light: {
    base: ["#eef4ff", "#f3f8ff", "#eefaf7"],
    orbs: [
      { cx: "8%", cy: "10%", r: "55%", color: "#86f2e4", opacity: 0.55 },
      { cx: "95%", cy: "6%", r: "50%", color: "#bec6e0", opacity: 0.75 },
      { cx: "85%", cy: "90%", r: "60%", color: "#6bd8cb", opacity: 0.4 },
      { cx: "12%", cy: "95%", r: "45%", color: "#ffddb8", opacity: 0.55 },
    ],
  },
  hero: {
    base: ["#0f766e", "#0b4f55", "#131b2e"],
    orbs: [
      { cx: "10%", cy: "8%", r: "60%", color: "#86f2e4", opacity: 0.5 },
      { cx: "95%", cy: "15%", r: "55%", color: "#bec6e0", opacity: 0.4 },
      { cx: "80%", cy: "98%", r: "65%", color: "#ffb95f", opacity: 0.3 },
    ],
  },
};

export default function GlassBackdrop({ variant = "light" }) {
  const { reduceTransparency } = usePreferences();
  // With reduced transparency the app sits on a plain, pale surface: the
  // cards are still translucent, but over one flat colour they read as
  // solid, and text never lies over a coloured orb.
  if (reduceTransparency && variant === "light") {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#f4f6fb" }]} />;
  }
  const palette = PALETTES[variant] ?? PALETTES.light;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={palette.base[0]} />
            <Stop offset="0.5" stopColor={palette.base[1]} />
            <Stop offset="1" stopColor={palette.base[2]} />
          </LinearGradient>
          {palette.orbs.map((orb, i) => (
            <RadialGradient key={i} id={`orb${i}`} cx={orb.cx} cy={orb.cy} r={orb.r} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={orb.color} stopOpacity={orb.opacity} />
              <Stop offset="1" stopColor={orb.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#base)" />
        {palette.orbs.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#orb${i})`} />
        ))}
      </Svg>
    </View>
  );
}
