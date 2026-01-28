import { GlpiTicket } from "@/types/glpi";

type LegacyConfig = {
  instance: "PETA" | "GMX";
  apiBase: string;  // ex: https://.../glpi/apirest.php
  appToken: string;
  userToken?: string;
  username?: string;
  password?: string;
};

type InitSessionResponse =
  | { session_token: string }
  | { session_token: string; glpiID?: string }
  | any;

async function httpJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`GLPI HTTP ${res.status} ${res.statusText}: ${text?.slice(0, 500)}`);
  }
  return json;
}

export class GlpiLegacyClient {
  private cfg: LegacyConfig;
  private sessionToken: string | null = null;

  constructor(cfg: LegacyConfig) {
    this.cfg = cfg;
  }

  private headers(extra?: Record<string, string>) {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "App-Token": this.cfg.appToken,
      ...extra,
    };
    if (this.sessionToken) h["Session-Token"] = this.sessionToken;
    return h;
  }

  async initSession() {
    const url = `${this.cfg.apiBase}/initSession`;

    // Prefer user_token
    if (this.cfg.userToken) {
      const json: InitSessionResponse = await httpJson(url, {
        method: "GET",
        headers: this.headers({
          Authorization: `user_token ${this.cfg.userToken}`,
        }),
      });
      this.sessionToken = json?.session_token ?? json?.sessionToken ?? null;
      if (!this.sessionToken) throw new Error("initSession: não retornou session_token");
      return;
    }

    // Fallback basic auth
    if (this.cfg.username && this.cfg.password) {
      const basic = Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString("base64");
      const json: InitSessionResponse = await httpJson(url, {
        method: "GET",
        headers: this.headers({
          Authorization: `Basic ${basic}`,
        }),
      });
      this.sessionToken = json?.session_token ?? json?.sessionToken ?? null;
      if (!this.sessionToken) throw new Error("initSession: não retornou session_token");
      return;
    }

    throw new Error("Sem userToken e sem username/password para initSession");
  }

  async killSession() {
    if (!this.sessionToken) return;
    try {
      await httpJson(`${this.cfg.apiBase}/killSession`, {
        method: "GET",
        headers: this.headers(),
      });
    } finally {
      this.sessionToken = null;
    }
  }

  /**
   * Busca tickets via /search/Ticket (mais eficiente pra filtrar ativos),
   * usando listSearchOptions pra achar IDs por table/field (estável).
   */
  async fetchActiveTickets(): Promise<GlpiTicket[]> {
    // 1) mapear search options
    const options = await httpJson(`${this.cfg.apiBase}/listSearchOptions/Ticket`, {
      method: "GET",
      headers: this.headers(),
    });

    const findOpt = (table: string, field: string) => {
      for (const [k, v] of Object.entries<any>(options ?? {})) {
        if (v?.table === table && v?.field === field) return Number(k);
      }
      return null;
    };

    const F = {
      id: findOpt("glpi_tickets", "id"),
      name: findOpt("glpi_tickets", "name"),
      content: findOpt("glpi_tickets", "content"),
      status: findOpt("glpi_tickets", "status"),
      date: findOpt("glpi_tickets", "date"),
      take: findOpt("glpi_tickets", "takeintoaccountdate"),
      solve: findOpt("glpi_tickets", "solvedate"),
      close: findOpt("glpi_tickets", "closedate"),
      tto: findOpt("glpi_tickets", "internal_time_to_own"),
      ttr: findOpt("glpi_tickets", "internal_time_to_resolve"),
      waiting: findOpt("glpi_tickets", "waiting_duration"),
      entityName:
        findOpt("glpi_entities", "completename") ??
        findOpt("glpi_entities", "name"),
      catName:
        findOpt("glpi_itilcategories", "completename") ??
        findOpt("glpi_itilcategories", "name"),
    };

    if (!F.id || !F.name || !F.status || !F.date) {
      throw new Error("Não consegui identificar campos essenciais via listSearchOptions/Ticket");
    }

    // 2) montar query de search
    // Status ativos: 1=new,2=assigned,3=planned,4=waiting (ajuste se quiser)
    const activeStatuses = [1, 2, 3, 4];

    const params = new URLSearchParams();
    // forcedisplay
    Object.values(F).forEach((v) => {
      if (typeof v === "number") params.append("forcedisplay[]", String(v));
    });

    // criteria: status in (1,2,3,4) usando OR
    activeStatuses.forEach((st, i) => {
      params.set(`criteria[${i}][field]`, String(F.status));
      params.set(`criteria[${i}][searchtype]`, "equals");
      params.set(`criteria[${i}][value]`, String(st));
      if (i > 0) params.set(`criteria[${i}][link]`, "OR");
    });

    // paginação: range (0-199, 200-399, ...)
    const allRows: any[] = [];
    const pageSize = 200;
    for (let start = 0; start < 2000; start += pageSize) {
      const end = start + pageSize - 1;
      const url = `${this.cfg.apiBase}/search/Ticket?${params.toString()}&range=${start}-${end}`;

      const json = await httpJson(url, {
        method: "GET",
        headers: this.headers(),
      });

      const rows = json?.data ?? json ?? [];
      if (!Array.isArray(rows) || rows.length === 0) break;
      allRows.push(...rows);

      if (rows.length < pageSize) break;
    }

    // 3) transformar em tickets
    const tickets: GlpiTicket[] = allRows.map((r: any) => {
      const get = (fieldId: number | null) => (fieldId ? r?.[String(fieldId)] ?? r?.[fieldId] : null);

      const glpi_id = Number(get(F.id));
      return {
        glpi_id,
        instance: this.cfg.instance,

        title: (get(F.name) ?? null) as any,
        content: (get(F.content) ?? null) as any,
        status: (get(F.status) != null ? Number(get(F.status)) : null),

        entity: (get(F.entityName) ?? null) as any,
        category: (get(F.catName) ?? null) as any,
        technician: null, // preencher depois

        date_opening: (get(F.date) ?? null) as any,
        date_takeaccount: (get(F.take) ?? null) as any,
        date_solve: (get(F.solve) ?? null) as any,
        date_close: (get(F.close) ?? null) as any,

        internal_time_to_own: (get(F.tto) != null ? Number(get(F.tto)) : null),
        internal_time_to_resolve: (get(F.ttr) != null ? Number(get(F.ttr)) : null),
        waiting_duration: (get(F.waiting) != null ? Number(get(F.waiting)) : null),

        sla_percentage_first: null,
        sla_percentage_resolve: null,
        is_overdue_first: null,
        is_overdue_resolve: null,
      };
    });

    // 4) buscar técnicos (Ticket_User type=2) e cache de User
    const userCache = new Map<number, string>();

    for (const t of tickets) {
      try {
        const rel = await httpJson(`${this.cfg.apiBase}/Ticket/${t.glpi_id}/Ticket_User`, {
          method: "GET",
          headers: this.headers(),
        });

        const arr = Array.isArray(rel) ? rel : rel?.data ?? [];
        const tech = arr.find((x: any) => Number(x?.type) === 2);
        const uid = tech?.users_id ? Number(tech.users_id) : null;
        if (!uid) continue;

        if (!userCache.has(uid)) {
          const u = await httpJson(`${this.cfg.apiBase}/User/${uid}`, {
            method: "GET",
            headers: this.headers({ "Accept": "application/json" }),
          });
          userCache.set(uid, u?.name ?? u?.realname ?? `user_${uid}`);
        }
        t.technician = userCache.get(uid) ?? null;
      } catch {
        // sem técnico ou endpoint indisponível – ignora
      }
    }

    return tickets;
  }
}