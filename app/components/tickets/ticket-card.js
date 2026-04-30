import { calculateSLA } from '../../../lib/sla'

export default function TicketCard({ ticket }) {
  const sla = calculateSLA(ticket)
  const percent = Math.max(sla.percentual_primeira_resposta, sla.percentual_solucao)
  const critical = percent >= 70

  const cardClass = `ticket-card ${critical ? 'ticket-card--critical' : 'ticket-card--ok'}`

  return (
    <div className={cardClass}>
      <div className="ticket-card-header">
        <div className="ticket-card-title">
          <span className="ticket-instance">{ticket.instance}</span>
          <span className="ticket-id">#{ticket.ticket_id || ticket.glpi_id}</span>
          <span className="ticket-title">{ticket.title}</span>
        </div>
        <div className="sla-indicator">
          <span className={`sla-badge ${critical ? 'late' : 'ok'}`}>
            {percent.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="ticket-card-info">
        {(ticket.requester_name || ticket.requester) && (
          <span className="info-item">
            <strong>Solicitante:</strong> {ticket.requester_name || ticket.requester}
          </span>
        )}
        {(ticket.group_name) && (
          <span className="info-item">
            <strong>Grupo:</strong> {ticket.group_name}
          </span>
        )}
        {(ticket.technician_name || ticket.technician) && (
          <span className="info-item">
            <strong>Técnico:</strong> {ticket.technician_name || ticket.technician}
          </span>
        )}
      </div>
      <div className="ticket-card-footer">
        <span className={`status-badge ${ticket.status_key}`}>
          {ticket.status_name || ticket.status_key}
        </span>
        <span className="sla-status">
          SLA: {sla.sla_primeira_resposta_status} ({percent.toFixed(0)}%)
        </span>
      </div>
    </div>
  )
}
