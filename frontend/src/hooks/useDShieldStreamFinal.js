import { useEffect, useRef, useState, useCallback } from 'react';
import { getWebSocketUrl, logWebSocketInfo } from '../config/websocket';

/**
 * Final fixed WebSocket hook for DShield streaming
 * - Single connection only
 * - Proper rate limiting
 * - Clean error handling
 * - No spam notifications
 */
export default function useDShieldStreamFinal(liveMode, addArc, onStatus) {
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastError, setLastError] = useState(null);
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 3; // Reduced attempts
    const wsUrl = (import.meta?.env?.VITE_WS_ATTACKS_URL) || getWebSocketUrl();

    // Rate limiting
    const lastArcTimeRef = useRef(0);
    const arcInterval = 7000; // 7 seconds between arcs
    const eventQueueRef = useRef([]);
    const processingRef = useRef(false);

    const connect = useCallback(() => {
        // Prevent multiple connections
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[useDShieldStreamFinal] Already connected, skipping');
            return;
        }

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        console.log('[useDShieldStreamFinal] 🔌 Connecting to:', wsUrl);

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[useDShieldStreamFinal] ✅ Connected to DShield stream');
                setIsConnected(true);
                setLastError(null);
                reconnectAttempts.current = 0;
                onStatus && onStatus({ connected: true, error: null });
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    console.log('[useDShieldStreamFinal] 📨 Received:', msg.type);

                    // Handle status messages
                    if (msg && msg.type === 'status') {
                        console.log('[useDShieldStreamFinal] 📊 Status:', msg.message);
                        onStatus && onStatus({
                            connected: true,
                            message: msg.message,
                            timestamp: msg.timestamp
                        });
                        return;
                    }

                    // Handle error messages
                    if (msg && msg.type === 'error') {
                        console.error('[useDShieldStreamFinal] ❌ Error:', msg.message);
                        onStatus && onStatus({
                            connected: false,
                            error: msg.message,
                            timestamp: msg.timestamp
                        });
                        return;
                    }

                    // Handle attack events with rate limiting
                    if (msg && msg.type === 'attack' && msg.data) {
                        const event = msg.data;
                        console.log('[useDShieldStreamFinal] 🎯 Attack event received:', event.id);

                        // Add to queue
                        eventQueueRef.current.push(event);

                        // Process queue if not already processing
                        if (!processingRef.current) {
                            processEventQueue();
                        }
                    }

                } catch (e) {
                    console.error('[useDShieldStreamFinal] Failed to parse message:', e);
                }
            };

            ws.onerror = (error) => {
                console.error('[useDShieldStreamFinal] ❌ WebSocket error:', error);
                setLastError('WebSocket connection error');
                onStatus && onStatus({ connected: false, error: 'WebSocket connection error' });
            };

            ws.onclose = (event) => {
                console.log('[useDShieldStreamFinal] 🔌 WebSocket closed:', event.code);
                setIsConnected(false);
                wsRef.current = null;

                // Attempt to reconnect if not closed by user
                if (liveMode && reconnectAttempts.current < maxReconnectAttempts) {
                    const backoff = Math.min(10000, 2000 * Math.pow(2, reconnectAttempts.current));
                    reconnectAttempts.current++;

                    console.log(`[useDShieldStreamFinal] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts.current})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, backoff);
                } else if (reconnectAttempts.current >= maxReconnectAttempts) {
                    console.error('[useDShieldStreamFinal] Max reconnection attempts reached');
                    setLastError('Failed to reconnect after multiple attempts');
                    onStatus && onStatus({
                        connected: false,
                        error: 'Failed to reconnect after multiple attempts'
                    });
                }
            };

        } catch (error) {
            console.error('[useDShieldStreamFinal] Failed to create WebSocket:', error);
            setLastError('Failed to create WebSocket connection');
            onStatus && onStatus({ connected: false, error: 'Failed to create WebSocket connection' });
        }
    }, [liveMode, onStatus, wsUrl]);

    // Process event queue with rate limiting
    const processEventQueue = useCallback(() => {
        if (processingRef.current) return;

        processingRef.current = true;

        const processNext = () => {
            const now = Date.now();
            const timeSinceLastArc = now - lastArcTimeRef.current;

            if (timeSinceLastArc >= arcInterval && eventQueueRef.current.length > 0) {
                // Get the most recent event
                const event = eventQueueRef.current.shift();

                if (event) {
                    console.log('[useDShieldStreamFinal] 🎯 Processing event:', event.id);

                    const confidence = Number(event.confidence ?? 0) || 0;
                    const isFallback = event.source === 'fallback/mock' || event.source === 'fallback/cache';

                    const arc = {
                        id: event.id || `dshield-${Date.now()}`,
                        startLat: event.src_lat || 0,
                        startLng: event.src_lng || 0,
                        endLat: event.dst_lat || 0,
                        endLng: event.dst_lng || 0,
                        color: getColorByConfidence(confidence),
                        altitude: 0.25 + (confidence / 100) * 0.5,
                        timestamp: event.reported_at ? new Date(event.reported_at).getTime() : Date.now(),
                        source: event.source || 'dshield',
                        confidence,
                        description: event.description,
                        isFallback: isFallback,
                        opacity: isFallback ? 0.7 : 1.0
                    };

                    console.log('[useDShieldStreamFinal] 🎯 Adding arc to globe:', arc.id);
                    addArc && addArc(arc);

                    // Update last arc time
                    lastArcTimeRef.current = now;

                    // Clear old events (keep only last 3)
                    if (eventQueueRef.current.length > 3) {
                        eventQueueRef.current = eventQueueRef.current.slice(-3);
                    }
                }
            }

            // Continue processing if there are more events
            if (eventQueueRef.current.length > 0) {
                setTimeout(processNext, 1000); // Check again in 1 second
            } else {
                processingRef.current = false;
            }
        };

        processNext();
    }, [addArc, arcInterval]);

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
        eventQueueRef.current = [];
        processingRef.current = false;
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
        disconnect
    };
}

/**
 * Get color based on confidence score
 */
function getColorByConfidence(confidence) {
    if (confidence >= 70) return 'red';
    if (confidence >= 30) return 'orange';
    return 'yellow';
}
