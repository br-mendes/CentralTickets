'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import InstanceBadge from '../components/InstanceBadge'
import StatusBadge from '../components/StatusBadge'
import SLABadge from '../components/SLABadge'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const MONTHS = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: '1', label: 'Novo' },
  { value: '2', label: 'Em atendimento' },
  { value: '4', label: 'Pendente' },
  { value: '5', label: 'Solucionado' },
  { value: '6', label: 'Fechado' },
  { value: '7', label: 'Aprovação' },
]

export default function RelatoriosPage() {
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const now = new Date()
  const [dateType, setDateType] = useState('opening')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [filterInstance, setFilterInstance] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const startDate = new Date(year, month - 1, 1).toISOString()
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()
      const dateCol = dateType === 'opening' ? 'date_created' : 'date_mod'

      const { data, error: err } = await supabase
        .from('tickets_cache')
        .select('ticket_id,title,entity,category,status_id,status_key,status_name,group_name,technician,is_sla_late,date_created,date_mod,date_solved,solution,instance')
        .gte(dateCol, startDate)
        .lte(dateCol, endDate)
        .order(dateCol, { ascending: false })

      if (err) throw err
      setAllTickets(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dateType, year, month])

  const entities = [...new Set(allTickets.map(t => t.entity).filter(Boolean))].sort()

  const filtered = allTickets.filter(t => {
    if (filterInstance && (t.instance || '').toLowerCase() !== filterInstance.toLowerCase()) return false
    if (filterEntity && t.entity !== filterEntity) return false
    if (filterStatus && String(t.status_id) !== filterStatus) return false
    return true
  })

  function exportCSV() {
    const headers = ['ID', 'Instância', 'Entidade', 'Categoria', 'Status', 'Grupo', 'Técnico', 'SLA', 'Abertura', 'Últ. Atualização', 'Solução']
    const rows = filtered.map(t => [
      t.ticket_id,
      t.instance || '',
      t.entity || '',
      t.category || '',
      t.status_name || t.status_key || '',
      t.group_name || '',
      t.technician || '',
      t.is_sla_late ? 'Fora do prazo' : 'No prazo',
      fmt(t.date_created),
      fmt(t.date_mod),
      (t.solution || '').replace(/\n/g, ' ').replace(/,/g, ';'),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${dateType}_${year}_${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const inputStyle = {
    padding: '7px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--text-primary)', fontSize: '0.85rem',
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Relatórios</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Histórico e exportação de dados</p>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px',
        display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Tipo de data</label>
          <select value={dateType} onChange={e => setDateType(e.target.value)} style={inputStyle}>
            <option value="opening">Data de Abertura</option>
            <option value="update">Última Atualização</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Ano</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Mês</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={inputStyle}>
            {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Instância</label>
          <select value={filterInstance} onChange={e => setFilterInstance(e.target.value)} style={inputStyle}>
            <option value="">Todas</option>
            <option value="peta">Peta</option>
            <option value="gmx">GMX</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Entidade</label>
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={inputStyle}>
            <option value="">Todas</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={load} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, alignSelf: 'flex-end' }}>
          Buscar
        </button>
      </div>

      {/* Results header */}
      {allTickets.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {filtered.length} tickets encontrados
          </span>
          <button onClick={exportCSV} style={{
            ...inputStyle, cursor: 'pointer',
            background: '#16a34a', color: 'white', border: 'none', fontWeight: 600,
          }}>
            Exportar CSV
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : error ? (
        <div style={{ color: 'var(--sla-late)', padding: '16px' }}>Erro: {error}</div>
      ) : allTickets.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '48px', textAlign: 'center', color: 'var(--text-muted)',
        }}>
          Selecione os filtros e clique em <strong>Buscar</strong> para carregar os dados.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Nenhum ticket corresponde aos filtros.</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                {['ID', 'Instância', 'Entidade', 'Categoria', 'Status', 'Grupo', 'Técnico', 'SLA', 'Abertura', 'Últ. Atualização', 'Solução'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.ticket_id}
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--background)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>#{t.ticket_id}</td>
                  <td style={{ padding: '9px 12px' }}><InstanceBadge instance={t.instance} /></td>
                  <td style={{ padding: '9px 12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.entity || '—'}</td>
                  <td style={{ padding: '9px 12px', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.category || '—'}</td>
                  <td style={{ padding: '9px 12px' }}><StatusBadge statusId={t.status_id} statusKey={t.status_key} statusName={t.status_name} /></td>
                  <td style={{ padding: '9px 12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.group_name || '—'}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{t.technician || '—'}</td>
                  <td style={{ padding: '9px 12px' }}><SLABadge isLate={t.is_sla_late} /></td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_created)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(t.date_mod)}</td>
                  <td style={{ padding: '9px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {t.solution ? t.solution.replace(/<[^>]+>/g, '').trim() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
