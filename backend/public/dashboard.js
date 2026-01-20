// dashboard.js - Funcionalidades adicionales para el dashboard

class DashboardManager {
    constructor() {
        this.initializeFeatures();
    }

    initializeFeatures() {
        this.setupVoiceCommands();
        this.setupOfflineSupport();
        this.setupPerformanceMonitor();
        this.setupEmergencyFeatures();
    }

    // Comandos de voz
    setupVoiceCommands() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'es-ES';

            this.recognition.onresult = (event) => {
                const command = event.results[0][0].transcript.toLowerCase();
                this.handleVoiceCommand(command);
            };

            // Agregar botón de comando de voz
            this.addVoiceButton();
        }
    }

    addVoiceButton() {
        const voiceBtn = document.createElement('button');
        voiceBtn.innerHTML = '🎤';
        voiceBtn.className = 'voice-btn';
        voiceBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--color-verde-espoch);
            border: none;
            color: white;
            font-size: 1.5em;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        
        voiceBtn.onclick = () => this.toggleVoiceRecognition();
        document.body.appendChild(voiceBtn);
    }

    toggleVoiceRecognition() {
        if (this.recognition) {
            this.recognition.start();
            this.showToast('Escuchando... Habla ahora', true);
        }
    }

    handleVoiceCommand(command) {
        console.log('Comando de voz:', command);
        
        if (command.includes('solicitar viaje')) {
            document.getElementById('requestRideBtn')?.click();
            this.showToast('Solicitando viaje...', true);
        } else if (command.includes('cancelar viaje')) {
            document.querySelector('.cancel-btn')?.click();
            this.showToast('Cancelando viaje...', true);
        } else if (command.includes('activar servicio')) {
            document.getElementById('toggleStatusBtn')?.click();
            this.showToast('Activando servicio...', true);
        } else if (command.includes('desactivar servicio')) {
            document.getElementById('toggleStatusBtn')?.click();
            this.showToast('Desactivando servicio...', true);
        }
    }

    // Soporte offline
    setupOfflineSupport() {
        window.addEventListener('online', this.handleOnlineStatus.bind(this));
        window.addEventListener('offline', this.handleOfflineStatus.bind(this));
    }

    handleOnlineStatus() {
        this.showToast('✅ Conexión restaurada', true);
        document.body.classList.remove('offline-mode');
    }

    handleOfflineStatus() {
        this.showToast('⚠️ Estás offline. Algunas funciones pueden no estar disponibles', false);
        document.body.classList.add('offline-mode');
    }

    // Monitor de rendimiento
    setupPerformanceMonitor() {
        // Monitorear uso de memoria
        if ('memory' in performance) {
            setInterval(() => {
                const memory = performance.memory;
                const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
                const totalMB = Math.round(memory.totalJSHeapSize / 1048576);
                
                if (usedMB > totalMB * 0.8) {
                    this.showToast('🔄 Optimizando rendimiento...', true);
                }
            }, 30000);
        }
    }

    // Características de emergencia
    setupEmergencyFeatures() {
        // Botón de emergencia
        const emergencyBtn = document.createElement('button');
        emergencyBtn.innerHTML = '🆘';
        emergencyBtn.className = 'emergency-btn';
        emergencyBtn.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--color-rojo-claro);
            border: none;
            color: white;
            font-size: 1.5em;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(255,0,0,0.3);
            transition: all 0.3s ease;
            animation: pulse 2s infinite;
        `;
        
        emergencyBtn.onclick = () => this.handleEmergency();
        document.body.appendChild(emergencyBtn);
    }

    handleEmergency() {
        if (confirm('¿Estás en una situación de emergencia? Se notificará a los contactos de emergencia.')) {
            // En una implementación real, esto enviaría la ubicación a contactos de emergencia
            this.showToast('🚨 Alerta de emergencia enviada', false);
            
            // Vibrar el dispositivo si es compatible
            if (navigator.vibrate) {
                navigator.vibrate([500, 200, 500]);
            }
        }
    }

    showToast(message, success) {
        const toast = document.getElementById('toast') || this.createToast();
        toast.textContent = message;
        toast.style.background = success ? 
            "linear-gradient(135deg, #4CAF50, #45a049)" : 
            "linear-gradient(135deg, #ff4444, #cc0000)";
        toast.classList.add("show");
        
        setTimeout(() => toast.classList.remove("show"), 4000);
    }

    createToast() {
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
        return toast;
    }
}

// Inicializar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
});