export default function SLABadge({ isLate }) {
  const color = isLate ? 'var(--sla-late)' : 'var(--sla-ok)'
  const label = isLate ? 'SLA Excedido' : 'No Prazo'

  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '9999px',
      fontSize: '0.72rem',
      fontWeight: 600,
      background: color + '18',
      color,
      border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
