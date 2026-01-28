import { GlpiTicket } from "@/types/glpi";

type HlConfig = {
  instance: "PETA" | "GMX";
  glpiUrl: string; // ex: https://glpi.exemplo.com.br
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

async function httpJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`GLPI HL HTTP ${res.status}: ${text?.slice(0, 500)}`);
  return json;
}

export class GlpiHLClient {
  private cfg: HlConfig;
  private accessToken: string | null = null;

  constructor(cfg: HlConfig) {
    this.cfg = cfg;
  }

  async authenticate() {
    // Token endpoint padrão: /api.php/token
    const url = `${this.cfg.glpiUrl}/api.php/token`;

    const body = new URLSearchParams();
    body.set("grant_type", "password");
    body.set("client_id", this.cfg.clientId);
    body.set("client_secret", this.cfg.clientSecret);
    body.set("username", this.cfg.username);
    body.set("password", this.cfg.password);
    body.set("scope", "api");

    const json = await httpJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    this.accessToken = json?.access_token ?? null;
    if (!this.accessToken) throw new Error("OAuth2 não retornou access_token");
  }

  private headers() {
    if (!this.accessToken) throw new Error("HL client não autenticado");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  async fetchActiveTickets(): Promise<GlpiTicket[]> {
    // Endpoints HL normalmente: /api.php/Assistance/Ticket
    // Como a paginação/filters podem variar por versão, fazemos um fetch simples e filtramos status.
    const url = `${this.cfg.glpiUrl}/api.php/Assistance/Ticket`;

    const json = await httpJson(url, { method: "GET", headers: this.headers() });

    const rows: any[] =
      Array.isArray(json) ? json :
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.items) ? json.items :
      [];

    const activeStatuses = new Set([1, 2, 3, 4]);

    return rows
      .filter((r) => activeStatuses.has(Number(r?.status)))
      .map((r) => ({
        glpi_id: Number(r?.id),
        instance: this.cfg.instance,

        title: r?.name ?? null,
        content: r?.content ?? null,
        status: r?.status != null ? Number(r.status) : null,

        entity: r?.entity?.name ?? r?.entity ?? null,
        category: r?.category?.completename ?? r?.category ?? null,
        technician: r?.team?.tech?.[0]?.name ?? null,

        date_opening: r?.date ?? null,
        date_takeaccount: r?.takeintoaccountdate ?? null,
        date_solve: r?.solvedate ?? null,
        date_close: r?.closedate ?? null,

        internal_time_to_own: r?.internal_time_to_own ?? null,
        internal_time_to_resolve: r?.internal_time_to_resolve ?? null,
        waiting_duration: r?.waiting_duration ?? null,

        sla_percentage_first: null,
        sla_percentage_resolve: null,
        is_overdue_first: null,
        is_overdue_resolve: null,
      }));
  }
}