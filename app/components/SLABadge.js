export default function SLABadge({ isLate }) {
  return (
    <span className={`sla-badge ${isLate ? 'late' : 'ok'}`}>
      {isLate ? 'SLA Excedido' : 'No Prazo'}
    </span>
  )
}
