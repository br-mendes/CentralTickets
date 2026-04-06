import { TicketCard } from './TicketCard';
import { STATUS_ORDER, STATUS_LABELS } from '../services/api';

export function KanbanBoard({ tickets }) {
  const ticketsByStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = tickets.filter(t => t.status === status);
    return acc;
  }, {});

  return (
    <div className="kanban-board">
      {STATUS_ORDER.map(status => (
        <KanbanColumn
          key={status}
          status={status}
          label={STATUS_LABELS[status]}
          tickets={ticketsByStatus[status] || []}
        />
      ))}
    </div>
  );
}

function KanbanColumn({ status, label, tickets }) {
  return (
    <div className="kanban-column">
      <div className="column-header">
        <div className="column-title">
          <span className={`status-dot ${status}`}></span>
          {label}
        </div>
        <span className="column-count">{tickets.length}</span>
      </div>
      <div className="column-content">
        {tickets.length === 0 ? (
          <div className="empty-column">
            Nenhum ticket
          </div>
        ) : (
          tickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))
        )}
      </div>
    </div>
  );
}
