/**
 * Clusters points that are within a specified radius of each other
 * @param {Array} points - Array of points with lat/lng coordinates
 * @param {number} radius - Radius in degrees to cluster points (default: 0.5)
 * @param {number} altitude - Current camera altitude for dynamic clustering
 * @param {number} altitudeThreshold - Altitude threshold to enable clustering (default: 1.1)
 * @returns {Array} Array of clustered points
 */
export function clusterPoints(
  points = [],
  radius = 0.5,
  altitude = 2,
  altitudeThreshold = 1.1,
) {
  // If no points or altitude is below threshold, return original points
  if (!points.length || altitude < altitudeThreshold) {
    return points;
  }

  // Adjust radius based on camera altitude
  const dynamicRadius = radius * (altitude / 2);
  const clusters = [];
  const processed = new Set();

  // Process each point
  points.forEach((point, index) => {
    if (processed.has(index)) return;

    const cluster = {
      lat: point.lat,
      lng: point.lng,
      points: [point],
      id: `cluster-${index}`,
      isCluster: false,
    };

    // Find nearby points
    points.forEach((otherPoint, otherIndex) => {
      if (index === otherIndex || processed.has(otherIndex)) return;

      // Calculate distance between points
      const distance = getDistance(
        point.lat,
        point.lng,
        otherPoint.lat,
        otherPoint.lng,
      );

      if (distance <= dynamicRadius) {
        cluster.points.push(otherPoint);
        processed.add(otherIndex);
      }
    });

    processed.add(index);

    // If cluster has multiple points, calculate centroid and add count
    if (cluster.points.length > 1) {
      const centroid = getCentroid(cluster.points);
      clusters.push({
        ...centroid,
        id: cluster.id,
        isCluster: true,
        count: cluster.points.length,
        // Aggregate data from clustered points
        abuse_score: Math.max(...cluster.points.map((p) => p.abuse_score || 0)),
        abuse_info: {
          data: {
            abuseConfidenceScore: Math.max(
              ...cluster.points.map(
                (p) => p.abuse_info?.data?.abuseConfidenceScore || 0,
              ),
            ),
          },
        },
      });
    } else {
      // Single point, keep original
      clusters.push(point);
    }
  });

  return clusters;
}

/**
 * Calculate the great-circle distance between two points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in degrees
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 57.2958; // Earth's radius in degrees
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the centroid of a group of points
 * @param {Array} points - Array of points with lat/lng coordinates
 * @returns {Object} Centroid coordinates {lat, lng}
 */
function getCentroid(points) {
  const sumLat = points.reduce((sum, p) => sum + p.lat, 0);
  const sumLng = points.reduce((sum, p) => sum + p.lng, 0);
  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length,
  };
}
