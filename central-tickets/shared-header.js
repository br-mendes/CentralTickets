/*
Shared header injector with navigation
Replaces the page header with a common header across all pages.
Maintains theme and provides active state highlighting.
Injects standardized CSS for status badges, ticket meta, tables, etc.
*/
(function(){
  // Navigation items in desired order
  const NAV_ITEMS = [
    { href: 'index.html', label: 'Dashboard', icon: 'dashboard' },
    { href: 'tickets-ativos.html', label: 'Tickets Ativos', icon: 'active' },
    { href: 'tickets-em-espera.html', label: 'Em Espera', icon: 'clock' },
    { href: 'aprovacao.html', label: 'Aprovação', icon: 'check-circle' },
    { href: 'relatorios.html', label: 'Relatórios', icon: 'chart' },
    { href: 'kanban.html', label: 'Kanban', icon: 'layout' }
  ];

  // Standardized CSS to inject
  const STANDARDIZED_CSS = `
    /* === STATUS BADGES PADRONIZADOS === */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }

    .status-badge.new        { background: rgba(59, 130, 246, 0.15); color: #2563eb; }
    .status-badge.processing { background: rgba(34, 197, 94, 0.15); color: #16a34a; }
    .status-badge.pending    { background: rgba(249, 115, 22, 0.15); color: #ea580c; }
    .status-badge.solved     { background: rgba(107, 114, 128, 0.15); color: #52525b; }
    .status-badge.closed     { background: rgba(31, 41, 55, 0.25); color: #1f2937; }

    /* Dark Mode - cores mais visíveis e com bom contraste */
    [data-theme="dark"] .status-badge.new        { background: rgba(59, 130, 246, 0.30); color: #60a5fa; }
    [data-theme="dark"] .status-badge.processing { background: rgba(34, 197, 94, 0.30); color: #4ade80; }
    [data-theme="dark"] .status-badge.pending    { background: rgba(249, 115, 22, 0.30); color: #fb923c; }
    [data-theme="dark"] .status-badge.solved     { background: rgba(107, 114, 128, 0.30); color: #a1a1aa; }
    [data-theme="dark"] .status-badge.closed     { background: rgba(31, 41, 55, 0.45); color: #e2e8f0; }

    /* Para bordas nos cards (ticket-card) */
    .ticket-card.new        { border-left-color: #2563eb; }
    .ticket-card.processing { border-left-color: #16a34a; }
    .ticket-card.pending    { border-left-color: #ea580c; }
    .ticket-card.solved     { border-left-color: #52525b; }
    .ticket-card.closed     { border-left-color: #1f2937; }

    /* === TABELAS RESPONSIVAS COM ELLIPSIS === */
    .table-responsive {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }

    .table-responsive table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }

    .table-responsive th, .table-responsive td {
      padding: 12px 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: middle;
    }

    /* Larguras dinâmicas */
    .table-responsive .col-id          { width: 70px; }
    .table-responsive .col-title       { width: 38%; min-width: 260px; }
    .table-responsive .col-entity      { width: 18%; min-width: 160px; }
    .table-responsive .col-technician { width: 16%; min-width: 140px; }
    .table-responsive .col-group       { width: 16%; min-width: 140px; }
    .table-responsive .col-status      { width: 120px; }
    .table-responsive .col-date        { width: 110px; }
    .table-responsive .col-sla         { width: 100px; }

    /* Tooltip no hover para textos truncados */
    .table-responsive td[title] {
      cursor: help;
    }

    /* === ALERTAS PISCANDO PADRONIZADOS === */
    .sla-late, .alert-red {
      animation: flash-red 1200ms ease-in-out 4;
      border-color: #ef4444 !important;
    }

    .alert-yellow {
      animation: flash-yellow 1400ms ease-in-out 3;
      border-color: #f59e0b !important;
    }

    @keyframes flash-red {
      0%, 100% { background-color: rgba(239, 68, 68, 0.08); }
      50%      { background-color: rgba(239, 68, 68, 0.25); }
    }

    @keyframes flash-yellow {
      0%, 100% { background-color: rgba(245, 158, 11, 0.08); }
      50%      { background-color: rgba(245, 158, 11, 0.22); }
    }

    /* === OUTROS === */
    .ticket-meta {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ticket-entity, .ticket-technician, .ticket-group {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ticket-entity strong, .ticket-technician strong, .ticket-group strong {
      color: var(--text-primary);
      font-weight: 500;
    }
    .ticket-meta-label { color: var(--text-muted); font-size: 0.75rem; }

    .result-container {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-sm);
      margin-bottom: 24px;
    }
    .result-container h2 {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-primary);
    }

    .refresh-countdown {
      font-size: 0.75rem;
      color: var(--text-muted);
      padding: 4px 10px;
      background: var(--background);
      border-radius: var(--radius-sm);
    }

    .last-update {
      font-size: 0.75rem;
      color: var(--text-muted);
      padding: 4px 10px;
    }
  `;

  const ICONS = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>',
    active: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    chart: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    layout: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>'
  };

  function injectCSS() {
    if (document.getElementById('standardized-css')) return;
    const style = document.createElement('style');
    style.id = 'standardized-css';
    style.textContent = STANDARDIZED_CSS;
    document.head.appendChild(style);
  }

  function buildNavHTML(currentPage) {
    return NAV_ITEMS.map(item => {
      const isActive = item.href === currentPage;
      const activeClass = isActive ? ' active' : '';
      return `<a href="${item.href}" class="nav-link${activeClass}" id="nav-${item.icon}">
        <span class="nav-icon">${ICONS[item.icon]}</span>
        <span class="nav-label">${item.label}</span>
      </a>`;
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
      </nav>`;
  }

  function renderSharedHeader() {
    // Inject standardized CSS
    injectCSS();
    
    const header = document.querySelector('header.header');
    if (!header) return;
    header.innerHTML = `<div class="header-content">${buildHeaderHTML()}</div>`;
    
    // Theme initialization
    initTheme();
  }

  function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
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

  // Expose toggle for external use
  window.toggleTheme = toggleTheme;

  // Refresh countdown - configure per page in the page itself
  let refreshIntervalMs = 600000; // 10 minutes default
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
    if (el) el.textContent = `Refresh em ${min}:${sec.toString().padStart(2, '0')}`;
  }

  // Initialize on load
  window.renderSharedHeader = renderSharedHeader;
  document.addEventListener('DOMContentLoaded', renderSharedHeader);
})();