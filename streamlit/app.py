import re
import json
import os
from datetime import datetime, timedelta, date

import polars as pl
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from supabase import create_client

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="CentralTickets Analytics",
    page_icon="🎫",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ─────────────────────────────────────────────────────────────────
COLS = [
    "ticket_id", "instance", "title", "entity", "status_id", "status_key",
    "type_id", "priority_id", "urgency", "is_sla_late", "is_overdue_resolve",
    "due_date", "date_created", "date_mod", "date_solved",
    "technician", "technician_id", "requester", "requester_id", "requester_fullname",
    "group_name", "root_category", "request_type",
    "resolution_duration", "waiting_duration", "is_deleted",
]

PRIORITY_LABELS = {
    1: "Muito Baixa", 2: "Baixa", 3: "Média",
    4: "Alta", 5: "Urgente", 6: "Crítica",
}
PRIORITY_COLORS = {
    1: "#94a3b8", 2: "#3b82f6", 3: "#f59e0b",
    4: "#f97316", 5: "#dc2626", 6: "#7f1d1d",
}
STATUS_LABELS = {
    "new": "Novo", "processing": "Em Atendimento", "pending": "Pendente",
    "solved": "Solucionado", "closed": "Fechado",
    "pending-approval": "Aprovação", "approval": "Aprovação",
}
STATUS_COLORS = {
    "new": "#2563eb", "processing": "#16a34a", "pending": "#ea580c",
    "solved": "#6b7280", "closed": "#1f2937",
    "pending-approval": "#7c3aed", "approval": "#7c3aed",
}
STATUS_ID_MAP = {1: "new", 2: "processing", 3: "processing", 4: "pending", 5: "solved", 6: "closed", 7: "approval"}

TYPE_LABELS = {1: "Incidente", 2: "Requisição"}

ONE_YEAR_DAYS = 365
PAGE_SIZE = 1000


# ── Helpers ───────────────────────────────────────────────────────────────────
def process_entity(entity: str | None) -> str:
    if not entity:
        return "—"
    cleaned = re.sub(r"^PETA\s+GRUPO\s*>\s*", "", entity, flags=re.IGNORECASE)
    cleaned = re.sub(r"^GMX\s+TECNOLOGIA\s*>\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^PETA\s*>\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^GMX\s*>\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip() or entity


def last_group_label(name: str | None) -> str:
    if not name:
        return "—"
    s = str(name).strip()
    if s.startswith("["):
        try:
            arr = json.loads(s)
            if isinstance(arr, list):
                filtered = [
                    v for v in arr
                    if v and str(v).strip() and not re.match(r"^(GMX|PETA)$", str(v).strip(), re.IGNORECASE)
                ]
                filtered.sort(key=len, reverse=True)
                s = str(filtered[0] if filtered else (arr[0] if arr else "")).strip()
        except Exception:
            pass
    if not s or s == "Não atribuído":
        return "—"
    parts = s.split(">")
    return parts[-1].strip() or s


def resolve_status(status_key: str | None, status_id: int | None) -> str:
    if status_key in STATUS_LABELS:
        return status_key
    if status_id and status_id in STATUS_ID_MAP:
        return STATUS_ID_MAP[status_id]
    return status_key or "unknown"


def fmt_duration(seconds: float | None) -> str:
    if not seconds or seconds <= 0:
        return "—"
    h = int(seconds // 3600)
    d = h // 24
    rh = h % 24
    if d > 0:
        return f"{d}d {rh}h" if rh else f"{d}d"
    return f"{h}h"


# ── Supabase ──────────────────────────────────────────────────────────────────
@st.cache_resource
def get_supabase():
    url = st.secrets.get("SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    key = st.secrets.get("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not key:
        st.error("Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY nos secrets.")
        st.stop()
    return create_client(url, key)


@st.cache_data(ttl=600, show_spinner="Carregando tickets…")
def load_tickets(instances: tuple[str, ...]) -> pl.DataFrame:
    sb = get_supabase()
    one_year_ago = (datetime.now() - timedelta(days=ONE_YEAR_DAYS)).isoformat()
    rows: list[dict] = []
    from_row = 0

    while True:
        resp = (
            sb.table("tickets_cache")
            .select(",".join(COLS))
            .in_("instance", list(instances))
            .neq("is_deleted", True)
            .or_(f"status_key.not.in.(closed,solved),date_created.gte.{one_year_ago}")
            .order("date_mod", desc=True)
            .order("ticket_id", desc=True)
            .range(from_row, from_row + PAGE_SIZE - 1)
            .execute()
        )
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < PAGE_SIZE:
            break
        from_row += PAGE_SIZE

    if not rows:
        return pl.DataFrame()

    df = pl.DataFrame(rows, infer_schema_length=500)

    # Cast dates
    for col in ("date_created", "date_mod", "date_solved", "due_date"):
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).str.to_datetime(format=None, strict=False, ambiguous="earliest")
            )

    # Cast integers
    for col in ("ticket_id", "status_id", "type_id", "priority_id", "urgency",
                "resolution_duration", "waiting_duration"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Int64, strict=False))

    return df


