import React, { useEffect } from "react";
import { useLiveModeStatus } from "../hooks/useLiveModeStatus";

// Live Mode Status Component
export default function LiveMode() {
  useLiveModeStatus();

  // Listen for Live Mode live events to render arcs
  useEffect(() => {
    const handleLiveModeAttack = () => {
      // This event is dispatched from the WebSocket handler above
      // The App.jsx component will handle rendering the arcs
    };

    window.addEventListener("livemode-attack", handleLiveModeAttack);
    return () => {
      window.removeEventListener("livemode-attack", handleLiveModeAttack);
    };
  }, []);

  // Return null since this component only handles logic, no UI
  return null;
}

// Export the hook for use in the main App component
export { useLiveModeStatus };
