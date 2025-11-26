/* =========================
   Constants & Utilities
========================= */
export const MAX_ARCS = 5;
export const MAX_POINTS = 100;
export const LAST_N = 6;

export const GLOBE_TEXTURES = [
    {
        label: "Night",
        url: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
    },
    {
        label: "Day",
        url: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    },
    {
        label: "Dark",
        url: "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
    },
];

// Fallback texture in case remote textures fail to load
export const FALLBACK_TEXTURE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

export function validIPv4(ip) {
    return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(
        ip,
    );
}

// Color helper for dots/arcs based on abuseConfidenceScore
export const getColorByScore = (score = 0) => {
    const s = Number(score) || 0;
    if (s >= 70) return "red"; // high severity
    if (s >= 30) return "orange"; // medium severity
    return "yellow"; // low severity
};

// Preload texture and return a promise
export const preloadTexture = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(url);
        img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
        img.src = url;
    });
};

// Try loading textures with retry logic
export const loadTextureWithRetry = async (urls, maxRetries = 2) => {
    for (const url of urls) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                await preloadTexture(url);
                return url;
            } catch (err) {
                lastError = err;
                // swallow retries
            }
        }
        console.error(`All attempts to load texture ${url} failed:`, lastError);
    }
    return FALLBACK_TEXTURE;
};

/* Tooltip content utility for react-globe.gl.
   It returns a plain string; react-globe.gl will render it in a small tooltip. */
export function getTooltipContent(point) {
    if (!point) return "";
    const {
        ip,
        city,
        country,
        countryName,
        attackCount,
        isp,
        confidence,
        attackType,
        severity,
        source,
        target,
        description,
        abuse_info = {},
    } = point;
    const abuseData = abuse_info.data || {};
    const score = confidence || abuseData.abuseConfidenceScore || 0;
    const usageType = abuseData.usageType || "Unknown";
    const displayCountry = countryName || country || "Unknown";
    const attacks = attackCount || 0;

    // Enhanced tooltip for Live Mode attacks
    if (attackType && severity) {
        const severityColor =
            severity === "High"
                ? "#ff6b6b"
                : severity === "Medium"
                    ? "#ffa726"
                    : "#66bb6a";
        return `
      <div style="min-width:220px; max-width:300px">
        <b>${ip}</b><br/>
        ${city ? city + ", " : ""}${displayCountry}<br/>
        <span style="color:#FFD700">Confidence: ${score}%</span><br/>
        <span style="color:${severityColor}">Severity: ${severity}</span><br/>
        <span style="color:#74c0fc">Attack: ${attackType}</span><br/>
        <span style="color:#ab47bc">Source: ${source || "Unknown"}</span><br/>
        <span style="color:#26a69a">Target: ${target || "Unknown"}</span><br/>
        ${description ? `<i style="font-size:11px; color:#90a4ae">${description.substring(0, 100)}${description.length > 100 ? "..." : ""}</i>` : ""}
      </div>
    `;
    }

    // Standard tooltip for manual IP lookups
    return `
    <div style="min-width:180px">
      <b>${ip}</b><br/>
      ${city ? city + ", " : ""}${displayCountry}<br/>
      <span style="color:#FFD700">Confidence: ${score}%</span><br/>
      <span style="color:#ff6b6b">Attacks: ${attacks}</span><br/>
      ${isp ? `<span style="color:#74c0fc">ISP: ${isp}</span><br/>` : ""}
      <i>${usageType}</i>
    </div>
  `;
}
