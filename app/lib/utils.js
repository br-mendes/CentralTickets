/** Remove the instance prefix from entity names (e.g. "PETA GRUPO > X > Y" → "X > Y") */
export function processEntity(entity) {
  if (!entity) return '—'
  const cleaned = entity
    .replace(/^PETA\s+GRUPO\s*>\s*/i, '')
    .replace(/^GMX\s+TECNOLOGIA\s*>\s*/i, '')
    .replace(/^PETA\s*>\s*/i, '')
    .replace(/^GMX\s*>\s*/i, '')
    .trim()
  return cleaned || entity
}

/** Return only the last segment of a group path.
 *  Handles JSON array format: ["GMX – Segurança","GMX"] → "GMX – Segurança"
 */
export function lastGroupLabel(name) {
  if (!name) return '—'
  let str = String(name).trim()

  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str)
      if (Array.isArray(arr)) {
        const filtered = arr
          .filter(v => v && String(v).trim() && !/^(GMX|PETA)$/i.test(String(v).trim()))
        str = String(filtered[filtered.length - 1] || arr[arr.length - 1] || '').trim()
      }
    } catch { /* not JSON */ }
  }

  if (!str || str === 'Não atribuído') return '—'
  const parts = str.split('>')
  return parts[parts.length - 1].trim() || str
}

/** Format a datetime string as pt-BR short date+time */
export function fmt(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Format as short date only */
export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Hours elapsed since a given date string */
export function calcHoursAgo(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000))
}

/** Format hours into a human-readable string ("5d 2h" or "3h") */
export function formatWaitTime(hours) {
  if (hours < 1) return '< 1h'
  const days = Math.floor(hours / 24)
  const h = hours % 24
  if (days > 0) return h > 0 ? `${days}d ${h}h` : `${days}d`
  return `${hours}h`
}

/** Elapsed time since dateStr as human-readable string */
export function formatTimeSince(dateStr) {
  return formatWaitTime(calcHoursAgo(dateStr))
}

/** Filter tickets by period (days since field) */
export function applyPeriodFilter(tickets, period, field = 'date_created') {
  if (!period || period === 'all') return tickets
  const days = parseInt(period)
  const cutoff = new Date(Date.now() - days * 86400000)
  return tickets.filter(t => t[field] && new Date(t[field]) >= cutoff)
}

/** Apply all global header filters (search, period, technician) */
export function applyGlobalFilters(tickets, { globalSearch, period, globalTechnician }) {
  let result = tickets

  if (globalSearch && globalSearch.trim()) {
    const s = globalSearch.toLowerCase().trim()
    result = result.filter(t =>
      String(t.ticket_id).includes(s) ||
      (t.title || '').toLowerCase().includes(s)
    )
  }

  if (period && period !== 'all') {
    result = applyPeriodFilter(result, period)
  }

  if (globalTechnician) {
    result = result.filter(t => t.technician === globalTechnician)
  }

  return result
}

export const URGENCY_MAP = {
  1: { label: 'Muito Baixa', color: '#64748b' },
  2: { label: 'Baixa',       color: '#3b82f6' },
  3: { label: 'Média',       color: '#d97706' },
  4: { label: 'Alta',        color: '#ea580c' },
  5: { label: 'Muito Alta',  color: '#dc2626' },
  6: { label: 'Crítica',     color: '#7f1d1d' },
}

export const PRIORITY_MAP = URGENCY_MAP

export function formatSeconds(seconds) {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const d = Math.floor(h / 24)
  const rh = h % 24
  if (d > 0) return rh > 0 ? `${d}d ${rh}h` : `${d}d`
  return `${h}h`
}

const STATUS_MAP = {
  1: { label: 'Novo',           key: 'new',        color: '#2563eb' },
  2: { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  3: { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  4: { label: 'Pendente',       key: 'pending',    color: '#ea580c' },
  5: { label: 'Solucionado',    key: 'solved',     color: '#52525b' },
  6: { label: 'Fechado',        key: 'closed',     color: '#1f2937' },
  7: { label: 'Aprovação',      key: 'approval',   color: '#7c3aed' },
  new:                { label: 'Novo',           key: 'new',        color: '#2563eb' },
  processing:         { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  pending:            { label: 'Pendente',       key: 'pending',    color: '#ea580c' },
  solved:             { label: 'Solucionado',    key: 'solved',     color: '#52525b' },
  closed:             { label: 'Fechado',        key: 'closed',     color: '#1f2937' },
  'pending-approval': { label: 'Aprovação',      key: 'approval',   color: '#7c3aed' },
  approval:           { label: 'Aprovação',      key: 'approval',   color: '#7c3aed' },
}

export function getStatusConfig(statusId, statusKey) {
  if (statusKey === 'pending-approval' || statusKey === 'approval') {
    return { label: 'Aprovação', key: 'approval', color: '#7c3aed' }
  }
  return STATUS_MAP[statusId] || STATUS_MAP[statusKey] || {
    label: String(statusId || statusKey || '—'), key: 'unknown', color: '#94a3b8',
  }
}

/** Calculate days overdue from due_date */
export function calcDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0
  const diff = Date.now() - new Date(dueDateStr).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

/** Compute pending/waiting time for a ticket (date_mod basis) */
export function calcPendingTime(dateModStr) {
  return formatWaitTime(calcHoursAgo(dateModStr))
}

/** Build 30-day trend data: {labels, opened, closed} — O(n+30) via day-keyed maps */
export function build30DayTrend(tickets) {
  const openedByDay = {}
  const closedByDay = {}

  for (const t of tickets) {
    if (t.date_created) {
      const d = new Date(t.date_created)
      d.setHours(0, 0, 0, 0)
      openedByDay[d.getTime()] = (openedByDay[d.getTime()] || 0) + 1
    }
    const sk = t.status_key; const sid = Number(t.status_id)
    if ((sk === 'closed' || sk === 'solved' || sid === 5 || sid === 6) && t.date_mod) {
      const d = new Date(t.date_mod)
      d.setHours(0, 0, 0, 0)
      closedByDay[d.getTime()] = (closedByDay[d.getTime()] || 0) + 1
    }
  }

  const now = new Date()
  const labels = [], opened = [], closed = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
    opened.push(openedByDay[d.getTime()] || 0)
    closed.push(closedByDay[d.getTime()] || 0)
  }

  return { labels, opened, closed }
}