# ── Sidebar filters ───────────────────────────────────────────────────────────
def render_sidebar() -> dict:
    st.sidebar.title("🎫 CentralTickets")
    st.sidebar.markdown("---")

    instance_opt = st.sidebar.selectbox(
        "Instância", ["PETA + GMX", "PETA", "GMX"], index=0
    )
    instances = ("PETA", "GMX") if instance_opt == "PETA + GMX" else (instance_opt,)

    st.sidebar.markdown("---")
    st.sidebar.subheader("Filtros")

    status_opts = {
        "Todos": None,
        "Novo": ["new"],
        "Em Atendimento": ["processing"],
        "Pendente": ["pending"],
        "Solucionado": ["solved"],
        "Fechado": ["closed"],
        "Aprovação": ["approval", "pending-approval"],
    }
    status_sel = st.sidebar.selectbox("Status", list(status_opts.keys()))

    type_opts = {"Todos": None, "Incidente": 1, "Requisição": 2}
    type_sel = st.sidebar.selectbox("Tipo", list(type_opts.keys()))

    priority_opts = {"Todas": None, **{v: k for k, v in PRIORITY_LABELS.items()}}
    priority_sel = st.sidebar.selectbox("Prioridade", list(priority_opts.keys()))

    sla_sel = st.sidebar.checkbox("Apenas SLA excedido")

    st.sidebar.markdown("---")
    date_from = st.sidebar.date_input(
        "Criado de", value=date.today() - timedelta(days=365), max_value=date.today()
    )
    date_to = st.sidebar.date_input(
        "Criado até", value=date.today(), max_value=date.today()
    )

    st.sidebar.markdown("---")
    if st.sidebar.button("🔄 Recarregar dados", use_container_width=True):
        load_tickets.clear()
        st.rerun()

    return {
        "instances": instances,
        "status": status_opts[status_sel],
        "type_id": type_opts[type_sel],
        "priority_id": priority_opts[priority_sel],
        "sla_only": sla_sel,
        "date_from": datetime.combine(date_from, datetime.min.time()),
        "date_to": datetime.combine(date_to, datetime.max.time()),
    }


# ── Apply filters ─────────────────────────────────────────────────────────────
def apply_filters(df: pl.DataFrame, filters: dict) -> pl.DataFrame:
    if df.is_empty():
        return df

    if "date_created" in df.columns:
        df = df.filter(
            pl.col("date_created").is_between(
                pl.lit(filters["date_from"]), pl.lit(filters["date_to"])
            )
        )

    if filters["status"]:
        df = df.filter(pl.col("status_key").is_in(filters["status"]))

    if filters["type_id"]:
        df = df.filter(pl.col("type_id") == filters["type_id"])

    if filters["priority_id"]:
        df = df.filter(pl.col("priority_id") == filters["priority_id"])

    if filters["sla_only"]:
        df = df.filter(
            pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
        )

    return df


# ── KPI row ───────────────────────────────────────────────────────────────────
def render_kpis(df: pl.DataFrame) -> None:
    total = len(df)
    incidents = df.filter(pl.col("type_id") == 1).height if "type_id" in df.columns else 0
    requests  = df.filter(pl.col("type_id") == 2).height if "type_id" in df.columns else 0
    sla_late  = df.filter(
        pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
    ).height if "is_sla_late" in df.columns else 0
    processing = df.filter(pl.col("status_key") == "processing").height if "status_key" in df.columns else 0
    pending    = df.filter(pl.col("status_key") == "pending").height if "status_key" in df.columns else 0

    cols = st.columns(6)
    metrics = [
        ("Total", total, None),
        ("Incidentes", incidents, "normal" if incidents == 0 else "inverse"),
        ("Requisições", requests, None),
        ("Em Atendimento", processing, None),
        ("Pendentes", pending, "inverse" if pending > 10 else None),
        ("SLA Excedido", sla_late, "inverse" if sla_late > 0 else None),
    ]
    for col, (label, value, delta_color) in zip(cols, metrics):
        col.metric(label, value)


