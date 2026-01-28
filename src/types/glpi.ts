export type GlpiInstance = "PETA" | "GMX";

export type GlpiTicket = {
  glpi_id: number;
  instance: GlpiInstance;

  title: string | null;
  content: string | null;
  status: number | null;

  entity: string | null;
  category: string | null;
  technician: string | null;

  date_opening: string | null;
  date_takeaccount: string | null;
  date_solve: string | null;
  date_close: string | null;

  internal_time_to_own: number | null;     // segundos
  internal_time_to_resolve: number | null; // segundos
  waiting_duration?: number | null;        // segundos (se vier)

  sla_percentage_first: number | null;
  sla_percentage_resolve: number | null;
  is_overdue_first: boolean | null;
  is_overdue_resolve: boolean | null;
};

// Legacy alias for compatibility
export type Instance = GlpiInstance;
export interface Ticket extends Omit<GlpiTicket, 'title' | 'content' | 'status' | 'date_opening' | 'date_takeaccount' | 'date_solve' | 'date_close' | 'internal_time_to_own' | 'internal_time_to_resolve'> {
  title: string
  content?: string
  status?: number
  date_opening: string
  date_takeaccount?: string
  date_solve?: string
  date_close?: string
  internal_time_to_own?: number
  internal_time_to_resolve?: number
}
