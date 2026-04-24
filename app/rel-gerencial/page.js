'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let supabaseInstance = null
function getSupabase() {
  if (supabaseInstance) return supabaseInstance
  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return supabaseInstance
}

export default function RelGerencialPage() {
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [availableMonths, setAvailableMonths] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [displayedTickets, setDisplayedTickets] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isAllSelected, setIsAllSelected] = useState(false)
  
  const [kpi, setKpi] = useState({
    total: 0, dailyAvg: 0, weeklyAvg: 0, monthlyAvg: 0, annualTotal: 0, slaCompliance: 0
  })
  
  const tableBodyRef = useRef(null)
  const selectRef = useRef(null)

  function addLog(msg) {
    console.log(`[RelGerencial] ${msg}`)
  }

  function isAutoTicket(ticket) {
    const req = (ticket.requester || '').toLowerCase()
    // Check requestor first (primary)
    if (req.includes('user_sophos') || req.includes('api-zabbix')) return true
    // fallback checks
    const tech = (ticket.technician || '').toLowerCase()
    const sol = (ticket.solution || ticket.solution_content || '').toLowerCase()
    const title = (ticket.title || '').toLowerCase()
    return (tech.includes('zabbix') || tech.includes('sophos') || 
            sol.includes('zabbix') || sol.includes('sophos') ||
            title.includes('zabbix') || title.includes('sophos'))
  }

  function formatPriority(priorityName, priorityId) {
    if (priorityName) return priorityName
    if (priorityId) {
      const map = { 1:'Muito baixa', 2:'Baixa', 3:'Média', 4:'Alta', 5:'Muito alta', 6:'Crítica' }
      return map[priorityId] || 'Default'
    }
    return 'Default'
  }

  const loadAllTickets = useCallback(async () => {
    if (allTickets.length > 0) return allTickets
    addLog('Carregando tickets COFEN...')
    try {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('tickets_cache')
        .select('*')
        .eq('instance', 'GMX')
        .ilike('entity_full', '%COFEN%')
      
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) {
        addLog('Nenhum ticket COFEN encontrado', 'error')
        setLoading(false)
        return []
      }
      
      const months = new Set()
      data.forEach(t => {
        if (t.date_created) {
          const d = new Date(t.date_created)
          if (!isNaN(d.getTime())) {
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
            months.add(key)
          }
        }
      })
      
      setAllTickets(data)
      setAvailableMonths(Array.from(months).sort().reverse())
      addLog(`Total tickets COFEN: ${data.length}`)
      setLoading(false)
      return data
    } catch (err) {
      setError(err.message)
      setLoading(false)
      addLog(`Falha: ${err.message}`, 'error')
      return []
    }
  }, [allTickets.length])

  const filterByMonthAndType = useCallback((monthYear, typeVal) => {
    let filtered = allTickets.filter(t => {
      if (!t.date_created) return false
      const d = new Date(t.date_created)
      if (isNaN(d.getTime())) return false
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      return ym === monthYear
    })
    
    if (typeVal === 'auto') filtered = filtered.filter(t => isAutoTicket(t))
    else if (typeVal === 'manual') filtered = filtered.filter(t => !isAutoTicket(t))
    return filtered
  }, [allTickets])

  const getYearTickets = useCallback((year, typeVal) => {
    let yearTickets = allTickets.filter(t => {
      if (!t.date_created) return false
      const d = new Date(t.date_created)
      return !isNaN(d.getTime()) && d.getFullYear() === parseInt(year)
    })
    if (typeVal === 'auto') yearTickets = yearTickets.filter(t => isAutoTicket(t))
    else if (typeVal === 'manual') yearTickets = yearTickets.filter(t => !isAutoTicket(t))
    return yearTickets
  }, [allTickets])

  const updateKPIs = useCallback(() => {
    const selected = displayedTickets.filter(t => selectedIds.has(t.ticket_id))
    const totalSelected = selected.length
    const daysInMonth = selectedMonth ? new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0).getDate() : 30
    const dailyAvg = totalSelected / daysInMonth
    const weeklyAvg = totalSelected / 4.33
    
    let slaOkCount = 0
    selected.forEach(t => {
      if (t.is_overdue_resolve === false) slaOkCount++
      else if (t.is_overdue_resolve === null && (t.status_key === 'solved' || t.status_key === 'closed')) slaOkCount++
    })
    const slaCompliance = totalSelected > 0 ? (slaOkCount / totalSelected) * 100 : 0
    
    const year = selectedMonth ? selectedMonth.split('-')[0] : new Date().getFullYear().toString()
    const annualTotal = getYearTickets(year, typeFilter).length
    const monthlyAvg = annualTotal / 12
    
    setKpi({
      total: totalSelected,
      dailyAvg: dailyAvg.toFixed(2),
      weeklyAvg: weeklyAvg.toFixed(2),
      monthlyAvg: monthlyAvg.toFixed(1),
      annualTotal,
      slaCompliance: slaCompliance.toFixed(1)
    })
  }, [displayedTickets, selectedIds, selectedMonth, typeFilter, getYearTickets])

  useEffect(() => {
    loadAllTickets()
  }, [loadAllTickets])

  const handleGenerate = () => {
    if (!selectedMonth) {
      setError('Selecione um mês/ano.')
      return
    }
    const filtered = filterByMonthAndType(selectedMonth, typeFilter)
    setDisplayedTickets(filtered)
    setSelectedIds(new Set(filtered.map(t => t.ticket_id)))
    updateKPIs()
    addLog(`Relatório carregado: ${filtered.length} tickets`)
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(displayedTickets.map(t => t.ticket_id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectAuto = () => {
    const auto = displayedTickets.filter(t => isAutoTicket(t))
    setSelectedIds(new Set(auto.map(t => t.ticket_id)))
    updateKPIs()
  }

  const handleSelectManual = () => {
    const manual = displayedTickets.filter(t => !isAutoTicket(t))
    setSelectedIds(new Set(manual.map(t => t.ticket_id)))
    updateKPIs()
  }

  const handleClearAll = () => {
    setSelectedIds(new Set())
    updateKPIs()
  }

  const handleExportCSV = () => {
    if (selectedIds.size === 0) {
      setError('Nenhum ticket selecionado para exportar.')
      return
    }
    const selected = displayedTickets.filter(t => selectedIds.has(t.ticket_id))
    const headers = ['ID','Título','Abertura','Status','Solicitante','Técnico','Grupo','Severidade','SLA Atend.','SLA Soluç.','Últ. Atualização','Solução','Automático']
    const rows = selected.map(t => [
      t.ticket_id,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.date_created || '',
      t.status_name || '',
      t.requester_name || t.requester || '',
      t.technician || '',
      t.group_name || '',
      formatPriority(t.priority, t.priority_id),
      t.is_overdue_first ? 'Fora do prazo' : 'No prazo',
      t.is_overdue_resolve ? 'Fora do prazo' : 'No prazo',
      t.date_mod || '',
      `"${(t.solution || t.solution_content || '').replace(/"/g, '""')}"`,
      isAutoTicket(t) ? 'Sim' : 'Não'
    ].join(','))
    
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cofen_${selectedMonth}_${typeFilter}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addLog(`CSV exportado com ${selected.length} registros`)
  }

  const handleCheckboxChange = (ticketId, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(ticketId)
      else next.delete(ticketId)
      return next
    })
    setTimeout(updateKPIs, 0)
  }

  useEffect(() => {
    updateKPIs()
  }, [selectedIds, updateKPIs])

  const priorityClass = (priorityLabel) => {
    if (priorityLabel.includes('Crítica') || priorityLabel.includes('Muito alta')) return 'priority-high'
    if (priorityLabel.includes('Alta')) return 'priority-med'
    return 'priority-low'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>📊 Relatório Gerencial COFEN</h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Gerenciamento de tickets COFEN da instância GMX</div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>📅 Mês/Ano</label>
          <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
          >
            <option value="">Selecione...</option>
            {availableMonths.map(m => {
              const [year, month] = m.split('-')
              const monthName = new Date(parseInt(year), parseInt(month)-1, 1).toLocaleString('pt-BR', { month: 'long' })
              return <option key={m} value={m}>{monthName} de {year}</option>
            })}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>🖖 Tipo</label>
          <select 
            value={typeFilter} 
            onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
          >
            <option value="all">Todos</option>
            <option value="auto">🖖 Automáticos</option>
            <option value="manual">👤 Manuais</option>
          </select>
        </div>
        <button onClick={handleGenerate} className="btn-primary">
          🚀 Carregar Relatório
        </button>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => handleSelectAll(true)} className="btn-secondary" style={{ fontSize: '0.78rem' }}>✅ Selecionar Todos</button>
          <button onClick={handleSelectAuto} className="btn-secondary" style={{ fontSize: '0.78rem' }}>🖖 Automáticos</button>
          <button onClick={handleSelectManual} className="btn-secondary" style={{ fontSize: '0.78rem' }}>👤 Manuais</button>
          <button onClick={handleClearAll} className="btn-secondary" style={{ fontSize: '0.78rem' }}>❌ Desmarcar</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Tickets (selecionados)', value: kpi.total },
          { label: 'Média Diária (mês)', value: kpi.dailyAvg },
          { label: 'Média Semanal (mês)', value: kpi.weeklyAvg },
          { label: 'Média Mensal (ano)', value: kpi.monthlyAvg },
          { label: 'Total Anual (entidade)', value: kpi.annualTotal },
          { label: 'SLA Compliance (selecionados)', value: `${kpi.slaCompliance}%` },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{displayedTickets.length} tickets exibidos</span>
        <button onClick={handleExportCSV} className="btn-export" disabled={selectedIds.size === 0}>
          📥 Exportar CSV ({selectedIds.size} selecionados)
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}><div className="spinner" /></div>
      ) : error ? (
        <div style={{ color: '#dc2626', padding: '16px' }}>Erro: {error}</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'center', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    onChange={e => { handleSelectAll(e.target.checked); updateKPIs() }}
                  />
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Título</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Abertura</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Solicitante</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Técnico</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Grupo</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Severidade</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>SLA Atend.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>SLA Soluç.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Últ. Atualiz.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Solução</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Automático</th>
              </tr>
            </thead>
            <tbody>
              {displayedTickets.length === 0 ? (
                <tr>
                  <td colSpan="12" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {selectedMonth ? 'Nenhum ticket encontrado.' : 'Selecione um mês/ano e clique em "Carregar Relatório"'}
                  </td>
                </tr>
              ) : (
                displayedTickets.map((t, i) => (
                  <tr key={`${t.ticket_id}-${t.instance}`} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(t.ticket_id)}
                        onChange={e => handleCheckboxChange(t.ticket_id, e.target.checked)}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)' }}>#{t.ticket_id}</td>
                    <td style={{ padding: '8px 12px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{t.date_created ? new Date(t.date_created).toLocaleString('pt-BR') : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`status-badge ${t.status_key}`}>{t.status_name || t.status_key}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{t.requester || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.group_name || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={priorityClass(formatPriority(t.priority, t.priority_id))}>{formatPriority(t.priority, t.priority_id)}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={t.is_overdue_first ? 'sla-error' : 'sla-ok'}>{t.is_overdue_first ? 'Fora do prazo' : 'No prazo'}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={t.is_overdue_resolve ? 'sla-error' : 'sla-ok'}>{t.is_overdue_resolve ? 'Fora do prazo' : 'No prazo'}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{t.date_mod ? new Date(t.date_mod).toLocaleString('pt-BR') : '—'}</td>
                    <td style={{ padding: '8px 12px', maxWidth: '300px', whiteSpace: 'normal', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {(t.solution || t.solution_content || '—').toString().substring(0, 100)}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={isAutoTicket(t) ? 'auto-sim' : ''}>{isAutoTicket(t) ? 'Sim' : 'Não'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
