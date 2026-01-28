import { statusLabel, isAlert } from "@/lib/utils";

type Ticket = {
  id: number;
  glpi_id: number;
  instance: "PETA" | "GMX";
  title: string | null;
  status: number | null;
  entity: string | null;
  category: string | null;
  technician: string | null;
  date_opening: string | null;
  sla_percentage_first: number | null;
  sla_percentage_resolve: number | null;
  is_overdue_first: boolean | null;
  is_overdue_resolve: boolean | null;
};

async function loadTickets(): Promise<Ticket[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/tickets`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return [];
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return [];
    }
    const json = await res.json();
    return json?.data ?? [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const tickets = await loadTickets();
  const threshold = 70;

  const alertCount = tickets.filter((t) =>
    isAlert(t.sla_percentage_first, t.sla_percentage_resolve, threshold)
  ).length;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Central de Tickets</h1>
      <p style={{ marginTop: 6, color: "#555" }}>
        Tickets ativos (PETA + GMX). Alerta vermelho quando SLA ≥ {threshold}%.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{tickets.length}</div>
        </div>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Em alerta</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{alertCount}</div>
        </div>
      </div>

      <div style={{ marginTop: 18, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#fafafa" }}>
            <tr>
              {["Instância", "Ticket", "Título", "Status", "Responsável", "Entidade", "Categoria", "SLA 1ª", "SLA Solução"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, padding: 10, borderBottom: "1px solid #eee" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const alert = isAlert(t.sla_percentage_first, t.sla_percentage_resolve, threshold);
              return (
                <tr key={t.id} style={{ background: alert ? "#fff1f2" : "white" }}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", fontWeight: 600 }}>
                    {t.instance}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    #{t.glpi_id}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {t.title ?? "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {statusLabel(t.status)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {t.technician ?? "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {t.entity ?? "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {t.category ?? "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", color: (t.sla_percentage_first ?? 0) >= threshold ? "#b91c1c" : undefined, fontWeight: (t.sla_percentage_first ?? 0) >= threshold ? 700 : 400 }}>
                    {t.sla_percentage_first != null ? `${t.sla_percentage_first.toFixed(2)}%` : "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", color: (t.sla_percentage_resolve ?? 0) >= threshold ? "#b91c1c" : undefined, fontWeight: (t.sla_percentage_resolve ?? 0) >= threshold ? 700 : 400 }}>
                    {t.sla_percentage_resolve != null ? `${t.sla_percentage_resolve.toFixed(2)}%` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        Sync: chame <code>/api/cron/sync?secret=...</code> para atualizar o cache.
      </p>
    </main>
  );
}
