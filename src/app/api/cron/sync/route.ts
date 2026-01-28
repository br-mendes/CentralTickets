import { NextRequest, NextResponse } from 'next/server';
import { getInstanceEnvs, fetchTicketsForInstance } from "@/lib/glpi";
import { computeSlaPercent } from "@/lib/sla";
import { getSupabaseAdmin } from '@/lib/supabase/client';

export const dynamic = "force-dynamic";

const ALERT_THRESHOLD = 70;

async function upsertTickets(tickets: any[]) {
  const { error } = await getSupabaseAdmin()
    .from("tickets")
    .upsert(tickets, { onConflict: "glpi_id,instance" });

  if (error) throw new Error(`Supabase upsert tickets falhou: ${error.message}`);
}

async function loadExisting(instance: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .select("glpi_id, instance, sla_percentage_first, sla_percentage_resolve, created_at")
    .eq("instance", instance);

  if (error) throw new Error(`Supabase select tickets falhou: ${error.message}`);
  const map = new Map<number, any>();
  (data ?? []).forEach((r: any) => map.set(Number(r.glpi_id), r));
  return map;
}

async function insertHistory(rows: any[]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseAdmin().from("sla_history").insert(rows);
  if (error) throw new Error(`Supabase insert sla_history falhou: ${error.message}`);
}

export async function GET(req: NextRequest) {
  // Protege cron/manual
  const secret = process.env.CRON_SECRET;
  const got = new URL(req.url).searchParams.get("secret") || req.headers.get("x-cron-secret");
  if (secret && got !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const envs = getInstanceEnvs();

  const results: any[] = [];
  for (const env of envs) {
    const prev = await loadExisting(env.instance);
    const fetched = await fetchTicketsForInstance(env);

    const nowIso = new Date().toISOString();

    const prepared = fetched.map((t) => {
      const first = computeSlaPercent({
        startISO: t.date_opening,
        endISO: t.date_takeaccount ?? null, // se não atendido, null => agora
        allowedSeconds: t.internal_time_to_own,
        waitingSeconds: 0,
      });

      const resolve = computeSlaPercent({
        startISO: t.date_opening,
        endISO: t.date_solve ?? null,
        allowedSeconds: t.internal_time_to_resolve,
        waitingSeconds: t.waiting_duration ?? 0,
      });

      const old = prev.get(t.glpi_id);

      const row = {
        glpi_id: t.glpi_id,
        instance: t.instance,
        title: t.title,
        content: t.content,
        status: t.status,
        entity: t.entity,
        category: t.category,
        technician: t.technician,
        date_opening: t.date_opening,
        date_takeaccount: t.date_takeaccount,
        date_solve: t.date_solve,
        date_close: t.date_close,
        internal_time_to_own: t.internal_time_to_own,
        internal_time_to_resolve: t.internal_time_to_resolve,
        sla_percentage_first: first.percent,
        sla_percentage_resolve: resolve.percent,
        is_overdue_first: first.overdue,
        is_overdue_resolve: resolve.overdue,
        created_at: old?.created_at ?? nowIso,
        updated_at: nowIso,
      };

      // History: cruzou threshold
      const hist: any[] = [];

      if (old) {
        const oldF = old.sla_percentage_first;
        const newF = row.sla_percentage_first;
        if ((oldF == null || oldF < ALERT_THRESHOLD) && (newF != null && newF >= ALERT_THRESHOLD)) {
          hist.push({
            ticket_glpi_id: t.glpi_id,
            instance: t.instance,
            sla_type: "FIRST",
            old_percentage: oldF,
            new_percentage: newF,
            alert_threshold: ALERT_THRESHOLD,
          });
        }

        const oldR = old.sla_percentage_resolve;
        const newR = row.sla_percentage_resolve;
        if ((oldR == null || oldR < ALERT_THRESHOLD) && (newR != null && newR >= ALERT_THRESHOLD)) {
          hist.push({
            ticket_glpi_id: t.glpi_id,
            instance: t.instance,
            sla_type: "RESOLVE",
            old_percentage: oldR,
            new_percentage: newR,
            alert_threshold: ALERT_THRESHOLD,
          });
        }
      }

      return { row, hist };
    });

    await upsertTickets(prepared.map((x) => x.row));
    await insertHistory(prepared.flatMap((x) => x.hist));

    results.push({ instance: env.instance, count: prepared.length });
  }

  return NextResponse.json({ ok: true, results });
}
