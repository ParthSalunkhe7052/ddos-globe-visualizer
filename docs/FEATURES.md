# DDoS Globe Visualizer - Features Overview

## Core Features

### 1. 3D Globe Visualization
- **Interactive 3D Globe**: WebGL-powered globe using Three.js and react-globe.gl
- **Real-time Point Rendering**: Dynamic visualization of IP locations with smooth animations
- **Zoom & Pan Controls**: Intuitive mouse/touch controls for exploration
- **Country Highlighting**: Visual distinction of different regions
- **Custom Point Styling**: Color-coded threat levels and abuse scores

### 2. IP Address Analysis
- **Single IP Lookup**: Analyze any IPv4 address for geolocation and threat data
- **Batch Analysis**: Process multiple IPs efficiently
- **Comprehensive Data Display**:
  - Geographic coordinates (latitude/longitude)
  - Country and city information
  - ISP and organization details
  - Usage type classification
  - Abuse confidence score (when AbuseIPDB is configured)
  - Total abuse reports and last reported date
  - Reverse DNS lookup

### 3. Real-time Threat Intelligence

#### Live Attack Feed
- **Multiple Threat Sources**:
  - **ThreatFox** (abuse.ch): C2 servers, botnets, malware infrastructure
  - **URLhaus** (abuse.ch): Malicious URLs and payload distribution
  - **MalwareBazaar** (abuse.ch): Malware samples and hashes
  - **AlienVault OTX** (optional): Open threat exchange indicators

- **Live Event Stream**: WebSocket-based real-time updates
- **Attack Visualization**: Dynamic points appearing on globe
- **Event Aggregation**: Collapse similar events to prevent spam
- **Feed Status Monitoring**: Real-time status of each threat feed
- **Confidence Scoring**: AI-enhanced threat confidence calculation
- **Cross-feed Correlation**: Higher confidence when multiple feeds report same IOC

#### Event Types
- IP addresses (IPv4)
- Domain names
- URLs
- File hashes (MD5, SHA1, SHA256)

### 4. Advanced Search & Filtering

#### Search Capabilities
- IP address search with validation
- Country/region filtering
- ISP/organization search
- Abuse score range filtering

#### Filter Options
- Minimum abuse confidence threshold
- Date range for last reported
- Usage type (datacenter, ISP, etc.)
- Geographic region

### 5. Admin Dashboard
- **System Health Monitoring**:
  - API connectivity status
  - Active WebSocket connections
  - Service availability checks
  - Cache statistics

- **Cache Management**:
  - View cache size and entries
  - Clear all caches
  - Manual cache cleanup

- **System Diagnostics**:
  - AbuseIPDB API status
  - GeoIP service status
  - Live feed service status
  - Error logs and warnings

### 6. Data Export
- **CSV Export**: Export analyzed data for further analysis
- **JSON Export**: Raw data export for programmatic access
- **Filtered Exports**: Export based on current filters
- **Batch Export**: Export multiple IPs at once

### 7. Caching System

#### Multi-tier Caching
- **In-memory Cache**: Fast access for recent queries (24h TTL)
- **SQLite Database**: Persistent storage for frequent IPs
- **Smart Cache Invalidation**: TTL-based automatic cleanup

#### Cache Benefits
- Reduced API calls
- Faster response times
- Cost savings on paid API tiers
- Offline capability for cached data

### 8. API Integration

#### Supported APIs
1. **IP-API.com** (Free tier):
   - Geolocation data
   - ISP information
   - No API key required

2. **AbuseIPDB** (Optional):
   - Abuse confidence scoring
   - Report history
   - Last reported timestamps
   - Free tier: 1,000 requests/day

3. **AlienVault OTX** (Optional):
   - Threat pulse subscriptions
   - Indicator correlation
   - API key required

4. **Abuse.ch Feeds** (Free):
   - ThreatFox, URLhaus, MalwareBazaar
   - No authentication required

### 9. User Interface Features

#### Theme Support
- Dark mode (default)
- Light mode option
- System preference detection
- Persistent theme selection

#### Responsive Design
- Desktop-optimized layout
- Tablet support
- Mobile-friendly interface
- Adaptive globe sizing

#### Notifications
- Toast notifications for events
- Success/error feedback
- Loading indicators
- Real-time status updates

#### Accessibility
- Keyboard navigation support
- Screen reader friendly
- High contrast mode
- ARIA labels

### 10. Performance Optimizations

#### Frontend
- Code splitting and lazy loading
- Memoized components
- Efficient re-rendering
- WebGL optimization

#### Backend
- Async/await throughout
- Connection pooling
- Request throttling
- Graceful error handling

### 11. Developer Features

#### Configuration
- Environment-based config
- `.env` file support
- Configurable intervals and limits
- Debug mode

#### Logging
- Structured logging
- Log level configuration
- Request/response logging
- Error tracking

#### API Documentation
- OpenAPI/Swagger specs
- Interactive API docs at `/docs`
- Request/response examples
- Error code documentation

### 12. Mock Data Mode
- Testing without API keys
- Sample IP dataset included
- Realistic data simulation
- Development-friendly

## Feature Roadmap

### Planned Features (Future)
- [ ] Historical data analysis
- [ ] Custom threat feed integration
- [ ] Email/webhook alerting
- [ ] Multi-user support with authentication
- [ ] Advanced analytics dashboard
- [ ] Machine learning threat prediction
- [ ] GeoIP database updates automation
- [ ] API rate limit dashboard
- [ ] Custom visualization themes
- [ ] Report generation (PDF/HTML)

## Technical Specifications

### Supported IP Formats
- IPv4: Standard dotted decimal (e.g., 192.168.1.1)
- CIDR notation: Future support planned

### Data Retention
- Cache: 1-24 hours (configurable)
- Database: Until manual cleanup
- Logs: 7 days default

### Rate Limits
- AbuseIPDB: 1,000 requests/day (free tier)
- IP-API: 45 requests/minute
- Internal: No hard limits, throttling applied

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### System Requirements
- Python 3.8+
- Node.js 16+
- 4GB RAM minimum
- Modern GPU recommended for smooth 3D rendering
