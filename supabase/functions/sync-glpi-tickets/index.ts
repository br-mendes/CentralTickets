import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface TicketData {
  ticket_id: number;
  instance: "PETA" | "GMX";
  title: string;
  [key: string]: unknown;
}

interface SyncPayload {
  instance: "PETA" | "GMX";
  all_tickets: TicketData[];
  timestamp: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Apenas POST é aceito" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: SyncPayload = await req.json();

    if (!payload.instance || !["PETA", "GMX"].includes(payload.instance)) {
      return new Response(
        JSON.stringify({ error: "Instância inválida. Use PETA ou GMX" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(payload.all_tickets)) {
      return new Response(JSON.stringify({ error: "all_tickets deve ser um array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
      details: [`🚀 Sincronização iniciada para ${payload.instance}`],
    };

    for (const ticket of payload.all_tickets) {
      if (!ticket.ticket_id) continue;

      const { data: existing } = await supabase
        .from("tickets_cache")
        .select("*")
        .eq("ticket_id", ticket.ticket_id)
        .eq("instance", payload.instance)
        .single();

      const isNew = !existing;
      if (isNew) log.tickets_added++;
      else log.tickets_updated++;

      await supabase.from("tickets_cache").upsert([{ ...ticket, instance: payload.instance, raw_data: ticket, last_sync: new Date().toISOString() }]);
    }

    await supabase.from("sync_control").upsert([{ instance: payload.instance, last_sync: new Date().toISOString(), status: "completed" }]);

    return new Response(JSON.stringify(log), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err), status: "failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
