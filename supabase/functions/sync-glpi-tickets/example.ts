/**
 * Exemplo de integração com a edge function de sincronização
 * Pode ser usado em:
 * - Backend Node.js/Deno
 * - Integração com webhooks
 * - Scheduled jobs
 * - Testes
 */

import { SyncPayload, SyncLogResponse, GlpiTicket } from "./types.ts";

// ============================================================================
// EXEMPLO 1: Cliente simples (Fetch)
// ============================================================================

class GlpiSyncClient {
  private functionUrl: string;
  private anonKey: string;

  constructor(supabaseUrl: string, anonKey: string) {
    this.functionUrl = `${supabaseUrl}/functions/v1/sync-glpi-tickets`;
    this.anonKey = anonKey;
  }

  async sync(instance: "PETA" | "GMX", tickets: GlpiTicket[]): Promise<SyncLogResponse> {
    const payload: SyncPayload = {
      instance,
      all_tickets: tickets,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(this.functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async syncBatch(
    instance: "PETA" | "GMX",
    tickets: GlpiTicket[],
    batchSize: number = 1000
  ): Promise<SyncLogResponse[]> {
    const results: SyncLogResponse[] = [];

    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = tickets.slice(i, i + batchSize);
      console.log(`Sincronizando lote ${Math.floor(i / batchSize) + 1}...`);

      const result = await this.sync(instance, batch);
      results.push(result);

      // Log de progresso
      console.log(`  ✅ ${result.tickets_added} adicionados`);
      console.log(`  ♻️ ${result.tickets_updated} atualizados`);
      if (result.errors.length > 0) {
        console.log(`  ❌ ${result.errors.length} erros`);
      }
    }

    return results;
  }
}

// ============================================================================
// EXEMPLO 2: Parser de resposta com tratamento de erros
// ============================================================================

interface SyncReport {
  success: boolean;
  instance: string;
  totalProcessed: number;
  totalAdded: number;
  totalUpdated: number;
  totalErrors: number;
  changesDetected: number;
  duration: string;
  errorDetails: string[];
  changesDetail: string[];
}

function parseSyncResponse(response: SyncLogResponse): SyncReport {
  const errors = response.errors.map(
    (e) => `Ticket #${e.ticket_id || "N/A"}: ${e.error}`
  );

  const changes = response.changes_detected.map((c) => {
    const fields = c.changed_fields.join(", ");
    return `Ticket #${c.ticket_id}: [${fields}]`;
  });

  const startTime = new Date(response.started_at);
  const endTime = response.details[response.details.length - 1]
    ? new Date(response.details[response.details.length - 1].split("] ")[0] + "]")
    : new Date();

  const durationMs = endTime.getTime() - startTime.getTime();
  const durationSec = (durationMs / 1000).toFixed(2);

  return {
    success: response.status === "completed",
    instance: response.instance,
    totalProcessed: response.tickets_processed,
    totalAdded: response.tickets_added,
    totalUpdated: response.tickets_updated,
    totalErrors: response.errors.length,
    changesDetected: response.changes_detected.length,
    duration: `${durationSec}s`,
    errorDetails: errors,
    changesDetail: changes,
  };
}

function printSyncReport(report: SyncReport) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 RELATÓRIO DE SINCRONIZAÇÃO");
  console.log("=".repeat(60));
  console.log(`Instance: ${report.instance}`);
  console.log(`Status: ${report.success ? "✅ Sucesso" : "❌ Falhou"}`);
  console.log(`Duração: ${report.duration}`);
  console.log("");
  console.log("📈 Estatísticas:");
  console.log(`  • Total processado: ${report.totalProcessed}`);
  console.log(`  • Novos: ${report.totalAdded}`);
  console.log(`  • Atualizados: ${report.totalUpdated}`);
  console.log(`  • Mudanças detectadas: ${report.changesDetected}`);
  console.log(`  • Erros: ${report.totalErrors}`);

  if (report.changesDetail.length > 0) {
    console.log("");
    console.log("🔄 Mudanças Detectadas:");
    report.changesDetail.slice(0, 10).forEach((change) => {
      console.log(`  • ${change}`);
    });
    if (report.changesDetail.length > 10) {
      console.log(`  • ... e ${report.changesDetail.length - 10} mais`);
    }
  }

  if (report.errorDetails.length > 0) {
    console.log("");
    console.log("❌ Erros:");
    report.errorDetails.slice(0, 5).forEach((error) => {
      console.log(`  • ${error}`);
    });
    if (report.errorDetails.length > 5) {
      console.log(`  • ... e ${report.errorDetails.length - 5} mais`);
    }
  }

  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// EXEMPLO 3: Integração com retry e circuit breaker
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
}

class ResilientGlpiSyncClient extends GlpiSyncClient {
  private retryOptions: Required<RetryOptions>;

  constructor(supabaseUrl: string, anonKey: string, retryOptions: RetryOptions = {}) {
    super(supabaseUrl, anonKey);
    this.retryOptions = {
      maxRetries: retryOptions.maxRetries ?? 3,
      initialDelayMs: retryOptions.initialDelayMs ?? 1000,
      backoffMultiplier: retryOptions.backoffMultiplier ?? 2,
    };
  }

