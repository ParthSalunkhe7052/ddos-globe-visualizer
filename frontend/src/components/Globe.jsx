import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import Globe from "react-globe.gl";
import { useTheme } from "../contexts/ThemeContext";

// Better texture URLs with fallbacks
const GLOBE_TEXTURES = {
  dark: [
    "https://unpkg.com/three-globe/example/img/earth-night.jpg",
    "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
    "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  ],
  light: [
    "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    "https://unpkg.com/three-globe/example/img/earth-day.jpg",
  ],
};

// Fallback texture (1x1 pixel)
const FALLBACK_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";

export default function GlobeComponent({
  points = [],
  arcs = [],
  rings = [],
  onPointClick,
  onGlobeClick,
  globeRef,
  enableClustering = false,
  autoRotate = true,
  rotateSpeed = 0.5,
}) {
  const { theme } = useTheme();
  const [error, setError] = useState(null);
  const [texture, setTexture] = useState(GLOBE_TEXTURES[theme][0]);
  const [globeReady, setGlobeReady] = useState(false);

  const internalGlobeRef = useRef();
  const activeRef = globeRef || internalGlobeRef;

  // Load globe textures with fallback
  useEffect(() => {
    const loadTexture = async () => {
      try {
        const textures = GLOBE_TEXTURES[theme];
        for (const url of textures) {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
          setTexture(url);
          return;
        }
      } catch {
        // all textures failed, using fallback
        setTexture(FALLBACK_TEXTURE);
      }
    };
    loadTexture();
  }, [theme]);

  // Global error handling
  useEffect(() => {
    const handleError = (e) => {
      // globe error
      setError(e);
    };
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  // Optional clustering (safe fallback if not implemented)
  const processedPoints = useMemo(() => {
    try {
      if (enableClustering) {
        // clustering not implemented
        // return clusterPoints(points);
      }
      return points;
    } catch {
      // error clustering points
      return points;
    }
  }, [points, enableClustering]);

  const handleGlobeReady = useCallback(() => {
    // globe ready
    setGlobeReady(true);

    // Set up auto-rotation
    if (activeRef.current && autoRotate) {
      const controls = activeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = rotateSpeed;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
      }
    }
  }, [activeRef, autoRotate, rotateSpeed]);

  // Update rotation when props change
  useEffect(() => {
    if (activeRef.current && globeReady) {
      const controls = activeRef.current.controls();
      if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = rotateSpeed;
      }
    }
  }, [autoRotate, rotateSpeed, globeReady]);

  if (error) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
          color: "#fff",
        }}
      >
        Globe failed to load. Please refresh.
      </div>
    );
  }

  // Globe background must always be black regardless of theme
  const backgroundColor = "#000000";
  const arcColor =
    theme === "dark" ? "rgba(6,182,212,0.8)" : "rgba(37,99,235,0.8)";
  const ringColor =
    theme === "dark" ? "rgba(6,182,212,0.6)" : "rgba(37,99,235,0.6)";

  return (
    <div
      className="globe-container"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: backgroundColor,
        transition: "background-color 0.3s ease",
      }}
    >
      <Globe
        ref={activeRef}
        globeImageUrl={texture}
        backgroundColor={backgroundColor}
        pointsData={processedPoints}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={(d) =>
          d.color || (theme === "dark" ? "#FFD700" : "#0066cc")
        }
        pointRadius={(d) => (d.isCluster ? 2 : 0.5)}
        pointAltitude={0.01}
        arcsData={arcs}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcDashLength={0.25}
        arcDashGap={1}
        arcDashAnimateTime={2000}
        arcColor={() => arcColor}
        ringsData={rings}
        ringLat={(d) => d.lat}
        ringLng={(d) => d.lng}
        ringColor={() => (t) => ringColor.replace("0.6", (1 - t).toFixed(2))}
        ringMaxRadius={2}
        ringPropagationSpeed={3}
        ringRepeatPeriod={1000}
        onGlobeReady={handleGlobeReady}
        onGlobeClick={onGlobeClick}
        onPointClick={onPointClick}
      />
      {!globeReady && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#FFD700",
          }}
        >
          Loading globe...
        </div>
      )}
      {points.length === 0 && globeReady && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#FFD700",
            fontSize: "14px",
            textAlign: "center",
          }}
        >
          No points to display. Search for an IP to analyze.
        </div>
      )}
    </div>
  );
}
