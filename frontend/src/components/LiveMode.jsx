/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useRef, useState } from "react";

// Real country data with major cities and attack scenarios
const COUNTRY_DATABASE = [
  // North America
  {
    country: "United States",
    cities: [
      {
        name: "New York",
        lat: 40.7128,
        lng: -74.006,
        attacks: ["DDoS", "Phishing", "Malware", "Ransomware"],
      },
      {
        name: "Los Angeles",
        lat: 34.0522,
        lng: -118.2437,
        attacks: ["DDoS", "Data Breach", "Botnet"],
      },
      {
        name: "Chicago",
        lat: 41.8781,
        lng: -87.6298,
        attacks: ["DDoS", "Phishing", "Insider Threat"],
      },
      {
        name: "Miami",
        lat: 25.7617,
        lng: -80.1918,
        attacks: ["DDoS", "Malware", "Cryptocurrency Mining"],
      },
      {
        name: "Seattle",
        lat: 47.6062,
        lng: -122.3321,
        attacks: ["DDoS", "Cloud Attack", "API Abuse"],
      },
    ],
  },
  {
    country: "Canada",
    cities: [
      {
        name: "Toronto",
        lat: 43.6532,
        lng: -79.3832,
        attacks: ["DDoS", "Phishing", "Banking Fraud"],
      },
      {
        name: "Vancouver",
        lat: 49.2827,
        lng: -123.1207,
        attacks: ["DDoS", "Cryptocurrency Mining", "IoT Attack"],
      },
    ],
  },

  // Europe
  {
    country: "United Kingdom",
    cities: [
      {
        name: "London",
        lat: 51.5074,
        lng: -0.1278,
        attacks: ["DDoS", "Phishing", "Banking Fraud", "State-sponsored"],
      },
      {
        name: "Manchester",
        lat: 53.4808,
        lng: -2.2426,
        attacks: ["DDoS", "Ransomware", "Insider Threat"],
      },
    ],
  },
  {
    country: "Germany",
    cities: [
      {
        name: "Berlin",
        lat: 52.52,
        lng: 13.405,
        attacks: ["DDoS", "Industrial Espionage", "Malware"],
      },
      {
        name: "Frankfurt",
        lat: 50.1109,
        lng: 8.6821,
        attacks: ["DDoS", "Banking Fraud", "Financial Crime"],
      },
    ],
  },
  {
    country: "France",
    cities: [
      {
        name: "Paris",
        lat: 48.8566,
        lng: 2.3522,
        attacks: ["DDoS", "State-sponsored", "Data Breach"],
      },
      {
        name: "Lyon",
        lat: 45.764,
        lng: 4.8357,
        attacks: ["DDoS", "Ransomware", "Insider Threat"],
      },
    ],
  },
  {
    country: "Netherlands",
    cities: [
      {
        name: "Amsterdam",
        lat: 52.3676,
        lng: 4.9041,
        attacks: ["DDoS", "Cryptocurrency Mining", "Botnet"],
      },
    ],
  },
  {
    country: "Russia",
    cities: [
      {
        name: "Moscow",
        lat: 55.7558,
        lng: 37.6176,
        attacks: ["DDoS", "State-sponsored", "APT", "Cyber Warfare"],
      },
      {
        name: "Saint Petersburg",
        lat: 59.9311,
        lng: 30.3609,
        attacks: ["DDoS", "Industrial Espionage", "Malware"],
      },
    ],
  },

  // Asia
  {
    country: "China",
    cities: [
      {
        name: "Beijing",
        lat: 39.9042,
        lng: 116.4074,
        attacks: ["DDoS", "State-sponsored", "APT", "Industrial Espionage"],
      },
      {
        name: "Shanghai",
        lat: 31.2304,
        lng: 121.4737,
        attacks: ["DDoS", "Financial Crime", "Data Breach"],
      },
      {
        name: "Shenzhen",
        lat: 22.5431,
        lng: 114.0579,
        attacks: ["DDoS", "IoT Attack", "Supply Chain"],
      },
    ],
  },
  {
    country: "Japan",
    cities: [
      {
        name: "Tokyo",
        lat: 35.6762,
        lng: 139.6503,
        attacks: ["DDoS", "Ransomware", "Insider Threat"],
      },
      {
        name: "Osaka",
        lat: 34.6937,
        lng: 135.5023,
        attacks: ["DDoS", "Malware", "Cryptocurrency Mining"],
      },
    ],
  },
  {
    country: "South Korea",
    cities: [
      {
        name: "Seoul",
        lat: 37.5665,
        lng: 126.978,
        attacks: ["DDoS", "State-sponsored", "Cyber Warfare"],
      },
      {
        name: "Busan",
        lat: 35.1796,
        lng: 129.0756,
        attacks: ["DDoS", "Industrial Espionage", "APT"],
      },
    ],
  },
  {
    country: "India",
    cities: [
      {
        name: "Mumbai",
        lat: 19.076,
        lng: 72.8777,
        attacks: ["DDoS", "Phishing", "Banking Fraud"],
      },
      {
        name: "Delhi",
        lat: 28.7041,
        lng: 77.1025,
        attacks: ["DDoS", "Government Attack", "Data Breach"],
      },
      {
        name: "Bangalore",
        lat: 12.9716,
        lng: 77.5946,
        attacks: ["DDoS", "Cloud Attack", "API Abuse"],
      },
    ],
  },

  // Middle East & Africa
  {
    country: "Israel",
    cities: [
      {
        name: "Tel Aviv",
        lat: 32.0853,
        lng: 34.7818,
        attacks: ["DDoS", "State-sponsored", "Cyber Warfare", "APT"],
      },
    ],
  },
  {
    country: "United Arab Emirates",
    cities: [
      {
        name: "Dubai",
        lat: 25.2048,
        lng: 55.2708,
        attacks: ["DDoS", "Financial Crime", "Cryptocurrency Mining"],
      },
    ],
  },
  {
    country: "South Africa",
    cities: [
      {
        name: "Cape Town",
        lat: -33.9249,
        lng: 18.4241,
        attacks: ["DDoS", "Banking Fraud", "Ransomware"],
      },
    ],
  },

  // South America
  {
    country: "Brazil",
    cities: [
      {
        name: "São Paulo",
        lat: -23.5505,
        lng: -46.6333,
        attacks: ["DDoS", "Banking Fraud", "Cryptocurrency Mining"],
      },
      {
        name: "Rio de Janeiro",
        lat: -22.9068,
        lng: -43.1729,
        attacks: ["DDoS", "Ransomware", "Malware"],
      },
    ],
  },
  {
    country: "Argentina",
    cities: [
      {
        name: "Buenos Aires",
        lat: -34.6118,
        lng: -58.396,
        attacks: ["DDoS", "Banking Fraud", "Insider Threat"],
      },
    ],
  },

  // Oceania
  {
    country: "Australia",
    cities: [
      {
        name: "Sydney",
        lat: -33.8688,
        lng: 151.2093,
        attacks: ["DDoS", "Ransomware", "Government Attack"],
      },
      {
        name: "Melbourne",
        lat: -37.8136,
        lng: 144.9631,
        attacks: ["DDoS", "Data Breach", "Insider Threat"],
      },
    ],
  },
];

