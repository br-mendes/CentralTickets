import { getStatusConfig } from '../lib/utils'

export default function StatusBadge({ statusId, statusKey, statusName }) {
  const cfg = getStatusConfig(statusId, statusKey)
  const label = cfg.label !== String(statusId || statusKey || '—') ? cfg.label : (statusName || cfg.label)
  return (
    <span className={`status-badge ${cfg.key}`}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {label}
    </span>
  )
}
