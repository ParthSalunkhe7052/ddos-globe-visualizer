// Real country data with major cities and attack scenarios
export const COUNTRY_DATABASE = [
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
export const COUNTRY_IP_RANGES = {
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
