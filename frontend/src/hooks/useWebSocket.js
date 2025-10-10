// frontend/src/hooks/useWebSocket.js
import { useEffect, useRef, useState, useCallback } from "react";

/*
  useWebSocket hook
  - Connects to a backend websocket endpoint (default: ws://127.0.0.1:8000/ws)
  - Reconnects automatically on close/error with jittered backoff
  - Normalizes incoming messages and stores them in `events` (newest first)
  - Exposes: { events, isConnected, sendMessage, close, liveMode, setLiveMode, reconnect }
  - Keeps a MAX_EVENTS limit so memory doesn't grow unbounded.
*/

const DEFAULT_WS_URL =
  typeof window !== "undefined" && window?.location?.hostname === "localhost"
    ? "ws://127.0.0.1:8000/ws"
    : `${typeof window !== "undefined" && window.location && (window.location.protocol === "https:" ? "wss" : "ws")}://${typeof window !== "undefined" ? window.location.host : "127.0.0.1:8000"}/ws`;

const MAX_EVENTS = 500;

export default function useWebSocket({
  url = DEFAULT_WS_URL,
  autoConnect = true,
} = {}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const liveModeRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState([]); // newest-first array of normalized events
  const [liveMode, setLiveMode] = useState(false);

  // keep liveModeRef in sync (so event handler reads latest value)
  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  // helpers (function declarations so they are hoisted)
  function computeArcFromGeo(geo = {}) {
    const lat = geo?.latitude ?? geo?.lat ?? 0;
    const lon = geo?.longitude ?? geo?.lon ?? geo?.lng ?? 0;
    return { startLat: 0, startLng: 0, endLat: lat, endLng: lon };
  }

  function computeSeverity(abuse = {}) {
    const score =
      Number(
        abuse?.abuseConfidenceScore ?? abuse?.score ?? abuse?.abuse_score ?? 0,
      ) || 0;
    if (score >= 70) return "High";
    if (score >= 30) return "Medium";
    return "Low";
  }

  const handleMessage = useCallback((evt) => {
    try {
      const raw =
        typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data || {};
      const geo = raw.geo_info || raw.geoInfo || raw.geo || {};
      const abuse = raw.abuse_info || raw.abuseInfo || raw.abuse || {};
      const normalized = {
        ip: raw.ip,
        geo_info: geo,
        abuse_info: abuse,
        arc: raw.arc || computeArcFromGeo(geo),
        severity: raw.severity || computeSeverity(abuse),
        timestamp: raw.timestamp || Date.now(),
        raw: raw,
      };

      // Log event arrival for debugging
      console.log("[useWebSocket] Event received:", normalized);

      // Only record events if liveMode is ON
      if (liveModeRef.current) {
        setEvents((prev) => {
          const next = [normalized, ...prev];
          if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
          return next;
        });
      } else {
        console.log("[useWebSocket] liveMode is OFF, event ignored");
      }
    } catch (e) {
      // non-fatal; keep going
      // eslint-disable-next-line no-console
      console.error("useWebSocket: failed to parse message", e);
    }
  }, []);

  // connect + reconnect logic
  const scheduleReconnect = useCallback(() => {
    if (reconnectRef.current) return;
    // jittered backoff 2s-5s
    const delay = 2000 + Math.floor(Math.random() * 3000);
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null;
      try {
        connect();
      } catch {
        /* ignore */
      }
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return; // already connected/connecting
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        console.log("WS message", event.data);
        handleMessage(event);
      };

      ws.onclose = (ev) => {
        setIsConnected(false);
        wsRef.current = null;
        // schedule reconnect unless closed intentionally
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        // eslint-disable-next-line no-console
        console.error("useWebSocket websocket error", err);
        // let onclose handle reconnect
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("useWebSocket connect failed", err);
      scheduleReconnect();
    }
  }, [url, handleMessage, scheduleReconnect]);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
    // Only run once on mount (no liveMode in deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, url]);

  const sendMessage = useCallback((msg) => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      } else {
        // eslint-disable-next-line no-console
        console.warn("useWebSocket: ws not open, message not sent", msg);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("useWebSocket sendMessage error", e);
    }
  }, []);

  const close = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    setIsConnected(false);
  }, []);

  return {
    events, // newest-first array of normalized events
    isConnected,
    sendMessage,
    close,
    liveMode,
    setLiveMode,
    reconnect: connect,
  };
}
