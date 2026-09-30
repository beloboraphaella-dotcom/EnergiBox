import Icon from "./Icon";

/** The one modal of the app: a bottom sheet on phones, a centred glass
 * dialog from `sm` up, over a blurred scrim. Clicking the scrim closes. */
export default function GlassModal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-scrim p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md glass-strong rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-md py-4 border-b border-white/70">
          <h3 className="font-headline-md text-[20px] leading-[28px] font-semibold text-on-surface">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full text-on-surface-variant hover:bg-white/60 transition-colors active:scale-95 duration-150"
          >
            <Icon name="close" style={{ fontSize: "20px" }} />
          </button>
        </div>
        <div className="p-md">{children}</div>
      </div>
    </div>
  );
}
