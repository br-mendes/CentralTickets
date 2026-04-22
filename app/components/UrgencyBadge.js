const URGENCY = {
  1: { label: 'Muito Baixa', color: '#64748b', bg: '#f1f5f9' },
  2: { label: 'Baixa',       color: '#3b82f6', bg: '#eff6ff' },
  3: { label: 'Média',       color: '#d97706', bg: '#fef3c7' },
  4: { label: 'Alta',        color: '#ea580c', bg: '#fff7ed' },
  5: { label: 'Muito Alta',  color: '#dc2626', bg: '#fef2f2' },
  6: { label: 'Crítica',     color: '#fff',    bg: '#7f1d1d' },
}

export default function UrgencyBadge({ urgency, showLabel = false }) {
  if (!urgency) return null
  const u = URGENCY[urgency] || URGENCY[3]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: showLabel ? '2px 7px' : '2px 5px',
      borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
      color: u.color, background: u.bg,
      border: `1px solid ${u.color}33`,
      whiteSpace: 'nowrap',
    }}>
      {showLabel ? u.label : `U${urgency}`}
    </span>
  )
}

export const URGENCY_LABELS = {
  1: 'Muito Baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Muito Alta', 6: 'Crítica'
}
export const URGENCY_COLORS = ['#64748b', '#3b82f6', '#d97706', '#ea580c', '#dc2626', '#7f1d1d']
