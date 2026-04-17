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

/** Return only the last segment of a group path ("A > B > C" → "C") */
export function lastGroupLabel(name) {
  if (!name) return '—'
  const parts = String(name).split('>')
  return parts[parts.length - 1].trim() || String(name)
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

/** Filter tickets by period (days since date_created) */
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

/** Map status_id/status_key to a display config */
const STATUS_MAP = {
  1: { label: 'Novo', key: 'new', color: '#2563eb' },
  2: { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  3: { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  4: { label: 'Pendente', key: 'pending', color: '#ea580c' },
  5: { label: 'Solucionado', key: 'solved', color: '#52525b' },
  6: { label: 'Fechado', key: 'closed', color: '#1f2937' },
  7: { label: 'Aprovação', key: 'approval', color: '#ea580c' },
  new: { label: 'Novo', key: 'new', color: '#2563eb' },
  processing: { label: 'Em atendimento', key: 'processing', color: '#16a34a' },
  pending: { label: 'Pendente', key: 'pending', color: '#ea580c' },
  solved: { label: 'Solucionado', key: 'solved', color: '#52525b' },
  closed: { label: 'Fechado', key: 'closed', color: '#1f2937' },
  'pending-approval': { label: 'Aprovação', key: 'approval', color: '#ea580c' },
}

export function getStatusConfig(statusId, statusKey) {
  return STATUS_MAP[statusId] || STATUS_MAP[statusKey] || { label: String(statusId || statusKey || '—'), key: 'unknown', color: '#94a3b8' }
}

/** Calculate days overdue from due_date */
export function calcDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0
  const diff = Date.now() - new Date(dueDateStr).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

/** Compute pending/waiting time for a ticket (date_mod basis) */
export function calcPendingTime(dateModStr) {
  const hours = calcHoursAgo(dateModStr)
  return formatWaitTime(hours)
}

/** Build 30-day trend data: {labels, opened, closed} */
export function build30DayTrend(tickets) {
  const now = new Date()
  const days = 30
  const labels = []
  const opened = []
  const closed = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    labels.push(key)

    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)

    opened.push(tickets.filter(t => {
      const dt = t.date_created ? new Date(t.date_created) : null
      return dt && dt >= start && dt <= end
    }).length)

    closed.push(tickets.filter(t => {
      const sk = t.status_key
      const sid = Number(t.status_id)
      const isClosed = sk === 'closed' || sk === 'solved' || sid === 5 || sid === 6
      const dt = t.date_mod ? new Date(t.date_mod) : null
      return isClosed && dt && dt >= start && dt <= end
    }).length)
  }

  return { labels, opened, closed }
}
