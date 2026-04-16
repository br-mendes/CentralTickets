const STATUS_CONFIG = {
  1: { label: 'Novo', color: 'var(--status-new)' },
  2: { label: 'Em atendimento', color: 'var(--status-processing)' },
  4: { label: 'Pendente', color: 'var(--status-pending)' },
  5: { label: 'Solucionado', color: 'var(--status-solved)' },
  6: { label: 'Fechado', color: 'var(--status-closed)' },
  7: { label: 'Aprovação', color: 'var(--status-approval)' },
  new: { label: 'Novo', color: 'var(--status-new)' },
  processing: { label: 'Em atendimento', color: 'var(--status-processing)' },
  pending: { label: 'Pendente', color: 'var(--status-pending)' },
  solved: { label: 'Solucionado', color: 'var(--status-solved)' },
  closed: { label: 'Fechado', color: 'var(--status-closed)' },
}

export default function StatusBadge({ statusId, statusKey, statusName }) {
  const config = STATUS_CONFIG[statusId] || STATUS_CONFIG[statusKey]
  const label = config?.label || statusName || String(statusId || statusKey || '—')
  const color = config?.color || 'var(--text-muted)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 10px',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }} />
      {label}
    </span>
  )
}
