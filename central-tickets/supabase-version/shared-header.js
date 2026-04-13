/*
Shared header injector
Replaces the page header with a common header across all pages.
*/
(function(){
  function buildHeaderHTML() {
    return `
      <div class="header-left">
        <h1>Central de Tickets</h1>
      </div>
      <nav class="header-nav">
        <a href="index.html" class="nav-link">Dashboard</a>
        <a href="kanban.html" class="nav-link">Kanban</a>
        <a href="tickets-ativos.html" class="nav-link">Tickets Ativos</a>
        <a href="tickets-em-espera.html" class="nav-link">Em Espera</a>
        <a href="relatorios.html" class="nav-link">Relatórios</a>
        <a href="aprovacao.html" class="nav-link" id="nav-link-aprovacao">Aprovação</a>
      </nav>`;
  }

  function renderSharedHeader() {
    const header = document.querySelector('header.header');
    if (!header) return;
    header.innerHTML = `<div class="header-content">${buildHeaderHTML()}</div>`;
    const current = (location.pathname.split('/').pop()) || 'index.html';
    header.querySelectorAll('.nav-link').forEach(a => {
      if (a.getAttribute('href') === current) a.classList.add('active');
      else a.classList.remove('active');
    });
  }

  window.renderSharedHeader = renderSharedHeader;
  document.addEventListener('DOMContentLoaded', renderSharedHeader);
})();
