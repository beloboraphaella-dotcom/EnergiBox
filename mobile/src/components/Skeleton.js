import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";

/** A placeholder in the shape of the content that is loading, so a screen
 * shows its layout at once instead of a blank page. Pulses gently, unless
 * the phone asks for reduced motion. */
export default function Skeleton({ style, height = 80, radius = 18 }) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    let loop;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled || reduced) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
          ])
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={[{
        height, borderRadius: radius, opacity,
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.85)",
      }, style]}
    />
  );
}

/** The loading state of a screen, announced once to screen readers. */
export function SkeletonList({ label, children, style }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={[{ gap: 12 }, style]}>
      {children}
    </View>
  );
}
