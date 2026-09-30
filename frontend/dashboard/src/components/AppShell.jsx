import { useState } from "react";
import Icon from "./Icon";
import { useLanguage } from "../context/LanguageContext";

/** The navigation shell shared by every screen in the mockups: a fixed
 * 256px sidebar from `md` up, a fixed top bar, and a bottom tab bar below
 * `md`. Markup and classes are taken from the mockups; only the item list
 * is lifted into a prop so the same shell serves every page.
 *
 * `items` is [{ key, icon, labelKey }]; `footerItems` is the Support /
 * Logout group pinned to the bottom of the sidebar. */
export default function AppShell({
  items,
  footerItems = [],
  active,
  onNavigate,
  title,
  headerRight,
  children,
  mainClassName = "",
}) {
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const sideLink = (item) => {
    const isActive = item.key === active;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onNavigate?.(item.key)}
        className={
          "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ease-in-out font-label-sm text-label-sm text-left " +
          (isActive
            ? "bg-white/80 text-secondary shadow-[0_6px_16px_-8px_rgba(0,106,97,0.45)] ring-1 ring-white"
            : item.danger
              ? "text-error hover:bg-error-container/60"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/50")
        }
      >
        <Icon name={item.icon} fill={isActive} />
        <span>{t(item.labelKey)}</span>
      </button>
    );
  };

  return (
    <div className="text-on-background min-h-screen antialiased font-body-md text-body-md">
      <div className="app-backdrop" aria-hidden="true" />

      {/* SideNavBar — desktop only. Floats as a glass panel with a margin
          all round, so the backdrop shows on every side of it. */}
      <aside className="hidden md:flex flex-col w-60 fixed left-3 top-3 bottom-3 glass-strong rounded-2xl p-sm space-y-base z-40">
        <div className="mb-lg px-2 pt-2 flex items-center gap-3">
          <span className="icon-orb w-10 h-10 bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim text-on-secondary-fixed">
            <Icon name="bolt" fill />
          </span>
          <div>
            <h1 className="font-headline-md text-[22px] leading-7 font-bold text-on-surface">
              EnergiBox
            </h1>
            <p className="font-label-sm text-label-sm text-outline">{t("shell.tagline")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-xs overflow-y-auto no-scrollbar">
          {items.map(sideLink)}
        </nav>

        {footerItems.length > 0 && (
          <div className="mt-auto space-y-xs pt-4 border-t border-white/70">
            {footerItems.map(sideLink)}
          </div>
        )}
      </aside>

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 right-0 z-30 md:left-[16.5rem] md:right-3 md:top-3 glass-strong md:rounded-2xl rounded-b-2xl flex justify-between items-center px-margin-mobile md:px-6 py-3">
        <div className="md:hidden flex items-center gap-2">
          <span className="icon-orb w-8 h-8 bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim text-on-secondary-fixed">
            <Icon name="bolt" fill style={{ fontSize: "18px" }} />
          </span>
          <span className="font-headline-md text-headline-md font-bold text-on-surface">
            EnergiBox
          </span>
        </div>
        <div className="hidden md:block">
          <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-4">{headerRight}</div>
      </header>

      {/* Main canvas. The top padding clears the fixed header, the bottom
          padding clears the mobile tab bar. */}
      <main
        className={
          "md:pl-[16.5rem] pt-[84px] md:pt-[96px] pb-[104px] md:pb-margin-desktop min-h-screen " +
          "px-margin-mobile md:pr-margin-desktop " +
          mainClassName
        }
      >
        {children}
      </main>

      {/* BottomNavBar — mobile only. The mockups show four tabs; the app has
          more screens than that, so the first three keep their place and
          everything else moves behind "More" rather than becoming
          unreachable on a phone. */}
      {(() => {
        const primary = items.slice(0, 3);
        const overflow = [...items.slice(3), ...footerItems];
        const overflowActive = overflow.some((i) => i.key === active);

        const tabClass = (isActive) =>
          "flex flex-col items-center justify-center active:scale-90 transition-transform font-label-sm text-label-sm " +
          (isActive
            ? "bg-white/85 text-secondary rounded-full px-4 py-1 shadow-[0_4px_12px_-6px_rgba(0,106,97,0.45)]"
            : "text-on-surface-variant active:bg-white/60 rounded-lg px-2 py-1");

        return (
          <>
            {moreOpen && (
              <>
                <div
                  className="md:hidden fixed inset-0 z-40 glass-scrim"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="md:hidden fixed bottom-[5.5rem] left-0 right-0 z-50 mx-margin-mobile rounded-2xl glass-strong overflow-hidden">
                  {overflow.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onNavigate?.(item.key);
                      }}
                      className={
                        "w-full flex items-center gap-3 px-4 py-3 font-label-sm text-label-sm text-left transition-colors " +
                        (item.key === active
                          ? "bg-white/80 text-secondary"
                          : item.danger
                            ? "text-error active:bg-error-container/60"
                            : "text-on-surface-variant active:bg-white/60")
                      }
                    >
                      <Icon name={item.icon} fill={item.key === active} />
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Floating glass tab bar; the safe-area inset lifts it clear of
                an iPhone home indicator. */}
            <nav
              className="md:hidden fixed left-3 right-3 z-50 rounded-2xl glass-strong flex justify-around items-center h-16 px-2"
              style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {primary.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onNavigate?.(item.key);
                  }}
                  className={tabClass(item.key === active)}
                >
                  <Icon name={item.icon} fill={item.key === active} />
                  <span className="text-[10px] mt-1">{t(item.labelKey)}</span>
                </button>
              ))}

              {overflow.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className={tabClass(overflowActive || moreOpen)}
                  aria-expanded={moreOpen}
                >
                  <Icon name="more_horiz" fill={overflowActive || moreOpen} />
                  <span className="text-[10px] mt-1">{t("shell.more")}</span>
                </button>
              )}
            </nav>
          </>
        );
      })()}

    </div>
  );
}
