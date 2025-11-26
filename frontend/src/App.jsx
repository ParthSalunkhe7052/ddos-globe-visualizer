import React, { useEffect, useRef, useState, useCallback } from "react";
import Globe from "./components/Globe";
import ThemeToggle from "./components/ThemeToggle";
import Sidebar from "./components/Sidebar";
import StatsPanel from "./components/StatsPanel";
import { showToast } from "./components/Toast";
import NotificationProvider from "./notifications/NotificationProvider";
import NotificationPanel from "./notifications/NotificationPanel";
import NotificationBell from "./notifications/NotificationBell";
import LiveMode, { useLiveModeStatus } from "./components/LiveMode";
import { clusterPoints } from "./utils/clusterPoints";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import "./App.css";
import "./styles/themes.css";

// Refactored imports
import SeverityLegend from "./components/SeverityLegend";
import SideInfoPanel from "./components/SideInfoPanel";
import {
  getColorByScore,
  getTooltipContent,
  GLOBE_TEXTURES,
  FALLBACK_TEXTURE,
  validIPv4,
  loadTextureWithRetry,
  MAX_ARCS,
  MAX_POINTS,
  LAST_N,
} from "./utils/globeUtils";

/* =========================
   App Content Component
========================= */
function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Live Mode status hook
  const {
    status: liveModeStatus,
    isChecking,
    toggleLiveMode,
  } = useLiveModeStatus();
  // State hooks
  const [ip, setIp] = useState("");
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
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
      return JSON.parse(localStorage.getItem("recentIps") || "[]"); // array of IP strings
    } catch {
      return [];
    }
  });
  const [globeTexture, setGlobeTexture] = useState(GLOBE_TEXTURES[0].url);
  const [globeReady, setGlobeReady] = useState(false);

  // Filter state
  const [filterCountry, setFilterCountry] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  // Heatmap mode state
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Severity color for heatmap mode
  const getSeverityColor = (score) => {
    if (score >= 70) return "red";
    if (score >= 30) return "orange";
    return "green";
  };

  // Ref (must be before any useEffect that uses it)
  const globeRef = useRef();

  // Enhanced arc generation function
  const createArcWithPoint = useCallback(
    (
      startLat,
      startLng,
      endLat,
      endLng,
      color,
      ip,
      score,
      additionalData = {},
    ) => {
      const now = Date.now();

      const newPoint = {
        id: `${ip || "unknown"}-${now}`,
        lat: endLat,
        lng: endLng,
        ip: ip || "Unknown",
        color,
        score: score || 0,
        timestamp: now,
        ...additionalData,
      };

      const newArc = {
        id: `arc-${now}`,
        startLat,
        startLng,
        endLat,
        endLng,
        color,
        altitude: 0.3 + Math.random() * 0.4,
        timestamp: now,
        pointId: newPoint.id,
        stroke: 1.2,
        dashLength: 0.8,
        dashGap: 0.3,
      };

      return { newPoint, newArc };
    },
    [],
  );

  // Enhanced cleanup function that ensures arc-point synchronization
  const cleanupArcAndPoint = useCallback((arcId, pointId) => {
    setArcs((prev) => prev.filter((a) => a.id !== arcId));
    setPoints((prev) => prev.filter((p) => p.id !== pointId));
  }, []);

  // Clean up old arcs and points periodically and enforce 5-arc limit
  useEffect(() => {
    // Listen for Live Mode live events to render arcs
    function onLiveAttack(e) {
      try {
        const {
          lat,
          lng,
          confidencePct,
          ip,
          seenAt,
          country,
          city,
          attackType,
          severity,
          source,
          target,
          description,
        } = e.detail || {};

        if (typeof lat !== "number" || typeof lng !== "number") return;
        const now = Date.now();
        const pov = globeRef.current?.pointOfView?.() || { lat: 0, lng: 0 };
        const startLat = typeof pov.lat === "number" ? pov.lat : 0;
        const startLng = typeof pov.lng === "number" ? pov.lng : 0;
        const color = getColorByScore(confidencePct);

        // Create enhanced point with all the detailed information
        const { newPoint, newArc } = createArcWithPoint(
          startLat,
          startLng,
          lat,
          lng,
          color,
          ip,
          confidencePct,
          {
            timestamp: seenAt || now,
            country: country || "Unknown",
            city: city || "Unknown",
            attackType: attackType || "Unknown",
            severity: severity || "Medium",
            source: source || "Unknown",
            target: target || "Unknown",
            description: description || "Cybersecurity incident detected.",
            // Add abuse_info structure for compatibility
            abuse_info: {
              data: {
                abuseConfidenceScore: confidencePct,
                attackType: attackType,
                severity: severity,
                source: source,
                target: target,
              },
            },
            // Add geo_info structure for compatibility
            geo_info: {
              country: country,
              city: city,
              latitude: lat,
              longitude: lng,
            },
          },
        );

        setPoints((prev) => [newPoint, ...prev].slice(0, MAX_POINTS));
        setArcs((prev) => [newArc, ...prev].slice(0, MAX_ARCS));
        setRings([{ id: `ring-${now}`, lat, lng }]);

        // Show enhanced toast notification
        showToast(
          `${attackType || "Attack"} detected in ${city || "Unknown"}, ${country || "Unknown"}`,
          severity === "High"
            ? "error"
            : severity === "Medium"
              ? "warning"
              : "info",
        );

        setTimeout(() => {
          cleanupArcAndPoint(newArc.id, newPoint.id);
        }, 30000);
      } catch (error) {
        console.error("Error handling live mode attack:", error);
      }
    }
    window.addEventListener("livemode-attack", onLiveAttack);
    return () => window.removeEventListener("livemode-attack", onLiveAttack);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 30_000; // Remove arcs older than 30 seconds

      // First, get current arcs to determine which points should remain
      setArcs((prev) => {
        const filtered = prev.filter((a) => (a.timestamp || 0) >= cutoff);
        // Enforce 5-arc limit - if more than 5, keep only the newest 5
        const finalArcs = filtered.length > 5 ? filtered.slice(0, 5) : filtered;

        // Get the point IDs that should remain (from active arcs)
        const activePointIds = new Set(
          finalArcs.map((a) => a.pointId).filter(Boolean),
        );

        // Remove points that are not associated with active arcs
        setPoints((currentPoints) => {
          return currentPoints.filter((p) => {
            // Keep points that are associated with active arcs OR are not arc-related
            return activePointIds.has(p.id) || !p.id.includes("-");
          });
        });

        return finalArcs;
      });
    }, 5000);

    return () => clearInterval(id);
  }, [cleanupArcAndPoint]);

  // Handler to clear all state and reset globe
  const handleClearAll = () => {
    setPoints([]);
    setArcs([]);
    setRings([]);
    setSelectedInfo(null);
    setRecentIps([]);
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
          // no-op
        }
      } catch (err) {
        console.error("Failed to load any globe textures:", err);
        if (mounted) {
          setGlobeTexture(FALLBACK_TEXTURE);
          // no-op
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
  }, [globeTexture]);

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

  const BACKEND_URL =
    import.meta.env?.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  async function handleAnalyze(targetIp) {
    setLoading(true);
    fetch(`${BACKEND_URL}/analyze_ip?ip=${encodeURIComponent(targetIp)}`)
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
          // no geolocation returned
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
        const { newPoint, newArc } = createArcWithPoint(
          startLat,
          startLng,
          latitude,
          longitude,
          color,
          data.ip || targetIp,
          score,
          {
            country,
            city: geo.city,
            abuse_info: data.abuse_info,
            geo_info: data.geo_info,
            timestamp: now,
          },
        );

        setPoints((prev) => [newPoint, ...prev].slice(0, MAX_POINTS));
        setSelectedInfo(newPoint);
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

        // Update URL with current IP
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

        // Remove arc and associated point after 30s to keep scene fresh
        setTimeout(() => {
          cleanupArcAndPoint(newArc.id, newPoint.id);
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
  // Debug logs removed
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
            className={`ip-button live-mode-btn ${liveModeStatus === "on" ? "live-mode-on" : "live-mode-off"}`}
            onClick={toggleLiveMode}
            disabled={isChecking}
            title={
              isChecking
                ? "Checking backend..."
                : liveModeStatus === "on"
                  ? "Live Mode is active"
                  : "Toggle Live Mode"
            }
            aria-label={`Live Mode ${liveModeStatus === "on" ? "On" : "Off"}`}
          >
            {isChecking ? "Checking..." : "Live Mode"}
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
                      : d.color || "#FFD700"
                }
                pointAltitude={(d) =>
                  d.isCluster ? 0.025 : 0.008 + ((d.score || 0) / 100) * 0.015
                }
                pointRadius={(d) =>
                  d.isCluster ? 1.2 + 0.2 * Math.log2(d.count) : 0.8
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
                arcAltitude={(d) => d.altitude || 0.5}
                arcStroke={(d) => d.stroke || 1.0}
                arcDashLength={(d) => d.dashLength || 0.6}
                arcDashGap={(d) => d.dashGap || 0.4}
                arcDashAnimateTime={2500}
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
        <div
          id="severity-legend-box"
          style={{ position: "fixed", left: 18, bottom: 18, zIndex: 10 }}
        >
          <SeverityLegend
            collapsed={legendCollapsed}
            onToggle={handleLegendToggle}
            isMobile={isMobile}
          />
        </div>

        {/* Live Mode Logic (no UI) */}
        <LiveMode />

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
