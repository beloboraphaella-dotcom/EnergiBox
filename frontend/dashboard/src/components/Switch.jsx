/** An on/off switch. The visible track is small, as in the mockups, but
 * the button around it is at least 44×44 px — the size a thumb can hit
 * reliably — and it announces itself as a switch with its state. */
export default function Switch({ checked, onChange, label, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={
        "relative inline-flex items-center justify-center min-w-11 min-h-11 -m-2.5 p-2.5 rounded-full " +
        "focus-visible:outline-2 focus-visible:outline-secondary disabled:opacity-50 " +
        className
      }
    >
      <span
        className={
          "block h-5 w-10 rounded-full transition-colors duration-200 " +
          (checked ? "bg-secondary" : "bg-outline-variant")
        }
      />
      <span
        className={
          "absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-4 transition-all duration-200 " +
          (checked ? "right-2.5 border-secondary" : "left-2.5 border-outline-variant")
        }
      />
    </button>
  );
}
