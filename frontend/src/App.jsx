import React, { useEffect, useRef, useState, useCallback } from "react";
import Globe from "./components/Globe";
import useDShieldStream from "./hooks/useDShieldStreamFinal";
import ThemeToggle from "./components/ThemeToggle";
import Sidebar from "./components/Sidebar";
import StatsPanel from "./components/StatsPanel";
import { showToast } from "./components/Toast";
import NotificationProvider from "./notifications/NotificationProvider";
import NotificationPanel from "./notifications/NotificationPanel";
import NotificationBell from "./notifications/NotificationBell";
import { clusterPoints } from "./utils/clusterPoints";
import { debounce } from "./utils/debounce";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import "./App.css";
import "./styles/themes.css";

// Color helper for dots/arcs based on abuseConfidenceScore
const getColorByScore = (score = 0) => {
  const s = Number(score) || 0;
  if (s >= 70) return "red"; // high severity
  if (s >= 30) return "orange"; // medium severity
  return "yellow"; // low severity
};
function SeverityLegend({ collapsed, onToggle, isMobile }) {
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

/* =========================
   Constants & Utilities
========================= */
const MAX_ARCS = 500;
const MAX_POINTS = 100;
const LAST_N = 6;

const GLOBE_TEXTURES = [
  {
    label: "Night",
    url: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
  },
  {
    label: "Day",
    url: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  },
  {
    label: "Dark",
    url: "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
  },
];

// Fallback texture in case remote textures fail to load
const FALLBACK_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

function validIPv4(ip) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(
    ip,
  );
}

const severityColor = (score = 0) => {
  const n = Number(score) || 0;
  if (n >= 80) return "rgb(220,40,40)"; // red
  if (n >= 40) return "rgb(255,140,0)"; // orange
  return "rgb(255,220,80)"; // yellow
};

// Preload texture and return a promise
const preloadTexture = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
    img.src = url;
  });
};

// Try loading textures with retry logic
const loadTextureWithRetry = async (urls, maxRetries = 2) => {
  for (const url of urls) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await preloadTexture(url);
        return url;
      } catch (err) {
        lastError = err;
        console.warn(`Attempt ${i + 1} failed to load texture ${url}:`, err);
      }
    }
    console.error(`All attempts to load texture ${url} failed:`, lastError);
  }
  return FALLBACK_TEXTURE;
};

function arcGradient(score = 0) {
  return [severityColor(score), "rgba(255,255,255,0.6)"];
}

/* =========================
   Presentational Components
========================= */

// Bottom-left severity legend with inline chevron (collapsible on mobile, always open on desktop)

