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
 *   - backdrop-filter. Only the app's chrome gets a real blur, through
 *     expo-blur; cards rely on translucency over the ambient backdrop.
 *     See the `glass` block below for why.
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

// ── Glass ────────────────────────────────────────────────────────────────
// The same system as the web's index.css: an ambient backdrop of the
// brand's teal, indigo and amber (components/GlassBackdrop.js), and
// translucent panels over it at three levels of opacity.
//
// Cards carry no blur view. The backdrop is a smooth gradient fixed
// behind the scroll view, and blurring a smooth gradient returns the same
// gradient, so a translucent fill composites to what a blur would show —
// without a native blur per card, which on Android would cost a frame on
// every list scroll. Real blur is kept for the surfaces content scrolls
// *under*: the top bar, the tab bar and the sheets (see AppShell).
//
// Shadows use `boxShadow`, which the New Architecture supports on both
// platforms and which, unlike Android's `elevation`, is not drawn through
// a translucent fill.
export const glass = {
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 16,
    boxShadow: "0px 10px 30px -12px rgba(19, 27, 46, 0.18)",
  },
  strong: {
    backgroundColor: "rgba(255, 255, 255, 0.74)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.75)",
    borderRadius: 16,
    boxShadow: "0px 12px 40px -16px rgba(19, 27, 46, 0.22)",
  },
  subtle: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 12,
  },
  // The one emphasised figure on a screen.
  dark: {
    backgroundColor: "rgba(19, 27, 46, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 16,
    boxShadow: "0px 18px 40px -16px rgba(19, 27, 46, 0.55)",
  },
  // A card on the deep sign-in backdrop.
  hero: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 24,
    boxShadow: "0px 24px 60px -20px rgba(0, 0, 0, 0.45)",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 12,
    // Left/right rather than paddingHorizontal: react-native-web maps the
    // latter to a logical property that a caller's paddingLeft (room for
    // a leading icon) cannot override.
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 12,
    color: colors.onSurface,
  },
  heroInput: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 12,
    color: "#ffffff",
  },
  heroPlaceholder: "rgba(255, 255, 255, 0.65)",
  // Buttons. The web's primary is a gradient; a flat mid-teal reads the
  // same at phone size without pulling in a gradient package.
  primaryButton: {
    backgroundColor: "#00796f",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    boxShadow: "0px 8px 20px -8px rgba(0, 106, 97, 0.6)",
  },
  primaryButtonText: { fontFamily: fonts.label, fontSize: 15, lineHeight: 20, color: "#ffffff" },
  ghostButton: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ghostButtonText: { fontFamily: fonts.label, fontSize: 15, lineHeight: 20, color: colors.onSurface },
  // A pill that marks the selected option in a row of them.
  pillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    borderColor: "#ffffff",
    boxShadow: "0px 4px 12px -6px rgba(0, 106, 97, 0.45)",
  },
  pillIdle: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderColor: "rgba(255, 255, 255, 0.6)",
  },
  // Round icon holder.
  orb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    boxShadow: "0px 4px 12px -6px rgba(0, 106, 97, 0.35)",
  },
  scrim: "rgba(11, 28, 48, 0.28)",
  divider: "rgba(255, 255, 255, 0.7)",
};

// Status pills, matching the web's .chip-* classes.
export const chips = {
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.7)",
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  text: { fontFamily: fonts.label, fontSize: 12, lineHeight: 20, color: colors.onSurfaceVariant },
  teal: { bg: "rgba(134, 242, 228, 0.45)", fg: "#005049", border: "rgba(0, 106, 97, 0.15)" },
  red: { bg: "rgba(255, 218, 214, 0.7)", fg: "#93000a", border: "rgba(186, 26, 26, 0.15)" },
  amber: { bg: "rgba(255, 221, 184, 0.7)", fg: "#653e00", border: "rgba(184, 117, 0, 0.18)" },
  indigo: { bg: "rgba(218, 226, 253, 0.8)", fg: "#3f465c", border: "rgba(86, 94, 116, 0.15)" },
};

// The mockups' two card names, now glass. Every screen that already used
// them picks the new surface up without changing.
export const glassCard = glass.card;
export const surfaceCard = glass.card;
