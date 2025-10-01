// Color helper for dots/arcs based on abuseConfidenceScore
const getColorByScore = (score = 0) => {
  const s = Number(score) || 0;
  if (s >= 70) return 'red';        // high severity
  if (s >= 30) return 'orange';     // medium severity
  return 'yellow';                  // low severity
};

// Bottom-left severity legend with inline chevron (collapsible on mobile, always open on desktop)
function SeverityLegend({ collapsed, onToggle, isMobile }) {
  const containerStyle = {
    position: 'absolute',
    bottom: 12,
    left: 12,
    background: 'rgba(18,18,18,0.9)',
    border: '1px solid #444',
    borderRadius: 8,
    padding: 8,
    color: '#f1f1f1',
    fontSize: 12,
    zIndex: 3,
    minWidth: 130,
  };

  const chevronStyle = {
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 4,
    outline: 'none',
  };

  const legendContent = (
    <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 14, background: 'yellow' }} />
        <span>Low (&lt;30)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 14, background: 'orange' }} />
        <span>Medium (30–69)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 14, background: 'red' }} />
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
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}>
            <polyline
              points={collapsed ? '4,7 9,12 14,7' : '4,11 9,6 14,11'}
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
import React, { useEffect, useRef, useState } from 'react';
import useWebSocket from "./useWebSocket";
import ThemeToggle from './components/ThemeToggle';
import Sidebar from './components/Sidebar';
import { showToast } from './components/Toast';
import NotificationProvider from './notifications/NotificationProvider';
import NotificationPanel from './notifications/NotificationPanel';
import NotificationBell from './notifications/NotificationBell';
import Globe from 'react-globe.gl';
import { clusterPoints } from './utils/clusterPoints';
import StatsPanel from './components/StatsPanel';
import TimelineSlider from './components/TimelineSlider';
import './App.css';


/* =========================
   Constants & Utilities
========================= */
const MAX_POINTS = 500;
const MAX_ARCS = 500;
const LAST_N = 6;

const GLOBE_TEXTURES = [
  { label: 'Night', url: '//unpkg.com/three-globe/example/img/earth-night.jpg' },
  { label: 'Day', url: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg' },
  { label: 'Dark', url: '//unpkg.com/three-globe/example/img/earth-dark.jpg' }
];

function validIPv4(ip) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip);
}

function severityColor(score = 0) {
  const n = Number(score) || 0;
  if (n >= 80) return 'rgb(220,40,40)';   // red
  if (n >= 40) return 'rgb(255,140,0)';   // orange
  return 'rgb(255,220,80)';               // yellow
}

function arcGradient(score = 0) {
  return [severityColor(score), 'rgba(255,255,255,0.6)'];
}

function buildShareUrl(ip) {
  const url = new URL(window.location.href);
  url.searchParams.set('ip', ip);
  return url.toString();
}

/* =========================
   Presentational Components
========================= */

// Bottom-left severity legend with inline chevron (collapsible on mobile, always open on desktop)


