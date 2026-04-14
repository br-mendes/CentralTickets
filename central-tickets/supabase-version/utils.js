/* =====================================================
   CentralTickets - Utility Functions
   ===================================================== */

// Theme Management
const ThemeManager = {
    KEY: 'centraltickets-theme',
    
    init() {
        const saved = localStorage.getItem(this.KEY);
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            // Default to dark theme
            this.setDark();
        }
        this.updateToggleIcon();
    },
    
    toggle() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            this.setLight();
        } else {
            this.setDark();
        }
    },
    
    setDark() {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(this.KEY, 'dark');
        this.updateToggleIcon();
    },
    
    setLight() {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem(this.KEY, 'light');
        this.updateToggleIcon();
    },
    
    updateToggleIcon() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            toggle.innerHTML = isDark 
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        }
    }
};

// Refresh Manager with Countdown
const RefreshManager = {
    interval: null,
    countdownInterval: null,
    remainingSeconds: 0,
    refreshCallback: null,
    countdownElement: null,
    
    start(seconds, callback) {
        this.stop();
        this.remainingSeconds = seconds;
        this.refreshCallback = callback;
        
        // Update countdown display immediately
        this.updateCountdown();
        
        // Main refresh interval
        this.interval = setInterval(() => {
            this.remainingSeconds--;
            
            if (this.remainingSeconds <= 0) {
                this.refreshCallback?.();
                this.remainingSeconds = seconds;
            }
            
            this.updateCountdown();
        }, 1000);
        
        // Countdown display update
        this.countdownInterval = setInterval(() => this.updateCountdown(), 1000);
    },
    
    stop() {
        if (this.interval) clearInterval(this.interval);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.interval = null;
        this.countdownInterval = null;
    },
    
    updateCountdown() {
        const el = document.getElementById('countdown');
        if (el) {
            const mins = Math.floor(this.remainingSeconds / 60);
            const secs = this.remainingSeconds % 60;
            el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    },
    
    reset() {
        const seconds = this.refreshCallback ? 180 : 300; // Default
        this.remainingSeconds = seconds;
    }
};

// Date/Time Formatters
const DateUtils = {
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },
    
    formatTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatShortDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit'
        });
    },
    
    timeAgo(dateStr) {
        if (!dateStr) return '';
        
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) return `${minutes}min`;
        if (hours < 24) return `${hours}h`;
        return `${days}d`;
    }
};

// Status Helpers
const StatusHelpers = {
    getClass(statusKey) {
        const map = {
            'new': 'new',
            'processing': 'processing',
            'pending': 'pending',
            'pending-approval': 'pending-approval',
            'approval': 'pending-approval',
            'solved': 'solved',
            'closed': 'closed'
        };
        return map[statusKey] || 'new';
    },
    
    getLabel(statusKey) {
        const map = {
            'new': 'Novo',
            'processing': 'Em Andamento',
            'pending': 'Pendente',
            'pending-approval': 'Aprovação',
            'approval': 'Aprovação',
            'solved': 'Solucionado',
            'closed': 'Fechado'
        };
        return map[statusKey] || 'Desconhecido';
    },
    
    render(statusKey) {
        const cls = this.getClass(statusKey);
        const label = this.getLabel(statusKey);
        return `<span class="status-badge ${cls}">${label}</span>`;
    }
};

// Instance Badge Helper
const InstanceHelper = {
    render(instanceName) {
        if (!instanceName) return '';
        const cls = instanceName.toUpperCase() === 'PETA' ? 'peta' : 'gmx';
        const label = instanceName.toUpperCase() === 'PETA' ? 'PETA' : 'GMX';
        return `<span class="instance-badge ${cls}">${label}</span>`;
    }
};

// Navigation - Set active link
function setActiveNav() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.nav-link');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (path.includes(href.replace('.html', '')) || (path === '/' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Loading State
function showLoading(containerId, message = 'Carregando...') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">${message}</p>
            </div>
        `;
    }
}

// Format number with leading zeros
function padNumber(num) {
    return num.toString().padStart(2, '0');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Truncate text with ellipsis
function truncate(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    setActiveNav();
});

// Export for global use
window.ThemeManager = ThemeManager;
window.RefreshManager = RefreshManager;
window.DateUtils = DateUtils;
window.StatusHelpers = StatusHelpers;
window.InstanceHelper = InstanceHelper;
window.showLoading = showLoading;
window.padNumber = padNumber;
window.escapeHtml = escapeHtml;
window.truncate = truncate;