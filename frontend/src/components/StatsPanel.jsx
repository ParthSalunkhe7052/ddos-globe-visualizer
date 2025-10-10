import React from "react";

function getTopCountries(points, topN = 3) {
  const countryCounts = {};
  points.forEach((pt) => {
    const country = pt.country || pt.geo_info?.country || "Unknown";
    if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;
  });
  const sorted = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  return sorted;
}

export default function StatsPanel({ points, hideHeading }) {
  const uniqueIps = new Set(points.map((pt) => pt.ip)).size;
  const topCountries = getTopCountries(points);

  return (
    <div
      style={{
        marginTop: 18,
        marginRight: 12,
        background: "rgba(20,20,20,0.75)",
        border: "1px solid rgba(255,215,0,0.35)",
        borderRadius: 10,
        padding: 12,
        color: "#f1f1f1",
        fontSize: 14,
        minWidth: 180,
        maxWidth: 260,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        backdropFilter: "blur(2px)",
      }}
    >
      {!hideHeading && (
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            marginBottom: 8,
            color: "#FFD700",
          }}
        >
          Live Stats
        </div>
      )}
      <div>
        Total Points: <b>{points.length}</b>
      </div>
      <div>
        Unique IPs: <b>{uniqueIps}</b>
      </div>
      <div style={{ marginTop: 8, fontWeight: 500 }}>Top Countries:</div>
      {topCountries.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.7 }}>No data</div>
      ) : (
        <ol style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 13 }}>
          {topCountries.map(([country, count]) => (
            <li key={country}>
              {country} <span style={{ color: "#FFD700" }}>({count})</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
