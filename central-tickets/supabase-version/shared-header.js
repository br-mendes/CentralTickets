/*
Shared header injector with navigation
Replaces the page header with a common header across all pages.
Maintains theme and provides active state highlighting.
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

  const ICONS = {
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>',
    active: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    chart: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    layout: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>'
  };

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

  // Initialize on load
  window.renderSharedHeader = renderSharedHeader;
  document.addEventListener('DOMContentLoaded', renderSharedHeader);
})();