const DEFAULT_LIMIT = 20
const DEFAULT_INSTANCE = 'PETA,GMX'

export async function fetchTicketsPage(params = {}) {
  const {
    instance = DEFAULT_INSTANCE,
    statuses = '',
    typeId = null,
    includeDeleted = false,
    cursor = null,
    limit = DEFAULT_LIMIT,
  } = params

  const query = new URLSearchParams({
    instance,
    limit: String(Math.min(100, Math.max(1, limit))),
  })

  if (statuses) query.set('statuses', statuses)
  if (typeId !== null && typeId !== undefined) query.set('typeId', String(typeId))
  if (includeDeleted) query.set('includeDeleted', 'true')
  if (cursor?.date_mod) query.set('cursorDate', cursor.date_mod)
  if (cursor?.ticket_id) query.set('cursorId', String(cursor.ticket_id))

  const response = await fetch(`/api/tickets?${query.toString()}`)
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.error || 'Falha ao buscar tickets')
  }

  return {
    tickets: payload.tickets || [],
    nextCursor: payload.nextCursor,
    hasMore: payload.hasMore,
  }
}

export async function fetchAllTickets(params = {}, maxPages = 10) {
  let hasMore = true
  const all = []
  let pageCount = 0
  let nextCursor = null

  while (hasMore && pageCount < maxPages) {
    const result = await fetchTicketsPage({
      ...params,
      cursor: nextCursor,
    })

    const pageData = result.tickets || []
    all.push(...pageData)
    hasMore = result.hasMore && pageData.length > 0
    nextCursor = result.nextCursor
    pageCount++

    if (!hasMore || pageData.length === 0) break
  }

  return { data: all, total: all.length }
}