// Side Info Panel Component (right side)
function SideInfoPanel({ info, collapsed, onToggle, isMobile }) {
  // Force dark theme styling regardless of global theme
  const panelStyle = {
    position: "absolute",
    right: 12,
    top: 100,
    bottom: 12,
    width: collapsed ? 44 : isMobile ? "60%" : 360,
    transition: "width 0.2s ease",
    background:
      "linear-gradient(180deg, rgba(16,16,16,0.98), rgba(12,12,12,0.96))",
    border: "1px solid rgba(255,213,79,0.35)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
    borderRadius: 14,
    padding: 0,
    zIndex: 3,
    color: "#f1f1f1",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const chevronBtnStyle = {
    position: "absolute",
    left: 6,
    top: 6,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 6,
    borderRadius: 10,
  };

  // Helper to render a field if present
  const renderField = (label, value) =>
    value !== undefined &&
    value !== null &&
    value !== "" && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "100px 1fr",
          gap: 6,
          alignItems: "center",
        }}
      >
        <div style={{ color: "#FFD700", opacity: 0.9, fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ color: "#e8e8e8" }}>{value}</div>
      </div>
    );

  // Abuse info extraction
  const abuse = info?.abuse_info?.data || info?.abuse_info || {};

  return (
    <div style={panelStyle} className="side-info-panel">
      <button
        className="side-chevron"
        aria-label={collapsed ? "Expand info panel" : "Collapse info panel"}
        onClick={onToggle}
        style={chevronBtnStyle}
        title={collapsed ? "Expand" : "Collapse"}
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
          aria-label={collapsed ? "Expand info panel" : "Collapse info panel"}
        >
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
        <div
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {/* Sticky header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "rgba(18,18,18,0.98)",
              borderBottom: "1px solid rgba(255,213,79,0.25)",
              padding: "14px 16px",
              zIndex: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 10,
                  background: "#FFD54F",
                  boxShadow: "0 0 8px rgba(255,213,79,0.5)",
                }}
              />
              <div style={{ fontWeight: 700, letterSpacing: 0.4 }}>
                IP Details
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div
            className="side-info-content"
            style={{
              padding: "12px 16px",
              fontSize: 13.5,
              lineHeight: 1.6,
              display: "grid",
              gap: 12,
              overflowY: "auto",
            }}
          >
            {info ? (
              <>
                {renderField("IP Address", info.ip)}
                {renderField(
                  "Country",
                  info.country || info.countryCode || info.geo_info?.country,
                )}
                {renderField("City", info.city || info.geo_info?.city)}
                {renderField("ASN", info.asn || abuse.asn)}
                {renderField("ISP", info.isp || abuse.isp)}
                {renderField("Domain", info.domain || abuse.domain)}
                {renderField("Usage Type", info.usageType || abuse.usageType)}
                {renderField(
                  "Last Seen",
                  info.lastSeen || abuse.lastReportedAt,
                )}
                {renderField(
                  "Confidence",
                  (info.confidence !== undefined
                    ? info.confidence
                    : abuse.abuseConfidenceScore) + "%",
                )}
                {typeof info.lat === "number" &&
                  typeof info.lng === "number" &&
                  renderField(
                    "Coordinates",
                    `${info.lat.toFixed(3)}, ${info.lng.toFixed(3)}`,
                  )}
                {renderField(
                  "Hostnames",
                  Array.isArray(info.hostnames)
                    ? info.hostnames.join(", ")
                    : info.hostnames,
                )}
              </>
            ) : (
              <div style={{ color: "#bbb" }}>No point selected.</div>
            )}
          </div>

          {/* Sticky footer actions (Share removed) */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              background: "rgba(18,18,18,0.98)",
              borderTop: "1px solid rgba(255,213,79,0.25)",
              padding: "10px 12px",
              display: "flex",
              gap: 8,
            }}
          >
            {info?.ip ? (
              <>
                <a
                  href={`https://www.abuseipdb.com/check/${info.ip}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ip-button"
                  style={{ textDecoration: "none" }}
                >
                  AbuseIPDB
                </a>
                <a
                  href={`https://ipinfo.io/${info.ip}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ip-button"
                  style={{ textDecoration: "none" }}
                >
                  IPInfo
                </a>
              </>
            ) : (
              <button
                type="button"
                className="ip-button"
                disabled
                style={{ opacity: 0.5 }}
              >
                No IP
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Tooltip content utility for react-globe.gl.
   It returns a plain string; react-globe.gl will render it in a small tooltip. */
function getTooltipContent(point) {
  if (!point) return "";
  const { ip, city, country, abuse_info = {} } = point;
  const abuseData = abuse_info.data || {};
  const score = abuseData.abuseConfidenceScore ?? "–";
  const usageType = abuseData.usageType || "Unknown";

  return `
    <div style="min-width:150px">
      <b>${ip}</b><br/>
      ${city ? city + ", " : ""}${country || ""}<br/>
      <span style="color:#FFD700">Score: ${score}</span><br/>
      <i>${usageType}</i>
    </div>
  `;
}

/* =========================
   App Content Component
========================= */
function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // State hooks
  const [ip, setIp] = useState("");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentIp, setCurrentIp] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [points, setPoints] = useState([]);
  const [arcs, setArcs] = useState([]);
  // Live mode state: whether to receive and process live websocket events
  // Default OFF to avoid fetching/rendering live notifications until user enables it
  const [liveMode, setLiveMode] = useState(false);

  // Clear all visualizations when component mounts or live mode is disabled
  useEffect(() => {
    setPoints([]);
    setArcs([]);
    setLoading(false);
    if (processedEventIdsRef.current) {
      processedEventIdsRef.current.clear();
    }
  }, [liveMode]);
  const [rings, setRings] = useState([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateSpeed, setRotateSpeed] = useState(0.5);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [recentIps, setRecentIps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("recentIps") || "[]"); // array of IP strings
    } catch {
      return [];
    }
  });
  const [globeTexture, setGlobeTexture] = useState(GLOBE_TEXTURES[0].url);
  const [globeReady, setGlobeReady] = useState(false);
  const [textureError, setTextureError] = useState(false);

  // Handle texture loading errors
  const handleTextureError = useCallback(() => {
    console.error("Failed to load globe texture:", globeTexture);
    setTextureError(true);
    setGlobeTexture(FALLBACK_TEXTURE);
    showToast("Failed to load globe texture, using fallback", "warning");
  }, [globeTexture]);

  // Reset texture error when changing texture
  useEffect(() => {
    setTextureError(false);
  }, [globeTexture]);
  // Filter state
  const [filterCountry, setFilterCountry] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  // Heatmap mode state
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Sync live mode state with window for cache control
  useEffect(() => {
    window.__liveModeEnabled = liveMode;
    if (!liveMode) {
      localStorage.removeItem("live_feed");
    }
  }, [liveMode]);
  // Severity color for heatmap mode
  const getSeverityColor = (score) => {
    if (score >= 70) return "red";
    if (score >= 30) return "orange";
    return "green";
  };

  // Ref (must be before any useEffect that uses it)
  const globeRef = useRef();

  // DShield streaming hook with rate limiting
  const addDShieldArc = useCallback((arc) => {
    console.log("[App] 🎯 Adding DShield arc:", arc.id, "IP:", arc.ip);

    // Show notification for new attack with IP details
    if (arc.ip && arc.ip !== "Unknown") {
      showToast(
        `🎯 New Attack: ${arc.ip} (${arc.country || "Unknown"}) - ${arc.attackCount || 0} attacks`,
        "info"
      );
    }

    setArcs((prev) => {
      // Limit to 5 arcs maximum - remove oldest
      const updated = [arc, ...prev].slice(0, 5);
      return updated;
    });

    // Add pulse ring at destination
    setRings((prev) => {
      const newRing = {
        id: `ring-${arc.id}`,
        lat: arc.endLat,
        lng: arc.endLng,
      };
      return [newRing, ...prev].slice(0, 5);
    });

    // Add point at source location with IP details
    setPoints((prev) => {
      const newPoint = {
        id: `point-${arc.id}`,
        lat: arc.startLat,
        lng: arc.startLng,
        color: arc.color,
        size: 0.5 + (arc.confidence / 100) * 0.5,
        timestamp: arc.timestamp,
        source: arc.source,
        confidence: arc.confidence,
        ip: arc.ip,
        country: arc.country,
        attackCount: arc.attackCount,
      };
      return [newPoint, ...prev].slice(0, MAX_POINTS);
    });

    // Remove arc and point after 25 seconds (5 arcs * 5 sec interval)
    setTimeout(() => {
      setArcs((prev) => prev.filter((a) => a.id !== arc.id));
      setPoints((prev) => prev.filter((p) => p.id !== `point-${arc.id}`));
    }, 25000);
  }, [showToast]);

  const handleDShieldStatus = useCallback(
    (status) => {
      // Don't show connection status notifications - too spammy
      // Only log to console
      console.log("[App] DShield status:", status);
    },
    [],
  );

  const { isConnected: dshieldConnected, lastError: dshieldError } =
    useDShieldStream(liveMode, addDShieldArc, handleDShieldStatus);

  // Show subtle offline badge when live mode is ON but not connected
  const LiveOfflineBadge = () => {
    // Only show if live mode is enabled AND explicitly disconnected with error
    if (!liveMode || !dshieldError) return null;
    
    return (
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 20,
          background: "rgba(220, 38, 38, 0.12)",
          color: "#ef4444",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          backdropFilter: "blur(4px)",
        }}
      >
        Live feed offline
      </div>
    );
  };

  // keep processed ids to avoid duplicates
  const processedEventIdsRef = useRef(new Set());
  useEffect(() => {
    if (liveMode) {
      // Don't spam notifications - just log
      console.log("[App] Live Mode enabled");
    } else {
      processedEventIdsRef.current.clear();
      console.log("[App] Live Mode disabled");
    }
  }, [liveMode]);

  // DShield streaming - no random arcs in production
  useEffect(() => {
    if (!liveMode) return;

    // Only allow random arcs in development with explicit flag
    const allowRandomArcs =
      import.meta?.env?.MODE === "development" &&
      import.meta?.env?.VITE_ALLOW_RANDOM_ARCS === "true";

    if (allowRandomArcs) {
      console.warn("Random arcs enabled for development only");
      const generateRandomArc = () => {
        const startLat = Math.random() * 180 - 90;
        const startLng = Math.random() * 360 - 180;
        const endLat = Math.random() * 180 - 90;
        const endLng = Math.random() * 360 - 180;

        const arcId = `dev-arc-${Date.now()}-${Math.random()}`;
        const severity = Math.random();
        const color =
          severity > 0.7 ? "red" : severity > 0.4 ? "orange" : "yellow";

        const newArc = {
          id: arcId,
          startLat,
          startLng,
          endLat,
          endLng,
          color,
          altitude: 0.25 + Math.random() * 0.5,
          timestamp: Date.now(),
        };

        setArcs((prev) => [newArc, ...prev].slice(0, MAX_ARCS));
        setRings((prev) => {
          const newRing = { id: `ring-${arcId}`, lat: endLat, lng: endLng };
          return [newRing, ...prev].slice(0, 5);
        });

        setTimeout(() => {
          setArcs((prev) => prev.filter((a) => a.id !== arcId));
        }, 15000);
      };

      const interval = setInterval(
        generateRandomArc,
        2000 + Math.random() * 3000,
      );
      return () => clearInterval(interval);
    }
  }, [liveMode]);

  // Live mode uses DShield stream only to avoid duplicate connections

  // prune arcs older than 30s every 5s
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setArcs((prev) => prev.filter((a) => (a.timestamp || 0) >= cutoff));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Handler to clear all state and reset globe
  const handleClearAll = () => {
    setPoints([]);
    setArcs([]);
    setRings([]);
    setSelectedInfo(null);
    setCurrentIp("");
    setRecentIps([]);
    processedEventIdsRef.current.clear();
    localStorage.removeItem("recentIps");
    globeRef.current?.pointOfView({ lat: 0, lng: 0, altitude: 2 }, 1500);
  };

  useEffect(() => {
    document.body.classList.remove("dark-theme", "light-theme");
    document.body.classList.add(
      theme === "dark" ? "dark-theme" : "light-theme",
    );
  }, [theme]);
  const handleThemeToggle = () => {
    console.log("Theme button clicked!");
    toggleTheme();
  };
  const handleLegendToggle = () => setLegendCollapsed((c) => !c);

  // Resize/mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Controls auto-rotate speed
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = rotateSpeed;
  }, [autoRotate, rotateSpeed]);

  // Handle Globe initialization and auto-run IP query
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("ip");

    if (globeRef.current && globeReady) {
      setLoading(false);
      if (q && validIPv4(q)) {
        setIp(q);
        handleAnalyze(q);
      }
    }
  }, [globeReady]);

  // Load globe texture
  useEffect(() => {
    let mounted = true;

    const loadTexture = async () => {
      try {
        setLoading(true);
        const textureUrl = await loadTextureWithRetry([
          globeTexture,
          ...GLOBE_TEXTURES.map((t) => t.url),
        ]);
        if (mounted) {
          setGlobeTexture(textureUrl);
          setTextureError(textureUrl === FALLBACK_TEXTURE);
        }
      } catch (err) {
        console.error("Failed to load any globe textures:", err);
        if (mounted) {
          setGlobeTexture(FALLBACK_TEXTURE);
          setTextureError(true);
          showToast("Failed to load globe textures", "error");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadTexture();
    return () => {
      mounted = false;
    };
  }, []);

  // Globe ready handler
  const handleGlobeReady = useCallback(() => {
    setGlobeReady(true);
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = autoRotate;
      globeRef.current.controls().autoRotateSpeed = rotateSpeed;
    }
  }, [autoRotate, rotateSpeed]);

  // Globe error handler
  const handleGlobeError = useCallback((error) => {
    console.error("Globe initialization error:", error);
    setLoading(false);
    showToast("Failed to initialize globe visualization", "error");
  }, []);

  // CSV export of recent IPs based on currently known point data
  function handleExportCSV() {
    const header = ["IP", "Country", "City", "Abuse Score", "Type", "ISP"];
    const rows = recentIps.map((ipVal) => {
      const pt = points.find((p) => p.ip === ipVal);
      const geo = pt?.geo_info || {};
      const abuse = pt?.abuse_info?.data || {};
      return [
        ipVal,
        geo.country || "",
        geo.city || "",
        abuse.abuseConfidenceScore ?? "",
        abuse.usageType || "",
        abuse.isp || "",
      ];
    });
    const csv = [header, ...rows]
      .map((r) =>
        r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ddos-globe-export-${Date.now()}.csv`;
    a.click();
  }

  async function handleAnalyze(targetIp) {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/analyze_ip?ip=${encodeURIComponent(targetIp)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Geo info
        const geo = data.geo_info || {};
        const latitude = geo.latitude;
        const longitude = geo.longitude;
        const country = geo.country || "Unknown";

        if (typeof latitude !== "number" || typeof longitude !== "number") {
          console.warn("No geolocation returned for IP:", targetIp, data);
          showToast("No geolocation returned for IP", "error");
          return;
        }

        // Abuse score (field name per your backend notes)
        const abuse = data.abuse_info || {};
        const score =
          Number(
            abuse.abuseConfidenceScore ?? abuse.data?.abuseConfidenceScore,
          ) || 0;
        const color = getColorByScore(score);

        // Origin for arc = current camera view
        const pov = globeRef.current?.pointOfView?.() || { lat: 0, lng: 0 };
        const startLat = typeof pov.lat === "number" ? pov.lat : 0;
        const startLng = typeof pov.lng === "number" ? pov.lng : 0;

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
        setPoints((prev) => [newPoint, ...prev].slice(0, MAX_POINTS));
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
        setArcs((prev) => [newArc, ...prev].slice(0, MAX_ARCS));

        // Pulse ring
        setRings([{ id: `ring-${now}`, lat: latitude, lng: longitude }]);

        // Pause auto-rotate, fly to IP
        setAutoRotate(false);
        globeRef.current?.pointOfView(
          { lat: latitude, lng: longitude, altitude: 1.2 },
          1500,
        );
        setTimeout(() => setAutoRotate(true), 2000);

        // Shareable link + current IP
        setCurrentIp(targetIp);
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (targetIp ? `?ip=${targetIp}` : ""),
        );

        // Update recent IPs (strings), de-dupe
        setRecentIps((prev) => {
          const dedup = [targetIp, ...prev.filter((x) => x !== targetIp)].slice(
            0,
            LAST_N,
          );
          localStorage.setItem("recentIps", JSON.stringify(dedup));
          return dedup;
        });

        // Remove arc after 30s to keep scene fresh
        setTimeout(() => {
          setArcs((prev) => prev.filter((a) => a.id !== newArc.id));
        }, 30000);

        showToast("IP data loaded successfully", "success");
      })
      .catch((err) => {
        console.error("Error fetching data from backend", err);
        showToast("Could not load IP data", "error");
      })
      .finally(() => setLoading(false));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ipTrimmed = ip.trim();
    if (!validIPv4(ipTrimmed)) return;
    await handleAnalyze(ipTrimmed);
  };

  const handleSnapshot = () => {
    const canvas = globeRef.current?.renderer()?.domElement;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ddos-globe-${Date.now()}.png`;
    a.click();
    showToast("Snapshot downloaded", "info");
  };

  // Severity band helper (for filtering)
  function getSeverityBand(score = 0) {
    const s = Number(score) || 0;
    if (s >= 70) return "High";
    if (s >= 30) return "Medium";
    return "Low";
  }

  // Filtered points for globe (by country, severity, and timeline if playing)
  const filteredPoints = points.filter((pt) => {
    const country = pt.country || pt.geo_info?.country || "";
    const sev = getSeverityBand(pt.score);
    const countryOk = !filterCountry || country === filterCountry;
    const severityOk = !filterSeverity || sev === filterSeverity;
    return countryOk && severityOk;
  });
  // Filter arcs
  const filteredArcs = arcs;

  // Clustering logic
  const [cameraAltitude, setCameraAltitude] = useState(2);
  // Cluster if zoomed out (altitude >= 1.1)
  const clusteredPoints = clusterPoints(filteredPoints, 4, cameraAltitude, 1.1);

  /* =========================
     Render
  ========================= */
  // Log filtered counts for debugging
  console.log("filteredPoints.length:", filteredPoints.length);
  console.log("filteredArcs.length:", filteredArcs.length);
  return (
    <NotificationProvider>
      <div
        className="app-container"
        style={{
          width: "100vw",
          height: "100vh",
          background: "#111",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Hamburger toggle button for sidebar */}
        <button
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((o) => !o)}
          style={{
            position: "fixed",
            top: 18,
            left: 18,
            zIndex: 200,
            background: "none",
            border: "none",
            color: theme === "dark" ? "#FFD700" : "#222",
            fontSize: 28,
            cursor: "pointer",
            padding: 4,
          }}
        >
          {/* Hamburger icon */}
          <span style={{ display: sidebarOpen ? "none" : "block" }}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              aria-label="Open sidebar"
              role="img"
            >
              <rect y="5" width="28" height="3" rx="1.5" fill="currentColor" />
              <rect
                y="12.5"
                width="28"
                height="3"
                rx="1.5"
                fill="currentColor"
              />
              <rect y="20" width="28" height="3" rx="1.5" fill="currentColor" />
            </svg>
          </span>
          {/* X icon when open */}
          <span style={{ display: sidebarOpen ? "block" : "none" }}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              aria-label="Close sidebar"
              role="img"
            >
              <line
                x1="6"
                y1="6"
                x2="22"
                y2="22"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="6"
                x2="6"
                y2="22"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
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
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.3)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            <div className="spinner"></div>
          </div>
        )}
        {/* Notifications */}
        <NotificationPanel />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginTop: 10,
          }}
        >
          <h1 className="app-header" style={{ margin: 0 }}>
            DDoS Globe Visualizer
          </h1>
          <ThemeToggle />
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
          <button
            className="ip-button"
            type="submit"
            disabled={!validIPv4(ip.trim())}
            aria-label="Analyze IP"
          >
            Analyze
          </button>

          <button
            type="button"
            className="ip-button"
            onClick={handleSnapshot}
            title="Download PNG snapshot"
            aria-label="Download snapshot"
          >
            Snapshot
          </button>
          <button
            type="button"
            className="ip-button"
            onClick={() => setLiveMode((l) => !l)}
            title="Toggle Live Mode"
            aria-label="Toggle Live Mode"
          >
            {liveMode ? "Live: On" : "Live: Off"}
          </button>
          <button
            type="button"
            className="ip-button"
            onClick={handleClearAll}
            title="Reset globe and clear all data"
            aria-label="Reset globe"
          >
            Reset Globe
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 12,
            }}
          >
            <label style={{ fontSize: 12, opacity: 0.8 }}>Rotate speed</label>
            <label
              htmlFor="rotate-speed"
              style={{ fontSize: 12, opacity: 0.8, marginRight: 4 }}
            >
              Rotate speed
            </label>
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
              {autoRotate ? "Pause" : "Rotate"}
            </button>
          </div>
        </form>

        {/* Live offline badge */}
        {liveMode && !dshieldConnected && <LiveOfflineBadge />}

        {/* Search/filter input */}
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
          <label htmlFor="search-input" style={{ display: "none" }}>
            Search by IP or country
          </label>
          <input
            id="search-input"
            type="text"
            placeholder="Search by IP or country…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              borderRadius: 10,
              padding: "8px 12px",
              background: theme === "dark" ? "#18191a" : "#f5f5f5",
              color: theme === "dark" ? "#fff" : "#181818",
              border: `1px solid ${theme === "dark" ? "#444" : "#ccc"}`,
              outline: "none",
              fontSize: 15,
              boxShadow: "none",
              transition: "box-shadow 0.2s, border-color 0.2s",
            }}
            aria-label="Search by IP or country"
            onFocus={(e) =>
              (e.target.style.boxShadow =
                theme === "dark"
                  ? "0 0 0 2px #FFD70055"
                  : "0 0 0 2px #FFD70044")
            }
            onBlur={(e) => (e.target.style.boxShadow = "none")}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                const value = searchTerm.trim();
                if (validIPv4(value)) {
                  handleAnalyze(value);
                } else if (value) {
                  const term = value;
                  // Try to geocode country name using Nominatim
                  try {
                    const resp = await fetch(
                      `https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(term)}&format=json&limit=1`,
                    );
                    const data = await resp.json();
                    if (
                      Array.isArray(data) &&
                      data.length > 0 &&
                      data[0].lat &&
                      data[0].lon
                    ) {
                      globeRef.current?.pointOfView(
                        {
                          lat: parseFloat(data[0].lat),
                          lng: parseFloat(data[0].lon),
                          altitude: 1.5,
                        },
                        1500,
                      );
                    } else {
                      alert("No results found");
                    }
                  } catch {
                    alert("No results found");
                  }
                }
              }
            }}
          />
          <style>{`
          input[type="text"]::placeholder {
            color: ${theme === "dark" ? "#bbb" : "#888"};
            opacity: 0.7;
          }
        `}</style>
        </div>

        <div
          role="application"
          aria-label="Interactive globe"
          className="globe-container"
        >
          <ErrorBoundary>
            <div
              style={{ width: "100%", height: "100%", position: "relative" }}
            >
              <Globe
                ref={globeRef}
                points={points}
                arcs={arcs}
                rings={rings}
                pointsData={clusteredPoints}
                pointLat={(d) => d.lat}
                pointLng={(d) => d.lng}
                pointLabel={(d) =>
                  d.isCluster
                    ? `<b>${d.count} attacks</b><br/>Click to zoom in`
                    : getTooltipContent(d)
                }
                pointColor={(d) =>
                  heatmapMode
                    ? getSeverityColor(
                        d.abuse_score ||
                          d.abuse_info?.data?.abuseConfidenceScore ||
                          0,
                      )
                    : d.isCluster
                      ? "#FFD700"
                      : d.color
                }
                pointAltitude={(d) =>
                  d.isCluster ? 0.025 : 0.005 + ((d.score || 0) / 100) * 0.01
                }
                pointRadius={(d) =>
                  d.isCluster ? 1.2 + 0.2 * Math.log2(d.count) : 0.7
                }
                onPointClick={(point) => {
                  if (point.isCluster) {
                    // Zoom in to cluster area
                    setAutoRotate(false);
                    globeRef.current?.pointOfView(
                      {
                        lat: point.lat,
                        lng: point.lng,
                        altitude: Math.max(cameraAltitude * 0.5, 0.7),
                      },
                      1200,
                    );
                    setTimeout(() => setAutoRotate(true), 2000);
                  } else {
                    setSelectedInfo(point);
                    setAutoRotate(false);
                    globeRef.current?.pointOfView(
                      { lat: point.lat, lng: point.lng, altitude: 1.2 },
                      1500,
                    );
                    setTimeout(() => setAutoRotate(true), 2000);
                  }
                }}
                onGlobeClick={() => setSelectedInfo(null)}
                onPointHover={(p) => {
                  const canvas = globeRef.current?.renderer()?.domElement;
                  if (canvas) canvas.style.cursor = p ? "pointer" : "grab";
                }}
                enablePointerInteraction={true}
                arcsData={filteredArcs}
                arcStartLat={(d) => d.startLat}
                arcStartLng={(d) => d.startLng}
                arcEndLat={(d) => d.endLat}
                arcEndLng={(d) => d.endLng}
                arcColor={(d) =>
                  heatmapMode
                    ? getSeverityColor(
                        d.abuse_score ||
                          d.abuse_info?.data?.abuseConfidenceScore ||
                          0,
                      )
                    : "#FFD700"
                }
                arcAltitude={(d) => d.altitude}
                arcStroke={0.9}
                arcDashLength={0.6}
                arcDashGap={0.4}
                arcDashAnimateTime={2000}
                ringsData={rings}
                ringLat={(d) => d.lat}
                ringLng={(d) => d.lng}
                ringColor={() => (t) => `rgba(255,215,0,${1 - t})`}
                ringMaxRadius={2}
                ringPropagationSpeed={3}
                ringRepeatPeriod={1000}
                autoRotate={autoRotate}
                autoRotateSpeed={rotateSpeed}
                onZoom={(alt) => setCameraAltitude(alt)}
                onGlobeReady={handleGlobeReady}
                onError={handleGlobeError}
              />
              {loading && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "rgba(0, 0, 0, 0.8)",
                    color: "#FFD700",
                    padding: "20px",
                    borderRadius: "8px",
                    zIndex: 1000,
                  }}
                >
                  Loading...
                </div>
              )}
            </div>
          </ErrorBoundary>
          {loading && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "#FFD700",
                fontSize: "16px",
                padding: "20px",
                background: "rgba(0,0,0,0.7)",
                borderRadius: "8px",
                zIndex: 1000,
              }}
            >
              Loading...
            </div>
          )}
        </div>

        {/* Severity Legend */}
        <div style={{ position: "fixed", left: 18, bottom: 18, zIndex: 10 }}>
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
          onToggle={() => setSideCollapsed((c) => !c)}
          isMobile={isMobile}
        />
      </div>
    </NotificationProvider>
  );
}
window.onerror = function (message, source, lineno, colno, error) {
  console.error("Global error:", { message, source, lineno, colno, error });
};

window.onunhandledrejection = function (event) {
  console.error("Unhandled promise rejection:", event.reason);
};

/* =========================
   Main App Component
========================= */
export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
