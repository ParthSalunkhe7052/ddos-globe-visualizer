// frontend/src/api.js
import axios from "axios";

// Base URL of your FastAPI backend
const API_URL = "http://127.0.0.1:8000";

export async function pingServer() {
  const res = await axios.get(`${API_URL}/ping`);
  return res.data;
}

export async function analyzeIP(ip) {
  const res = await axios.get(`${API_URL}/analyze_ip`, {
    params: { ip },
  });
  return res.data;
}
