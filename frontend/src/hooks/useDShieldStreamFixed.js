import { useEffect, useRef, useState, useCallback } from "react";
import { getWebSocketUrl, logWebSocketInfo } from "../config/websocket";

/**
 * Fixed WebSocket hook for DShield streaming with rate limiting
 */
export default function useDShieldStreamFixed(liveMode, addArc, onStatus) {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const wsUrl = import.meta?.env?.VITE_WS_ATTACKS_URL || getWebSocketUrl();

  // Rate limiting
  const lastArcTimeRef = useRef(0);
  const arcInterval = 7000; // 7 seconds between arcs
  const pendingEventsRef = useRef([]);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // Log WebSocket configuration for debugging
    logWebSocketInfo();
    console.log("[useDShieldStreamFixed] 🔌 Connecting to:", wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(
          "[useDShieldStreamFixed] ✅ Connected to DShield stream at:",
          wsUrl,
        );
        setIsConnected(true);
        setLastError(null);
        reconnectAttempts.current = 0;
        onStatus && onStatus({ connected: true, error: null });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("[useDShieldStreamFixed] 📨 Received:", msg.type);

          // Handle status messages
          if (msg && msg.type === "status") {
            console.log("[useDShieldStreamFixed] 📊 Status:", msg.message);
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
            console.error("[useDShieldStreamFixed] ❌ Error:", msg.message);
            onStatus &&
              onStatus({
                connected: false,
                error: msg.message,
                timestamp: msg.timestamp,
              });
            return;
          }

          // Handle attack events with rate limiting
          if (msg && msg.type === "attack" && msg.data) {
            const event = msg.data;
            console.log(
              "[useDShieldStreamFixed] 🎯 Attack event received:",
              event.id,
            );

            // Add to pending events
            pendingEventsRef.current.push(event);

            // Process pending events with rate limiting
            processPendingEvents();
          }
        } catch (e) {
          console.error(
            "[useDShieldStreamFixed] Failed to parse message:",
            e,
            event.data,
          );
        }
      };

      ws.onerror = (error) => {
        console.error("[useDShieldStreamFixed] ❌ WebSocket error:", error);
        setLastError("WebSocket connection error");
        onStatus &&
          onStatus({ connected: false, error: "WebSocket connection error" });
      };

      ws.onclose = (event) => {
        console.log("[useDShieldStreamFixed] 🔌 WebSocket closed:", {
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
            `[useDShieldStreamFixed] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts.current})`,
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoff);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error(
            "[useDShieldStreamFixed] Max reconnection attempts reached",
          );
          setLastError("Failed to reconnect after multiple attempts");
          onStatus &&
            onStatus({
              connected: false,
              error: "Failed to reconnect after multiple attempts",
            });
        }
      };
    } catch (error) {
      console.error(
        "[useDShieldStreamFixed] Failed to create WebSocket:",
        error,
      );
      setLastError("Failed to create WebSocket connection");
      onStatus &&
        onStatus({
          connected: false,
          error: "Failed to create WebSocket connection",
        });
    }
  }, [liveMode, addArc, onStatus, isConnected]);

  // Process pending events with rate limiting
  const processPendingEvents = useCallback(() => {
    const now = Date.now();
    const timeSinceLastArc = now - lastArcTimeRef.current;

    if (
      timeSinceLastArc >= arcInterval &&
      pendingEventsRef.current.length > 0
    ) {
      // Get the most recent event
      const event = pendingEventsRef.current.shift();

      if (event) {
        console.log("[useDShieldStreamFixed] 🎯 Processing event:", event.id);

        const confidence = Number(event.confidence ?? 0) || 0;
        const isFallback =
          event.source === "fallback/mock" || event.source === "fallback/cache";

        const arc = {
          id: event.id || `dshield-${Date.now()}`,
          startLat: event.src_lat || 0,
          startLng: event.src_lng || 0,
          endLat: event.dst_lat || 0,
          endLng: event.dst_lng || 0,
          color: getColorByConfidence(confidence),
          altitude: 0.25 + (confidence / 100) * 0.5,
          timestamp: event.reported_at
            ? new Date(event.reported_at).getTime()
            : Date.now(),
          source: event.source || "dshield",
          confidence,
          description: event.description,
          isFallback: isFallback,
          opacity: isFallback ? 0.7 : 1.0,
        };

        console.log("[useDShieldStreamFixed] 🎯 Adding arc to globe:", arc.id);
        addArc && addArc(arc);

        // Update last arc time
        lastArcTimeRef.current = now;

        // Clear old pending events (keep only last 5)
        if (pendingEventsRef.current.length > 5) {
          pendingEventsRef.current = pendingEventsRef.current.slice(-5);
        }
      }
    }
  }, [addArc]);

  // Process pending events periodically
  useEffect(() => {
    if (!liveMode) return;

    const interval = setInterval(() => {
      processPendingEvents();
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [liveMode, processPendingEvents]);

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
    pendingEventsRef.current = [];
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
