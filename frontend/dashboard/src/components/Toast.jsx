import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "./Icon";

/** Short-lived messages: a command that failed, a change saved, a new
 * alert while the app is open. Announced to screen readers through a
 * polite live region. Sits above the mobile tab bar. */

const ToastContext = createContext({ show: () => {} });

const TONES = {
  info: "text-on-surface",
  success: "text-secondary",
  error: "text-error",
  alert: "text-on-tertiary-container",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message, { tone = "info", icon, duration = 4000 } = {}) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone, icon }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const defaultIcon = { info: "info", success: "check_circle", error: "error", alert: "notifications_active" };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed z-[70] left-3 right-3 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="glass-strong rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto toast-in"
          >
            <Icon name={toast.icon || defaultIcon[toast.tone]} className={TONES[toast.tone]} fill />
            <span className="font-body-md text-body-md text-on-surface flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="btn-icon -mr-2"
              aria-label="OK"
            >
              <Icon name="close" style={{ fontSize: "18px" }} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
