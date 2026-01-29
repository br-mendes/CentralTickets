import { statusLabel, isAlert } from "@/lib/utils";
import { ManualSyncButton } from "@/components/manual-sync-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AutoRefreshStatus } from "@/components/auto-refresh";

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
  updated_at: string | null;
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
  const refreshIntervalSeconds = 60;

  const alertCount = tickets.filter((t) =>
    isAlert(t.sla_percentage_first, t.sla_percentage_resolve, threshold)
  ).length;
  const totalPeta = tickets.filter((t) => t.instance === "PETA").length;
  const totalGmx = tickets.filter((t) => t.instance === "GMX").length;
  const overdueFirst = tickets.filter((t) => t.is_overdue_first).length;
  const overdueResolve = tickets.filter((t) => t.is_overdue_resolve).length;
  const uniqueTechnicians = new Set(
    tickets.map((t) => t.technician).filter((name): name is string => Boolean(name))
  ).size;
  const uniqueCategories = new Set(
    tickets.map((t) => t.category).filter((name): name is string => Boolean(name))
  ).size;
  const today = new Date();
  const openedToday = tickets.filter((t) => {
    if (!t.date_opening) return false;
    const date = new Date(t.date_opening);
    if (Number.isNaN(date.getTime())) return false;
    return date.toDateString() === today.toDateString();
  }).length;
  const average = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number => typeof value === "number");
    if (valid.length === 0) return null;
    return valid.reduce((acc, value) => acc + value, 0) / valid.length;
  };
  const averageFirst = average(tickets.map((t) => t.sla_percentage_first));
  const averageResolve = average(tickets.map((t) => t.sla_percentage_resolve));
  const lastSyncAt = tickets.reduce<Date | null>((latest, ticket) => {
    if (!ticket.updated_at) return latest;
    const date = new Date(ticket.updated_at);
    if (Number.isNaN(date.getTime())) return latest;
    if (!latest || date > latest) return date;
    return latest;
  }, null);
  const todayLabel = today.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const lastSyncLabel = lastSyncAt
    ? lastSyncAt.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sem sincronização";

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Central de Tickets</div>
          <div className="header-logos">
            <div className="header-logo-card">
              <img
                src="https://i.ibb.co/Xr6CrgTJ/logo-GMX-preto-1.png"
                alt="Logo GMX"
                loading="lazy"
              />
            </div>
            <div className="header-logo-card header-logo-card-dark">
              <img
                src="https://i.ibb.co/qLpHTnB1/logo-big-white.png"
                alt="Logo PETA"
                loading="lazy"
              />
            </div>
          </div>
          <h1 className="page-title">Painel de operação</h1>
          <p className="page-subtitle">
            Tickets ativos (PETA + GMX). Alerta vermelho quando SLA ≥ {threshold}%.
          </p>
          <div className="brand-logos" aria-label="Logotipos das instâncias">
            <img
              src="https://i.ibb.co/qLpHTnB1/logo-big-white.png"
              alt="Logo PETA"
              className="brand-logo"
              loading="lazy"
            />
            <img
              src="https://i.ibb.co/Xr6CrgTJ/logo-GMX-preto-1.png"
              alt="Logo GMX"
              className="brand-logo"
              loading="lazy"
            />
          </div>
        </div>
        <div className="toolbar">
          <div className="sync-pill">Última sincronização {lastSyncLabel}</div>
          <AutoRefreshStatus />
          <ManualSyncButton />
          <ThemeToggle />
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total de tickets</div>
          <div className="stat-value">{tickets.length}</div>
          <div className="stat-meta">{alertCount} em alerta crítico</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Instâncias ativas</div>
          <div className="stat-value">{totalPeta + totalGmx}</div>
          <div className="stat-meta">
            PETA: {totalPeta} · GMX: {totalGmx}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vencidos</div>
          <div className="stat-value">{overdueFirst + overdueResolve}</div>
          <div className="stat-meta">
            1ª resposta: {overdueFirst} · solução: {overdueResolve}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Abertos hoje</div>
          <div className="stat-value">{openedToday}</div>
          <div className="stat-meta">{todayLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Responsáveis</div>
          <div className="stat-value">{uniqueTechnicians}</div>
          <div className="stat-meta">Técnicos com tickets ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Categorias</div>
          <div className="stat-value">{uniqueCategories}</div>
          <div className="stat-meta">Distribuição atual</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SLA médio 1ª</div>
          <div className="stat-value">
            {averageFirst != null ? `${averageFirst.toFixed(1)}%` : "-"}
          </div>
          <div className="stat-meta">Meta crítica em {threshold}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SLA médio solução</div>
          <div className="stat-value">
            {averageResolve != null ? `${averageResolve.toFixed(1)}%` : "-"}
          </div>
          <div className="stat-meta">Meta crítica em {threshold}%</div>
        </div>
      </section>

      <section className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-title">Fila detalhada</div>
            <div className="table-subtitle">
              Indicadores de SLA destacados em vermelho.
            </div>
          </div>
          <div className="table-subtitle">
            Sync manual disponível acima.
          </div>
        </div>
        {tickets.length === 0 ? (
          <div className="empty-state">
            <div>Nenhum ticket disponível no momento.</div>
            <div className="empty-state-hint">
              Se a autenticação via API falhar, acompanhe diretamente pelos painéis de assistência:
              <ul>
                <li>
                  <a
                    href="https://glpi.petacorp.com.br/front/central.php?embed&dashboard=assistance&entities_id=0&is_recursive=1&token=12ed3e1e-1be6-5584-a013-ee0fb1b4465b"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PETA
                  </a>
                </li>
                <li>
                  <a
                    href="https://glpi.gmxtecnologia.com.br/front/central.php?embed&dashboard=assistance&entities_id=0&is_recursive=1&token=a15a6318-1b97-5ba1-bb90-a374e92cc0b4"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GMX
                  </a>
                </li>
              </ul>
            </div>
            <div className="empty-state-panels">
              <div className="panel-card">
                <div className="panel-title">PETA</div>
                <iframe
                  title="Painel de assistência PETA"
                  src="https://glpi.petacorp.com.br/front/central.php?embed&dashboard=assistance&entities_id=0&is_recursive=1&token=12ed3e1e-1be6-5584-a013-ee0fb1b4465b"
                  loading="lazy"
                />
              </div>
              <div className="panel-card">
                <div className="panel-title">GMX</div>
                <iframe
                  title="Painel de assistência GMX"
                  src="https://glpi.gmxtecnologia.com.br/front/central.php?embed&dashboard=assistance&entities_id=0&is_recursive=1&token=a15a6318-1b97-5ba1-bb90-a374e92cc0b4"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {[
                  "Instância",
                  "Ticket",
                  "Título",
                  "Status",
                  "Responsável",
                  "Entidade",
                  "Categoria",
                  "SLA 1ª",
                  "SLA Solução",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const alert = isAlert(
                  t.sla_percentage_first,
                  t.sla_percentage_resolve,
                  threshold
                );
                return (
                  <tr key={t.id} className={alert ? "alert-row" : undefined}>
                    <td>
                      <span
                        className={`badge ${
                          t.instance === "PETA" ? "peta" : "gmx"
                        }`}
                      >
                        {t.instance}
                      </span>
                    </td>
                    <td>#{t.glpi_id}</td>
                    <td>{t.title ?? "-"}</td>
                    <td>{statusLabel(t.status)}</td>
                    <td>{t.technician ?? "-"}</td>
                    <td>{t.entity ?? "-"}</td>
                    <td>{t.category ?? "-"}</td>
                    <td
                      className={
                        (t.sla_percentage_first ?? 0) >= threshold
                          ? "danger-text"
                          : undefined
                      }
                    >
                      {t.sla_percentage_first != null
                        ? `${t.sla_percentage_first.toFixed(2)}%`
                        : "-"}
                    </td>
                    <td
                      className={
                        (t.sla_percentage_resolve ?? 0) >= threshold
                          ? "danger-text"
                          : undefined
                      }
                    >
                      {t.sla_percentage_resolve != null
                        ? `${t.sla_percentage_resolve.toFixed(2)}%`
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
