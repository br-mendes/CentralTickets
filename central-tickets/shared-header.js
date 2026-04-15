// shared-header.js - VERSÃO DEFINITIVA v3
// Resolve: race conditions, dupla inicialização, referências circulares
(function () {
  'use strict';

  // ── Estado interno (flags idempotência) ──────────────────────────────────
  let _rendered      = false;
  let _themeReady    = false;
  let _cdTimer       = null;
  let _nextRefresh   = null;
  let _cdIntervalMs  = 600000;

  // ── Navegação ────────────────────────────────────────────────────────────
  const NAV_ITEMS = [
    { href: 'index.html',           label: 'Dashboard'       },
    { href: 'tickets-ativos.html',  label: 'Tickets Ativos'  },
    { href: 'tickets-em-espera.html', label: 'Em Espera'     },
    { href: 'aprovacao.html',       label: 'Aprovação'       },
    { href: 'relatorios.html',      label: 'Relatórios'      },
    { href: 'kanban.html',          label: 'Kanban'          }
  ];

  function currentPage() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function buildNav() {
    const cur = currentPage();
    return NAV_ITEMS.map(it =>
      `<a href="${it.href}" class="nav-link${it.href === cur ? ' active' : ''}">${it.label}</a>`
    ).join('');
  }

  function buildHeader() {
    return `
      <div class="header-content">
        <div class="header-left">
          <h1>
            <span class="header-logo">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </span>
            <span class="page-title">
              <span class="title-main">Central de Tickets</span>
              <span class="subtitle">GLPI Dashboard</span>
            </span>
          </h1>
        </div>
        <nav class="header-nav">${buildNav()}</nav>
        <div class="header-right">
          <div class="header-search">
            <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" fill="none"
                 stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input id="globalSearch" type="text"
                   placeholder="Buscar ID ou título..." class="search-input">
          </div>
          <select id="periodFilter" class="header-filter">
            <option value="all">Todos os períodos</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <span class="refresh-countdown" id="refreshCountdown"></span>
          <button class="theme-toggle" onclick="window.toggleTheme()" title="Alternar tema">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1"  x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22"  x2="5.64"  y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1"  y1="12" x2="3"  y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
              <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  // ── Renderização do header ───────────────────────────────────────────────
  function renderSharedHeader() {
    if (_rendered) return true;                          // idempotente
    const h = document.querySelector('header.header');
    if (!h) {
      console.warn('[Header] <header class="header"> não encontrado');
      return false;
    }
    h.innerHTML = buildHeader();
    _rendered = true;
    return true;
  }

  // ── Tema ─────────────────────────────────────────────────────────────────
  function initTheme() {
    if (_themeReady) return;
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    _themeReady = true;
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  // ── Countdown ────────────────────────────────────────────────────────────
  function _tickCountdown() {
    if (!_nextRefresh) return;
    const rem  = Math.max(0, _nextRefresh - Date.now());
    const m    = Math.floor(rem / 60000);
    const s    = Math.floor((rem % 60000) / 1000);
    const el   = document.getElementById('refreshCountdown');
    if (el) {
      el.innerHTML =
        `Próximo refresh: <span class="countdown-value">${m}:${String(s).padStart(2,'0')}</span>`;
    }
  }

  function startRefreshCountdown(intervalMs) {
    if (intervalMs) _cdIntervalMs = intervalMs;
    _nextRefresh = Date.now() + _cdIntervalMs;
    if (_cdTimer) clearInterval(_cdTimer);
    _cdTimer = setInterval(_tickCountdown, 1000);
    _tickCountdown();   // primeira atualização imediata (countdown já visível)
  }

  // ── Normalização de status ────────────────────────────────────────────────
  function normalizeStatus(raw) {
    if (!raw) return 'new';
    const s = String(raw).toLowerCase();
    if (s.includes('atendimento') || s.includes('processing')) return 'processing';
    if (s.includes('pendente')    || s.includes('pending'))    return 'pending';
    if (s.includes('solucionado') || s.includes('solved'))     return 'solved';
    if (s.includes('fechado')     || s.includes('closed'))     return 'closed';
    if (s.includes('aprovação')   || s.includes('aprovacao'))  return 'pending';
    return 'new';
  }

  function getStatusDisplayName(raw) {
    const map = {
      processing: 'Em atendimento',
      pending:    'Pendente',
      solved:     'Solucionado',
      closed:     'Fechado',
      new:        'Novo'
    };
    return map[normalizeStatus(raw)] || 'Novo';
  }

  // ── Filtros globais ───────────────────────────────────────────────────────
  function populateTechnicianFilter(tickets) {
    const sel = document.getElementById('technicianFilter');
    if (!sel) return;
    const techs = [...new Set(tickets.map(t => t.technician).filter(Boolean))].sort();
    sel.innerHTML =
      '<option value="">Todos os técnicos</option>' +
      techs.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function applyGlobalFilters(tickets) {
    let out = tickets;

    const q = (document.getElementById('globalSearch')?.value || '').toLowerCase().trim();
    if (q) out = out.filter(t =>
      String(t.id).includes(q) || (t.title || '').toLowerCase().includes(q)
    );

    const days = parseInt(document.getElementById('periodFilter')?.value) || 0;
    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      out = out.filter(t => new Date(t.date_created || t.dateCreated) >= cutoff);
    }

    const tech = document.getElementById('technicianFilter')?.value || '';
    if (tech) out = out.filter(t => t.technician === tech);

    return out;
  }

  function initGlobalFilters(tickets) {
    if (!tickets?.length) return;
    populateTechnicianFilter(tickets);
    const dispatch = () => window.dispatchEvent(
      new CustomEvent('tickets-filtered', { detail: applyGlobalFilters(tickets) })
    );
    document.getElementById('globalSearch')?.addEventListener('input', dispatch);
    document.getElementById('periodFilter')?.addEventListener('change', dispatch);
    document.getElementById('technicianFilter')?.addEventListener('change', dispatch);
  }

  // ── Ponto de entrada unificado ────────────────────────────────────────────
  // Chamado pela página com initSharedHeader({ refreshInterval: N })
  // Pode ser chamado múltiplas vezes com segurança (flags idempotentes)
  function initSharedHeader(opts = {}) {
    renderSharedHeader();                     // idempotente
    initTheme();                              // idempotente
    if (opts.refreshInterval !== undefined) { // countdown só inicia se intervalo fornecido
      startRefreshCountdown(opts.refreshInterval);
    }
    if (window.tickets?.length) {
      initGlobalFilters(window.tickets);
    }
    console.log('[SharedHeader] OK –', currentPage());
  }

  // ── Auto-init do header (renderizar + tema sem countdown) ─────────────────
  function _autoInit() {
    renderSharedHeader();
    initTheme();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoInit, { once: true });
  } else {
    _autoInit();   // DOM já disponível (script no body ou defer tardio)
  }

  // ── API pública ───────────────────────────────────────────────────────────
  window.initSharedHeader       = initSharedHeader;
  window.renderSharedHeader     = renderSharedHeader;
  window.initTheme              = initTheme;
  window.toggleTheme            = toggleTheme;
  window.startRefreshCountdown  = startRefreshCountdown;
  window.normalizeStatus        = normalizeStatus;
  window.getUnifiedStatus       = normalizeStatus;   // alias retrocompat
  window.getStatusDisplayName   = getStatusDisplayName;
  window.applyGlobalFilters     = applyGlobalFilters;
  window.initGlobalFilters      = initGlobalFilters;

})();
