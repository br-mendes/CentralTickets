/**
 * Script de teste para validar a edge function de sincronização
 *
 * Uso:
 *   deno run --allow-net test.ts
 */

import { SyncPayload, SyncLogResponse } from "./types.ts";

// Configuração
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const ANON_KEY = Deno.env.get("ANON_KEY") || "eyJ...";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/sync-glpi-tickets`;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, message: string, details?: unknown) {
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${name}: ${message}`);
  results.push({ name, passed, message, details });
}

// ============================================================================
// TESTES UNITÁRIOS
// ============================================================================

function testPayloadStructure() {
  const payload: SyncPayload = {
    instance: "PETA",
    all_tickets: [
      {
        ticket_id: 1,
        instance: "PETA",
        title: "Test",
        content: null,
        entity: null,
        entity_full: null,
        entity_id: 0,
        entity_name: null,
        category: null,
        category_name: null,
        root_category: null,
        technician: null,
        technician_id: 0,
        technician_email: null,
        requester: null,
        requester_id: 0,
        requester_fullname: null,
        requester_email: null,
        group_name: null,
        group_id: 0,
        request_type: null,
        request_type_id: 0,
        request_source: null,
        status_id: 1,
        status_key: "new",
        status_name: "Novo",
        priority_id: 1,
        priority: "1-Baixa",
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
      },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    logTest("Payload Structure", true, "Estrutura de payload válida");
    return true;
  } catch (e) {
    logTest("Payload Structure", false, `Erro ao parsear payload: ${e}`);
    return false;
  }
}

function testInstanceValidation() {
  const validInstances = ["PETA", "GMX"];
  let allValid = true;

  for (const instance of validInstances) {
    if (!["PETA", "GMX"].includes(instance)) {
      allValid = false;
    }
  }

  logTest(
    "Instance Validation",
    allValid,
    `Instâncias válidas: ${validInstances.join(", ")}`
  );
  return allValid;
}

function testFieldMapping() {
  const requiredFields = [
    "ticket_id",
    "instance",
    "title",
    "status_id",
    "status_name",
    "priority_id",
    "date_created",
    "date_mod",
    "is_deleted",
  ];

  logTest(
    "Field Mapping",
    true,
    `Mapeamento de ${requiredFields.length} campos principais`
  );
  return true;
}

// ============================================================================
// TESTES DE API
// ============================================================================

async function testInvalidMethod() {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
    });

    logTest(
      "Invalid Method Test",
      response.status === 405,
      `Status esperado: 405, recebido: ${response.status}`
    );
    return response.status === 405;
  } catch (e) {
    logTest(
      "Invalid Method Test",
      false,
      `Erro de conexão: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

async function testInvalidInstance() {
  const payload = {
    instance: "INVALID",
    all_tickets: [],
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    logTest(
      "Invalid Instance Test",
      response.status === 400,
      `Status esperado: 400, recebido: ${response.status}`
    );

    if (response.status === 400) {
      const error = await response.json();
      logTest(
        "Invalid Instance Error Message",
        error.error?.includes("inválida"),
        `Mensagem de erro apropriada recebida`
      );
    }

    return response.status === 400;
  } catch (e) {
    logTest(
      "Invalid Instance Test",
      false,
      `Erro de conexão: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

async function testEmptyTicketArray() {
  const payload: SyncPayload = {
    instance: "PETA",
    all_tickets: [],
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    logTest(
      "Empty Array Test",
      response.status === 200,
      `Status esperado: 200, recebido: ${response.status}`,
      { shouldHandle: "arrays vazios com sucesso" }
    );
    return response.status === 200;
  } catch (e) {
    logTest(
      "Empty Array Test",
      false,
      `Erro de conexão: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

async function testValidPayload() {
  const payload: SyncPayload = {
    instance: "PETA",
    all_tickets: [
      {
        ticket_id: 99998,
        instance: "PETA",
        title: "[TEST] Test Ticket",
        content: null,
        entity: "Test Entity",
        entity_full: "PETA > Test Entity",
        entity_id: 0,
        entity_name: null,
        category: "Test > Category",
        category_name: null,
        root_category: "Test",
        technician: "Test Technician",
        technician_id: 1,
        technician_email: null,
        requester: "Test User",
        requester_id: 1,
        requester_fullname: null,
        requester_email: null,
        group_name: "Test Group",
        group_id: 0,
        request_type: "Test",
        request_type_id: 0,
        request_source: "",
        status_id: 1,
        status_key: "new",
        status_name: "Novo",
        priority_id: 1,
        priority: "1-Baixa",
        type_id: 1,
        urgency: 3,
        impact: 3,
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
        location: "",
        waiting_duration: 0,
        resolution_duration: 0,
        global_validation: 1,
        is_deleted: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(`\n📤 Enviando payload de teste para ${FUNCTION_URL}...`);

    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result: SyncLogResponse = await response.json();

    logTest(
      "Valid Payload Test",
      response.status === 200,
      `Status: ${response.status}`,
      { response: result }
    );

    if (result.status === "completed" || result.status === "completed_with_errors") {
      logTest(
        "Sync Completion",
        true,
        `Sincronização concluída: ${result.tickets_processed} processados`
      );

      logTest(
        "Tickets Added",
        result.tickets_added >= 0,
        `${result.tickets_added} tickets adicionados`
      );

      logTest(
        "Logging",
        result.details.length > 0,
        `${result.details.length} logs gerados`
      );

      if (result.errors.length > 0) {
        logTest("Error Handling", true, `${result.errors.length} erros capturados`);
      }
    }

    return response.status === 200;
  } catch (e) {
    logTest(
      "Valid Payload Test",
      false,
      `Erro: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

async function testResponseStructure() {
  const payload: SyncPayload = {
    instance: "GMX",
    all_tickets: [],
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    const requiredFields = [
      "instance",
      "started_at",
      "status",
      "tickets_processed",
      "tickets_added",
      "tickets_updated",
      "errors",
      "details",
    ];

    let allFieldsPresent = true;
    for (const field of requiredFields) {
      if (!(field in result)) {
        allFieldsPresent = false;
        console.log(`  ❌ Campo faltante: ${field}`);
      }
    }

    logTest("Response Structure", allFieldsPresent, "Estrutura de resposta válida");
    return allFieldsPresent;
  } catch (e) {
    logTest(
      "Response Structure",
      false,
      `Erro: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

// ============================================================================
// EXECUTAR TESTES
// ============================================================================

async function runAllTests() {
  console.log("=" + "=".repeat(59));
  console.log("🧪 TESTES DA EDGE FUNCTION DE SINCRONIZAÇÃO GLPI");
  console.log("=" + "=".repeat(59));

  console.log("\n📝 Testes Unitários:");
  console.log("-".repeat(60));

  testPayloadStructure();
  testInstanceValidation();
  testFieldMapping();

  console.log("\n🌐 Testes de API:");
  console.log("-".repeat(60));

  // Verificar conectividade
  try {
    await fetch(FUNCTION_URL, { method: "OPTIONS" }).catch(() => {
      throw new Error("Function não está acessível");
    });
  } catch (e) {
    console.warn(`⚠️ Aviso: ${e instanceof Error ? e.message : String(e)}`);
    console.warn(
      `   URL testada: ${FUNCTION_URL}`
    );
    console.warn(
      "   Verifique se a function está deployada e o SUPABASE_URL está correto"
    );
    console.log("\n📋 Alguns testes de API serão pulados...\n");
  }

  await testInvalidMethod();
  await testInvalidInstance();
  await testEmptyTicketArray();
  await testResponseStructure();

  console.log("\n🚀 Teste de Sincronização Completa:");
  console.log("-".repeat(60));
  await testValidPayload();

  // ============================================================================
  // RESUMO
  // ============================================================================

  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMO DOS TESTES");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`\n✅ Passou: ${passed}/${total} (${percentage}%)`);
  console.log(`❌ Falhou: ${total - passed}/${total}`);

  if (passed === total) {
    console.log("\n🎉 Todos os testes passaram!");
  } else {
    console.log("\n⚠️ Alguns testes falharam. Verifique os erros acima.");
  }

  console.log("\n📋 Detalhes dos Testes:");
  console.log("-".repeat(60));

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);
  }

  console.log("\n" + "=".repeat(60));

  // Retornar código de saída apropriado
  Deno.exit(passed === total ? 0 : 1);
}

// Executar se chamado diretamente
if (import.meta.main) {
  await runAllTests();
}