# ── Charts ────────────────────────────────────────────────────────────────────
def chart_status(df: pl.DataFrame) -> go.Figure:
    counts = (
        df.group_by("status_key")
        .agg(pl.len().alias("count"))
        .with_columns(
            pl.col("status_key").replace(STATUS_LABELS, default="Outro").alias("label")
        )
        .sort("count", descending=True)
    )
    fig = px.pie(
        counts.to_pandas(),
        names="label", values="count",
        color="label",
        color_discrete_map={v: STATUS_COLORS.get(k, "#94a3b8") for k, v in STATUS_LABELS.items()},
        hole=0.45,
    )
    fig.update_traces(textposition="inside", textinfo="percent+label")
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=280)
    return fig


def chart_trend_30d(df: pl.DataFrame) -> go.Figure:
    if "date_created" not in df.columns:
        return go.Figure()

    today = datetime.now().date()
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    labels = [d.strftime("%d/%m") for d in days]

    opened, closed = [], []
    for d in days:
        start = datetime.combine(d, datetime.min.time())
        end   = datetime.combine(d, datetime.max.time())
        opened.append(
            df.filter(pl.col("date_created").is_between(pl.lit(start), pl.lit(end))).height
        )
        closed_df = df.filter(
            pl.col("status_key").is_in(["closed", "solved"]) &
            pl.col("date_solved").is_not_null() &
            pl.col("date_solved").is_between(pl.lit(start), pl.lit(end))
        ) if "date_solved" in df.columns else pl.DataFrame()
        closed.append(closed_df.height if not closed_df.is_empty() else 0)

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=labels, y=opened, name="Abertos",  fill="tozeroy", line=dict(color="#3b82f6"), fillcolor="rgba(59,130,246,0.1)"))
    fig.add_trace(go.Scatter(x=labels, y=closed, name="Fechados", fill="tozeroy", line=dict(color="#22c55e"), fillcolor="rgba(34,197,94,0.1)"))
    fig.update_layout(margin=dict(t=0, b=0, l=0, r=0), height=280, legend=dict(orientation="h", y=1.1))
    return fig


def chart_by_priority(df: pl.DataFrame) -> go.Figure:
    if "priority_id" not in df.columns:
        return go.Figure()
    counts = (
        df.group_by("priority_id")
        .agg(pl.len().alias("count"))
        .sort("priority_id")
        .with_columns(
            pl.col("priority_id").cast(pl.Int64, strict=False)
        )
    )
    labels = [PRIORITY_LABELS.get(r, f"P{r}") for r in counts["priority_id"].to_list()]
    colors = [PRIORITY_COLORS.get(r, "#94a3b8") for r in counts["priority_id"].to_list()]
    fig = px.bar(x=labels, y=counts["count"].to_list(), color=labels,
                 color_discrete_sequence=colors)
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=280,
                      xaxis_title=None, yaxis_title=None)
    return fig


def chart_by_entity(df: pl.DataFrame, top: int = 15) -> go.Figure:
    if "entity" not in df.columns:
        return go.Figure()
    entity_col = df.with_columns(
        pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean")
    )
    counts = (
        entity_col.group_by("entity_clean")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )
    fig = px.bar(counts.to_pandas(), x="count", y="entity_clean", orientation="h",
                 color_discrete_sequence=["#2563eb"])
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=max(280, top * 22),
                      xaxis_title=None, yaxis_title=None, yaxis=dict(autorange="reversed"))
    return fig


def chart_by_technician(df: pl.DataFrame, top: int = 10) -> go.Figure:
    if "technician" not in df.columns:
        return go.Figure()
    counts = (
        df.filter(pl.col("technician").is_not_null() & (pl.col("technician") != ""))
        .group_by("technician")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )
    fig = px.bar(counts.to_pandas(), x="count", y="technician", orientation="h",
                 color_discrete_sequence=["#16a34a"])
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=max(280, top * 22),
                      xaxis_title=None, yaxis_title=None, yaxis=dict(autorange="reversed"))
    return fig


