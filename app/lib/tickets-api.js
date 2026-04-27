const DEFAULT_PAGE_SIZE = 200
const DEFAULT_INSTANCE = 'PETA,GMX'

export async function fetchTicketsPage(params = {}) {
  const {
    instance = DEFAULT_INSTANCE,
    statuses = '',
    typeId = null,
    dateField = '',
    fromDate = '',
    toDate = '',
    includeDeleted = false,
    start = 0,
    end = start + DEFAULT_PAGE_SIZE - 1,
  } = params

  const query = new URLSearchParams({
    start: String(start),
    end: String(end),
  })

  if (instance) query.set('instance', instance)
  if (statuses) query.set('statuses', statuses)
  if (typeId !== null && typeId !== undefined) query.set('typeId', String(typeId))
  if (dateField) query.set('dateField', dateField)
  if (fromDate) query.set('fromDate', fromDate)
  if (toDate) query.set('toDate', toDate)
  if (includeDeleted) query.set('includeDeleted', 'true')

  const response = await fetch(`/api/tickets?${query.toString()}`)
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.error || 'Falha ao buscar tickets')
  }

  return payload
}

export async function fetchAllTickets(params = {}, pageSize = 500) {
  const first = await fetchTicketsPage({ ...params, start: 0, end: pageSize - 1 })
  const firstData = first?.data || []
  const total = first?.pagination?.total || firstData.length

  if (!first?.pagination?.hasMore) {
    return { data: firstData, total }
  }

  const pageStarts = []
  for (let s = pageSize; s < total; s += pageSize) pageStarts.push(s)

  // Fetch remaining pages in bounded batches (6 concurrent) to avoid
  // overwhelming the API route's connection pool on large datasets.
  const BATCH = 6
  const pages = []
  for (let i = 0; i < pageStarts.length; i += BATCH) {
    const chunk = pageStarts.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map(s => fetchTicketsPage({ ...params, start: s, end: s + pageSize - 1 }))
    )
    pages.push(...results)
  }

  return {
    data: [firstData, ...pages.map(p => p?.data || [])].flat(),
    total,
  }
}
