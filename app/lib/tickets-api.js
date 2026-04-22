const DEFAULT_PAGE_SIZE = 200

export async function fetchTicketsPage(params = {}) {
  const {
    instance = '',
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
  let start = 0
  let hasMore = true
  const all = []
  let total = 0

  while (hasMore) {
    const result = await fetchTicketsPage({
      ...params,
      start,
      end: start + pageSize - 1,
    })

    const pageData = result?.data || []
    const pagination = result?.pagination || {}
    total = pagination.total || total

    all.push(...pageData)

    hasMore = Boolean(pagination.hasMore)
    start = pagination.nextStart || all.length
  }

  return { data: all, total: total || all.length }
}