def chart_by_category(df: pl.DataFrame, top: int = 10) -> go.Figure:
    if "root_category" not in df.columns:
        return go.Figure()
    counts = (
        df.filter(pl.col("root_category").is_not_null())
        .group_by("root_category")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )
    fig = px.bar(counts.to_pandas(), x="count", y="root_category", orientation="h",
                 color_discrete_sequence=["#7c3aed"])
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=max(280, top * 22),
                      xaxis_title=None, yaxis_title=None, yaxis=dict(autorange="reversed"))
    return fig


def chart_request_type(df: pl.DataFrame) -> go.Figure:
    if "request_type" not in df.columns:
        return go.Figure()
    counts = (
        df.filter(pl.col("request_type").is_not_null())
        .group_by("request_type")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(8)
    )
    fig = px.pie(counts.to_pandas(), names="request_type", values="count", hole=0.4)
    fig.update_traces(textposition="inside", textinfo="percent+label")
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=280)
    return fig


# ── SLA tab ───────────────────────────────────────────────────────────────────
def render_sla_tab(df: pl.DataFrame) -> None:
    st.subheader("Análise de SLA")

    sla_df = df.filter(
        pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
    ) if "is_sla_late" in df.columns else pl.DataFrame()

    active_sla = sla_df.filter(
        ~pl.col("status_key").is_in(["closed", "solved"])
    ) if not sla_df.is_empty() and "status_key" in sla_df.columns else pl.DataFrame()

    col1, col2, col3 = st.columns(3)
    col1.metric("SLA excedido total", sla_df.height)
    col2.metric("SLA excedido (não resolvido)", active_sla.height)
    sla_pct = round(sla_df.height / len(df) * 100, 1) if len(df) > 0 else 0
    col3.metric("% do total", f"{sla_pct}%")

    if not active_sla.is_empty():
        st.markdown("#### Críticos (não resolvidos) — top 20")

        now = datetime.now()

        def days_overdue(due: datetime | None) -> int:
            if due is None:
                return 0
            diff = now - due.replace(tzinfo=None) if due.tzinfo else now - due
            return max(0, diff.days)

        display = active_sla.with_columns([
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("Entidade"),
            pl.col("status_key").replace(STATUS_LABELS, default="—").alias("Status"),
            pl.col("priority_id").cast(pl.Int64, strict=False)
                .replace({k: v for k, v in PRIORITY_LABELS.items()}).alias("Prioridade"),
        ])

        cols_show = ["ticket_id", "title", "Entidade", "Status", "Prioridade",
                     "technician", "requester_fullname", "due_date"]
        cols_show = [c for c in cols_show if c in display.columns or c in ("Entidade", "Status", "Prioridade")]

        out = display.select(
            [c for c in cols_show if c in display.columns]
        ).sort(
            "due_date" if "due_date" in display.columns else display.columns[0]
        ).head(20)

        st.dataframe(out.to_pandas(), use_container_width=True)

    # SLA por entidade
    if not sla_df.is_empty() and "entity" in sla_df.columns:
        st.markdown("#### SLA excedido por entidade")
        ent = sla_df.with_columns(
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean")
        ).group_by("entity_clean").agg(pl.len().alias("count")).sort("count", descending=True).head(10)
        fig = px.bar(ent.to_pandas(), x="count", y="entity_clean", orientation="h",
                     color_discrete_sequence=["#dc2626"])
        fig.update_layout(xaxis_title=None, yaxis_title=None, height=280,
                          margin=dict(t=0, b=0, l=0, r=0), yaxis=dict(autorange="reversed"))
        st.plotly_chart(fig, use_container_width=True)


