export default function InstanceBadge({ instance }) {
  const isPeta = instance?.toLowerCase() === 'peta'
  const color = isPeta ? '#2563eb' : '#9333ea'
  const label = isPeta ? 'Peta' : 'GMX'

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.7rem',
      fontWeight: 700,
      background: color + '18',
      color,
      border: `1px solid ${color}33`,
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}
