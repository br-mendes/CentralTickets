(function(){
  const TTL_MS = 15 * 60 * 1000; // 15 minutes for per-instance tickets cache
  const USERNAME_TTL_MS = 30 * 60 * 1000; // 30 minutes for username cache
  const CACHE_KEY = 'central_tickets_cache_v1';
  function loadCache(){
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  function saveCache(cache){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {} }
  function loadOldestForInstance(instanceName){ const cache = loadCache(); const entry = cache[instanceName]; if (!entry || typeof entry !== 'object') return []; if (Date.now() - (entry.timestamp || 0) > TTL_MS) { delete cache[instanceName]; saveCache(cache); return []; } return entry.tickets || []; }
  function cacheOldestForInstance(instanceName, tickets){ const cache = loadCache(); cache[instanceName] = { tickets: Array.isArray(tickets) ? tickets : [], timestamp: Date.now() }; saveCache(cache); }
  function loadUserNameFromCache(instanceName, userId){ const key = `ucache_${instanceName}_${userId}`; try { const raw = localStorage.getItem(key); if (!raw) return null; const data = JSON.parse(raw); if (!data || typeof data.ts !== 'number' || !data.name) return null; if (Date.now() - data.ts > USERNAME_TTL_MS) { localStorage.removeItem(key); return null; } return data.name; } catch { return null; } }
  function cacheUserNameForInstance(instanceName, userId, name){ const key = `ucache_${instanceName}_${userId}`; localStorage.setItem(key, JSON.stringify({ name, ts: Date.now() })); }
  window.loadOldTicketsForInstance = loadOldestForInstance;
  window.cacheOldTicketsForInstance = cacheOldestForInstance;
  window.loadUserNameFromCache = loadUserNameFromCache;
  window.cacheUserNameForInstance = cacheUserNameForInstance;
})();
