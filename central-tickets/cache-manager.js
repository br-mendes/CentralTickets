(function(){
  const CACHE_KEY = 'central_tickets_cache_v1';
  function loadCache(){
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  function saveCache(cache){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {} }
  function loadOldestForInstance(instanceName){ const cache = loadCache(); return Array.isArray(cache[instanceName]) ? cache[instanceName] : []; }
  function cacheOldestForInstance(instanceName, tickets){ const cache = loadCache(); cache[instanceName] = Array.isArray(tickets) ? tickets.slice(0, 1000) : []; saveCache(cache); }
  window.loadOldTicketsForInstance = loadOldestForInstance;
  window.cacheOldTicketsForInstance = cacheOldestForInstance;
})();