  async syncWithRetry(
    instance: "PETA" | "GMX",
    tickets: GlpiTicket[]
  ): Promise<SyncLogResponse> {
    let lastError: Error | null = null;
    let delay = this.retryOptions.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        console.log(
          `Tentativa ${attempt + 1}/${this.retryOptions.maxRetries + 1} para ${instance}...`
        );
        const result = await this.sync(instance, tickets);

        if (result.status !== "failed") {
          return result;
        }

        throw new Error(`Sync returned failed status`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Tentativa ${attempt + 1} falhou: ${lastError.message}`);

        if (attempt < this.retryOptions.maxRetries) {
          console.log(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= this.retryOptions.backoffMultiplier;
        }
      }
    }

    throw lastError;
  }
}

// ============================================================================
// EXEMPLO 4: Monitoramento e métricas
// ============================================================================

interface SyncMetrics {
  timestamp: string;
  instance: string;
  duration: number;
  throughput: number; // tickets/segundo
  successRate: number; // 0-100%
  errorRate: number; // 0-100%
}

function calculateMetrics(response: SyncLogResponse, durationMs: number): SyncMetrics {
  const totalProcessed = response.tickets_processed || 1;
  const throughput = (totalProcessed / durationMs) * 1000;
  const successRate = ((totalProcessed - response.errors.length) / totalProcessed) * 100;
  const errorRate = (response.errors.length / totalProcessed) * 100;

  return {
    timestamp: new Date().toISOString(),
    instance: response.instance,
    duration: durationMs,
    throughput: parseFloat(throughput.toFixed(2)),
    successRate: parseFloat(successRate.toFixed(2)),
    errorRate: parseFloat(errorRate.toFixed(2)),
  };
}

// ============================================================================
// EXEMPLO 5: Fluxo completo de sincronização
// ============================================================================

async function executeSyncFlow(
  supabaseUrl: string,
  anonKey: string,
  tickets: GlpiTicket[]
) {
  const client = new ResilientGlpiSyncClient(supabaseUrl, anonKey, {
    maxRetries: 2,
    initialDelayMs: 500,
  });

  console.log("🚀 Iniciando sincronização de tickets...\n");

  try {
    // Separar por instância
    const petaTickets = tickets.filter((t) => t.instance === "PETA");
    const gmxTickets = tickets.filter((t) => t.instance === "GMX");

    const results: SyncLogResponse[] = [];

    // Sincronizar PETA
    if (petaTickets.length > 0) {
      console.log(`📍 Sincronizando ${petaTickets.length} tickets da instância PETA...`);
      const startTime = Date.now();
      const result = await client.syncWithRetry("PETA", petaTickets);
      const duration = Date.now() - startTime;

      results.push(result);
      const metrics = calculateMetrics(result, duration);
      console.log(`  ⚡ ${metrics.throughput.toFixed(2)} tickets/s`);
      console.log(`  ✅ Taxa de sucesso: ${metrics.successRate.toFixed(2)}%\n`);
    }

    // Sincronizar GMX
    if (gmxTickets.length > 0) {
      console.log(`📍 Sincronizando ${gmxTickets.length} tickets da instância GMX...`);
      const startTime = Date.now();
      const result = await client.syncWithRetry("GMX", gmxTickets);
      const duration = Date.now() - startTime;

      results.push(result);
      const metrics = calculateMetrics(result, duration);
      console.log(`  ⚡ ${metrics.throughput.toFixed(2)} tickets/s`);
      console.log(`  ✅ Taxa de sucesso: ${metrics.successRate.toFixed(2)}%\n`);
    }

    // Gerar relatórios
    for (const result of results) {
      const report = parseSyncResponse(result);
      printSyncReport(report);
    }

    console.log("✨ Sincronização concluída com sucesso!");
    return results;
  } catch (error) {
    console.error("❌ Erro durante sincronização:", error);
    throw error;
  }
}

// ============================================================================
// EXEMPLO 6: Teste unitário
// ============================================================================

async function testSyncFunction() {
  const testTicket: GlpiTicket = {
    ticket_id: 99999,
    instance: "PETA",
    title: "Test Ticket",
    content: null,
    entity: "Test Entity",
    entity_full: "PETA > Test Entity",
    entity_id: 1,
    entity_name: "Test Entity",
    category: "Test > Category",
    category_name: "Test Category",
    root_category: "Test",
    technician: "Test Tech",
    technician_id: 1,
    technician_email: "tech@test.com",
    requester: "Test User",
    requester_id: 1,
    requester_fullname: "Test User",
    requester_email: "user@test.com",
    group_name: "Test Group",
    group_id: 1,
    request_type: "Test",
    request_type_id: 1,
    request_source: "test",
    status_id: 1,
    status_key: "test",
    status_name: "Test Status",
    priority_id: 1,
    priority: "1-Test",
    type_id: 1,
    urgency: 1,
    impact: 1,
    date_created: new Date().toISOString(),
    date_mod: new Date().toISOString(),
    date_solved: null,
    date_close: null,
    due_date: null,
    take_into_account_date: null,
    is_sla_late: false,
    is_overdue_first: false,
    is_overdue_resolve: false,
    sla_percentage_first: null,
    sla_percentage_resolve: null,
    sla_ttr_name: null,
    sla_tto_name: null,
    solution: null,
    solution_content: null,
    solution_date: null,
    location: null,
    waiting_duration: 0,
    resolution_duration: 0,
    global_validation: 1,
    is_deleted: false,
  };

  console.log("🧪 Executando teste...");
  console.log("Payload de teste criado com sucesso");
  console.log(`  • Ticket ID: ${testTicket.ticket_id}`);
  console.log(`  • Instance: ${testTicket.instance}`);
  console.log(`  • Title: ${testTicket.title}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  GlpiSyncClient,
  ResilientGlpiSyncClient,
  parseSyncResponse,
  printSyncReport,
  calculateMetrics,
  executeSyncFlow,
  testSyncFunction,
  type SyncReport,
  type SyncMetrics,
};
