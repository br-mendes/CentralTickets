import { formatShortDate, getRelativeTime } from '../utils/dateUtils';

export function TicketCard({ ticket }) {
  return (
    <div className={`ticket-card ${ticket.status}`}>
      <div className="ticket-header">
        <span className="ticket-id">#{ticket.id}</span>
        <span className="ticket-entity">{ticket.entity}</span>
      </div>
      
      <div className="ticket-category">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        {ticket.category}
      </div>
      
      <div className="ticket-dates">
        <div className="ticket-date-row">
          <span className="ticket-date-label">Abertura:</span>
          <span className="ticket-date-value">{formatShortDate(ticket.dateCreated)}</span>
        </div>
        <div className="ticket-date-row">
          <span className="ticket-date-label">Previsto:</span>
          <span className="ticket-date-value">{formatShortDate(ticket.dueDate)}</span>
        </div>
      </div>
      
      {ticket.status === 'pending' && ticket.timePending && (
        <div className="pending-time">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          {ticket.timePending}
        </div>
      )}
    </div>
  );
}
