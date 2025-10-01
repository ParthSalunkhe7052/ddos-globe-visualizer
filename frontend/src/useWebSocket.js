// frontend/src/useWebSocket.js
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useWebSocket(wsUrl = "/ws", options = { autoConnect: true })
 * - Returns { events, sendMessage, isConnected, isPaused, pause, resume, connect, disconnect }
 * - events: newest-first array of parsed JSON messages received from server
 * - pause/resume: stop/resume appending incoming messages to events (socket stays open)
 */
export default function useWebSocket(
  wsUrl = "/ws",
  options = { autoConnect: true }
) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [events, setEvents] = useState([]); // newest-first
  const [isConnected, setIsConnected] = useState(false);

  const buildUrl = (url) => {
    if (/^wss?:\/{2}/i.test(url)) return url;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // if url begins with "/", keep it, else ensure leading "/"
    const path = url.startsWith("/") ? url : "/" + url;
    return `${proto}//${window.location.host}${path}`;
  };

  const connect = useCallback(() => {
    if (wsRef.current) return;
    const url = buildUrl(wsUrl);
    console.debug("[useWebSocket] connecting to", url);
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.info("[useWebSocket] open", url);
        setIsConnected(true);
      };

      ws.onmessage = (ev) => {
        // debug log incoming raw message
        console.debug("[useWebSocket] message", ev.data);
        try {
          const parsed = JSON.parse(ev.data);
          // newest-first, but only if not paused
          if (!pausedRef.current) {
            setEvents((prev) => [parsed, ...prev]);
          }
        } catch (e) {
          // ignore non-json messages but log
          console.warn("[useWebSocket] parse error", e);
        }
      };

      ws.onclose = (evt) => {
        console.warn("[useWebSocket] closed", evt && evt.code, evt && evt.reason);
        setIsConnected(false);
        wsRef.current = null;
        // attempt reconnect only if we are not paused
        if (!pausedRef.current) {
          if (reconnectRef.current) clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(() => {
            connect();
          }, 2000);
        }
      };

      ws.onerror = (err) => {
        console.error("[useWebSocket] error", err);
        try { ws.close(); } catch (e) { /* ignore */ }
      };
    } catch (e) {
      console.error("[useWebSocket] failed to create websocket", e);
    }
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) { /* ignore */ }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    console.info("[useWebSocket] paused receiving messages");
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    console.info("[useWebSocket] resumed receiving messages");
  }, []);

  const sendMessage = useCallback((obj) => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(obj));
      } else {
        console.warn("[useWebSocket] sendMessage: websocket not open");
      }
    } catch (e) {
      console.error("[useWebSocket] send error", e);
    }
  }, []);

  useEffect(() => {
    if (options?.autoConnect) connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, disconnect, options?.autoConnect]);

  return { events, sendMessage, isConnected, isPaused, pause, resume, connect, disconnect };
}
