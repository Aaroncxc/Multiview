// ============================================================
// Toast — Non-blocking transient feedback
// Apple HIG: Inline messages near source, non-blocking toasts
//            for transient feedback ("Saved", "Undo Move Cube")
// ============================================================

import React, { useEffect, useState, useCallback } from "react";
import "./Toast.css";

interface ToastMessage {
  id: number;
  text: string;
  type: "info" | "success" | "warning" | "error";
}

let toastId = 0;
const listeners = new Set<(msg: ToastMessage) => void>();

/** Show a toast from anywhere in the app */
export function showToast(
  text: string,
  type: "info" | "success" | "warning" | "error" = "info"
) {
  const msg: ToastMessage = { id: ++toastId, text, type };
  listeners.forEach((fn) => fn(msg));
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts((prev) => [...prev.slice(-4), msg]); // max 5 visible
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== msg.id));
    }, 2500);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  }, [addToast]);

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
};
