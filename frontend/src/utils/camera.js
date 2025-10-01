// Camera animation helpers for react-globe.gl
export function animateCamera(globeRef, { lat, lng, altitude }, duration = 1200) {
  if (globeRef.current && globeRef.current.pointOfView) {
    globeRef.current.pointOfView({ lat, lng, altitude }, duration);
  }
}
