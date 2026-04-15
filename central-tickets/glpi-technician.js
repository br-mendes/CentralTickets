/**
 * Fetch Technician Names from GLPI API
 * Uses Ticket_User endpoint to get assigned technicians (type=2)
 * Endpoint: GET /Ticket/{ticket_id}/Ticket_User
 */

window.GLPIUtils = {
    // Fetch assigned technician (type=2) from GLPI for a single ticket
    async getTechnicianFromTicket(ticketId, instanceName) {
        if (!ticketId || !instanceName) return '';
        
        const config = window.APP_CONFIG;
        const instance = instanceName === 'Peta' 
            ? { BASE_URL: config.GLPI_PETA_URL, USER_TOKEN: config.GLPI_PETA_USER_TOKEN, APP_TOKEN: config.GLPI_PETA_APP_TOKEN }
            : { BASE_URL: config.GLPI_GMX_URL, USER_TOKEN: config.GLPI_GMX_USER_TOKEN, APP_TOKEN: config.GLPI_GMX_APP_TOKEN };
        
        try {
            // First ensure we have a session
            if (!window.sessionTokens?.[instanceName]) {
                await window.initSessionGLPI(instanceName);
            }
            
            const response = await fetch(
                `${instance.BASE_URL}/Ticket/${ticketId}/Ticket_User`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Session-Token': window.sessionTokens[instanceName],
                        'App-Token': instance.APP_TOKEN,
                    },
                }
            );
            
            if (!response.ok) {
                console.error(`Failed to fetch Ticket_User for ticket ${ticketId}: ${response.status}`);
                return '';
            }
            
            const data = await response.json();
            
            if (!data || !Array.isArray(data)) return '';
            
            // Find the assigned technician (type = 2)
            const assignedTechnician = data.find(actor => actor.type === 2);
            
            if (!assignedTechnician || !assignedTechnician.users_id) return '';
            
            // Get user details to get the name
            const userName = await this.getUserName(assignedTechnician.users_id, instanceName);
            return userName;
            
        } catch (error) {
            console.error(`Error fetching technician for ticket ${ticketId}:`, error);
            return '';
        }
    },
    
    // Get user name from GLPI User endpoint
    async getUserName(userId, instanceName) {
        if (!userId) return '';
        
        const config = window.APP_CONFIG;
        const instance = instanceName === 'Peta' 
            ? { BASE_URL: config.GLPI_PETA_URL, USER_TOKEN: config.GLPI_PETA_USER_TOKEN, APP_TOKEN: config.GLPI_PETA_APP_TOKEN }
            : { BASE_URL: config.GLPI_GMX_URL, USER_TOKEN: config.GLPI_GMX_USER_TOKEN, APP_TOKEN: config.GLPI_GMX_APP_TOKEN };
        
        try {
            // Check session
            if (!window.sessionTokens?.[instanceName]) {
                await window.initSessionGLPI(instanceName);
            }
            
            const response = await fetch(
                `${instance.BASE_URL}/User/${userId}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Session-Token': window.sessionTokens[instanceName],
                        'App-Token': instance.APP_TOKEN,
                    },
                }
            );
            
            if (!response.ok) return userId.toString();
            
            const user = await response.json();
            
            // Construct name from common fields
            const firstname = user.firstname || '';
            const realname = user.realname || '';
            const name = user.name || '';
            
            let fullName = '';
            if (firstname && realname) {
                fullName = `${firstname} ${realname}`;
            } else if (firstname) {
                fullName = firstname;
            } else if (realname) {
                fullName = realname;
            } else {
                fullName = name;
            }
            
            return fullName || userId.toString();
            
        } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
            return userId.toString();
        }
    },
    
    // Batch fetch technicians for multiple tickets
    async fetchTechniciansForTickets(tickets, instanceName) {
        const results = {};
        
        for (const ticket of tickets) {
            if (ticket.id && !ticket.technician) {
                const techName = await this.getTechnicianFromTicket(ticket.id, instanceName);
                results[ticket.id] = techName;
            }
        }
        
        return results;
    }
};

// Initialize session for GLPI if not exists
window.initSessionGLPI = async function(instanceName) {
    if (!window.sessionTokens) window.sessionTokens = {};
    if (window.sessionTokens[instanceName]) return window.sessionTokens[instanceName];
    
    const config = window.APP_CONFIG;
    const instance = instanceName === 'Peta' 
        ? { BASE_URL: config.GLPI_PETA_URL, USER_TOKEN: config.GLPI_PETA_USER_TOKEN, APP_TOKEN: config.GLPI_PETA_APP_TOKEN }
        : { BASE_URL: config.GLPI_GMX_URL, USER_TOKEN: config.GLPI_GMX_USER_TOKEN, APP_TOKEN: config.GLPI_GMX_APP_TOKEN };
    
    const response = await fetch(`${instance.BASE_URL}/initSession`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `user_token ${instance.USER_TOKEN}`,
            'App-Token': instance.APP_TOKEN,
        },
    });
    
    const data = await response.json();
    window.sessionTokens[instanceName] = data.session_token;
    return data.session_token;
};