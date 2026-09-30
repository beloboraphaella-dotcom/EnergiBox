import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "./Icon";
import { colors, glass, type } from "../theme";

/** Short-lived messages above the tab bar: a command that failed, a
 * change saved, a new alert while the app is open. Screen readers
 * announce them (accessibilityLiveRegion on Android, the announcement
 * API on iOS through `accessibilityRole="alert"`). */

const ToastContext = createContext({ show: () => {} });

const TONES = {
  info: { icon: "info", color: colors.onSurface },
  success: { icon: "check_circle", color: colors.secondary },
  error: { icon: "error", color: colors.error },
  alert: { icon: "notifications_active", color: "#b45309" },
};

// Clears the floating tab bar (64) and its gap (12), plus breathing room.
const BOTTOM_OFFSET = 88;

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message, { tone = "info", icon, duration = 4000 } = {}) => {
    const id = nextId.current++;
    const opacity = new Animated.Value(0);
    setToasts((list) => [...list.slice(-2), { id, message, tone, icon, opacity }]);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="box-none" style={[styles.stack, { bottom: BOTTOM_OFFSET + insets.bottom }]}>
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] ?? TONES.info;
          return (
            <Animated.View
              key={toast.id}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[glass.strong, styles.toast, {
                opacity: toast.opacity,
                transform: [{ translateY: toast.opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }]}
            >
              <Icon name={toast.icon || tone.icon} size={22} color={tone.color} />
              <Text style={styles.text}>{toast.message}</Text>
              <TouchableOpacity
                onPress={() => dismiss(toast.id)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="OK"
              >
                <Icon name="close" size={18} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  stack: { position: "absolute", left: 12, right: 12, gap: 8, zIndex: 100 },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, overflow: "hidden",
  },
  text: { ...type.bodyMd, fontSize: 15, lineHeight: 21, color: colors.onSurface, flex: 1 },
});
