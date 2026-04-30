import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface TicketData {
  ticket_id: number;
  instance: "PETA" | "GMX";
  title?: string;
  content?: string | null;
  entity?: string | null;
  entity_full?: string | null;
  entity_id?: number;
  category?: string | null;
  category_name?: string | null;
  root_category?: string | null;
  technician?: string | null;
  technician_id?: number;
  requester?: string | null;
  requester_id?: number;
  group_name?: string | null;
  group_id?: number;
  request_type?: string | null;
  request_type_id?: number;
  status_id?: number;
  status_key?: string | null;
  status_name?: string | null;
  priority_id?: number;
  priority?: string | null;
  type_id?: number;
  urgency?: number;
  impact?: number;
  date_created?: string | null;
  date_mod?: string | null;
  date_solved?: string | null;
  date_close?: string | null;
  due_date?: string | null;
  is_sla_late?: boolean;
  is_overdue_first?: boolean;
  is_overdue_resolve?: boolean;
  sla_percentage_first?: number | null;
  sla_percentage_resolve?: number | null;
  solution?: string | null;
  is_deleted?: boolean;
  [key: string]: unknown;
}

interface SyncPayload {
  instance: "PETA" | "GMX";
  all_tickets: TicketData[];
  timestamp: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variáveis de ambiente não configuradas");
}

const supabase = createClient(SUPABASE_URL || "", SUPABASE_SERVICE_ROLE_KEY || "");

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Apenas POST aceito" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload;
    try {
      payload = await req.json();
    } catch (e) {
      console.error("Erro ao parsear JSON:", e);
      return new Response(
        JSON.stringify({ error: "JSON inválido no corpo" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!payload.instance) {
      return new Response(
        JSON.stringify({ error: "Campo 'instance' obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!["PETA", "GMX"].includes(payload.instance)) {
      return new Response(
        JSON.stringify({ error: "Instance deve ser PETA ou GMX" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(payload.all_tickets)) {
      return new Response(
        JSON.stringify({ error: "all_tickets deve ser array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const log = {
      instance: payload.instance,
      started_at: new Date().toISOString(),
      status: "completed",
      tickets_processed: payload.all_tickets.length,
      tickets_added: 0,
      tickets_updated: 0,
      changes_detected: [],
      errors: [],
      details: [
        `🚀 Iniciando sincronização para ${payload.instance}`,
        `📊 Total de tickets: ${payload.all_tickets.length}`,
      ],
    };

    for (const ticket of payload.all_tickets) {
      if (!ticket.ticket_id) {
        log.errors.push({ error: "Ticket sem ID" });
        continue;
      }

      try {
        const normalized = {
          ticket_id: ticket.ticket_id,
          instance: payload.instance,
          title: ticket.title || null,
          entity: ticket.entity || null,
          entity_full: ticket.entity_full || null,
          entity_id: ticket.entity_id || 0,
          category: ticket.category || null,
          category_name: ticket.category_name || null,
          root_category: ticket.root_category || null,
          status_id: ticket.status_id || null,
          status_key: ticket.status_key || null,
          status_name: ticket.status_name || null,
          group_name: ticket.group_name || null,
          group_id: ticket.group_id || 0,
          date_created: ticket.date_created || null,
          date_mod: ticket.date_mod || null,
          due_date: ticket.due_date || null,
          is_sla_late: ticket.is_sla_late || false,
          sla_percentage_first: ticket.sla_percentage_first || null,
          sla_percentage_resolve: ticket.sla_percentage_resolve || null,
          raw_data: ticket,
          last_sync: new Date().toISOString(),
          technician: ticket.technician || null,
          technician_id: ticket.technician_id || 0,
          priority_id: ticket.priority_id || 1,
          priority: ticket.priority || "1-Baixa",
          urgency: ticket.urgency || 3,
          date_solved: ticket.date_solved || null,
          type_id: ticket.type_id || 2,
          solution: ticket.solution || null,
          content: ticket.content || null,
          requester: ticket.requester || null,
          requester_id: ticket.requester_id || 0,
          impact: ticket.impact || 3,
          date_close: ticket.date_close || null,
          is_overdue_first: ticket.is_overdue_first || false,
          is_overdue_resolve: ticket.is_overdue_resolve || false,
          request_type: ticket.request_type || null,
          is_deleted: ticket.is_deleted || false,
        };

        const { error } = await supabase
          .from("tickets_cache")
          .upsert([normalized], { onConflict: "ticket_id,instance" });

        if (error) {
          log.errors.push({ ticket_id: ticket.ticket_id, error: error.message });
          log.details.push(`❌ Erro #${ticket.ticket_id}: ${error.message}`);
        } else {
          log.tickets_added++;
          log.details.push(`✅ Ticket #${ticket.ticket_id}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.errors.push({ ticket_id: ticket.ticket_id, error: msg });
        log.details.push(`❌ Exceção #${ticket.ticket_id}: ${msg}`);
      }
    }

    await supabase.from("sync_control").upsert(
      [
        {
          instance: payload.instance,
          last_sync: new Date().toISOString(),
          status: "completed",
          tickets_count: payload.all_tickets.length,
        },
      ],
      { onConflict: "instance" }
    );

    log.details.push(
      `✨ Concluído: ${log.tickets_added}/${payload.all_tickets.length}, ${log.errors.length} erros`
    );

    return new Response(JSON.stringify(log), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro não tratado:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: msg,
        status: "failed",
        details: [msg],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
