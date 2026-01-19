(function () {
    const API_BASE = window.API_BASE_URL || window.UNIRIDERS_API || window.API || "/api";
    const registeredClocks = new Set();
    let offsetMs = 0;
    let tickInterval = null;
    let syncInterval = null;

    async function syncWithServer() {
        try {
            const response = await fetch(`${API_BASE}/system/time`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Sin respuesta del servidor');
            const data = await response.json();
            const serverTime = data.serverTime || data.isoServerTime;
            if (serverTime) {
                offsetMs = new Date(serverTime).getTime() - Date.now();
            } else if (typeof data.epochMs === 'number') {
                offsetMs = data.epochMs - Date.now();
            }
        } catch (error) {
            offsetMs = 0;
        }
    }

    function formatSyncedTime(date) {
        return date.toLocaleString('es-EC', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function updateClocks() {
        if (registeredClocks.size === 0) return;
        const now = new Date(Date.now() + offsetMs);
        registeredClocks.forEach(clock => {
            clock.textContent = formatSyncedTime(now);
            clock.dataset.syncedAt = now.toISOString();
        });
    }

    function startTicking() {
        if (tickInterval) return;
        syncWithServer().then(updateClocks);
        tickInterval = setInterval(updateClocks, 1000);
        syncInterval = setInterval(() => syncWithServer().then(updateClocks), 60 * 1000);
    }

    function registerClock(element) {
        if (!element) return;
        registeredClocks.add(element);
        startTicking();
        updateClocks();
    }

    window.startLiveClock = function (selectorOrElement) {
        const element = typeof selectorOrElement === 'string'
            ? document.querySelector(selectorOrElement)
            : selectorOrElement;
        registerClock(element);
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-live-clock]').forEach(registerClock);
    });

    window.addEventListener('beforeunload', () => {
        if (tickInterval) clearInterval(tickInterval);
        if (syncInterval) clearInterval(syncInterval);
        registeredClocks.clear();
    });
})();
