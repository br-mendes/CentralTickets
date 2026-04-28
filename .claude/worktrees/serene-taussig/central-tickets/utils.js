/* =====================================================
   CentralTickets - Utility Functions
   Shared across all pages
   ===================================================== */

// ==================== THEME MANAGEMENT ====================
const ThemeManager = {
    KEY: 'centraltickets-theme',
    
    init() {
        const saved = localStorage.getItem(this.KEY);
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
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
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(this.KEY, 'light');
        this.updateToggleIcon();
    },
    
    updateToggleIcon() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            toggle.innerHTML = isDark 
                ? this.getSunIcon() 
                : this.getMoonIcon();
        }
    },
    
    getSunIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    },
    
    getMoonIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
};

// ==================== REFRESH MANAGER ====================
const RefreshManager = {
    interval: null,
    countdownInterval: null,
    remainingSeconds: 0,
    refreshCallback: null,
    REFRESH_INTERVAL: 180000, // Default 3 minutes
    
    start(seconds, callback) {
        this.stop();
        this.remainingSeconds = seconds || this.REFRESH_INTERVAL;
        this.refreshCallback = callback;
        
        this.updateCountdown();
        
        this.interval = setInterval(() => {
            this.remainingSeconds--;
            
            if (this.remainingSeconds <= 0) {
                this.refreshCallback?.();
                this.remainingSeconds = seconds || this.REFRESH_INTERVAL;
            }
            
            this.updateCountdown();
        }, 1000);
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
        this.remainingSeconds = this.REFRESH_INTERVAL;
    }
};

// ==================== DATE FORMATTING ====================
const DateUtils = {
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatDateTime(dateStr) {
        return this.formatDate(dateStr);
    },
    
    formatDateOnly(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
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

// ==================== STATUS HELPERS ====================
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

// ==================== INSTANCE HELPERS ====================
const InstanceHelper = {
    render(instanceName) {
        if (!instanceName) return '';
        const cls = instanceName.toUpperCase() === 'PETA' ? 'peta' : 'gmx';
        const label = instanceName.toUpperCase() === 'PETA' ? 'PETA' : 'GMX';
        return `<span class="instance-badge ${cls}">${label}</span>`;
    }
};

// ==================== NAVIGATION ====================
function setActiveNav() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.nav-link');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const pageName = href.replace('.html', '');
            if (path.includes(pageName) || (path === '/' && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        }
    });
}

// ==================== LOADING STATE ====================
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

// ==================== UTILITY FUNCTIONS ====================
function padNumber(num) {
    return num.toString().padStart(2, '0');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function getCurrentTimeFormatted() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ==================== SVG ICONS ====================
const Icons = {
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
    
    active: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    
    wait: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    
    approval: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>`,
    
    reports: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    
    kanban: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
    
    refresh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    
    search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    
    export: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    
    filter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    
    ticket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    
    clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    
    check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    
    alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    
    user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    
    group: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    
    category: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    
    entity: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
};

// ==================== INITIALIZE ON DOM READY ====================
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    setActiveNav();
});

// ==================== EXPORT FOR GLOBAL USE ====================
window.ThemeManager = ThemeManager;
window.RefreshManager = RefreshManager;
window.DateUtils = DateUtils;
window.StatusHelpers = StatusHelpers;
window.InstanceHelper = InstanceHelper;
window.Icons = Icons;
window.showLoading = showLoading;
window.padNumber = padNumber;
window.escapeHtml = escapeHtml;
window.truncate = truncate;
window.getCurrentTimeFormatted = getCurrentTimeFormatted;