// Side Info Panel Component (right side)
function SideInfoPanel({ info, collapsed, onToggle, isMobile }) {
  const panelStyle = {
    position: 'absolute',
    right: 12,
    top: 100,
    bottom: 12,
    width: collapsed ? 42 : (isMobile ? '60%' : 280),
    transition: 'width 0.2s ease',
    background: 'rgba(20,20,20,0.75)',
    border: '1px solid rgba(255,215,0,0.35)',
    borderRadius: 10,
    padding: 10,
    zIndex: 3,
    color: '#f1f1f1',
    overflow: 'hidden',
    backdropFilter: 'blur(2px)'
  };

  const chevronBtnStyle = {
    position: 'absolute',
    left: 6,
    top: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 2
  };

  // Helper to render a field if present
  const renderField = (label, value) => value !== undefined && value !== null && value !== '' && (
    <div><b>{label}:</b> {value}</div>
  );

  // Abuse info extraction
  const abuse = info?.abuse_info?.data || info?.abuse_info || {};

  return (
    <div style={panelStyle} className="side-info-panel">
      <button
        className="side-chevron"
        aria-label={collapsed ? 'Expand info panel' : 'Collapse info panel'}
        onClick={onToggle}
        style={chevronBtnStyle}
        title={collapsed ? 'Expand' : 'Collapse'}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label={collapsed ? 'Expand info panel' : 'Collapse info panel'}>
          <polyline
            points={collapsed ? "4,7 9,12 14,7" : "4,11 9,6 14,11"}
            fill="none"
            stroke="#FFD700"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {!collapsed && (
        <div className="side-info-content" style={{ marginTop: 24, fontSize: 13, lineHeight: 1.45 }}>
          {info ? (
            <>
              {/* Always show name if present */}
              {renderField('Name', info.name)}
              {/* Always show coordinates if present */}
              {typeof info.lat === 'number' && typeof info.lng === 'number' && (
                <div><b>Coords:</b> {info.lat.toFixed(3)}, {info.lng.toFixed(3)}</div>
              )}
              {/* IP-related fields */}
              {renderField('IP', info.ip)}
              {renderField('Abuse Score', info.abuseConfidenceScore || info.score || abuse.abuseConfidenceScore)}
              {renderField('Country', info.country || info.countryCode || info.geo_info?.country)}
              {renderField('City', info.city || info.geo_info?.city)}
              {renderField('ISP', info.isp || abuse.isp)}
              {renderField('Type', info.usageType || abuse.usageType)}
            </>
          ) : (
            <div>No point selected.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* Tooltip content utility for react-globe.gl.
   It returns a plain string; react-globe.gl will render it in a small tooltip. */
function getTooltipContent(point) {
  if (!point) return '';
  const { ip, city, country, abuse_info = {} } = point;
  const abuseData = abuse_info.data || {};
  const score = abuseData.abuseConfidenceScore ?? '–';
  const usageType = abuseData.usageType || 'Unknown';

  return `
    <div style="min-width:150px">
      <b>${ip}</b><br/>
      ${city ? city + ', ' : ''}${country || ''}<br/>
      <span style="color:#FFD700">Score: ${score}</span><br/>
      <i>${usageType}</i>
    </div>
  `;
}

/* =========================
   Main App
========================= */
export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // State hooks
  const [ip, setIp] = useState('');
  const [theme, setTheme] = useState('dark');
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentIp, setCurrentIp] = useState('');
  const [searchTerm, setSearchTerm] = useState("");
  const [points, setPoints] = useState([]);
  const [arcs, setArcs] = useState([]);
  const [rings, setRings] = useState([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateSpeed, setRotateSpeed] = useState(0.5);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [recentIps, setRecentIps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('recentIps') || '[]'); // array of IP strings
    } catch {
      return [];
    }
  });
  const [globeTexture, setGlobeTexture] = useState(GLOBE_TEXTURES[0].url);
  // Filter state
  const [filterCountry, setFilterCountry] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  // Heatmap mode state
  const [heatmapMode, setHeatmapMode] = useState(false);
  // Live mode state: whether to receive and process live websocket events
  // Default OFF to avoid fetching/rendering live notifications until user enables it
  const [liveMode, setLiveMode] = useState(false);
  // Severity color for heatmap mode
  const getSeverityColor = (score) => {
    if (score >= 70) return 'red';
    if (score >= 30) return 'orange';
    return 'green';
  };

  // Ref (must be before any useEffect that uses it)
  const globeRef = useRef();

  // WebSocket hook (do not auto-connect; we control connect with liveMode)
  const { events: wsEvents, isConnected: wsConnected, pause: wsPause, resume: wsResume, connect: wsConnect, disconnect: wsDisconnect } =
    useWebSocket("ws://127.0.0.1:8000/ws", { autoConnect: false });

  // keep processed ids to avoid duplicates
  const processedEventIdsRef = useRef(new Set());
  // connect/resume when liveMode true, pause when false
  useEffect(() => {
    if (liveMode) {
      // resume delivering messages
      try { wsResume(); } catch {}
      // ensure connection open
      if (!wsConnected) wsConnect();
      showToast && showToast('Live Mode enabled', 'info');
    } else {
      try { wsPause(); } catch {}
      showToast && showToast('Live Mode paused', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode]);

  // Process incoming WS events (append to points/arcs/rings and recentIps)
  useEffect(() => {
    if (!Array.isArray(wsEvents) || wsEvents.length === 0) return;

    // process oldest-first so timeline order is preserved
    const items = [...wsEvents].reverse();
    items.forEach(ev => {
      if (!ev || !ev.ip) return;
      const id = `${ev.ip}-${ev.timestamp || Date.now()}`;
      if (processedEventIdsRef.current.has(id)) return;
      processedEventIdsRef.current.add(id);

      // extract lat/lng safely
      const lat = (ev.geo_info && (ev.geo_info.lat ?? ev.geo_info.latitude)) ?? null;
      const lng = (ev.geo_info && (ev.geo_info.lon ?? ev.geo_info.longitude)) ?? null;
      const score = Number(ev.abuse_info?.abuseConfidenceScore ?? ev.abuse_score ?? 0) || 0;
      const color = getColorByScore(score);
      const now = ev.timestamp || Date.now();

      // append point
      setPoints(prev => {
        if (prev.some(p => p.id === id)) return prev;
        const newPt = {
          id,
          ip: ev.ip,
          lat,
          lng,
          score,
          color,
          city: ev.geo_info?.city,
          abuse_info: ev.abuse_info,
          geo_info: ev.geo_info,
          timestamp: now
        };
        return [newPt, ...prev].slice(0, MAX_POINTS);
      });

      // append arc (server may include ev.arc)
      setArcs(prev => {
        const arcId = `arc-${id}`;
        if (prev.some(a => a.id === arcId)) return prev;
        const serverArc = ev.arc || {};
        const newArc = {
          id: arcId,
          startLat: serverArc.startLat ?? 0,
          startLng: serverArc.startLng ?? 0,
          endLat: serverArc.endLat ?? lat,
          endLng: serverArc.endLng ?? lng,
          color,
          altitude: 0.25 + Math.random() * 0.5,
          timestamp: now
        };
        // schedule removal after 30s
        setTimeout(() => {
          setArcs(prevA => prevA.filter(a => a.id !== arcId));
        }, 30000);
        return [newArc, ...prev].slice(0, MAX_ARCS);
      });

      // pulse ring
      if (lat !== null && lng !== null) {
        setRings([{ id: `ring-${id}`, lat, lng }]);
      }

      // update recent IPs
      setRecentIps(prev => {
        const dedup = [ev.ip, ...prev.filter(x => x !== ev.ip)].slice(0, LAST_N);
        try { localStorage.setItem('recentIps', JSON.stringify(dedup)); } catch {}
        return dedup;
      });

      // alert for high severity
      if (score >= 70) {
        try { playAlertSound(); } catch {}
        showToast && showToast(`High severity attack detected: ${ev.ip} (score ${score})`, 'warning');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsEvents]);

  // prune arcs older than 30s every 5s
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setArcs(prev => prev.filter(a => (a.timestamp || 0) >= cutoff));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Handler to clear all state and reset globe
  const handleClearAll = () => {
    setPoints([]);
    setArcs([]);
    setRings([]);
    setSelectedInfo(null);
    setCurrentIp('');
    setRecentIps([]);
    localStorage.removeItem('recentIps');
    globeRef.current?.pointOfView({ lat: 0, lng: 0, altitude: 2 }, 1500);
  };

  useEffect(() => {
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
  }, [theme]);
  const handleThemeToggle = () => {
    console.log('Theme button clicked!');
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };
  const handleLegendToggle = () => setLegendCollapsed(c => !c);

  // Resize/mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Controls auto-rotate speed
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = rotateSpeed;
  }, [autoRotate, rotateSpeed]);

  // Auto-run if ?ip= present
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('ip');
    if (q && validIPv4(q)) {
      setIp(q);
      setTimeout(() => handleAnalyze(q), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSV export of recent IPs based on currently known point data
  function handleExportCSV() {
    const header = ['IP', 'Country', 'City', 'Abuse Score', 'Type', 'ISP'];
    const rows = recentIps.map(ipVal => {
      const pt = points.find(p => p.ip === ipVal);
      const geo = pt?.geo_info || {};
      const abuse = pt?.abuse_info?.data || {};
      return [
        ipVal,
        geo.country || '',
        geo.city || '',
        abuse.abuseConfidenceScore ?? '',
        abuse.usageType || '',
        abuse.isp || ''
      ];
    });
    const csv = [header, ...rows]
      .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ddos-globe-export-${Date.now()}.csv`;
    a.click();
  }

  async function handleAnalyze(targetIp) {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/analyze_ip?ip=${encodeURIComponent(targetIp)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Backend responded ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Geo info
        const geo = data.geo_info || {};
        const latitude = geo.latitude;
        const longitude = geo.longitude;
        const country = geo.country || 'Unknown';

        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          console.warn('No geolocation returned for IP:', targetIp, data);
          showToast('No geolocation returned for IP', 'error');
          return;
        }

        // Abuse score (field name per your backend notes)
        const abuse = data.abuse_info || {};
        const score = Number(abuse.abuseConfidenceScore ?? abuse.data?.abuseConfidenceScore) || 0;
        const color = getColorByScore(score);

        // Origin for arc = current camera view
        const pov = globeRef.current?.pointOfView?.() || { lat: 0, lng: 0 };
        const startLat = typeof pov.lat === 'number' ? pov.lat : 0;
        const startLng = typeof pov.lng === 'number' ? pov.lng : 0;

        // Add point and arc with timestamp
        const now = Date.now();
        const newPoint = {
          id: `${targetIp}-${now}`,
          lat: latitude,
          lng: longitude,
          ip: data.ip || targetIp,
          country,
          color, // <— new color
          score,
          city: geo.city,
          abuse_info: data.abuse_info,
          geo_info: data.geo_info,
          timestamp: now,
        };
        setPoints(prev => [newPoint, ...prev].slice(0, MAX_POINTS));
        setSelectedInfo(newPoint);

        const newArc = {
          id: `arc-${now}`,
          startLat,
          startLng,
          endLat: latitude,
          endLng: longitude,
          color, // <— use the same color here
          altitude: 0.25 + Math.random() * 0.5,
          timestamp: now,
        };
        setArcs(prev => [newArc, ...prev].slice(0, MAX_ARCS));

        // Pulse ring
        setRings([{ id: `ring-${now}`, lat: latitude, lng: longitude }]);

        // Pause auto-rotate, fly to IP
        setAutoRotate(false);
        globeRef.current?.pointOfView(
          { lat: latitude, lng: longitude, altitude: 1.2 },
          1500
        );
        setTimeout(() => setAutoRotate(true), 2000);

        // Shareable link + current IP
        setCurrentIp(targetIp);
        window.history.replaceState({}, '', buildShareUrl(targetIp));

        // Update recent IPs (strings), de-dupe
        setRecentIps(prev => {
          const dedup = [targetIp, ...prev.filter(x => x !== targetIp)].slice(0, LAST_N);
          localStorage.setItem('recentIps', JSON.stringify(dedup));
          return dedup;
        });

        // Remove arc after 30s to keep scene fresh
        setTimeout(() => {
          setArcs(prev => prev.filter(a => a.id !== newArc.id));
        }, 30000);

        showToast('IP data loaded successfully', 'success');
      })
      .catch(err => {
        console.error('Error fetching data from backend', err);
        showToast('Could not load IP data', 'error');
      })
      .finally(() => setLoading(false));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ipTrimmed = ip.trim();
    if (!validIPv4(ipTrimmed)) return;
    await handleAnalyze(ipTrimmed);
  };

  const handleShare = () => {
    const shareIp = currentIp || ip.trim();
    if (!validIPv4(shareIp)) return;
    const url = buildShareUrl(shareIp);
    navigator.clipboard?.writeText(url)
      .then(() => showToast("Link copied to clipboard!", "success"))
      .catch(() => showToast("Could not copy link", "error"));
  };

  const handleSnapshot = () => {
    const canvas = globeRef.current?.renderer()?.domElement;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `ddos-globe-${Date.now()}.png`;
    a.click();
    showToast("Snapshot downloaded", "info");
  };

  // Severity band helper (for filtering)
  function getSeverityBand(score = 0) {
    const s = Number(score) || 0;
    if (s >= 70) return 'High';
    if (s >= 30) return 'Medium';
    return 'Low';
  }

  // Timeline state
  const allTimestamps = points.map(pt => pt.timestamp).filter(Boolean).sort((a, b) => a - b);
  const minTime = allTimestamps[0] || Date.now();
  const maxTime = allTimestamps[allTimestamps.length - 1] || Date.now();
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  // Default timelineValue to Date.now() so all points/arcs are visible on load
  const [timelineValue, setTimelineValue] = useState(Date.now());

  // Filtered points for globe (by country, severity, and timeline if playing)
  const filteredPoints = points.filter(pt => {
    const country = pt.country || pt.geo_info?.country || '';
    const sev = getSeverityBand(pt.score);
    const countryOk = !filterCountry || country === filterCountry;
    const severityOk = !filterSeverity || sev === filterSeverity;
    if (!timelinePlaying) return countryOk && severityOk;
    const timeOk = !pt.timestamp || pt.timestamp <= timelineValue;
    return countryOk && severityOk && timeOk;
  });
  // Filter arcs by timeline if playing
  const filteredArcs = arcs.filter(a => {
    if (!timelinePlaying) return true;
    return !a.timestamp || a.timestamp <= timelineValue;
  });

  // Clustering logic
  const [cameraAltitude, setCameraAltitude] = useState(2);
  // Cluster if zoomed out (altitude >= 1.1)
  const clusteredPoints = clusterPoints(filteredPoints, 4, cameraAltitude, 1.1);

  /* =========================
     Render
  ========================= */
  // Log filtered counts for debugging
  console.log('filteredPoints.length:', filteredPoints.length);
  console.log('filteredArcs.length:', filteredArcs.length);
  return (
    <NotificationProvider>
    <div className="app-container">
      {/* Hamburger toggle button for sidebar */}
      <button
        aria-label="Toggle sidebar"
        onClick={() => setSidebarOpen(o => !o)}
        style={{
          position: 'fixed',
          top: 18,
          left: 18,
          zIndex: 200,
          background: 'none',
          border: 'none',
          color: theme === 'dark' ? '#FFD700' : '#222',
          fontSize: 28,
          cursor: 'pointer',
          padding: 4,
        }}
      >
        {/* Hamburger icon */}
        <span style={{ display: sidebarOpen ? 'none' : 'block' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-label="Open sidebar" role="img">
            <rect y="5" width="28" height="3" rx="1.5" fill="currentColor" />
            <rect y="12.5" width="28" height="3" rx="1.5" fill="currentColor" />
            <rect y="20" width="28" height="3" rx="1.5" fill="currentColor" />
          </svg>
        </span>
        {/* X icon when open */}
        <span style={{ display: sidebarOpen ? 'block' : 'none' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-label="Close sidebar" role="img">
            <line x1="6" y1="6" x2="22" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <line x1="22" y1="6" x2="6" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {/* Sidebar component with all left controls */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        theme={theme}
        recentIps={recentIps}
        setRecentIps={setRecentIps}
        handleExportCSV={handleExportCSV}
        handleClearAll={handleClearAll}
        setIp={setIp}
        points={points}
        filterCountry={filterCountry}
        setFilterCountry={setFilterCountry}
        filterSeverity={filterSeverity}
        setFilterSeverity={setFilterSeverity}
        GLOBE_TEXTURES={GLOBE_TEXTURES}
        globeTexture={globeTexture}
        setGlobeTexture={setGlobeTexture}
        onThemeToggle={handleThemeToggle}
        heatmapMode={heatmapMode}
        setHeatmapMode={setHeatmapMode}
      />
      {loading && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.3)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          pointerEvents: "none"
        }}>
          <div className="spinner"></div>
        </div>
      )}
  {/* Notifications */}
  <NotificationPanel />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <h1 className="app-header" style={{ margin: 0 }}>DDoS Globe Visualizer</h1>
        <ThemeToggle theme={theme} onToggle={handleThemeToggle} />
        {/* Notification bell */}
        <NotificationBell />
      </div>

      {/* Top controls */}
      <form className="input-container" onSubmit={handleSubmit}>
        <input
          type="text"
          className="ip-input"
          placeholder="Enter IPv4 (e.g. 198.51.100.23)"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
        />
        <button className="ip-button" type="submit" disabled={!validIPv4(ip.trim())} aria-label="Analyze IP">
          Analyze
        </button>

        <button type="button" className="ip-button" onClick={handleShare} title="Copy shareable link" aria-label="Share IP">
          Share
        </button>
        <button type="button" className="ip-button" onClick={handleSnapshot} title="Download PNG snapshot" aria-label="Download snapshot">
          Snapshot
        </button>
        <button
          type="button"
          className="ip-button"
          onClick={() => setLiveMode(l => !l)}
          title="Toggle Live Mode"
          aria-label="Toggle Live Mode"
        >
          {liveMode ? "Live: On" : "Live: Off"}
        </button>
        <button type="button" className="ip-button" onClick={handleClearAll} title="Reset globe and clear all data" aria-label="Reset globe">
          Reset Globe
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Rotate speed</label>
          <label htmlFor="rotate-speed" style={{ fontSize: 12, opacity: 0.8, marginRight: 4 }}>Rotate speed</label>
          <input
            id="rotate-speed"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={rotateSpeed}
            onChange={(e) => setRotateSpeed(parseFloat(e.target.value))}
            aria-label="Rotate speed"
          />
          <button
            type="button"
            className="ip-button"
            onClick={() => setAutoRotate((v) => !v)}
            title="Toggle auto-rotate"
            aria-label="Toggle auto-rotate"
          >
            {autoRotate ? 'Pause' : 'Rotate'}
          </button>
        </div>
      </form>

      {/* Search/filter input */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
        <label htmlFor="search-input" style={{ display: 'none' }}>Search by IP or country</label>
        <input
          id="search-input"
          type="text"
          placeholder="Search by IP or country…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            borderRadius: 10,
            padding: '8px 12px',
            background: theme === 'dark' ? '#18191a' : '#f5f5f5',
            color: theme === 'dark' ? '#fff' : '#181818',
            border: `1px solid ${theme === 'dark' ? '#444' : '#ccc'}`,
            outline: 'none',
            fontSize: 15,
            boxShadow: 'none',
            transition: 'box-shadow 0.2s, border-color 0.2s',
          }}
          aria-label="Search by IP or country"
          onFocus={e => e.target.style.boxShadow = theme === 'dark'
            ? '0 0 0 2px #FFD70055'
            : '0 0 0 2px #FFD70044'}
          onBlur={e => e.target.style.boxShadow = 'none'}
          onKeyDown={async e => {
            if (e.key === 'Enter') {
              const value = searchTerm.trim();
              if (validIPv4(value)) {
                handleAnalyze(value);
              } else if (value) {
                const term = value;
                // Try to geocode country name using Nominatim
                try {
                  const resp = await fetch(`https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(term)}&format=json&limit=1`);
                  const data = await resp.json();
                  if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
                    globeRef.current?.pointOfView({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), altitude: 1.5 }, 1500);
                  } else {
                    alert('No results found');
                  }
                } catch {
                  alert('No results found');
                }
              }
            }
          }}
        />
        <style>{`
          input[type="text"]::placeholder {
            color: ${theme === 'dark' ? '#bbb' : '#888'};
            opacity: 0.7;
          }
        `}</style>
      </div>

      <div role="application" aria-label="Interactive globe">
        <Globe
          ref={globeRef}
          pointsData={clusteredPoints}
          pointLat={d => d.lat}
          pointLng={d => d.lng}
          pointLabel={d => d.isCluster ? `<b>${d.count} attacks</b><br/>Click to zoom in` : getTooltipContent(d)}
          pointColor={d =>
            heatmapMode
              ? getSeverityColor(d.abuse_score || d.abuse_info?.data?.abuseConfidenceScore || 0)
              : (d.isCluster ? '#FFD700' : d.color)
          }
          pointAltitude={d => d.isCluster ? 0.025 : 0.005 + ((d.score || 0) / 100) * 0.01}
          pointRadius={d => d.isCluster ? 1.2 + 0.2 * Math.log2(d.count) : 0.7}
          onPointClick={point => {
            if (point.isCluster) {
              // Zoom in to cluster area
              setAutoRotate(false);
              globeRef.current?.pointOfView(
                { lat: point.lat, lng: point.lng, altitude: Math.max(cameraAltitude * 0.5, 0.7) },
                1200
              );
              setTimeout(() => setAutoRotate(true), 2000);
            } else {
              setSelectedInfo(point);
              setAutoRotate(false);
              globeRef.current?.pointOfView(
                { lat: point.lat, lng: point.lng, altitude: 1.2 },
                1500
              );
              setTimeout(() => setAutoRotate(true), 2000);
            }
          }}
          onGlobeClick={(coords) => console.log('Clicked globe at:', coords)}
          onPointHover={p => {
            const canvas = globeRef.current?.renderer()?.domElement;
            if (canvas) canvas.style.cursor = p ? 'pointer' : 'grab';
          }}
          globeImageUrl={globeTexture}
          backgroundColor="rgba(0,0,0,0)"
          enablePointerInteraction={true}
          arcsData={filteredArcs}
          arcStartLat={d => d.startLat}
          arcStartLng={d => d.startLng}
          arcEndLat={d => d.endLat}
          arcEndLng={d => d.endLng}
          arcColor={d =>
            heatmapMode
              ? getSeverityColor(d.abuse_score || d.abuse_info?.data?.abuseConfidenceScore || 0)
              : '#FFD700'
          }
          arcAltitude={d => d.altitude}
          arcStroke={0.9}
          arcDashLength={0.6}
          arcDashGap={0.4}
          arcDashAnimateTime={2000}
          ringsData={rings}
          ringLat={d => d.lat}
          ringLng={d => d.lng}
          ringColor={() => (t) => `rgba(255,120,120,${1 - t})`}
          ringMaxRadius={2.2}
          ringPropagationSpeed={1.4}
          ringRepeatPeriod={1200}
          onZoom={alt => setCameraAltitude(alt)}
        />
      </div>
      {/* Timeline slider for replay */}
      {allTimestamps.length > 1 && (
        <TimelineSlider
          min={minTime}
          max={maxTime}
          value={timelineValue}
          onChange={setTimelineValue}
          onPlayPause={() => setTimelinePlaying(p => !p)}
          playing={timelinePlaying}
          theme={theme}
        />
      )}
      {/* Severity legend always anchored at bottom left */}
      <div style={{ position: 'fixed', left: 18, bottom: 18, zIndex: 10 }}>
        <SeverityLegend
          collapsed={legendCollapsed}
          onToggle={handleLegendToggle}
          isMobile={isMobile}
        />
      </div>

      {/* Side Info Panel (right) */}
      <SideInfoPanel
        info={selectedInfo}
        collapsed={isMobile ? sideCollapsed : false}
        onToggle={() => setSideCollapsed(c => !c)}
        isMobile={isMobile}
      />
    </div>
    </NotificationProvider>
  );


  // Timeline play effect (single, above return)
  useEffect(() => {
    if (!timelinePlaying) return;
    if (timelineValue >= maxTime) {
      setTimelinePlaying(false);
      return;
    }
    const nextIdx = allTimestamps.findIndex(t => t > timelineValue);
    const nextTime = nextIdx === -1 ? maxTime : allTimestamps[nextIdx];
    const id = setTimeout(() => setTimelineValue(nextTime), 350);
    return () => clearTimeout(id);
  }, [timelinePlaying, timelineValue, maxTime, allTimestamps]);
}
