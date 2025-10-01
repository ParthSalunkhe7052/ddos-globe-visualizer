// src/components/ThemeToggle.jsx
import React from "react";
import "./ThemeToggle.css";

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle-button"
      onClick={onToggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
