/**
 * WebSocket configuration for DDoS Globe Visualizer
 */

// Get the backend URL from environment or use default
function getBackendUrl() {
  // Check if we're in development mode
  const isDev = import.meta.env.DEV;

  if (isDev) {
    // In development, backend is usually on port 8000
    return "http://localhost:8000";
  }

  // In production, use the same host as the frontend
  return window.location.origin;
}

// Get WebSocket URL
export function getWebSocketUrl() {
  const backendUrl = getBackendUrl();
  const wsProto = backendUrl.startsWith("https") ? "wss:" : "ws:";
  const host = backendUrl.replace(/^https?:\/\//, "");
  return `${wsProto}//${host}/ws/attacks`;
}

// Get API base URL
export function getApiUrl() {
  return getBackendUrl();
}

// Debug function to log WebSocket connection info
export function logWebSocketInfo() {
  console.log("🔌 WebSocket Configuration:");
  console.log("   Backend URL:", getBackendUrl());
  console.log("   WebSocket URL:", getWebSocketUrl());
  console.log("   API URL:", getApiUrl());
  console.log("   Environment:", import.meta.env.MODE);
}
