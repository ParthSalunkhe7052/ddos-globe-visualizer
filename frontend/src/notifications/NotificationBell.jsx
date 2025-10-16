import React from "react";
import { useNotifications } from "./NotificationProvider";

export default function NotificationBell() {
  const { toggle, items, unread } = useNotifications();
  const total = items.length;
  return (
    <button
      onClick={toggle}
      aria-label="Notifications"
      title="Notifications"
      style={{
        marginLeft: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        position: "relative",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          background: "#FFD700",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="black"
          aria-hidden="true"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      </span>
      {/* total badge when open or badge for unread when closed */}
      {unread > 0 && (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ef4444",
            color: "#fff",
            fontSize: 11,
            padding: "0 6px",
            borderRadius: 999,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {unread === 0 && total > 0 && (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            color: "#FFD700",
            fontSize: 11,
            padding: "0 6px",
            borderRadius: 999,
          }}
        >
          {total}
        </span>
      )}
    </button>
  );
}
