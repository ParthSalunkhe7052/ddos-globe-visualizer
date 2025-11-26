# 🔑 API Keys Setup Guide

This guide will help you obtain free API keys for the DDoS Globe Visualizer.

---

## 🎯 Overview

The DDoS Globe Visualizer integrates with multiple threat intelligence sources. While the application works without API keys (using mock data), obtaining free API keys significantly enhances functionality and provides real-time threat data.

---

## 📋 API Keys Summary

| Service | Required | Free Tier | Setup Time | Features |
|---------|----------|-----------|------------|----------|
| **AbuseIPDB** | Optional | 1,000 requests/day | 2 minutes | IP abuse scoring & reports |
| **AlienVault OTX** | Optional | Unlimited | 3 minutes | Threat indicators & pulses |
| **Abuse.ch** | No | Unlimited | None needed | ThreatFox, URLhaus, MalwareBazaar |

---

## 🔐 How to Get API Keys

### 1. AbuseIPDB API Key

**What it provides:**
- IP abuse confidence scoring (0-100%)
- Historical abuse reports
- Threat categorization
- Country of origin verification

**How to get it:**

1. **Visit**: https://www.abuseipdb.com/register
2. **Create Account**:
   - Enter email address
   - Choose a strong password
   - Verify email
3. **Generate API Key**:
   - Login to your account
   - Go to: https://www.abuseipdb.com/account/api
   - Click "Create Key"
   - Copy your API key
4. **Add to `.env` file**:
   ```env
   ABUSEIPDB_KEY=your_actual_api_key_here
   ```

**Free Tier Limits:**
- ✅ 1,000 requests per day
- ✅ Access to check endpoint
- ✅ Historical data (90 days)
- ✅ No credit card required

**Paid Tiers** (optional):
- Basic: $20/month - 5,000 requests/day
- Premium: $50/month - 25,000 requests/day
- Enterprise: Custom pricing

---

### 2. AlienVault OTX API Key

**What it provides:**
- Open Threat Exchange indicators
- Malware signatures
- Command & Control server IPs
- Threat intelligence pulses
- Community-contributed threat data

**How to get it:**

1. **Visit**: https://otx.alienvault.com/api
2. **Create Account**:
   - Click "Sign Up"
   - Enter email and create password
   - Or use Google/GitHub login
   - Verify email
3. **Get API Key**:
   - Login to your account
   - Go to: https://otx.alienvault.com/api
   - Your API key is displayed in the "OTX Key" section
   - Click "Show" to reveal it
   - Copy the key
4. **Add to `.env` file**:
   ```env
   OTX_API_KEY=your_actual_otx_api_key_here
   ```

**Free Tier Limits:**
- ✅ Unlimited API requests
- ✅ Full access to pulses
- ✅ Real-time threat feeds
- ✅ Community contributions
- ✅ No credit card required

---

### 3. Abuse.ch Feeds (No API Key Required)

**What they provide:**
- **ThreatFox**: C2 servers, botnet infrastructure
- **URLhaus**: Malicious URLs and payloads
- **MalwareBazaar**: Malware samples and hashes

**How to use:**

**No registration needed!** These feeds are publicly available:

- ThreatFox: https://threatfox.abuse.ch/export/
- URLhaus: https://urlhaus.abuse.ch/api/
- MalwareBazaar: https://bazaar.abuse.ch/api/

The application automatically fetches data from these sources.

**Optional Authentication** (for higher limits):

If you want higher rate limits:

1. **Visit**: https://abuse.ch/
2. **Register**: Create a free account
3. **Get Auth Key**: Available in account settings
4. **Add to `.env` file**:
   ```env
   ABUSECH_AUTH_KEY=your_auth_key_here
   ```

---

## 📝 Configuration

### Step 1: Copy Environment Template

```bash
# Copy the example file
cp .env.example .env
```

### Step 2: Edit `.env` File

Open the `.env` file and add your API keys:

```env
# ========== API Keys ==========

# AbuseIPDB (Optional but Recommended)
ABUSEIPDB_KEY=your_abuseipdb_key_here

# AlienVault OTX (Optional)
OTX_API_KEY=your_otx_key_here

# Abuse.ch (Optional - for higher limits)
ABUSECH_AUTH_KEY=your_abusech_key_here
```

### Step 3: Configure Settings

Adjust other settings as needed:

