import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Usage (we'll wire this into App.jsx in the next step):
 *  import ToastProvider, { showToast } from "./components/Toast";
 *  // Somewhere in code:
 *  showToast("Link copied!", "success");
 *  showToast("Something went wrong", "error");
 */

export function showToast(message, type = "info", duration = 2200) {
  // Dispatch a custom event so any mounted ToastProvider can show it
  window.dispatchEvent(
    new CustomEvent("app:toast", { detail: { message, type, duration } })
  );
}

function ToastItem({ id, message, type, onDone, duration }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // enter
    requestAnimationFrame(() => setVisible(true));
    // auto close
    timerRef.current = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timerRef.current);
  }, [duration]);

  const base = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    minWidth: 180,
    maxWidth: 360,
    borderRadius: 10,
    boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
    color: "#111",
    background: "#f1f1f1",
    border: "1px solid rgba(0,0,0,0.08)",
    transform: `translateY(${visible ? "0" : "8px"})`,
    opacity: visible ? 1 : 0,
    transition: "opacity 160ms ease, transform 160ms ease",
    fontSize: 14,
  };

  const typeChip = {
    success: { background: "#B6F3C8" },
    error: { background: "#FFD3D3" },
    info: { background: "#DDEBFF" },
  }[type] || { background: "#DDEBFF" };

  return (
    <div
      style={base}
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity" && !visible) onDone(id);
      }}
      role="status"
      aria-live="polite"
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background:
            type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#3b82f6",
          boxShadow: "0 0 0 3px rgba(0,0,0,0.06)",
        }}
      />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          opacity: 0.7,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function ToastProvider() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const { message, type = "info", duration = 2200 } = e.detail || {};
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
    };
    window.addEventListener("app:toast", handler);
    return () => window.removeEventListener("app:toast", handler);
  }, []);

  const container = {
    position: "fixed",
    right: 16,
    bottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 9999,
    pointerEvents: "none", // clicks pass through container
  };

  return createPortal(
    <div style={container}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem
            {...t}
            onDone={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))}
          />
        </div>
      ))}
    </div>,
    document.body
  );
}
