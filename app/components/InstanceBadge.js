export default function InstanceBadge({ instance }) {
  const key = (instance || '').toLowerCase() === 'peta' ? 'peta' : 'gmx'
  const label = key === 'peta' ? 'PETA' : 'GMX'
  return <span className={`instance-badge ${key}`}>{label}</span>
}
