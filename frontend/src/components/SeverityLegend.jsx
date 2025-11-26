import React from "react";

export default function SeverityLegend({ collapsed, onToggle, isMobile }) {
  const containerStyle = {
    position: "absolute",
    bottom: 12,
    left: 12,
    background: "rgba(18,18,18,0.9)",
    border: "1px solid #444",
    borderRadius: 8,
    padding: 8,
    color: "#f1f1f1",
    fontSize: 12,
    zIndex: 3,
    minWidth: 130,
  };

  const chevronStyle = {
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    marginBottom: 4,
    outline: "none",
  };

  const legendContent = (
    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "yellow",
          }}
        />
        <span>Low (&lt;30)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "orange",
          }}
        />
        <span>Medium (30–69)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "red",
          }}
        />
        <span>High (≥70)</span>
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      {isMobile && (
        <div
          style={chevronStyle}
          onClick={onToggle}
          aria-label={collapsed ? "Expand legend" : "Collapse legend"}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggle();
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            role="img"
            aria-label={collapsed ? "Expand legend" : "Collapse legend"}
          >
            <polyline
              points={collapsed ? "4,7 9,12 14,7" : "4,11 9,6 14,11"}
              fill="none"
              stroke="#FFD700"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      {!collapsed && legendContent}
    </div>
  );
}
