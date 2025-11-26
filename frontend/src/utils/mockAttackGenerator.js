import { COUNTRY_DATABASE, COUNTRY_IP_RANGES } from "./mockAttackData";

// Helper function to generate realistic attack sources
export const generateRealisticSource = (attackType) => {
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
            "Hardware Component",
            "Third-party Service",
            "Development Tool",
        ],
    };

    const attackSources = sources[attackType] || ["Unknown Source"];
    return attackSources[Math.floor(Math.random() * attackSources.length)];
};

// Helper function to generate realistic targets
export const generateRealisticTarget = (city, attackType) => {
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
export const generateAttackDescription = (attackType, city, country) => {
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

// Generate realistic mock attack data targeting real countries and cities
export const generateMockAttack = () => {
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
