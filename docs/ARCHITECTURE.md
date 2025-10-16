# DDoS Globe Visualizer - Architecture

## System Overview

DDoS Globe Visualizer is a full-stack web application that provides real-time visualization of global IP threat data on an interactive 3D globe.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React)                       │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │  Globe View    │  │  Search/Filter │  │  Live Feed     ││
│  │  (Three.js)    │  │  Components    │  │  Dashboard     ││
│  └────────────────┘  └────────────────┘  └────────────────┘│
│           │                   │                    │          │
│           └───────────────────┴────────────────────┘          │
│                              │                                │
│                     WebSocket + REST API                      │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                      Backend (FastAPI)                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  REST API      │  │  WebSocket     │  │  Admin Panel   │ │
│  │  Endpoints     │  │  Handlers      │  │  Dashboard     │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
│           │                   │                    │           │
│  ┌────────┴───────────────────┴────────────────────┴────────┐│
│  │              Service Layer (Business Logic)               ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   ││
│  │  │ GeoIP        │  │ AbuseIPDB    │  │ Live Feeds  │   ││
│  │  │ Service      │  │ Service      │  │ Service     │   ││
│  │  └──────────────┘  └──────────────┘  └─────────────┘   ││
│  └────────────────────────────────────────────────────────────┤│
│  │                   Cache Layer (SQLite)                    ││
│  └────────────────────────────────────────────────────────────┘│
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                    External APIs                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  IP-API.com    │  │  AbuseIPDB     │  │  ThreatFox,    │ │
│  │  (GeoIP)       │  │  (Threat Intel)│  │  URLhaus, etc. │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **React 19**: UI framework with hooks and functional components
- **Vite**: Build tool and development server
- **Three.js / react-globe.gl**: 3D globe visualization
- **Tailwind CSS**: Utility-first CSS framework
- **Axios**: HTTP client for API calls
- **React Hot Toast**: Toast notifications

### Backend
- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server
- **HTTPx**: Async HTTP client
- **SQLite**: Local caching database
- **Pydantic**: Data validation and serialization
- **python-dotenv**: Environment variable management

## Core Components

### 1. Frontend Components

#### Globe Component
- 3D interactive globe using Three.js
- Real-time point rendering for IP locations
- Click interactions for detailed information
- Smooth camera animations

#### Live Mode Component
- WebSocket connection for real-time updates
- Event stream processing
- Attack visualization and alerts
- Feed status monitoring

#### Search Component
- IP address search and validation
- Country/region filtering
- Export functionality

### 2. Backend Services

#### GeoIP Service (`geo_service.py`)
- IP to location mapping
- GeoLite2 database integration
- ip-api.com fallback
- Response caching

#### AbuseIPDB Service (`abuseipdb_service.py`)
- Threat intelligence lookup
- Abuse confidence scoring
- Rate limit handling (429 errors)
- 24-hour request quota management

#### Live Feed Service (`live_feed_service.py`)
- Multiple threat feed polling:
  - ThreatFox (abuse.ch)
  - URLhaus (abuse.ch)
  - MalwareBazaar (abuse.ch)
  - AlienVault OTX
- Feed normalization
- Deduplication logic
- Exponential backoff on errors

#### IP Cache (`ip_cache.py`)
- SQLite-based caching
- TTL-based expiration
- Automatic cleanup
- Reduced API calls

### 3. API Endpoints

#### REST Endpoints
- `GET /health` - Health check
- `GET /analyze_ip?ip={ip}` - Analyze specific IP
- `GET /admin` - Admin dashboard UI
- `GET /api/admin/status` - System status
- `POST /api/admin/clear-cache` - Clear caches

#### WebSocket Endpoints
- `/ws/live` - Live attack feed stream

## Data Flow

### IP Analysis Flow
1. User submits IP address via frontend
2. Frontend sends GET request to `/analyze_ip`
3. Backend checks IP cache
4. If not cached:
   - Query GeoIP service
   - Query AbuseIPDB (if configured)
   - Enrich with additional data
   - Store in cache
5. Return enriched data to frontend
6. Frontend visualizes on globe

### Live Feed Flow
1. Backend polls threat feeds at configured intervals
2. Feed data is normalized and deduplicated
3. Events are queued with rate limiting
4. WebSocket broadcasts events to connected clients
5. Frontend receives and visualizes events
6. Collapsed summaries for high-volume sources

## Configuration

### Environment Variables
See `.env.example` for full list. Key variables:
- `ABUSEIPDB_KEY` - AbuseIPDB API key (optional)
- `OTX_API_KEY` - AlienVault OTX key (optional)
- `WS_HOST`, `WS_PORT` - Server binding
- `USE_MOCK_DATA` - Enable/disable mock data
- `VITE_BACKEND_URL` - Frontend API URL

## Caching Strategy

### IP Enrichment Cache
- In-memory cache with 24-hour TTL
- Reduces external API calls
- Automatic cleanup on startup

### Database Cache
- SQLite for persistent caching
- Stores IP analysis results
- Configurable TTL (default 1 hour)

## Error Handling

### Graceful Degradation
- Services fail independently
- Default values for missing data
- Comprehensive logging

### Rate Limiting
- AbuseIPDB: 24-hour cooldown on 429
- Feed backoff: Exponential retry
- Request throttling in live mode

## Scalability Considerations

### Current Limitations
- Single-server architecture
- SQLite database (suitable for <100k records)
- In-memory caching (limited by RAM)

### Future Improvements
- PostgreSQL for production
- Redis for distributed caching
- Horizontal scaling with load balancer
- Dedicated WebSocket server

## Security

### API Key Management
- All keys in `.env` (gitignored)
- No hardcoded credentials
- Optional API features

### CORS Configuration
- Configured for development
- Should be restricted in production

### Input Validation
- IP address validation
- Pydantic models for all inputs
- XSS protection via React

## Monitoring & Logging

### Logging
- Python `logging` module
- Configurable log levels
- Structured log messages

### Health Checks
- `/health` endpoint
- Service status monitoring
- Admin dashboard metrics

## Deployment

### Development
- `run_all.bat` for Windows
- Separate backend/frontend processes
- Hot reload enabled

### Production Recommendations
- Use reverse proxy (nginx)
- HTTPS/WSS for security
- Process manager (systemd, PM2)
- Environment-specific configs
- Database backups
