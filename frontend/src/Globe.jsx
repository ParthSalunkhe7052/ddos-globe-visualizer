// frontend/src/Globe.jsx
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { clusterPoints } from "./utils/clusterPoints";
import { debounce } from "./utils/debounce";
import { setCache, getCache } from "./utils/cache";
import { animateCamera } from "./utils/camera";
import LiveToggle from "./LiveToggle";
  // Health check state
  const [backendHealthy, setBackendHealthy] = useState(null); // null=unknown, true/false
  const [healthMsg, setHealthMsg] = useState("");
  // Live Mode state
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveStatus, setLiveStatus] = useState("OFF");
  const [lastLiveUpdate, setLastLiveUpdate] = useState(null);
  const [liveData, setLiveData] = useState([]);
  const [liveError, setLiveError] = useState("");
  const [pollInterval, setPollInterval] = useState(6000); // ms, can be changed for tuning
  const pollBackoffRef = useRef(6000);
  const pollTimerRef = useRef();
  // Health check on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const resp = await fetch("/health");
        const data = await resp.json();
        console.debug("/health response", data);
        if (data && (data.status === "ok" || data.success)) {
          setBackendHealthy(true);
          setHealthMsg("");
        } else {
          setBackendHealthy(false);
          setHealthMsg("Backend offline");
        }
      } catch (e) {
        setBackendHealthy(false);
        setHealthMsg("Backend offline");
        console.error("/health error", e);
      }
    }
    checkHealth();
  }, []);
  // Live Mode polling logic
  useEffect(() => {
    if (!backendHealthy) return;
    if (!liveEnabled) {
      setLiveStatus("OFF");
      setLiveData([]);
      setLastLiveUpdate(null);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }
    let stopped = false;
    async function pollLive() {
      if (stopped) return;
      try {
        let cached = getCache("live_feed");
        if (cached) {
          setLiveData(cached.data);
          setLastLiveUpdate(cached.ts);
          setLiveStatus("ON");
        }
        const resp = await fetch(`/live_feed?enabled=true`);
        const data = await resp.json();
        console.debug("/live_feed response", data, new Date());
        if (data && data.success) {
          setLiveData(data.events || []);
          setLastLiveUpdate(Date.now());
          setLiveStatus("ON");
          setCache("live_feed", { data: data.events || [] , ts: Date.now() }, pollInterval);
          pollBackoffRef.current = pollInterval;
        } else {
          setLiveError(data && data.message ? data.message : "Service unavailable");
          setLiveStatus("ERROR");
          pollBackoffRef.current = Math.min(pollBackoffRef.current * 2, 60000);
        }
      } catch (e) {
        setLiveError("Service unavailable");
        setLiveStatus("ERROR");
        pollBackoffRef.current = Math.min(pollBackoffRef.current * 2, 60000);
        console.error("/live_feed error", e);
      }
      if (!stopped) {
        pollTimerRef.current = setTimeout(pollLive, pollBackoffRef.current);
      }
    }
    pollLive();
    return () => {
      stopped = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [liveEnabled, backendHealthy, pollInterval]);

const severityColor = (severity) => {
  switch (severity) {
    case "High":
      return "red";
    case "Medium":
      return "orange";
    default:
      return "green";
  }
};

export default function AttackGlobe({ attacks = [] }) {
  // Cluster/zoom state
  const [zoomedCluster, setZoomedCluster] = useState(null);
  const [visibleAttacks, setVisibleAttacks] = useState(attacks.length);

  // Cluster points based on zoom/camera
  const clusteredPoints = useMemo(() => {
    if (zoomedCluster && zoomedCluster.members) {
      setVisibleAttacks(zoomedCluster.members.length);
      return zoomedCluster.members;
    }
    const clustered = clusterPoints(attacks, 4, cameraAltitude, 1.1);
    setVisibleAttacks(clustered.filter(p => !p.isCluster).length);
    return clustered;
  }, [attacks, cameraAltitude, zoomedCluster]);

  // Handle cluster click: zoom in
  const handlePointClick = useCallback((point) => {
    if (point.isCluster) {
      setZoomedCluster(point);
      // Smooth zoom to cluster
      if (globeRef.current) {
        globeRef.current.pointOfView({ lat: point.lat, lng: point.lng, altitude: 0.7 }, 1200);
      }
    }
  }, []);

  // Reset view if no points in cluster
  const handleResetView = useCallback(() => {
    setZoomedCluster(null);
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2 }, 1200);
    }
  }, []);
  // Camera/zoom state for clustering and arc width/opacity
  const [cameraAltitude, setCameraAltitude] = useState(2);
  // Helper for requestAnimationFrame batching
  const arcFrameRef = useRef();
  const [batchedArcs, setBatchedArcs] = useState([]);

  // Group overlapping arcs by src/dst grid cell (1°)
  const groupArcs = useCallback((arcs) => {
    const grid = new Map();
    for (const arc of arcs) {
      const srcKey = `${Math.floor(arc.startLat)},${Math.floor(arc.startLng)}`;
      const dstKey = `${Math.floor(arc.endLat)},${Math.floor(arc.endLng)}`;
      const key = `${srcKey}|${dstKey}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(arc);
    }
    // Merge arcs in each group
    return Array.from(grid.values()).map(group => {
      if (group.length === 1) return group[0];
      // Average positions, pick most severe color
      const avg = arr => arr.reduce((s, v) => s + v, 0) / group.length;
      const startLat = avg(group.map(a => a.startLat));
      const startLng = avg(group.map(a => a.startLng));
      const endLat = avg(group.map(a => a.endLat));
      const endLng = avg(group.map(a => a.endLng));
      const severity = group.reduce((max, a) => (a.severity === "High" ? a : max), group[0]).severity;
      return {
        ...group[0],
        startLat, startLng, endLat, endLng, severity,
        count: group.length
      };
    });
  }, []);

  // Memoize grouped arcs and simplified curves
  const arcsData = useMemo(() => {
    const baseArcs = dshieldOnly
      ? dshieldEvents.map(e => ({ ...(e.arc || {}), severity: e.severity || "High", __payload: e }))
      : (attacks || []).map(e => e.arc ? { ...e.arc, severity: e.severity } : null).filter(Boolean);
    // Group overlapping arcs
    const grouped = groupArcs(baseArcs);
    // Simplify curves: fewer points for distant arcs
    return grouped.map(arc => ({
      ...arc,
      curveResolution: cameraAltitude > 1.5 ? 8 : 32 // fewer points if zoomed out
    }));
  }, [dshieldOnly, dshieldEvents, attacks, groupArcs, cameraAltitude]);

  // Batch arc updates with requestAnimationFrame
  useEffect(() => {
    if (arcFrameRef.current) cancelAnimationFrame(arcFrameRef.current);
    arcFrameRef.current = requestAnimationFrame(() => setBatchedArcs(arcsData));
    return () => arcFrameRef.current && cancelAnimationFrame(arcFrameRef.current);
  }, [arcsData]);

  // Listen for camera altitude changes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    function updateCamera() {
      setCameraAltitude(globe.controls().object.position.length());
    }
    globe.controls().addEventListener('change', updateCamera);
    updateCamera();
    return () => globe.controls().removeEventListener('change', updateCamera);
  }, []);
  // Default live mode off — user must opt-in
  const [liveMode, setLiveMode] = useState(false);
  const [dshieldOnly, setDshieldOnly] = useState(false);
  const [dshieldEvents, setDshieldEvents] = useState([]);
  const [dshieldError, setDshieldError] = useState("");
  const [analyzeIp, setAnalyzeIp] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch DShield events
  useEffect(() => {
    let mounted = true;
    let interval;
    async function fetchDShield() {
      try {
        setDshieldError("");
        const resp = await fetch('/live/dshield');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data.events || [];
        setDshieldEvents(list || []);
      } catch (e) {
        if (mounted) setDshieldError(e.message || String(e));
      }
    }
    if (dshieldOnly) {
      fetchDShield();
      interval = setInterval(fetchDShield, 5000);
    }
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [dshieldOnly]);

  // Analyze IP logic
  async function doAnalyze(ip) {
    setAnalyzeError("");
    setAnalyzeResult(null);
    setLoading(true);
    if (!ip) {
      setAnalyzeError("Please enter an IP address.");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(`/analyze?ip=${encodeURIComponent(ip)}`);
      let data;
      try {
        data = await resp.json();
      } catch (jsonErr) {
        console.error("Failed to parse JSON:", jsonErr);
        setAnalyzeError("Service unavailable.");
        setLoading(false);
        return;
      }
      console.log("Analyze response:", data);

      if (resp.status === 429 || (data && data.error === "API_LIMIT")) {
        setAnalyzeError("API limit reached. Try again tomorrow or upgrade your plan.");
      } else if (!resp.ok || data.error) {
        setAnalyzeError(data.message || "Could not load IP data.");
      } else {
        setAnalyzeResult(data);
      }
    } catch (e) {
      console.error("Analyze fetch error:", e);
      setAnalyzeError("Service unavailable.");
    } finally {
      setLoading(false);
    }
  }
  const globeRef = useRef();
  // connect auto by default (hook default: autoConnect true, wsUrl "/ws")
  const { events, isConnected, isPaused, connect, pause, resume } = useWebSocket();

  // ...all state, effect, and logic declarations here...

  // (Insert the rest of the component logic and state here, then the return block at the end)

  return (
    <div style={{ width: "100%", height: "600px", position: "relative" }}>
      {/* Health check banner */}
      {backendHealthy === false && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#b71c1c', color: '#fff', padding: 12, zIndex: 100 }}>
          {healthMsg || "Backend offline"}
        </div>
      )}
      {/* Live Mode toggle and status */}
      <LiveToggle
        enabled={liveEnabled}
        onToggle={setLiveEnabled}
        status={liveStatus}
        lastUpdate={lastLiveUpdate}
      />
      {/* Analyze IP controls */}
      <div style={{ position: 'absolute', top: 60, left: 10, zIndex: 12, background: 'rgba(30,30,30,0.95)', borderRadius: 8, padding: 12, minWidth: 320, maxWidth: 400 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="IP to analyze"
            value={analyzeIp}
            onChange={e => setAnalyzeIp(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }}
            disabled={loading}
            aria-label="Analyze IP"
          />
          <button
            type="button"
            onClick={() => doAnalyze(analyzeIp)}
            style={{ padding: '6px 10px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            disabled={loading}
            aria-label="Analyze"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
        <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 6 }}>
          {loading && <div style={{ color: '#bbb', fontSize: 13 }}>Loading...</div>}
          {analyzeError && <div style={{ color: '#ff5252' }}>{analyzeError}</div>}
          {analyzeResult && (
            <AnalyzeModal data={analyzeResult} onClose={() => setAnalyzeResult(null)} />
          )}
          {!analyzeResult && !analyzeError && !loading && <div style={{ color: '#bbb', fontSize: 12 }}>Enter IP and click Analyze</div>}
        </div>
      </div>

      {/* Globe visualization */}
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        pointsData={clusteredPoints}
        pointLat={d => d.lat}
        pointLng={d => d.lng}
        pointColor={d => (d.isCluster ? "#FFD700" : d.color || "red")}
        pointAltitude={d => (d.isCluster ? 0.025 : 0.02)}
        pointRadius={d => (d.isCluster ? 1.2 + 0.2 * Math.log2(d.count || 1) : 0.4)}
        pointLabel={d => (d.isCluster ? `<b>${d.count} attacks</b><br/>Click to expand` : d.ip || "")}
        onPointClick={handlePointClick}
        arcsData={batchedArcs}
        arcColor={d => severityColor(d?.severity)}
        arcAltitude={d => d?.altitude ?? 0.3}
        arcStroke={d => cameraAltitude > 1.5 ? 0.5 : 0.9}
        arcDashLength={0.6}
        arcDashGap={0.4}
        arcDashAnimateTime={2000}
        arcDashInitialGap={d => Math.random()}
        arcCurveResolution={d => d.curveResolution || 8}
        arcOpacity={d => cameraAltitude > 1.5 ? 0.25 : 0.7}
        width={"100%"}
        height={600}
      />

      {/* InfoPanel overlay (attacks, top IPs, analyze) */}
      {/* You must implement InfoPanel.jsx to accept attacks, topIPs, onAnalyze, analyzeDisabled */}
      {/* <InfoPanel attacks={liveData} topIPs={...} onAnalyze={...} analyzeDisabled={...} /> */}

      {/* ClusterPopup overlay (if zoomedCluster) */}
      {/* You must implement ClusterPopup.jsx to accept cluster, onZoomFurther, onReset, onClose */}
      {/* {zoomedCluster && <ClusterPopup cluster={zoomedCluster} onZoomFurther={...} onReset={handleResetView} onClose={handleResetView} />} */}

      {/* Mini-map/counter overlay */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 15, fontWeight: 500 }}>
        {visibleAttacks} attacks visible
      </div>

      {/* Reset View button if zoomed and no points */}
      {zoomedCluster && (!zoomedCluster.members || zoomedCluster.members.length === 0) && (
        <button onClick={handleResetView} style={{ position: 'absolute', top: 60, right: 10, zIndex: 21, background: '#222', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 15, cursor: 'pointer', boxShadow: '0 2px 8px #000' }}>
          Reset View
        </button>
      )}

      {/* Accessibility: keyboard shortcut for reset view (Esc) */}
      <input type="text" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} aria-hidden="true" tabIndex={-1} onKeyDown={e => {
        if (e.key === 'Escape') handleResetView();
      }} />
    </div>
  );
// End of AttackGlobe
}

// Modal for Analyze result
function AnalyzeModal({ data, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: '#222', color: '#fff', padding: 24, borderRadius: 10, minWidth: 320, maxWidth: 480, boxShadow: '0 2px 16px #000' }}>
        <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>&times;</button>
        <h3 style={{ marginTop: 0 }}>IP Analysis Result</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
