import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";
import { useLanguage } from "../context/LanguageContext";

/** The one modal of the app: a bottom sheet on phones, a centred glass
 * dialog from `sm` up, over a blurred scrim. Clicking the scrim or
 * pressing Escape closes it. Focus moves into the dialog when it opens and
 * back to where it was when it closes, and screen readers announce it as
 * a dialog with its title. */
export default function GlassModal({ title, onClose, children }) {
  const { t } = useLanguage();
  const titleId = useId();
  const panel = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const target = panel.current?.querySelector("[autofocus], input, select, textarea") || panel.current;
    target?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-scrim p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full sm:max-w-md glass-strong rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-md py-4 border-b border-white/70">
          <h3 id={titleId} className="font-headline-md text-[20px] leading-[28px] font-semibold text-on-surface">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2.5 -mr-2 rounded-full text-on-surface-variant hover:bg-white/60 transition-colors active:scale-95 duration-150"
          >
            <Icon name="close" style={{ fontSize: "20px" }} />
          </button>
        </div>
        <div className="p-md">{children}</div>
      </div>
    </div>
  );
}