# ── Relatórios tab ────────────────────────────────────────────────────────────
def render_reports_tab(df: pl.DataFrame) -> None:
    st.subheader("Relatórios")

    with st.expander("Filtros adicionais", expanded=True):
        c1, c2, c3 = st.columns(3)
        entities = ["Todas"] + sorted(
            df.with_columns(
                pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("ec")
            )["ec"].drop_nulls().unique().to_list()
        ) if "entity" in df.columns else ["Todas"]
        techs = ["Todos"] + sorted(df["technician"].drop_nulls().unique().to_list()) if "technician" in df.columns else ["Todos"]
        cats  = ["Todas"] + sorted(df["root_category"].drop_nulls().unique().to_list()) if "root_category" in df.columns else ["Todas"]

        sel_entity = c1.selectbox("Entidade", entities)
        sel_tech   = c2.selectbox("Técnico", techs)
        sel_cat    = c3.selectbox("Categoria", cats)
        search     = st.text_input("Buscar no título", placeholder="Digite para filtrar…")

    result = df
    if "entity" in result.columns and sel_entity != "Todas":
        result = result.filter(
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8) == sel_entity
        )
    if "technician" in result.columns and sel_tech != "Todos":
        result = result.filter(pl.col("technician") == sel_tech)
    if "root_category" in result.columns and sel_cat != "Todas":
        result = result.filter(pl.col("root_category") == sel_cat)
    if search:
        result = result.filter(
            pl.col("title").str.contains(search, literal=True) if "title" in result.columns else pl.lit(True)
        )

    st.markdown(f"**{result.height}** tickets encontrados")

    display_cols = [c for c in [
        "ticket_id", "instance", "title", "status_key", "type_id", "priority_id",
        "entity", "technician", "requester_fullname", "group_name",
        "root_category", "request_type", "date_created", "date_mod", "date_solved",
        "resolution_duration", "is_sla_late",
    ] if c in result.columns]

    out = result.select(display_cols).with_columns([
        pl.col("status_key").replace(STATUS_LABELS, default="—").alias("status_key"),
        pl.col("type_id").cast(pl.Utf8).replace({"1": "Incidente", "2": "Requisição"}, default="—").alias("type_id"),
        pl.col("priority_id").cast(pl.Utf8).replace(
            {str(k): v for k, v in PRIORITY_LABELS.items()}, default="—"
        ).alias("priority_id"),
        pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity"),
        pl.col("resolution_duration").map_elements(
            lambda x: fmt_duration(x), return_dtype=pl.Utf8
        ).alias("resolution_duration") if "resolution_duration" in result.columns else pl.lit(None),
    ])

    st.dataframe(out.to_pandas(), use_container_width=True, height=480)

    csv = out.to_pandas().to_csv(index=False).encode("utf-8")
    st.download_button("⬇️ Exportar CSV", csv, "tickets.csv", "text/csv", use_container_width=True)


# ── Overview tab ──────────────────────────────────────────────────────────────
def render_overview_tab(df: pl.DataFrame) -> None:
    render_kpis(df)

    st.markdown("---")

    c1, c2 = st.columns([1, 2])
    with c1:
        st.markdown("**Tickets por Status**")
        st.plotly_chart(chart_status(df), use_container_width=True)
    with c2:
        st.markdown("**Tendência 30 dias**")
        st.plotly_chart(chart_trend_30d(df), use_container_width=True)

    c3, c4 = st.columns(2)
    with c3:
        st.markdown("**Por Prioridade**")
        st.plotly_chart(chart_by_priority(df), use_container_width=True)
    with c4:
        st.markdown("**Canal de Requisição**")
        st.plotly_chart(chart_request_type(df), use_container_width=True)

    c5, c6 = st.columns(2)
    with c5:
        st.markdown("**Por Técnico (top 10)**")
        st.plotly_chart(chart_by_technician(df), use_container_width=True)
    with c6:
        st.markdown("**Por Categoria Raiz (top 10)**")
        st.plotly_chart(chart_by_category(df), use_container_width=True)

    st.markdown("**Por Entidade (top 15)**")
    st.plotly_chart(chart_by_entity(df), use_container_width=True)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    filters = render_sidebar()

    raw_df = load_tickets(filters["instances"])

    if raw_df.is_empty():
        st.warning("Nenhum ticket encontrado para os filtros selecionados.")
        return

    df = apply_filters(raw_df, filters)

    n_total = len(raw_df)
    n_filtered = len(df)
    st.caption(
        f"📊 {n_filtered:,} tickets exibidos de {n_total:,} carregados  •  "
        f"Cache atualizado: {datetime.now().strftime('%H:%M:%S')}"
    )

    tab1, tab2, tab3 = st.tabs(["📈 Visão Geral", "🔴 SLA", "📋 Relatórios"])
    with tab1:
        render_overview_tab(df)
    with tab2:
        render_sla_tab(df)
    with tab3:
        render_reports_tab(df)


if __name__ == "__main__":
    main()
