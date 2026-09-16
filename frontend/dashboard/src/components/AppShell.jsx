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
            ? "bg-secondary-container text-on-secondary-container"
            : item.danger
              ? "text-error hover:bg-error-container"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high")
        }
      >
        <Icon name={item.icon} fill={isActive} />
        <span>{t(item.labelKey)}</span>
      </button>
    );
  };

  return (
    <div className="bg-background text-on-background min-h-screen antialiased font-body-md text-body-md">
      {/* SideNavBar — desktop only */}
      <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface border-r border-outline-variant/30 p-sm space-y-base z-40">
        <div className="mb-lg px-2 pt-2">
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
            EnergiBox
          </h1>
          <p className="font-label-sm text-label-sm text-outline">{t("shell.tagline")}</p>
        </div>

        <nav className="flex-1 space-y-xs overflow-y-auto no-scrollbar">
          {items.map(sideLink)}
        </nav>

        {footerItems.length > 0 && (
          <div className="mt-auto space-y-xs pt-4 border-t border-outline-variant/30">
            {footerItems.map(sideLink)}
          </div>
        )}
      </aside>

      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-30 md:pl-64 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4">
        <div className="md:hidden flex items-center gap-2">
          <Icon name="electric_meter" className="text-secondary text-2xl" />
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
          "md:pl-64 pt-[80px] pb-[88px] md:pb-margin-desktop min-h-screen " +
          "px-margin-mobile md:px-margin-desktop " +
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
            ? "bg-secondary-container text-on-secondary-container rounded-full px-4 py-1"
            : "text-on-surface-variant active:bg-surface-container-high rounded-lg px-2 py-1");

        return (
          <>
            {moreOpen && (
              <>
                <div
                  className="md:hidden fixed inset-0 z-40 bg-on-surface/30"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 mx-margin-mobile mb-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-lg overflow-hidden">
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
                          ? "bg-secondary-container text-on-secondary-container"
                          : item.danger
                            ? "text-error active:bg-error-container"
                            : "text-on-surface-variant active:bg-surface-container-high")
                      }
                    >
                      <Icon name={item.icon} fill={item.key === active} />
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <nav className="md:hidden fixed bottom-0 w-full z-50 rounded-t-xl bg-surface/90 backdrop-blur-lg border-t border-outline-variant/30 shadow-lg flex justify-around items-center h-16 px-2 pb-safe">
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
