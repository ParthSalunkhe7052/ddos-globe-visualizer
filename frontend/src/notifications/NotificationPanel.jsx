import React, { useEffect, useRef, useState } from "react";
import { useNotifications } from "./NotificationProvider";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export default function NotificationPanel() {
  const { open, items, dismiss, clearAll, setOpen } = useNotifications();
  const [recentIds, setRecentIds] = useState(new Set());
  const containerRef = useRef(null);

  // Track new items for highlight animation
  useEffect(() => {
    if (!items || items.length === 0) return;
    const added = items.filter((i) => !recentIds.has(i.id)).map((i) => i.id);
    if (added.length === 0) return;
    setRecentIds((prev) => {
      const copy = new Set(prev);
      added.forEach((id) => copy.add(id));
      return copy;
    });
    // clear highlight after 1.6s
    const id = setTimeout(() => {
      setRecentIds((prev) => {
        const copy = new Set(prev);
        added.forEach((id) => copy.delete(id));
        return copy;
      });
    }, 1600);
    return () => clearTimeout(id);
  }, [items]);

  // scroll container to top when new items arrive while panel open
  useEffect(() => {
    if (!open) return;
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [items.length, open]);

  return (
    <div>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: open ? "auto" : "none",
          zIndex: open ? 999 : -1,
        }}
        onClick={() => setOpen(false)}
      />

      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 340,
          maxWidth: "90vw",
          background: "var(--panel-bg, rgba(24,24,24,0.98))",
          color: "var(--panel-fg, #fff)",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.4)",
          transform: open ? "translateX(0)" : "translateX(110%)",
          transition: "transform 280ms cubic-bezier(.2,.9,.25,1)",
          zIndex: 1000,
          padding: 12,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>Notifications</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={clearAll}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "inherit",
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Clear All
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingRight: 6,
          }}
        >
          {items.length === 0 && (
            <div style={{ color: "rgba(255,255,255,0.6)", padding: 12 }}>
              No notifications
            </div>
          )}
          {items.map((item) => {
            const isNew = recentIds.has(item.id);
            return (
              <div
                key={item.id}
                style={{
                  background: isNew
                    ? "linear-gradient(90deg, rgba(255,250,230,0.06), rgba(255,255,255,0.02))"
                    : "var(--card-bg, rgba(0,0,0,0.45))",
                  padding: 10,
                  borderRadius: 8,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  opacity: 1,
                  transition:
                    "background 400ms ease, transform 260ms ease, opacity 300ms ease",
                  transform: isNew ? "translateY(-6px)" : "translateY(0)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13, lineHeight: 1.2 }}>
                    {item.message}
                  </div>
                  <button
                    onClick={() => dismiss(item.id)}
                    aria-label="Dismiss"
                    title="Dismiss"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  <div>{item.source || item.type || ""}</div>
                  <div style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(item.ts)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
