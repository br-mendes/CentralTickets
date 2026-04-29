const DEFAULT_PAGE_SIZE = 100
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

  // Cap page size to 100 max
  const safeStart = Math.max(0, start)
  const safeEnd = Math.min(safeStart + 99, end)

  const query = new URLSearchParams({
    start: String(safeStart),
    end: String(safeEnd),
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

export async function fetchAllTickets(params = {}, pageSize = 100) {
  let start = 0
  let hasMore = true
  const all = []
  const maxPages = 10 // Safety limit
  let pageCount = 0

  while (hasMore && pageCount < maxPages) {
    const result = await fetchTicketsPage({
      ...params,
      start,
      end: start + pageSize - 1,
    })

    const pageData = result?.data || []
    const pagination = result?.pagination || {}

    all.push(...pageData)

    hasMore = Boolean(pagination.hasMore)
    start = pagination.nextStart || start + pageSize
    pageCount++

    if (!hasMore || pageData.length === 0) break
  }

  return { data: all, total: all.length }
}