// Realistic IP ranges for different countries (simplified)
const COUNTRY_IP_RANGES = {
  "United States": [
    "192.168.",
    "10.0.",
    "172.16.",
    "203.0.",
    "198.51.",
    "198.18.",
  ],
  China: ["58.14.", "58.16.", "58.18.", "58.20.", "58.22.", "58.24."],
  Russia: ["46.17.", "46.18.", "46.19.", "46.20.", "46.21.", "46.22."],
  Germany: ["46.4.", "46.5.", "46.6.", "46.7.", "46.8.", "46.9."],
  "United Kingdom": [
    "46.10.",
    "46.11.",
    "46.12.",
    "46.13.",
    "46.14.",
    "46.15.",
  ],
  France: ["46.16.", "46.17.", "46.18.", "46.19.", "46.20.", "46.21."],
  Japan: ["126.0.", "126.1.", "126.2.", "126.3.", "126.4.", "126.5."],
  "South Korea": [
    "175.192.",
    "175.193.",
    "175.194.",
    "175.195.",
    "175.196.",
    "175.197.",
  ],
  India: [
    "117.192.",
    "117.193.",
    "117.194.",
    "117.195.",
    "117.196.",
    "117.197.",
  ],
  Brazil: ["177.0.", "177.1.", "177.2.", "177.3.", "177.4.", "177.5."],
  Australia: ["1.0.", "1.1.", "1.2.", "1.3.", "1.4.", "1.5."],
  Canada: ["24.0.", "24.1.", "24.2.", "24.3.", "24.4.", "24.5."],
  Netherlands: ["46.23.", "46.24.", "46.25.", "46.26.", "46.27.", "46.28."],
  Israel: ["46.29.", "46.30.", "46.31.", "46.32.", "46.33.", "46.34."],
  "United Arab Emirates": [
    "46.35.",
    "46.36.",
    "46.37.",
    "46.38.",
    "46.39.",
    "46.40.",
  ],
  "South Africa": ["41.0.", "41.1.", "41.2.", "41.3.", "41.4.", "41.5."],
  Argentina: ["190.0.", "190.1.", "190.2.", "190.3.", "190.4.", "190.5."],
};

