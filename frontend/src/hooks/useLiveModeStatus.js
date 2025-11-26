import { useState, useRef, useEffect, useCallback } from "react";
import { generateMockAttack } from "../utils/mockAttackGenerator";

// Live Mode Status Hook
export function useLiveModeStatus() {
    const [status, setStatus] = useState("off"); // 'off', 'on'
    const [isChecking, setIsChecking] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const mockDataIntervalRef = useRef(null);

    // Start/stop mock data generation
    const startMockData = () => {
        if (mockDataIntervalRef.current) return;
        // start mock generation

        const generateWithRandomDelay = () => {
            generateMockAttack();
            // Random delay between 2-5 seconds for more realistic timing
            const nextDelay = 2000 + Math.random() * 3000;
            mockDataIntervalRef.current = setTimeout(
                generateWithRandomDelay,
                nextDelay,
            );
        };

        generateWithRandomDelay();
    };

    const stopMockData = () => {
        if (mockDataIntervalRef.current) {
            // stop mock generation
            clearTimeout(mockDataIntervalRef.current);
            mockDataIntervalRef.current = null;
        }
    };

    // Backend validation function
    const BACKEND_URL =
        import.meta.env?.VITE_BACKEND_URL || "http://127.0.0.1:8000";
    const WS_URL = import.meta.env?.VITE_WS_URL || "ws://127.0.0.1:8000/ws/live";
    const validateBackend = async () => {
        try {
            setIsChecking(true);

            // Check if backend is reachable
            const response = await fetch(`${BACKEND_URL}/health`, {
                method: "GET",
                timeout: 5000,
            });

            if (!response.ok) {
                throw new Error(`Backend health check failed: ${response.status}`);
            }

            // If we get here, backend is healthy
            setStatus("on");
            setIsChecking(false);
            return true;
        } catch (error) {
            void error;
            // validation failed
            setIsChecking(false);
            return false;
        }
    };

    // WebSocket connection for live data
    const connectWebSocket = () => {
        if (wsRef.current) return;

        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                // connected
                setStatus("on");
                // Start mock data as fallback (will be overridden by real data if available)
                startMockData();
            };

            ws.onclose = () => {
                // disconnected
                wsRef.current = null;

                // Attempt reconnection after 5 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (status === "on") {
                        connectWebSocket();
                    }
                }, 5000);
            };

            ws.onerror = () => {
                // websocket error
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data?.kind === "attack" && data?.event) {
                        // Stop mock data when real data is received
                        stopMockData();

                        // Dispatch globe arc event for App.jsx listener
                        const ev = data.event;
                        const lat = ev?.geo?.lat ?? ev?.geo_info?.latitude ?? ev?.lat;
                        const lng = ev?.geo?.lon ?? ev?.geo_info?.longitude ?? ev?.lng;

                        if (typeof lat === "number" && typeof lng === "number") {
                            window.dispatchEvent(
                                new CustomEvent("livemode-attack", {
                                    detail: {
                                        lat,
                                        lng,
                                        confidencePct: Math.round((ev.confidence || 0) * 100),
                                        ip: ev?.src_ip || ev?.ip || ev?.ioc,
                                        seenAt: ev?.seen_at || Date.now(),
                                    },
                                }),
                            );
                        }
                    }
                } catch (e) {
                    void e;
                    // message parse error
                }
            };
        } catch (e) {
            void e;
            // connection failed
        }
    };

    const disconnectWebSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        // Stop mock data when disconnecting
        stopMockData();
    }, []);

    const toggleLiveMode = async () => {
        if (status === "off") {
            // Turn on - validate backend first
            const isValid = await validateBackend();
            if (isValid) {
                connectWebSocket();
            }
            // If validation fails, keep status as 'off' (blue) - don't set to 'error'
        } else if (status === "on") {
            // Turn off - only if currently on
            disconnectWebSocket();
            setStatus("off");
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnectWebSocket();
            stopMockData();
        };
    }, [disconnectWebSocket]);

    return {
        status,
        isChecking,
        toggleLiveMode,
    };
}
