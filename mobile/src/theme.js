/** EnergiBox design tokens for React Native.
 *
 * Generated from frontend/dashboard/tailwind.config.js so the two
 * platforms cannot drift: same 47 Material 3 colours, same spacing scale,
 * same type ramp. Names are camelCased because RN style keys are JS
 * identifiers, so `on-surface` becomes `onSurface`.
 *
 * React Native has no CSS, so anything the web expresses with a class is
 * a plain object here. Three things the mockups rely on simply do not
 * exist on this platform and are approximated:
 *
 *   - backdrop-filter: blur(12px). The cards sit on a flat #f8f9ff
 *     background, so blurring it yields that same flat colour. The
 *     translucent fill alone composites to an identical result, which is
 *     why `glassCard` below carries no blur and needs no extra package.
 *   - :hover. Touch has no hover state; the mockups' hover affordances
 *     become pressed states.
 *   - Media queries. Layout responds to useWindowDimensions instead.
 */

export const colors = {
  onPrimaryFixed: "#131b2e",
  primaryFixedDim: "#bec6e0",
  background: "#f8f9ff",
  onSecondaryFixed: "#00201d",
  inverseSurface: "#213145",
  secondary: "#006a61",
  inverseOnSurface: "#eaf1ff",
  tertiaryFixed: "#ffddb8",
  onPrimaryFixedVariant: "#3f465c",
  surfaceContainerLowest: "#ffffff",
  tertiaryContainer: "#2a1700",
  outlineVariant: "#c6c6cd",
  outline: "#76777d",
  surfaceTint: "#565e74",
  surfaceContainerLow: "#eff4ff",
  tertiaryFixedDim: "#ffb95f",
  onSurface: "#0b1c30",
  onError: "#ffffff",
  surfaceContainerHigh: "#dce9ff",
  onTertiary: "#ffffff",
  onSecondaryContainer: "#006f66",
  onTertiaryFixed: "#2a1700",
  surfaceContainerHighest: "#d3e4fe",
  error: "#ba1a1a",
  secondaryContainer: "#86f2e4",
  onPrimaryContainer: "#7c839b",
  primary: "#000000",
  surfaceBright: "#f8f9ff",
  inversePrimary: "#bec6e0",
  secondaryFixed: "#89f5e7",
  primaryContainer: "#131b2e",
  secondaryFixedDim: "#6bd8cb",
  surfaceVariant: "#d3e4fe",
  onSurfaceVariant: "#45464d",
  surface: "#f8f9ff",
  onBackground: "#0b1c30",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",
  tertiary: "#000000",
  onSecondaryFixedVariant: "#005049",
  surfaceContainer: "#e5eeff",
  surfaceDim: "#cbdbf5",
  primaryFixed: "#dae2fd",
  onSecondary: "#ffffff",
  onTertiaryFixedVariant: "#653e00",
  onTertiaryContainer: "#b87500",
  onPrimary: "#ffffff",
};

// Spacing scale, verbatim from the Tailwind config.
export const spacing = {
  base: 4,
  xs: 8,
  sm: 16,
  gutter: 16,
  marginMobile: 16,
  md: 24,
  lg: 32,
  xl: 48,
  marginDesktop: 40,
};

export const radius = {
  DEFAULT: 4,
  lg: 8,
  xl: 12,
  full: 9999,
};

// Font families are the loaded @expo-google-fonts keys. The mockups map
// Hanken Grotesk to headings and metrics, Inter to body and labels, and
// JetBrains Mono to data readouts.
export const fonts = {
  headline: "HankenGrotesk_600SemiBold",
  headlineBold: "HankenGrotesk_700Bold",
  display: "HankenGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  label: "Inter_600SemiBold",
  mono: "JetBrainsMono_500Medium",
};

// The type ramp, matching the web's fontSize entries.
export const type = {
  headlineLg: { fontFamily: fonts.headline, fontSize: 32, lineHeight: 40 },
  headlineMd: { fontFamily: fonts.headline, fontSize: 24, lineHeight: 32 },
  displayMetrics: { fontFamily: fonts.display, fontSize: 48, lineHeight: 56, letterSpacing: -0.96 },
  dataLabel: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, letterSpacing: 0.7 },
  labelSm: { fontFamily: fonts.label, fontSize: 12, lineHeight: 16 },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
};

// `glass-card` from the mockups' <style> block. See the note above on why
// the blur is omitted rather than approximated with a blur view.
export const glassCard = {
  backgroundColor: "rgba(255, 255, 255, 0.7)",
  borderWidth: 1,
  borderColor: "rgba(198, 198, 205, 0.3)",
  borderRadius: radius.xl,
};

export const surfaceCard = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: "rgba(198, 198, 205, 0.3)",
  borderRadius: radius.xl,
};
