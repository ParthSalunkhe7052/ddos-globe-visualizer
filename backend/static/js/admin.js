// Admin Dashboard JavaScript functionality
function adminDashboard() {
    return {
        // State
        activeTab: 'feed',
        wsConnected: false,
        logPaused: false,
        isDark: false,
        feedMode: 'live',
        activeConnections: 0,
        totalAttacks: 0,
        lastUpdate: 'Never',
        dshieldStatus: 'unknown',
        abuseipdbStatus: 'unknown',
        geoipStatus: 'unknown',

        // Data arrays
        attackFeed: [],
        logs: [],
        notifications: [],

        // WebSocket connections
        attackWs: null,
        logWs: null,

        // Initialize dashboard
        init() {
            this.loadTheme();
            // WebSocket connections disabled - Live Mode removed
            // this.connectWebSockets();
            this.loadSystemStatus();
            this.startStatusUpdates();

            // Auto-scroll logs to bottom
            this.$watch('logs', () => {
                if (!this.logPaused) {
                    this.$nextTick(() => {
                        const logContainer = document.getElementById('log-container');
                        if (logContainer) {
                            logContainer.scrollTop = logContainer.scrollHeight;
                        }
                    });
                }
            });
        },

        // Theme management
        loadTheme() {
            const saved = localStorage.getItem('admin-theme');
            this.isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
            this.applyTheme();
        },

        toggleTheme() {
            this.isDark = !this.isDark;
            this.applyTheme();
            localStorage.setItem('admin-theme', this.isDark ? 'dark' : 'light');
        },

        applyTheme() {
            if (this.isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },

        // WebSocket connections - DISABLED (Live Mode removed)
        connectWebSockets() {
            // WebSocket connections disabled - Live Mode removed
            console.log('WebSocket connections disabled - Live Mode has been removed');
        },

        connectAttackFeed() {
            // WebSocket connections disabled - Live Mode removed
            console.log('Attack feed WebSocket disabled - Live Mode has been removed');
        },

        connectLogStream() {
            // WebSocket connections disabled - Live Mode removed
            console.log('Log stream WebSocket disabled - Live Mode has been removed');
        },

        // Message handlers
        handleAttackMessage(data) {
            switch (data.type) {
                case 'attack':
                    this.addAttack(data.data);
                    break;
                case 'status':
                    this.addLog('info', data.message);
                    break;
                case 'error':
                    this.addLog('error', data.message);
                    this.addNotification('error', 'Attack Feed Error', data.message);
                    break;
            }
        },

        handleLogMessage(data) {
            if (data.type === 'log') {
                this.addLog(data.level || 'info', data.message, data.timestamp);
            }
        },

        // Attack feed management
        addAttack(attack) {
            attack.timestamp = new Date().toISOString();
            attack.id = attack.id || `attack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            this.attackFeed.unshift(attack);
            this.totalAttacks++;
            this.lastUpdate = new Date().toLocaleTimeString();

            // Keep only last 100 attacks
            if (this.attackFeed.length > 100) {
                this.attackFeed = this.attackFeed.slice(0, 100);
            }
        },

        // Log management
        addLog(level, message, timestamp = null) {
            const logEntry = {
                id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                level: level,
                message: message,
                timestamp: timestamp || new Date().toISOString()
            };

            this.logs.push(logEntry);

            // Keep only last 1000 logs
            if (this.logs.length > 1000) {
                this.logs = this.logs.slice(-1000);
            }
        },

        toggleLogPause() {
            this.logPaused = !this.logPaused;
            if (!this.logPaused) {
                // Auto-scroll to bottom when resuming
                this.$nextTick(() => {
                    const logContainer = document.getElementById('log-container');
                    if (logContainer) {
                        logContainer.scrollTop = logContainer.scrollHeight;
                    }
                });
            }
        },

        clearLogs() {
            this.logs = [];
            this.addLog('info', 'Logs cleared by user');
        },

        reconnectLogs() {
            // WebSocket connections disabled - Live Mode removed
            this.addNotification('info', 'WebSocket Disabled', 'Live Mode and WebSocket streaming have been removed');
            console.log('Reconnect logs disabled - Live Mode has been removed');
        },

        // System controls
        async setFeedMode(mode) {
            try {
                const response = await fetch('/api/debug/feed_mode', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mode: mode })
                });

                if (response.ok) {
                    this.feedMode = mode;
                    this.addNotification('success', 'Feed Mode Changed', `Switched to ${mode} mode`);
                } else {
                    throw new Error('Failed to change feed mode');
                }
            } catch (error) {
                this.addNotification('error', 'Feed Mode Error', error.message);
            }
        },

        async clearCache() {
            try {
                const response = await fetch('/api/admin/clear-cache', {
                    method: 'POST'
                });

                if (response.ok) {
                    this.addNotification('success', 'Cache Cleared', 'IP cache has been cleared');
                } else {
                    throw new Error('Failed to clear cache');
                }
            } catch (error) {
                this.addNotification('error', 'Cache Error', error.message);
            }
        },

        async refreshDShield() {
            try {
                const response = await fetch('/api/admin/refresh-dshield', {
                    method: 'POST'
                });

                if (response.ok) {
                    this.addNotification('success', 'DShield Refreshed', 'DShield data has been refreshed');
                } else {
                    throw new Error('Failed to refresh DShield data');
                }
            } catch (error) {
                this.addNotification('error', 'DShield Error', error.message);
            }
        },

        async testConnection() {
            this.addNotification('info', 'Testing Connections', 'Checking all service connections...');

            try {
                const [health, dshield, abuseipdb] = await Promise.all([
                    fetch('/health').then(r => r.json()),
                    fetch('/api/health/live-feed').then(r => r.json()),
                    fetch('/api/health/abuseipdb').then(r => r.json())
                ]);

                this.dshieldStatus = dshield.status === 'live' ? 'online' : 'offline';
                this.abuseipdbStatus = abuseipdb.status === 'online' ? 'online' : 'offline';
                this.geoipStatus = health.geoip_status === 'online' ? 'online' : 'offline';

                this.addNotification('success', 'Connection Test Complete', 'All services tested successfully');
            } catch (error) {
                this.addNotification('error', 'Connection Test Failed', error.message);
            }
        },

        async exportLogs() {
            const logData = this.logs.map(log => ({
                timestamp: log.timestamp,
                level: log.level,
                message: log.message
            }));

            const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ddos-logs-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.addNotification('success', 'Logs Exported', 'Log data has been downloaded');
        },

        // System status updates
        async loadSystemStatus() {
            try {
                const response = await fetch('/health');
                const data = await response.json();

                if (data.success) {
                    this.feedMode = data.data.feed_mode || 'live';
                    this.lastUpdate = data.data.last_update || 'Never';
                }
            } catch (error) {
                console.error('Failed to load system status:', error);
            }
        },

        startStatusUpdates() {
            // Update system status every 30 seconds
            setInterval(() => {
                this.loadSystemStatus();
            }, 30000);
        },

        // Notification management
        addNotification(type, title, message) {
            const notification = {
                id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: type,
                title: title,
                message: message,
                timestamp: new Date().toISOString()
            };

            this.notifications.push(notification);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                this.removeNotification(notification.id);
            }, 5000);
        },

        removeNotification(id) {
            this.notifications = this.notifications.filter(n => n.id !== id);
        },

        // Computed properties
        get attackFeedHtml() {
            return this.attackFeed.map(attack => `
                <div class="attack-item new">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center space-x-2">
                            <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">${attack.src_ip || attack.ip || 'Unknown IP'}</span>
                            <span class="status-badge ${attack.confidence > 80 ? 'online' : attack.confidence > 50 ? 'warning' : 'offline'}">
                                ${attack.confidence || 0}% confidence
                            </span>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400">${new Date(attack.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                        <div class="grid grid-cols-2 gap-2">
                            <div><strong>Country:</strong> ${attack.country_name || 'Unknown'}</div>
                            <div><strong>ISP:</strong> ${attack.isp || 'Unknown'}</div>
                            <div><strong>Attacks:</strong> ${attack.attack_count || 1}</div>
                            <div><strong>Protocol:</strong> ${attack.protocol || 'Unknown'}</div>
                        </div>
                        ${attack.description ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">${attack.description}</div>` : ''}
                    </div>
                </div>
            `).join('');
        },

        get logsHtml() {
            return this.logs.map(log => `
                <div class="log-entry ${log.level}">
                    <span class="text-gray-500 dark:text-gray-400">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span class="text-gray-400 dark:text-gray-500">[${log.level.toUpperCase()}]</span>
                    <span>${log.message}</span>
                </div>
            `).join('');
        }
    };
}
