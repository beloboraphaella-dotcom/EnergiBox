import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../theme";

/** An on/off switch. The track is drawn small, as in the mockups, but the
 * touch area around it is at least 48×48 dp, and screen readers hear a
 * switch with its state and the device it controls. */
export default function Switch({ value, onValueChange, label, disabled = false, size = "md" }) {
  const big = size === "lg";
  return (
    <Pressable
      onPress={() => !disabled && onValueChange?.(!value)}
      disabled={disabled}
      hitSlop={big ? 8 : 14}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      // The aria-* forms too: react-native-web reads these, not
      // accessibilityState, for a switch's checked state.
      role="switch"
      aria-checked={value}
      aria-label={label}
      style={({ pressed }) => [styles.touch, pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }]}
    >
      <View style={[big ? styles.trackLg : styles.track, { backgroundColor: value ? colors.secondary : "rgba(198, 198, 205, 0.7)" }]}>
        <View style={[big ? styles.knobLg : styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: { padding: 6 },
  track: { width: 40, height: 22, borderRadius: 11, justifyContent: "center" },
  trackLg: { width: 52, height: 30, borderRadius: 15, justifyContent: "center" },
  knob: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" },
  knobLg: { position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" },
  knobOn: { right: 2 },
  knobOff: { left: 2 },
});
