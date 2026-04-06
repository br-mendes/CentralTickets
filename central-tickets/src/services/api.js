const API_CONFIG = {
  BASE_URL: 'https://glpi.petacorp.com.br/apirest.php',
  USER_TOKEN: 'guhEhrBwOaU1Wk6ETIuWc2jZf3tVkL7VWd62oz51',
  APP_TOKEN: 'guhEhrBwOaU1Wk6ETIuWc2jZf3tVkL7VWd62oz51',
};

const TICKET_STATUS = {
  1: { name: 'Novo', key: 'new', color: '#3b82f6' },
  2: { name: 'Em atendimento', key: 'processing', color: '#f59e0b' },
  3: { name: 'Em atendimento', key: 'processing', color: '#f59e0b' },
  4: { name: 'Pendente', key: 'pending', color: '#8b5cf6' },
  5: { name: 'Solucionado', key: 'solved', color: '#10b981' },
  6: { name: 'Fechado', key: 'closed', color: '#6b7280' },
};

const STATUS_ORDER = ['new', 'processing', 'pending', 'solved', 'closed'];

const STATUS_LABELS = {
  new: 'Novo',
  processing: 'Em atendimento',
  pending: 'Pendente',
  solved: 'Solucionado',
  closed: 'Fechado',
};

class GLPIApiService {
  constructor() {
    this.sessionToken = null;
  }

  async initSession() {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/initSession/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user_token ${API_CONFIG.USER_TOKEN}`,
          'App-Token': API_CONFIG.APP_TOKEN,
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao iniciar sessão: ${response.status}`);
      }

      const data = await response.json();
      this.sessionToken = data.session_token;
      return this.sessionToken;
    } catch (error) {
      console.error('Erro na autenticação:', error);
      throw error;
    }
  }

  async killSession() {
    if (!this.sessionToken) return;

    try {
      await fetch(`${API_CONFIG.BASE_URL}/killSession/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': this.sessionToken,
          'App-Token': API_CONFIG.APP_TOKEN,
        },
      });
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
    } finally {
      this.sessionToken = null;
    }
  }

  async getTickets() {
    if (!this.sessionToken) {
      await this.initSession();
    }

    try {
      const allTickets = [];
      let page = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const start = page * pageSize;
        const end = start + pageSize - 1;

        const response = await fetch(
          `${API_CONFIG.BASE_URL}/search/Ticket/?` + 
          `&range=${start}-${end}` +
          `&expand_dropdowns=true` +
          `&get_hateoas=false` +
          `&criteria[0][link]=AND` +
          `&criteria[0][field]=12` +
          `&criteria[0][searchtype]=notcontains` +
          `&criteria[0][value]=` +
          `&uid_cols=false`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Session-Token': this.sessionToken,
              'App-Token': API_CONFIG.APP_TOKEN,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Erro ao buscar tickets: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
          if (data.data.length === 0) {
            hasMore = false;
          } else {
            allTickets.push(...data.data);
            page++;
            
            if (data.data.length < pageSize) {
              hasMore = false;
            }
          }
        } else {
          hasMore = false;
        }
      }

      return this.processTickets(allTickets);
    } catch (error) {
      console.error('Erro ao buscar tickets:', error);
      throw error;
    }
  }

  processTickets(tickets) {
    return tickets.map(ticket => this.transformTicket(ticket));
  }

  transformTicket(ticket) {
    const statusId = ticket[12] || 1;
    const statusInfo = TICKET_STATUS[statusId] || TICKET_STATUS[1];

    return {
      id: ticket[2] || ticket.id,
      title: ticket[1] || 'Sem título',
      entity: ticket[80] || 'Entidade não definida',
      category: ticket[3] || ticket[7] || 'Categoria não definida',
      statusId: statusId,
      status: statusInfo.key,
      statusName: statusInfo.name,
      statusColor: statusInfo.color,
      dateCreated: ticket[91] || ticket.date_creation,
      dueDate: ticket[10] || ticket.due_date,
      timePending: statusInfo.key === 'pending' ? this.calculatePendingTime(ticket) : null,
    };
  }

  calculatePendingTime(ticket) {
    const lastUpdate = ticket[91] || ticket.date_creation;
    if (!lastUpdate) return null;

    const updateDate = new Date(lastUpdate);
    const now = new Date();
    const diffMs = now - updateDate;

    return this.formatDuration(diffMs);
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      if (remainingHours > 0) {
        return `há ${days} dia${days > 1 ? 's' : ''} e ${remainingHours} hora${remainingHours > 1 ? 's' : ''}`;
      }
      return `há ${days} dia${days > 1 ? 's' : ''}`;
    }
    
    if (hours > 0) {
      return `há ${hours} hora${hours > 1 ? 's' : ''}`;
    }
    
    if (minutes > 0) {
      return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    }
    
    return 'há poucos segundos';
  }
}

export const apiService = new GLPIApiService();
export { TICKET_STATUS, STATUS_ORDER, STATUS_LABELS };
