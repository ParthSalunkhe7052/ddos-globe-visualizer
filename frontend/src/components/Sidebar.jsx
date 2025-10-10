import React from "react";
import "./Sidebar.css";
import StatsPanel from "./StatsPanel";

export default function Sidebar({
  open,
  onClose,
  theme = "dark",
  recentIps = [],
  setRecentIps,
  handleExportCSV,
  handleClearAll,
  setIp,
  points = [],
  filterCountry,
  setFilterCountry,
  filterSeverity,
  setFilterSeverity,
  GLOBE_TEXTURES = [],
  globeTexture,
  setGlobeTexture,
  onThemeToggle,
  heatmapMode,
  setHeatmapMode,
}) {
  return (
    <aside
      className={`sidebar${open ? " open" : ""}`}
      aria-label="Sidebar"
      style={{
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s ease",
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: 260,
        zIndex: 100,
        background: "rgba(18,18,18,0.98)",
        color: "#f1f1f1",
        boxShadow: "2px 0 12px rgba(0,0,0,0.25)",
        overflowY: "auto",
        borderRight: "1px solid #2a2a2a",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        paddingTop: 0,
      }}
    >
      {/* Sidebar content, no close button */}
      <div
        style={{
          padding: "48px 18px 18px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: 1,
          overflowY: "auto",
        }}
      >
        {/* Recent IPs */}
        <section
          style={{
            background: "rgba(20,20,20,0.9)",
            border: "1px solid #FFD54F33",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              marginBottom: 8,
              color: "#FFD700",
            }}
          >
            Recent IPs
          </div>
          {recentIps.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentIps.map((recent) => (
                <button
                  key={recent}
                  type="button"
                  className="ip-button"
                  style={{
                    padding: "6px 10px",
                    fontSize: "0.92em",
                    background: "#1e1e1e",
                    border: "1px solid #FFD54F",
                    color: "#FFD54F",
                    borderRadius: 10,
                  }}
                  onClick={() => setIp(recent)}
                  title={`Analyze ${recent}`}
                >
                  {recent}
                </button>
              ))}
              <button
                type="button"
                className="ip-button"
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  fontSize: "0.92em",
                  background: "#2a2a2a",
                  border: "1px solid #FFD54F",
                  color: "#FFD54F",
                  alignSelf: "flex-end",
                  borderRadius: 10,
                }}
                onClick={() => {
                  setRecentIps([]);
                  localStorage.removeItem("recentIps");
                }}
                title="Clear recent IPs"
              >
                Clear
              </button>
            </div>
          ) : (
            <div style={{ color: "#aaa", fontSize: 13 }}>No recent IPs</div>
          )}
        </section>

        {/* Export CSV & Clear All */}
        <section style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="ip-button"
            style={{
              flex: 1,
              padding: "10px 0",
              background: "#181818",
              border: "1px solid #FFD54F",
              color: "#FFD54F",
              borderRadius: 12,
              fontWeight: 600,
            }}
            onClick={handleExportCSV}
            title="Export recent IPs and info to CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="ip-button"
            style={{
              flex: 1,
              padding: "10px 0",
              background: "#222",
              border: "1px solid #FFD54F",
              color: "#FFD54F",
              borderRadius: 12,
              fontWeight: 600,
            }}
            onClick={handleClearAll}
            title="Reset all data and globe view"
          >
            Clear All
          </button>
        </section>

        {/* Live Stats (single heading, no extra box) */}
        <section
          style={{
            background: "rgba(20,20,20,0.9)",
            border: "1px solid #FFD54F33",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              marginBottom: 8,
              color: "#FFD700",
            }}
          >
            Live Stats
          </div>
          {/* StatsPanel should not render its own heading */}
          <StatsPanel points={points} hideHeading />
        </section>

        {/* Filters */}
        <section
          style={{
            background: "rgba(20,20,20,0.9)",
            border: "1px solid #FFD54F33",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              marginBottom: 8,
              color: "#FFD700",
            }}
          >
            Filters
          </div>
          <div style={{ marginBottom: 8 }}>
            <label
              htmlFor="sidebar-filter-country"
              style={{ fontSize: 13, marginRight: 6 }}
            >
              Country:
            </label>
            <select
              id="sidebar-filter-country"
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              style={{
                background: "#18191a",
                color: "#FFD54F",
                borderRadius: 10,
                padding: "6px 10px",
                border: "1px solid #FFD54F",
                minWidth: 90,
              }}
              aria-label="Filter by country"
            >
              <option value="">All</option>
              {Array.from(
                new Set(
                  points
                    .map((pt) => pt.country || pt.geo_info?.country)
                    .filter(Boolean),
                ),
              )
                .sort()
                .map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label
              htmlFor="sidebar-filter-severity"
              style={{ fontSize: 13, marginRight: 6 }}
            >
              Severity:
            </label>
            <select
              id="sidebar-filter-severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              style={{
                background: "#18191a",
                color: "#FFD54F",
                borderRadius: 10,
                padding: "6px 10px",
                border: "1px solid #FFD54F",
                minWidth: 90,
              }}
              aria-label="Filter by severity"
            >
              <option value="">All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <button
            type="button"
            className="ip-button"
            style={{
              marginTop: 8,
              padding: "10px 0",
              background: heatmapMode ? "#FFD54F" : "#181818",
              border: "1px solid #FFD54F",
              color: heatmapMode ? "#181818" : "#FFD54F",
              borderRadius: 12,
              fontWeight: 600,
              width: "100%",
            }}
            onClick={() => setHeatmapMode((prev) => !prev)}
            title={
              heatmapMode
                ? "Disable heatmap coloring"
                : "Enable heatmap coloring"
            }
            aria-pressed={heatmapMode}
          >
            {heatmapMode ? "Disable Heatmap" : "Enable Heatmap"}
          </button>
        </section>
      </div>
    </aside>
  );
}
