// src/utils/clusterPoints.js
// Simple grid-based clustering for lat/lon points

/**
 * Cluster points by 1° grid. If more than N points in a cell, merge to a cluster.
 * @param {Array} points - Array of {lat, lng, ...}
 * @param {number} minClusterSize - Minimum points to form a cluster
 * @param {number} zoomLevel - Current camera altitude (lower = more zoomed in)
 * @param {number} clusterZoomThreshold - Altitude below which clustering is disabled
 * @returns {Array} Clustered points (with .isCluster, .count, .members)
 */
export function clusterPoints(
  points,
  minClusterSize = 4,
  zoomLevel = 2,
  clusterZoomThreshold = 1.1,
) {
  if (zoomLevel < clusterZoomThreshold) return points; // Show all points when zoomed in
  const grid = new Map();
  for (const pt of points) {
    // 1° grid cell
    const latKey = Math.floor(pt.lat);
    const lngKey = Math.floor(pt.lng);
    const key = `${latKey},${lngKey}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(pt);
  }
  const clustered = [];
  for (const [key, pts] of grid.entries()) {
    if (pts.length >= minClusterSize) {
      // Make a cluster point
      const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      clustered.push({
        lat: avgLat,
        lng: avgLng,
        isCluster: true,
        count: pts.length,
        members: pts,
        // Use highest severity color in cluster
        color: pts.reduce((max, p) => (p.score > max.score ? p : max), pts[0])
          .color,
      });
    } else {
      clustered.push(...pts);
    }
  }
  return clustered;
}
