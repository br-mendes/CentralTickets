// Supabase Edge Function to sync technician names from GLPI
// This function will fetch technician names for all tickets and update the database

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GLPI_CONFIG = {
  'Peta': {
    BASE_URL: 'https://glpi.petacorp.com.br/apirest.php',
    USER_TOKEN: 'PveUan5K0TcmshIlTOmB3x9QqGON2AGwI7AXTwOS',
    APP_TOKEN: 'guhEhrBwOaU1Wk6ETIuWc2jZf3tVkL7VWd62oz51'
  },
  'GMX': {
    BASE_URL: 'https://glpi.gmxtecnologia.com.br/apirest.php',
    USER_TOKEN: 'b8WgBZm1upQDj3BYaKMePRXRSyywM6n8xkytzRph',
    APP_TOKEN: 'whm88xUDeRBEamJi1IeRhRGFmixdIVouoNdCuBpF'
  }
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function initGLPISession(instance: string) {
  const config = GLPI_CONFIG[instance];
  const response = await fetch(`${config.BASE_URL}/initSession`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `user_token ${config.USER_TOKEN}`,
      'App-Token': config.APP_TOKEN,
    },
  });
  
  const data = await response.json();
  return data.session_token;
}

async function getTechnicianForTicket(ticketId: number, sessionToken: string, instance: string) {
  const config = GLPI_CONFIG[instance];
  
  try {
    const response = await fetch(
      `${config.BASE_URL}/Ticket/${ticketId}/Ticket_User`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': sessionToken,
          'App-Token': config.APP_TOKEN,
        },
      }
    );
    
    if (!response.ok) return null;
    
    const actors = await response.json();
    if (!Array.isArray(actors)) return null;
    
    // Find assigned technician (type = 2)
    const technician = actors.find((a: any) => a.type === 2);
    if (!technician || !technician.users_id) return null;
    
    // Get user details
    const userResponse = await fetch(
      `${config.BASE_URL}/User/${technician.users_id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': sessionToken,
          'App-Token': config.APP_TOKEN,
        },
      }
    );
    
    if (!userResponse.ok) return null;
    
    const user = await userResponse.json();
    const name = [user.firstname, user.realname].filter(Boolean).join(' ') || user.name || '';
    
    return { id: technician.users_id, name };
  } catch (e) {
    console.error(`Error fetching technician for ticket ${ticketId}:`, e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const { instance, limit } = await req.json();
    
    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Get session token for GLPI
    const sessionToken = await initGLPISession(instance);
    
    // Fetch tickets that need technician names
    const { data: tickets, error } = await supabase
      .from('tickets_cache')
      .select('id, ticket_id, instance, technician')
      .eq('instance', instance)
      .is('technician', null)
      .limit(limit || 100);
    
    if (error) throw error;
    if (!tickets || tickets.length === 0) {
      return new Response(JSON.stringify({ message: 'No tickets to update', updated: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`Found ${tickets.length} tickets to update for ${instance}`);
    
    let updated = 0;
    for (const ticket of tickets) {
      const tech = await getTechnicianForTicket(ticket.ticket_id, sessionToken, instance);
      
      if (tech && tech.name) {
        await supabase
          .from('tickets_cache')
          .update({ technician: tech.name })
          .eq('id', ticket.id)
          .eq('instance', instance);
        
        updated++;
      }
    }
    
    return new Response(JSON.stringify({ 
      message: `Updated ${updated} technician names for ${instance}`,
      updated,
      total: tickets.length
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
