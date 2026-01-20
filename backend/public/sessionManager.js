// sessionManager.js
class SessionManager {
    constructor() {
        this.currentSessionId = this.getCurrentSessionId();
    }

    getCurrentSessionId() {
        // Buscar sessionId en URL parameters primero
        const urlParams = new URLSearchParams(window.location.search);
        let sessionId = urlParams.get('sessionId');
        
        if (!sessionId) {
            // Si no hay en URL, buscar en localStorage
            sessionId = localStorage.getItem('currentSessionId');
        }
        
        return sessionId;
    }

    getSessionData(key) {
        if (!this.currentSessionId) return null;
        return localStorage.getItem(this.currentSessionId + '_' + key);
    }

    setSessionData(key, value) {
        if (!this.currentSessionId) return;
        localStorage.setItem(this.currentSessionId + '_' + key, value);
    }

    createNewSession(role, email, name) {
        const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        localStorage.setItem(newSessionId + '_userEmail', email);
        localStorage.setItem(newSessionId + '_userName', name);
        localStorage.setItem(newSessionId + '_userRole', role);
        localStorage.setItem('currentSessionId', newSessionId);
        
        this.currentSessionId = newSessionId;
        
        return newSessionId;
    }

    getActiveSessions() {
        const sessions = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('session_') && key.includes('_userEmail')) {
                const sessionId = key.replace('_userEmail', '');
                sessions.push({
                    id: sessionId,
                    email: localStorage.getItem(key),
                    role: localStorage.getItem(sessionId + '_userRole')
                });
            }
        }
        return sessions;
    }

    clearSession() {
        if (this.currentSessionId) {
            localStorage.removeItem(this.currentSessionId + '_userEmail');
            localStorage.removeItem(this.currentSessionId + '_userName');
            localStorage.removeItem(this.currentSessionId + '_userRole');
            localStorage.removeItem('currentSessionId');
        }
    }
}

const sessionManager = new SessionManager();