/**
 * Tipos para sincronização de tickets GLPI
 */

export interface GlpiTicket {
  ticket_id: number;
  instance: "PETA" | "GMX";
  title: string;
  content: string | null;
  entity: string | null;
  entity_full: string | null;
  entity_id: number;
  entity_name: string | null;
  category: string | null;
  category_name: string | null;
  root_category: string | null;
  technician: string | null;
  technician_id: number;
  technician_email: string | null;
  requester: string | null;
  requester_id: number;
  requester_fullname: string | null;
  requester_email: string | null;
  group_name: string | null;
  group_id: number;
  request_type: string | null;
  request_type_id: number;
  request_source: string | null;
  status_id: number;
  status_key: string | null;
  status_name: string | null;
  priority_id: number;
  priority: string | null;
  type_id: number;
  urgency: number;
  impact: number;
  date_created: string | null;
  date_mod: string | null;
  date_solved: string | null;
  date_close: string | null;
  due_date: string | null;
  take_into_account_date: string | null;
  is_sla_late: boolean;
  is_overdue_first: boolean;
  is_overdue_resolve: boolean;
  sla_percentage_first: number | null;
  sla_percentage_resolve: number | null;
  sla_ttr_name: string | null;
  sla_tto_name: string | null;
  solution: string | null;
  solution_content: string | null;
  solution_date: string | null;
  location: string | null;
  waiting_duration: number;
  resolution_duration: number;
  global_validation: number;
  is_deleted: boolean;
}

export interface SyncPayload {
  instance: "PETA" | "GMX";
  all_tickets: GlpiTicket[];
  timestamp: string;
}

export interface ChangeDetected {
  ticket_id: number;
  changed_fields: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
}

export interface SyncError {
  ticket_id?: number;
  field?: string;
  error: string;
}

export interface SyncLogResponse {
  instance: string;
  started_at: string;
  status: "running" | "completed" | "completed_with_errors" | "failed";
  tickets_processed: number;
  tickets_added: number;
  tickets_updated: number;
  tickets_removed: number;
  changes_detected: ChangeDetected[];
  errors: SyncError[];
  details: string[];
}

export interface TicketCacheRecord {
  ticket_id: number;
  instance: string;
  title: string | null;
  entity: string | null;
  entity_full: string | null;
  entity_id: number;
  entity_name: string | null;
  category: string | null;
  category_name: string | null;
  root_category: string | null;
  status_id: number | null;
  status_key: string | null;
  status_name: string | null;
  group_name: string | null;
  group_id: number;
  date_created: string | null;
  date_mod: string | null;
  due_date: string | null;
  is_sla_late: boolean;
  sla_percentage_first: number | null;
  sla_percentage_resolve: number | null;
  raw_data: unknown;
  last_sync: string;
  technician: string | null;
  technician_id: number;
  priority_id: number;
  priority: string | null;
  urgency: number;
  type_id: number;
  solution: string | null;
  content: string | null;
  requester: string | null;
  requester_id: number;
  impact: number;
  date_close: string | null;
  is_overdue_first: boolean;
  is_overdue_resolve: boolean;
  request_type: string | null;
  request_type_id: number;
  is_deleted: boolean;
}

export interface SyncControl {
  instance: string;
  last_sync: string;
  status: string;
  tickets_count: number;
  error_message: string | null;
  updated_at: string;
}
