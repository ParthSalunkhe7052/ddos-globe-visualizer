import React from "react";

// Side Info Panel Component (right side)
export default function SideInfoPanel({ info, collapsed, onToggle, isMobile }) {
    // Force dark theme styling regardless of global theme
    const panelStyle = {
        position: "absolute",
        right: 12,
        top: 100,
        bottom: 12,
        width: collapsed ? 44 : isMobile ? "60%" : 360,
        transition: "width 0.2s ease",
        background:
            "linear-gradient(180deg, rgba(16,16,16,0.98), rgba(12,12,12,0.96))",
        border: "1px solid rgba(255,213,79,0.35)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
        borderRadius: 14,
        padding: 0,
        zIndex: 3,
        color: "#f1f1f1",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };

    const chevronBtnStyle = {
        position: "absolute",
        left: 6,
        top: 6,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 6,
        borderRadius: 10,
    };

    // Helper to render a field if present
    const renderField = (label, value) =>
        value !== undefined &&
        value !== null &&
        value !== "" && (
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr",
                    gap: 6,
                    alignItems: "center",
                }}
            >
                <div style={{ color: "#FFD700", opacity: 0.9, fontWeight: 600 }}>
                    {label}
                </div>
                <div style={{ color: "#e8e8e8" }}>{value}</div>
            </div>
        );

    // Abuse info extraction
    const abuse = info?.abuse_info?.data || info?.abuse_info || {};

    return (
        <div style={panelStyle} className="side-info-panel">
            <button
                className="side-chevron"
                aria-label={collapsed ? "Expand info panel" : "Collapse info panel"}
                onClick={onToggle}
                style={chevronBtnStyle}
                title={collapsed ? "Expand" : "Collapse"}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onToggle();
                }}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    role="img"
                    aria-label={collapsed ? "Expand info panel" : "Collapse info panel"}
                >
                    <polyline
                        points={collapsed ? "4,7 9,12 14,7" : "4,11 9,6 14,11"}
                        fill="none"
                        stroke="#FFD700"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            </button>

            {!collapsed && (
                <div
                    style={{ display: "flex", flexDirection: "column", height: "100%" }}
                >
                    {/* Sticky header */}
                    <div
                        style={{
                            position: "sticky",
                            top: 0,
                            background: "rgba(18,18,18,0.98)",
                            borderBottom: "1px solid rgba(255,213,79,0.25)",
                            padding: "14px 16px",
                            zIndex: 1,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 10,
                                    background: "#FFD54F",
                                    boxShadow: "0 0 8px rgba(255,213,79,0.5)",
                                }}
                            />
                            <div style={{ fontWeight: 700, letterSpacing: 0.4 }}>
                                IP Details
                            </div>
                        </div>
                    </div>

                    {/* Scrollable content */}
                    <div
                        className="side-info-content"
                        style={{
                            padding: "12px 16px",
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            display: "grid",
                            gap: 12,
                            overflowY: "auto",
                        }}
                    >
                        {info ? (
                            <>
                                {renderField("IP Address", info.ip)}
                                {renderField(
                                    "Country",
                                    info.countryName ||
                                    info.country ||
                                    info.countryCode ||
                                    info.geo_info?.country,
                                )}
                                {renderField("City", info.city || info.geo_info?.city)}

                                {/* Enhanced Live Mode attack details */}
                                {info.attackType && renderField("Attack Type", info.attackType)}
                                {info.severity && (
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "100px 1fr",
                                            gap: 6,
                                            alignItems: "center",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "#FFD700",
                                                opacity: 0.9,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Severity
                                        </div>
                                        <div
                                            style={{
                                                color:
                                                    info.severity === "High"
                                                        ? "#ff6b6b"
                                                        : info.severity === "Medium"
                                                            ? "#ffa726"
                                                            : "#66bb6a",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {info.severity}
                                        </div>
                                    </div>
                                )}
                                {info.source && renderField("Source", info.source)}
                                {info.target && renderField("Target", info.target)}

                                {/* Standard fields */}
                                {renderField("Attack Count", info.attackCount)}
                                {renderField("Targets", info.targets)}
                                {renderField("Rank", info.rank)}
                                {renderField("Protocol", info.protocol)}
                                {renderField("ASN", info.asn || abuse.asn)}
                                {renderField("ISP", info.isp || abuse.isp)}
                                {renderField("Domain", info.domain || abuse.domain)}
                                {renderField("Usage Type", info.usageType || abuse.usageType)}

                                {/* Enhanced description for Live Mode */}
                                {info.description && (
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "100px 1fr",
                                            gap: 6,
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "#FFD700",
                                                opacity: 0.9,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Description
                                        </div>
                                        <div
                                            style={{
                                                color: "#e8e8e8",
                                                fontSize: "12px",
                                                lineHeight: 1.4,
                                            }}
                                        >
                                            {info.description}
                                        </div>
                                    </div>
                                )}

                                {renderField(
                                    "Last Seen",
                                    info.lastSeen || abuse.lastReportedAt,
                                )}
                                {renderField(
                                    "Confidence",
                                    (info.confidence !== undefined
                                        ? info.confidence
                                        : abuse.abuseConfidenceScore) + "%",
                                )}
                                {typeof info.lat === "number" &&
                                    typeof info.lng === "number" &&
                                    renderField(
                                        "Coordinates",
                                        `${info.lat.toFixed(3)}, ${info.lng.toFixed(3)}`,
                                    )}
                                {renderField(
                                    "Hostnames",
                                    Array.isArray(info.hostnames)
                                        ? info.hostnames.join(", ")
                                        : info.hostnames,
                                )}
                            </>
                        ) : (
                            <div style={{ color: "#bbb" }}>No point selected.</div>
                        )}
                    </div>

                    {/* Sticky footer actions (Share removed) */}
                    <div
                        style={{
                            position: "sticky",
                            bottom: 0,
                            background: "rgba(18,18,18,0.98)",
                            borderTop: "1px solid rgba(255,213,79,0.25)",
                            padding: "10px 12px",
                            display: "flex",
                            gap: 8,
                        }}
                    >
                        {info?.ip ? (
                            <>
                                <a
                                    href={`https://www.abuseipdb.com/check/${info.ip}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ip-button"
                                    style={{ textDecoration: "none" }}
                                >
                                    AbuseIPDB
                                </a>
                                <a
                                    href={`https://ipinfo.io/${info.ip}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ip-button"
                                    style={{ textDecoration: "none" }}
                                >
                                    IPInfo
                                </a>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="ip-button"
                                disabled
                                style={{ opacity: 0.5 }}
                            >
                                No IP
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