```env
# Mode Settings
DShieldMode=live                    # live or mock
USE_MOCK_DATA=false                 # Set to true to use sample data

# Polling Intervals (seconds)
ABUSEIPDB_INTERVAL=300              # How often to poll AbuseIPDB
LIVEFEED_POLL_INTERVAL_SEC=30       # Live feed refresh rate

# Server Settings
WS_HOST=0.0.0.0                     # Server bind address
WS_PORT=8000                        # Server port
DEBUG=false                         # Debug mode
```

---

## 🔒 Security Best Practices

### ⚠️ NEVER commit your `.env` file to Git!

**The `.env` file is already in `.gitignore` to protect your keys.**

### Do's ✅
- ✅ Keep API keys in `.env` file
- ✅ Use `.env.example` as a template
- ✅ Rotate keys periodically
- ✅ Use different keys for dev/production
- ✅ Monitor API usage

### Don'ts ❌
- ❌ Never hardcode keys in source code
- ❌ Never commit `.env` to Git
- ❌ Never share keys publicly
- ❌ Never use production keys in development
- ❌ Never store keys in screenshots or logs

---

## 🧪 Testing Your Setup

### Verify API Keys Work:

1. **Start the backend**:
   ```bash
   run_all.bat
   # or
   python backend/start_server.py
   ```

2. **Check logs**:
   - Look for "AbuseIPDB API key configured" (if key provided)
   - Look for "OTX feed enabled" (if key provided)
   - No errors about API authentication

3. **Test in application**:
   - Open http://localhost:5173
   - Analyze an IP address (e.g., 8.8.8.8)
   - Enable Live Mode
   - Check if data loads correctly

### Check Admin Dashboard:

1. Go to: http://localhost:8000/admin
2. Check "API Services Status"
3. Verify services show as "Healthy"

---

## ❓ Troubleshooting

### Issue: "API key not configured"

**Solution:**
- Verify `.env` file exists in project root
- Check key name matches exactly: `ABUSEIPDB_KEY`, `OTX_API_KEY`
- Remove any quotes around the key
- Restart the backend server

### Issue: "Unauthorized" or "401 Error"

**Solution:**
- Verify API key is correct (copy-paste again)
- Check if key has required permissions
- Verify account is activated (check email)
- Check API key hasn't expired

### Issue: "Rate limit exceeded"

**Solution:**
- You've hit the free tier limit
- Wait for limit to reset (usually 24 hours)
- Consider upgrading to paid tier
- Reduce polling interval in `.env`:
  ```env
  ABUSEIPDB_INTERVAL=600  # Poll every 10 minutes instead of 5
  ```

### Issue: "Mock data being used"

**Solution:**
- This is expected if no API keys provided
- Application works fine with mock data
- Add API keys to get real threat intelligence

---

## 📊 Monitoring Usage

### AbuseIPDB:
- View usage: https://www.abuseipdb.com/account/api
- Shows requests made today
- Displays remaining quota

### AlienVault OTX:
- No usage limits on free tier
- Monitor at: https://otx.alienvault.com/api

### Abuse.ch:
- Check status: https://abuse.ch/
- No registration needed for basic access

---

## 💡 Tips for Best Results

1. **Start with AbuseIPDB**: Most valuable for IP analysis
2. **Add OTX for live feeds**: Enables real-time threat detection
3. **Monitor your usage**: Stay within free tier limits
4. **Use mock data in development**: Save API calls for production
5. **Cache aggressively**: Default settings already optimize this

---

## 🎯 Quick Start Summary

**Minimum Setup (Works Without Keys):**
```bash
# Just copy the example
cp .env.example .env
# Run the application - uses mock data
run_all.bat
```

**Recommended Setup (With Free API Keys):**
```bash
# 1. Get AbuseIPDB key from https://www.abuseipdb.com/register
# 2. Get OTX key from https://otx.alienvault.com/api
# 3. Add to .env file
# 4. Run application
run_all.bat
```

---

## 📚 Additional Resources

- **AbuseIPDB Documentation**: https://docs.abuseipdb.com/
- **OTX Documentation**: https://otx.alienvault.com/api
- **Abuse.ch API Docs**: https://abuse.ch/api/
- **Project Documentation**: See `docs/` folder

---

## 🆘 Need Help?

- **Check Logs**: Look at terminal output when starting backend
- **Admin Dashboard**: http://localhost:8000/admin for diagnostics
- **Troubleshooting Guide**: See `TROUBLESHOOTING.md`
- **GitHub Issues**: Report problems on the repository

---

**⏱️ Total Setup Time: 5-10 minutes**

**💰 Total Cost: FREE** (with free tier limitations)

**🚀 Get started now and unlock real-time threat intelligence!**
