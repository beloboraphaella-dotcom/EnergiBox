import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/** The web's gradient fills (.btn-primary, .glass-dark), as a layer that
 * sits behind a surface's content: render it as the first child of a
 * view with overflow "hidden".
 *
 * SVG rather than `experimental_backgroundImage`: React Native paints
 * that on native only, and react-native-web ignores it, so the web
 * preview and the phones would disagree. */
const FILLS = {
  primary: {
    stops: [["#00897b", 1], ["#006a61", 1]],
    angle: { x1: "0", y1: "0", x2: "1", y2: "1" },
  },
  dark: {
    stops: [["#131b2e", 0.88], ["#0b4f55", 0.82]],
    angle: { x1: "0", y1: "0", x2: "0.8", y2: "1" },
    // The soft teal glow in the top-right corner of the web's dark cards.
    glow: { cx: "92%", cy: "8%", r: "45%", color: "#89f5e7", opacity: 0.22 },
  },
};

export default function GradientFill({ kind = "primary" }) {
  const fill = FILLS[kind];
  const id = `fill-${kind}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} {...fill.angle}>
            {fill.stops.map(([color, opacity], i) => (
              <Stop key={i} offset={i / (fill.stops.length - 1)} stopColor={color} stopOpacity={opacity} />
            ))}
          </LinearGradient>
          {fill.glow && (
            <RadialGradient id={`${id}-glow`} cx={fill.glow.cx} cy={fill.glow.cy} r={fill.glow.r} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={fill.glow.color} stopOpacity={fill.glow.opacity} />
              <Stop offset="1" stopColor={fill.glow.color} stopOpacity={0} />
            </RadialGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        {fill.glow && <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-glow)`} />}
      </Svg>
    </View>
  );
}
