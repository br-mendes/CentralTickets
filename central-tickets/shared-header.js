// shared-header.js - VERSÃO PADRONIZADA FINAL
// Funções: renderSharedHeader, initTheme, toggleTheme, startRefreshCountdown
(function () {
  const NAV_ITEMS = [
    { href: 'index.html', label: 'Dashboard', icon: '' },
    { href: 'tickets-ativos.html', label: 'Tickets Ativos', icon: '' },
    { href: 'tickets-em-espera.html', label: 'Em Espera', icon: '' },
    { href: 'aprovacao.html', label: 'Aprovação', icon: '' },
    { href: 'relatorios.html', label: 'Relatórios', icon: '' },
    { href: 'kanban.html', label: 'Kanban', icon: '' }
  ];

  function buildNavHTML(currentPage) {
    return NAV_ITEMS.map(item => {
      const isActive = item.href === currentPage;
      const activeClass = isActive ? ' active' : '';
      return `<a href="${item.href}" class="nav-link${activeClass}">${item.label}</a>`;
    }).join('');
  }

  function buildHeaderHTML() {
    const current = (location.pathname.split('/').pop()) || 'index.html';
    return `
      <div class="header-left">
        <h1>
          <span class="header-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </span>
          <span class="page-title">
            <span class="title-main">Central de Tickets</span>
            <span class="subtitle">GLPI Dashboard</span>
          </span>
        </h1>
      </div>
      <nav class="header-nav">
        ${buildNavHTML(current)}
      </nav>
      <div class="header-right">
        <!-- Busca Global -->
        <div class="header-search">
          <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input id="globalSearch" type="text" placeholder="Buscar ID ou título..." class="search-input">
        </div>

        <!-- Filtro por Período -->
        <select id="periodFilter" class="header-filter">
          <option value="all">Todos os períodos</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>

        <!-- Contador regressivo e tema (já existentes) -->
        <span class="refresh-countdown" id="refreshCountdown"></span>
        <button class="theme-toggle" onclick="toggleTheme()" title="Alternar tema">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        </button>
      </div>`;
  }

  function renderSharedHeader() {
    const header = document.querySelector('header.header');
    if (!header) return;
    header.innerHTML = `<div class="header-content">${buildHeaderHTML()}</div>`;
    initTheme();
  }

  function normalizeStatus(statusName) {
    if (!statusName) return 'new';
    if (statusName.includes('Em atendimento') || statusName.includes('processando')) return 'processing';
    if (statusName.includes('Pendente')) return 'pending';
    if (statusName.includes('Solucionado')) return 'solved';
    if (statusName.includes('Fechado')) return 'closed';
    if (statusName.includes('Aprovação') || statusName.includes('Aprovacao')) return 'pending';
    return 'new';
  }

  function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  }

  window.toggleTheme = toggleTheme;

  // Refresh countdown
  let refreshIntervalMs = 600000;
  let countdownTimer = null;
  let nextRefreshTime = null;

  window.startRefreshCountdown = function(intervalMs) {
    if (intervalMs) refreshIntervalMs = intervalMs;
    nextRefreshTime = Date.now() + refreshIntervalMs;
    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  };

  function updateCountdown() {
    if (!nextRefreshTime) return;
    const remaining = Math.max(0, nextRefreshTime - Date.now());
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    const el = document.getElementById('refreshCountdown');
    if (el) el.textContent = `Próximo refresh em ${min}:${sec.toString().padStart(2, '0')}`;
  }

  // Expose functions
  window.renderSharedHeader = renderSharedHeader;
  window.initTheme = initTheme;
  window.normalizeStatus = normalizeStatus;
  window.applyGlobalFilters = applyGlobalFilters;
  window.initGlobalFilters = initGlobalFilters;

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', renderSharedHeader);
})();

// Filtros globais
function applyGlobalFilters(tickets) {
    let filtered = tickets;

    // Busca global
    const searchInput = document.getElementById('globalSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (searchTerm) {
        filtered = filtered.filter(t => 
            String(t.id).includes(searchTerm) || 
            (t.title && t.title.toLowerCase().includes(searchTerm))
        );
    }

    // Filtro por período
    const periodSelect = document.getElementById('periodFilter');
    const days = periodSelect ? parseInt(periodSelect.value) : 0;
    if (days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        filtered = filtered.filter(t => new Date(t.dateCreated) >= cutoff);
    }

    // Filtro por técnico
    const techSelect = document.getElementById('technicianFilter');
    const tech = techSelect ? techSelect.value : '';
    if (tech) {
        filtered = filtered.filter(t => t.technician === tech);
    }

    return filtered;
}

function populateTechnicianFilter(tickets) {
    const select = document.getElementById('technicianFilter');
    if (!select) return;
    
    const technicians = [...new Set(tickets.map(t => t.technician).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todos os técnicos</option>' + 
        technicians.map(tech => `<option value="${tech}">${tech}</option>`).join('');
}

function initGlobalFilters(tickets) {
    if (!tickets || tickets.length === 0) return;
    
    populateTechnicianFilter(tickets);

    const searchInput = document.getElementById('globalSearch');
    const periodSelect = document.getElementById('periodFilter');
    const techSelect = document.getElementById('technicianFilter');

    const apply = () => {
        const filtered = applyGlobalFilters(tickets);
        window.dispatchEvent(new CustomEvent('tickets-filtered', { detail: filtered }));
    };

    if (searchInput) searchInput.addEventListener('input', apply);
    if (periodSelect) periodSelect.addEventListener('change', apply);
    if (techSelect) techSelect.addEventListener('change', apply);
}