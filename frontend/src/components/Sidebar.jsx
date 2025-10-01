import React from "react";
import './Sidebar.css';
import StatsPanel from './StatsPanel';

export default function Sidebar({
  open,
  onClose,
  theme = 'dark',
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
  setHeatmapMode
}) {
  return (
    <aside
      className={`sidebar${open ? ' open' : ''} ${theme}`}
      aria-label="Sidebar"
      style={{
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        width: 260,
        zIndex: 100,
        background: theme === 'dark' ? 'rgba(24,24,24,0.98)' : '#f7f7f7',
        color: theme === 'dark' ? '#f1f1f1' : '#181818',
        boxShadow: '2px 0 12px rgba(0,0,0,0.12)',
        overflowY: 'auto',
        borderRight: theme === 'dark' ? '1px solid #333' : '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        paddingTop: 0,
      }}
    >
      {/* Sidebar content, no close button */}
      <div style={{ padding: '48px 18px 18px 18px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1, overflowY: 'auto' }}>
        {/* Recent IPs */}
        <section style={{ background: theme === 'dark' ? 'rgba(20,20,20,0.75)' : '#fff', border: theme === 'dark' ? '1px solid #FFD70033' : '1px solid #FFD70055', borderRadius: 10, padding: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#FFD700' }}>Recent IPs</div>
          {recentIps.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentIps.map(recent => (
                <button
                  key={recent}
                  type="button"
                  className="ip-button"
                  style={{ padding: '2px 10px', fontSize: '0.92em', background: '#222', border: '1px solid #FFD700', color: '#FFD700' }}
                  onClick={() => setIp(recent)}
                  title={`Analyze ${recent}`}
                >
                  {recent}
                </button>
              ))}
              <button
                type="button"
                className="ip-button"
                style={{ marginTop: 6, padding: '2px 10px', fontSize: '0.92em', background: '#333', border: '1px solid #FFD700', color: '#FFD700', alignSelf: 'flex-end' }}
                onClick={() => {
                  setRecentIps([]);
                  localStorage.removeItem('recentIps');
                }}
                title="Clear recent IPs"
              >
                Clear
              </button>
            </div>
          ) : (
            <div style={{ color: '#aaa', fontSize: 13 }}>No recent IPs</div>
          )}
        </section>

        {/* Export CSV & Clear All */}
        <section style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ip-button"
            style={{ flex: 1, padding: '6px 0', background: '#181818', border: '1px solid #FFD700', color: '#FFD700', borderRadius: 6, fontWeight: 600 }}
            onClick={handleExportCSV}
            title="Export recent IPs and info to CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="ip-button"
            style={{ flex: 1, padding: '6px 0', background: '#222', border: '1px solid #FFD700', color: '#FFD700', borderRadius: 6, fontWeight: 600 }}
            onClick={handleClearAll}
            title="Reset all data and globe view"
          >
            Clear All
          </button>
        </section>

        {/* Live Stats (single heading, no extra box) */}
        <section style={{ background: theme === 'dark' ? 'rgba(20,20,20,0.75)' : '#fff', border: theme === 'dark' ? '1px solid #FFD70033' : '1px solid #FFD70055', borderRadius: 10, padding: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#FFD700' }}>Live Stats</div>
          {/* StatsPanel should not render its own heading */}
          <StatsPanel points={points} hideHeading />
        </section>

        {/* Filters */}
        <section style={{ background: theme === 'dark' ? 'rgba(20,20,20,0.75)' : '#fff', border: theme === 'dark' ? '1px solid #FFD70033' : '1px solid #FFD70055', borderRadius: 10, padding: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#FFD700' }}>Filters</div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="sidebar-filter-country" style={{ fontSize: 13, marginRight: 6 }}>Country:</label>
            <select
              id="sidebar-filter-country"
              value={filterCountry}
              onChange={e => setFilterCountry(e.target.value)}
              style={{ background: '#18191a', color: '#FFD700', borderRadius: 6, padding: '4px 8px', border: '1px solid #FFD700', minWidth: 90 }}
              aria-label="Filter by country"
            >
              <option value="">All</option>
              {Array.from(new Set(points.map(pt => pt.country || pt.geo_info?.country).filter(Boolean))).sort().map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="sidebar-filter-severity" style={{ fontSize: 13, marginRight: 6 }}>Severity:</label>
            <select
              id="sidebar-filter-severity"
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              style={{ background: '#18191a', color: '#FFD700', borderRadius: 6, padding: '4px 8px', border: '1px solid #FFD700', minWidth: 90 }}
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
            style={{ marginTop: 8, padding: '6px 0', background: heatmapMode ? '#FFD700' : '#181818', border: '1px solid #FFD700', color: heatmapMode ? '#181818' : '#FFD700', borderRadius: 6, fontWeight: 600, width: '100%' }}
            onClick={() => setHeatmapMode(prev => !prev)}
            title={heatmapMode ? 'Disable heatmap coloring' : 'Enable heatmap coloring'}
            aria-pressed={heatmapMode}
          >
            {heatmapMode ? 'Disable Heatmap' : 'Enable Heatmap'}
          </button>
        </section>
      </div>
    </aside>
  );
}
