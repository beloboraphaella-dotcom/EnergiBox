# EnergiBox design system — glass

Both apps draw every screen from one glassmorphism system. The web
implements it as Tailwind component classes in
`frontend/dashboard/src/index.css`; the mobile app as style tokens in
`mobile/src/theme.js`. The names match, so a screen reads the same in
either codebase.

## Why a backdrop

Glass is a translucent, blurred panel. A blur needs colour behind it to
act on: over a flat background it produces the same flat colour, which is
why the mockups' original `glass-card` rendered as a plain white card. The
system therefore starts with an ambient backdrop — the brand's teal,
indigo and amber as soft radial washes — fixed behind the content.

| | Web | Mobile |
|---|---|---|
| App backdrop | `.app-backdrop` | `<GlassBackdrop />` |
| Sign-in / onboarding backdrop | `.app-backdrop .app-backdrop-hero` | `<GlassBackdrop variant="hero" />` |

## Surfaces

Three levels, from most to least opaque, plus two accents.

| Role | Web | Mobile | Use for |
|---|---|---|---|
| Chrome | `.glass-strong` | `glass.strong` | sidebar, top bar, tab bar, menus, modals |
| Content | `.glass` | `glass.card` | every card and panel |
| Nested | `.glass-subtle` | `glass.subtle` | rows, tiles and segmented controls inside a card |
| Emphasis | `.glass-dark` | `glass.dark` | the one key figure on a screen (estimated cost) |
| Hero | `.glass-hero` | `glass.hero` | the card on the sign-in backdrop |

Rules of thumb:

- One `glass-dark` per screen at most; it is what the eye lands on.
- Nest `subtle` inside `glass`, never `glass` inside `glass`: stacked
  translucency muddies the text.
- Forms that open over a scrim (modals, sheets) sit on nothing worth seeing
  through, so they use the strong level at near-opaque fill.

## Controls

| Control | Web | Mobile |
|---|---|---|
| Primary action | `.btn-primary` | `<PrimaryButton>` (`glass.primaryButton` + `<GradientFill>`) |
| Secondary action | `.btn-glass` | `<GhostButton>` (`glass.ghostButton`) |
| Destructive | `.btn-danger`, `.btn-danger-solid` | `<GhostButton danger>` |
| Icon-only | `.btn-icon` | `<IconButton>` |
| Text field | `.glass-input` (`.glass-input-hero` on the hero) | `<Field>` / `glass.input` (`glass.heroInput`) |
| On/off switch | `<Switch>` | `<Switch>` |
| Segmented control | `.segmented` with `aria-pressed` buttons | `<Segmented>` (`glass.pillActive` / `glass.pillIdle`) |
| Status pill | `.chip`, `.chip-teal/red/amber/indigo` | `<Chip tone="teal">` (`components/GlassUI.js`) |
| Round icon | `.icon-orb` | `glass.orb`, `<Orb>` |
| Modal | `<GlassModal>` (`components/GlassModal.jsx`) | `<GlassSheet>`, a bottom sheet over `glass.scrim` |
| Stat tile | `.glass` card with `.icon-orb` | `<StatTile>` (`dark` for the key figure) |
| Confirm / message | `window.confirm` / `window.alert` | `confirm()` / `notify()` (`components/confirm.js`) |

Mobile components live in `mobile/src/components/GlassUI.js` unless noted.

**Gradients on mobile.** react-native-web ignores `experimental_backgroundImage`,
so primary buttons and dark cards draw theirs with `<GradientFill kind="primary">`
or `kind="dark"` (`components/GradientFill.js`), an SVG layer placed as the first
child of a view with `overflow: "hidden"` (already set on `glass.primaryButton`
and `glass.dark`).

Status colours map to meaning, not to decoration: teal is on / active /
saved money, red is a spike or a destructive action, amber is a pending or
extended-runtime state, indigo is informational.

## Interaction patterns

The same behaviour on both platforms, from the same building blocks:

| Pattern | Web | Mobile |
|---|---|---|
| On/off switch — 44 px (web) / 48 dp (mobile) touch area, `role="switch"` with the device's name | `<Switch>` (`components/Switch.jsx`) | `<Switch>` (`components/Switch.js`) |
| Switch that reacts at once and rolls back with a message on failure | `useDeviceToggle` (`live/useDeviceToggle.js`) | same, plus a light haptic tap |
| Refresh on change, paused in the background, polling as fallback | `useLiveRefresh` (`live/LiveContext.jsx`) | `useLiveRefresh` (`live/LiveContext.js`) |
| Loading placeholder in the shape of the content | `<Skeleton>` / `.skeleton` | `<Skeleton>`, `<SkeletonList>` |
| Server unreachable | `<ConnectionBanner>` in the shell | same |
| Short message (failure, success, new alert) | `useToast()` | `useToast()` |
| Time entry | `<input type="time">` + presets | `<TimeField>` steppers + presets |
| Reduced transparency | `html.reduce-transparency`, set in Settings or by the OS | `PreferencesContext`: flat backdrop, opaque bars |

Rules that follow from them: a card that looks like a device opens that
device; a control that looks like a switch switches; destructive or
wide actions (delete, switch everything off) ask first; every icon-only
button has an accessible name; modals close on Escape and take focus.

## Blur and performance

- **Web.** Every surface uses `backdrop-filter: blur() saturate()`. Where
  the browser lacks it, or the user asked for reduced transparency
  (`prefers-reduced-transparency`), each level falls back to a
  near-opaque fill so text never sits on an unblurred background.
- **Mobile.** Only the chrome that content scrolls under — top bar, tab
  bar, "More" sheet — uses a real blur (`expo-blur`). Cards rely on
  translucency: the backdrop is a smooth gradient, and blurring a smooth
  gradient returns the same gradient, so a blur per card would cost frames
  on every list scroll for no visible gain. On Android the blur uses
  `dimezisBlurViewSdk31Plus`, which blurs on Android 12+ and falls back to
  the translucent fill on older phones.
- Shadows on mobile use `boxShadow`, which the New Architecture supports on
  both platforms and which, unlike Android `elevation`, is not drawn
  through a translucent fill.

## Shared building blocks

| | Web | Mobile |
|---|---|---|
| App frame | `components/AppShell.jsx` | `components/AppShell.js` |
| Sign-in / sign-up / onboarding frame | `components/AuthLayout.jsx` | `components/AuthLayout.js` |
| Device icon by name | `utils/deviceIcon.js` | `deviceIcon()` in `utils.js` |

## Not done yet

- **Dark theme.** Still none, as the README says: the design has no dark
  palette. The system is built on CSS variables and tokens, so one would
  slot in as a second backdrop and a second set of fills.
- **Server-written text.** Alerts, suggestions and reports come in the
  reader's language since migration 006; API error details are still
  English only. See the README's known limitations.
