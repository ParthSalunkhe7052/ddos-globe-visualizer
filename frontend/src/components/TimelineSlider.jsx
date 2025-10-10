import React from "react";

export default function TimelineSlider({
  min,
  max,
  value,
  onChange,
  onPlayPause,
  playing,
  theme,
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: theme === "dark" ? "rgba(24,24,24,0.92)" : "#f7f7f7",
        borderTop: theme === "dark" ? "1px solid #333" : "1px solid #ddd",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.10)",
        gap: 18,
      }}
    >
      <button
        onClick={onPlayPause}
        aria-label={playing ? "Pause replay" : "Play replay"}
        style={{
          background: "none",
          border: "none",
          color: theme === "dark" ? "#FFD700" : "#222",
          fontSize: 22,
          cursor: "pointer",
          marginRight: 10,
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          accentColor: theme === "dark" ? "#FFD700" : "#222",
          height: 4,
          borderRadius: 4,
          background: theme === "dark" ? "#222" : "#eee",
        }}
        aria-label="Timeline slider"
      />
      <span
        style={{
          color: theme === "dark" ? "#FFD700" : "#222",
          fontSize: 13,
          marginLeft: 10,
        }}
      >
        {new Date(value).toLocaleString()}
      </span>
    </div>
  );
}
