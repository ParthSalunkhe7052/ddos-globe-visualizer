import { useEffect, useRef, useState, useCallback } from "react";
import { getWebSocketUrl, logWebSocketInfo } from "../config/websocket";

function getDefaultWsUrl() {
  // Use the new configuration
  return getWebSocketUrl();
}

/**
 * Hook for streaming DShield attack events via WebSocket
 * @param {boolean} liveMode - Whether to connect to the stream
 * @param {function} addArc - Function to add an arc to the globe
 * @param {function} onStatus - Callback for connection status updates
 */
export default function useDShieldStream(liveMode, addArc, onStatus) {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const wsUrl = import.meta?.env?.VITE_WS_ATTACKS_URL || getDefaultWsUrl();

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // Log WebSocket configuration for debugging
    logWebSocketInfo();
    console.log("[useDShieldStream] 🔌 Connecting to:", wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(
          "[useDShieldStream] ✅ Connected to DShield stream at:",
          wsUrl,
        );
        console.log("[useDShieldStream] WebSocket readyState:", ws.readyState);
        setIsConnected(true);
        setLastError(null);
        reconnectAttempts.current = 0;
        onStatus && onStatus({ connected: true, error: null });
      };

      ws.onmessage = (event) => {
        try {
          console.log(
            "[useDShieldStream] 📨 Received message:",
            event.data.length,
            "bytes",
          );
          console.log("[useDShieldStream] 📨 Raw message data:", event.data);
          const msg = JSON.parse(event.data);
          console.log("[useDShieldStream] 📨 Parsed message type:", msg.type);
          console.log("[useDShieldStream] 📨 Full parsed message:", msg);

          // Handle status messages
          if (msg && msg.type === "status") {
            console.log("[useDShieldStream] 📊 Status:", msg.message);
            onStatus &&
              onStatus({
                connected: true,
                message: msg.message,
                timestamp: msg.timestamp,
              });
            return;
          }

          // Handle error messages
          if (msg && msg.type === "error") {
            console.error("[useDShieldStream] ❌ Error:", msg.message);
            onStatus &&
              onStatus({
                connected: false,
                error: msg.message,
                timestamp: msg.timestamp,
              });
            return;
          }

          // Support message shapes:
          // 1) { type: 'attack', data: { src_lat, src_lng, dst_lat, dst_lng, confidence, reported_at } }
          // 2) Raw backend broadcast { ip, geo_info, abuse_info, arc, timestamp }

          if (msg && msg.type === "attack" && msg.data) {
            const e = msg.data;
            const confidence = Number(e.confidence ?? 0) || 0;
            const isFallback =
              e.source === "fallback/mock" || e.source === "fallback/cache";

            console.log("[useDShieldStream] 🎯 Processing attack event:", {
              id: e.id,
              source: e.source,
              confidence,
              isFallback,
              src_ip: e.src_ip,
              src_lat: e.src_lat,
              src_lng: e.src_lng,
            });

            const arc = {
              id: e.id || `dshield-${Date.now()}`,
              startLat: e.src_lat,
              startLng: e.src_lng,
              endLat: e.dst_lat,
              endLng: e.dst_lng,
              color: getColorByConfidence(confidence),
              altitude: 0.25 + (confidence / 100) * 0.5,
              timestamp: e.reported_at
                ? new Date(e.reported_at).getTime()
                : Date.now(),
              source: e.source || "dshield",
              confidence,
              description: e.description,
              isFallback: isFallback,
              opacity: isFallback ? 0.7 : 1.0, // Slightly transparent for fallback events
            };
            console.log("[useDShieldStream] 🎯 Adding arc to globe:", arc.id);
            addArc && addArc(arc);
            return;
          }

          const arcPayload = msg?.arc || {};
          const endLat =
            arcPayload.endLat ?? msg?.geo_info?.latitude ?? msg?.geo_info?.lat;
          const endLng =
            arcPayload.endLng ??
            msg?.geo_info?.longitude ??
            msg?.geo_info?.lon ??
            msg?.geo_info?.lng;
          if (typeof endLat === "number" && typeof endLng === "number") {
            const confidence =
              Number(msg?.abuse_info?.abuseConfidenceScore ?? 0) || 0;
            const arc = {
              id: msg.id || `ws-${Date.now()}`,
              startLat: arcPayload.startLat ?? 0,
              startLng: arcPayload.startLng ?? 0,
              endLat,
              endLng,
              color: getColorByConfidence(confidence),
              altitude: 0.25 + (confidence / 100) * 0.5,
              timestamp: msg.timestamp || Date.now(),
              source: "ws",
              confidence,
            };
            addArc && addArc(arc);
            return;
          }
        } catch (e) {
          console.error(
            "[useDShieldStream] Failed to parse message:",
            e,
            event.data,
          );
        }
      };

      ws.onerror = (error) => {
        console.error("[useDShieldStream] ❌ WebSocket error:", error);
        console.error(
          "[useDShieldStream] ❌ WebSocket readyState:",
          ws.readyState,
        );
        setLastError("WebSocket connection error");
        onStatus &&
          onStatus({ connected: false, error: "WebSocket connection error" });
      };

      ws.onclose = (event) => {
        console.log("[useDShieldStream] 🔌 WebSocket closed:", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setIsConnected(false);

        // Attempt to reconnect if not closed by user
        if (liveMode && reconnectAttempts.current < maxReconnectAttempts) {
          const backoff = Math.min(
            30000,
            1000 * Math.pow(2, reconnectAttempts.current),
          );
          reconnectAttempts.current++;

          console.log(
            `[useDShieldStream] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts.current})`,
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoff);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error("[useDShieldStream] Max reconnection attempts reached");
          setLastError("Failed to reconnect after multiple attempts");
          onStatus &&
            onStatus({
              connected: false,
              error: "Failed to reconnect after multiple attempts",
            });
        }
      };
    } catch (error) {
      console.error("[useDShieldStream] Failed to create WebSocket:", error);
      setLastError("Failed to create WebSocket connection");
      onStatus &&
        onStatus({
          connected: false,
          error: "Failed to create WebSocket connection",
        });
    }
  }, [liveMode, addArc, onStatus, isConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  // Connect/disconnect based on liveMode
  useEffect(() => {
    if (liveMode) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [liveMode, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    lastError,
    reconnect: connect,
    disconnect,
  };
}

/**
 * Get color based on confidence score
 */
function getColorByConfidence(confidence) {
  if (confidence >= 70) return "red";
  if (confidence >= 30) return "orange";
  return "yellow";
}