// Live Mode Status Hook
function useLiveModeStatus() {
  const [status, setStatus] = useState("off"); // 'off', 'on'
  const [isChecking, setIsChecking] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mockDataIntervalRef = useRef(null);

  // Generate realistic mock attack data targeting real countries and cities
  const generateMockAttack = () => {
    // Select a random country
    const randomCountry =
      COUNTRY_DATABASE[Math.floor(Math.random() * COUNTRY_DATABASE.length)];
    const randomCity =
      randomCountry.cities[
        Math.floor(Math.random() * randomCountry.cities.length)
      ];

    // Get coordinates from the selected city
    const lat = randomCity.lat;
    const lng = randomCity.lng;

    // Select a random attack type from the city's attack types
    const attackType =
      randomCity.attacks[Math.floor(Math.random() * randomCity.attacks.length)];

    // Generate realistic IP based on country
    const countryIpRanges = COUNTRY_IP_RANGES[randomCountry.country] || [
      "192.168.",
      "10.0.",
    ];
    const ipPrefix =
      countryIpRanges[Math.floor(Math.random() * countryIpRanges.length)];
    const ip = `${ipPrefix}${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    // Generate realistic confidence score based on attack type
    let confidencePct;
    switch (attackType) {
      case "State-sponsored":
      case "APT":
      case "Cyber Warfare":
        confidencePct = 85 + Math.floor(Math.random() * 15); // 85-100%
        break;
      case "DDoS":
        confidencePct = 70 + Math.floor(Math.random() * 25); // 70-95%
        break;
      case "Ransomware":
      case "Malware":
        confidencePct = 60 + Math.floor(Math.random() * 30); // 60-90%
        break;
      case "Phishing":
      case "Banking Fraud":
        confidencePct = 50 + Math.floor(Math.random() * 35); // 50-85%
        break;
      default:
        confidencePct = 40 + Math.floor(Math.random() * 40); // 40-80%
    }

    // Generate additional realistic details
    const additionalDetails = {
      country: randomCountry.country,
      city: randomCity.name,
      attackType: attackType,
      severity:
        confidencePct > 80 ? "High" : confidencePct > 60 ? "Medium" : "Low",
      source: generateRealisticSource(attackType),
      target: generateRealisticTarget(randomCity.name, attackType),
      timestamp: new Date().toISOString(),
      description: generateAttackDescription(
        attackType,
        randomCity.name,
        randomCountry.country,
      ),
    };

    // Dispatch the attack event with enhanced details
    window.dispatchEvent(
      new CustomEvent("livemode-attack", {
        detail: {
          lat,
          lng,
          confidencePct,
          ip,
          seenAt: Date.now(),
          ...additionalDetails,
        },
      }),
    );

    // mock attack generated
  };

  // Helper function to generate realistic attack sources
  const generateRealisticSource = (attackType) => {
    const sources = {
      DDoS: [
        "Botnet",
        "Distributed Network",
        "Compromised IoT Devices",
        "Reflection Attack",
      ],
      Phishing: [
        "Email Campaign",
        "SMS Phishing",
        "Social Engineering",
        "Fake Website",
      ],
      Malware: [
        "Email Attachment",
        "Drive-by Download",
        "USB Drop",
        "Watering Hole",
      ],
      Ransomware: [
        "Email Campaign",
        "Remote Desktop",
        "Vulnerability Exploit",
        "Supply Chain",
      ],
      "State-sponsored": [
        "APT Group",
        "Government Agency",
        "Military Unit",
        "Intelligence Service",
      ],
      "Banking Fraud": [
        "Card Skimming",
        "ATM Malware",
        "Online Banking",
        "Mobile Banking",
      ],
      "Data Breach": [
        "SQL Injection",
        "Insider Access",
        "Third-party Vendor",
        "Cloud Misconfiguration",
      ],
      "Cryptocurrency Mining": [
        "Browser Mining",
        "Infected Software",
        "Cloud Instance",
        "Container Escape",
      ],
      Botnet: [
        "IoT Compromise",
        "Malware Distribution",
        "Command & Control",
        "P2P Network",
      ],
      "Insider Threat": [
        "Disgruntled Employee",
        "Privilege Abuse",
        "Data Exfiltration",
        "Sabotage",
      ],
      "Industrial Espionage": [
        "Spear Phishing",
        "Watering Hole",
        "Supply Chain",
        "Physical Access",
      ],
      "Cyber Warfare": [
        "Critical Infrastructure",
        "Government Systems",
        "Military Networks",
        "Power Grid",
      ],
      "Financial Crime": [
        "Money Laundering",
        "Fraud Ring",
        "Identity Theft",
        "Payment Fraud",
      ],
      "IoT Attack": [
        "Default Credentials",
        "Firmware Exploit",
        "Protocol Abuse",
        "Physical Access",
      ],
      "Cloud Attack": [
        "Misconfiguration",
        "API Abuse",
        "Container Escape",
        "Privilege Escalation",
      ],
      "API Abuse": [
        "Rate Limiting Bypass",
        "Authentication Bypass",
        "Data Scraping",
        "Injection Attack",
      ],
      "Supply Chain": [
        "Software Compromise",
        "Hardware Backdoor",
        "Third-party Access",
        "Update Poisoning",
      ],
    };

    const attackSources = sources[attackType] || ["Unknown Source"];
    return attackSources[Math.floor(Math.random() * attackSources.length)];
  };

  // Helper function to generate realistic targets
  const generateRealisticTarget = (city, attackType) => {
    const targets = {
      DDoS: [
        "Web Server",
        "DNS Server",
        "Game Server",
        "Streaming Service",
        "E-commerce Site",
      ],
      Phishing: [
        "Banking Customers",
        "Corporate Employees",
        "Government Officials",
        "Healthcare Workers",
      ],
      Malware: [
        "Corporate Network",
        "Government System",
        "Healthcare Facility",
        "Educational Institution",
      ],
      Ransomware: [
        "Hospital",
        "School District",
        "Municipal Government",
        "Law Firm",
        "Manufacturing Plant",
      ],
      "State-sponsored": [
        "Government Agency",
        "Critical Infrastructure",
        "Military Base",
        "Research Facility",
      ],
      "Banking Fraud": [
        "ATM Network",
        "Online Banking",
        "Credit Card System",
        "Payment Processor",
      ],
      "Data Breach": [
        "Customer Database",
        "Employee Records",
        "Financial Data",
        "Personal Information",
      ],
      "Cryptocurrency Mining": [
        "Corporate Servers",
        "Cloud Infrastructure",
        "Gaming PCs",
        "Mobile Devices",
      ],
      Botnet: [
        "IoT Devices",
        "Home Routers",
        "Security Cameras",
        "Smart Appliances",
      ],
      "Insider Threat": [
        "Corporate Data",
        "Customer Information",
        "Financial Records",
        "Intellectual Property",
      ],
      "Industrial Espionage": [
        "Trade Secrets",
        "Research Data",
        "Manufacturing Process",
        "Customer List",
      ],
      "Cyber Warfare": [
        "Power Grid",
        "Water Treatment",
        "Transportation",
        "Communication Systems",
      ],
      "Financial Crime": [
        "Banking System",
        "Payment Network",
        "Cryptocurrency Exchange",
        "Investment Platform",
      ],
      "IoT Attack": [
        "Smart Home",
        "Industrial Sensors",
        "Medical Devices",
        "Vehicle Systems",
      ],
      "Cloud Attack": [
        "Cloud Storage",
        "Container Registry",
        "API Gateway",
        "Database Service",
      ],
      "API Abuse": [
        "Social Media API",
        "Payment API",
        "Mapping Service",
        "Weather Service",
      ],
      "Supply Chain": [
        "Software Update",
        "Hardware Component",
        "Third-party Service",
        "Development Tool",
      ],
    };

    const attackTargets = targets[attackType] || ["Unknown Target"];
    return attackTargets[Math.floor(Math.random() * attackTargets.length)];
  };

  // Helper function to generate attack descriptions
  const generateAttackDescription = (attackType, city, country) => {
    const descriptions = {
      DDoS: `Large-scale distributed denial-of-service attack targeting ${city} infrastructure, causing service disruptions and potential financial losses.`,
      Phishing: `Sophisticated phishing campaign targeting ${city} residents, attempting to steal credentials and personal information.`,
      Malware: `Advanced malware deployment detected in ${city}, potentially compromising systems and data integrity.`,
      Ransomware: `Ransomware attack on ${city} organization, encrypting critical data and demanding payment for decryption.`,
      "State-sponsored": `Suspected state-sponsored cyber operation targeting ${city} critical infrastructure, indicating advanced persistent threat.`,
      "Banking Fraud": `Financial fraud operation in ${city}, targeting banking systems and customer accounts.`,
      "Data Breach": `Unauthorized access to sensitive data systems in ${city}, potentially exposing personal and financial information.`,
      "Cryptocurrency Mining": `Cryptocurrency mining malware detected in ${city}, hijacking computing resources for profit.`,
      Botnet: `Botnet recruitment activity in ${city}, compromising devices for coordinated attacks.`,
      "Insider Threat": `Suspicious insider activity detected in ${city} organization, potentially compromising security.`,
      "Industrial Espionage": `Industrial espionage operation targeting ${city} businesses, attempting to steal trade secrets.`,
      "Cyber Warfare": `Cyber warfare operation targeting ${city} critical infrastructure, indicating nation-state involvement.`,
      "Financial Crime": `Financial crime operation in ${city}, involving money laundering and fraud schemes.`,
      "IoT Attack": `IoT device compromise detected in ${city}, potentially creating security vulnerabilities.`,
      "Cloud Attack": `Cloud infrastructure attack in ${city}, exploiting misconfigurations and vulnerabilities.`,
      "API Abuse": `API abuse detected in ${city}, potentially causing service degradation and data exposure.`,
      "Supply Chain": `Supply chain attack targeting ${city} organizations, compromising software or hardware components.`,
    };

    return (
      descriptions[attackType] ||
      `Cybersecurity incident detected in ${city}, ${country}.`
    );
  };

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

  const disconnectWebSocket = React.useCallback(() => {
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
