import json
import os
import re
from datetime import date, datetime, timedelta

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import polars as pl
import streamlit as st
from supabase import create_client

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Central de Tickets Analytics",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Constants ────────────────────────────────────────────────────────────────
COLS = [
    "ticket_id", "instance", "title", "entity", "status_id", "status_key",
    "type_id", "priority_id", "urgency", "is_sla_late", "is_overdue_resolve",
    "due_date", "date_created", "date_mod", "date_solved",
    "technician", "technician_id", "requester", "requester_id", "requester_fullname",
    "group_name", "root_category", "request_type",
    "resolution_duration", "waiting_duration", "is_deleted",
]

PRIORITY_LABELS = {
    1: "Muito Baixa",
    2: "Baixa",
    3: "Média",
    4: "Alta",
    5: "Urgente",
    6: "Crítica",
}
PRIORITY_COLORS = {
    1: "#94a3b8",
    2: "#3b82f6",
    3: "#f59e0b",
    4: "#f97316",
    5: "#dc2626",
    6: "#7f1d1d",
}
STATUS_LABELS = {
    "new": "Novo",
    "processing": "Em Atendimento",
    "pending": "Pendente",
    "solved": "Solucionado",
    "closed": "Fechado",
    "pending-approval": "Aprovação",
    "approval": "Aprovação",
    "unknown": "Outro",
}
STATUS_COLORS = {
    "new": "#2563eb",
    "processing": "#16a34a",
    "pending": "#ea580c",
    "solved": "#6b7280",
    "closed": "#1f2937",
    "pending-approval": "#7c3aed",
    "approval": "#7c3aed",
    "unknown": "#94a3b8",
}
STATUS_ID_MAP = {
    1: "new",
    2: "processing",
    3: "processing",
    4: "pending",
    5: "solved",
    6: "closed",
    7: "approval",
}
TYPE_LABELS = {
    1: "Incidente",
    2: "Requisição",
}

ONE_YEAR_DAYS = 365
PAGE_SIZE = 1000


# ── UI ───────────────────────────────────────────────────────────────────────
def inject_custom_css() -> None:
    st.markdown(
        """
        <style>
        .block-container {
            padding-top: 1rem;
            padding-bottom: 1rem;
        }
        div[data-testid="stMetric"] {
            background: linear-gradient(180deg, rgba(37,99,235,0.04), rgba(37,99,235,0.01));
            border: 1px solid rgba(148,163,184,0.25);
            padding: 14px 16px;
            border-radius: 16px;
        }
        div[data-testid="stMetricLabel"] p {
            font-weight: 600;
        }
        .stTabs [data-baseweb="tab-list"] {
            gap: 0.5rem;
        }
        .stTabs [data-baseweb="tab"] {
            border-radius: 12px;
            padding: 0.5rem 0.9rem;
        }
        .section-title {
            font-size: 1.05rem;
            font-weight: 700;
            margin: 0.2rem 0 0.8rem 0;
        }
        .subtle-box {
            border: 1px solid rgba(148,163,184,0.22);
            border-radius: 14px;
            padding: 0.75rem 1rem;
            background: rgba(248,250,252,0.45);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────
def process_entity(entity: str | None) -> str:
    if not entity:
        return "—"
    cleaned = re.sub(r"^PETA\\s+GRUPO\\s*>\\s*", "", entity, flags=re.IGNORECASE)
    cleaned = re.sub(r"^GMX\\s+TECNOLOGIA\\s*>\\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^PETA\\s*>\\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^GMX\\s*>\\s*", "", cleaned, flags=re.IGNORECASE)
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
                filtered.sort(key=lambda x: len(str(x)), reverse=True)
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


def safe_pandas(df: pl.DataFrame) -> pd.DataFrame:
    return df.to_pandas() if not df.is_empty() else pd.DataFrame()


def current_period_days(filters: dict) -> int:
    return max((filters["date_to"].date() - filters["date_from"].date()).days + 1, 1)


# ── Supabase ─────────────────────────────────────────────────────────────────
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

    date_cols = {"date_created", "date_mod", "date_solved", "due_date"}
    for row in rows:
        for col in date_cols:
            val = row.get(col)
            if val is None or isinstance(val, datetime):
                if isinstance(val, datetime):
                    row[col] = val.replace(tzinfo=None)
                continue
            try:
                row[col] = datetime.fromisoformat(str(val)).replace(tzinfo=None)
            except (ValueError, TypeError):
                row[col] = None

    df = pl.DataFrame(rows, infer_schema_length=len(rows))

    for col in (
        "ticket_id", "status_id", "type_id", "priority_id", "urgency",
        "resolution_duration", "waiting_duration", "technician_id", "requester_id",
    ):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Int64, strict=False))

    return df


# ── Enrichment ────────────────────────────────────────────────────────────────
def enrich_df(df: pl.DataFrame) -> pl.DataFrame:
    if df.is_empty():
        return df

    df = df.with_columns([
        pl.struct(["status_key", "status_id"]).map_elements(
            lambda s: resolve_status(s.get("status_key"), s.get("status_id")),
            return_dtype=pl.Utf8,
        ).alias("status_norm"),

        pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean"),

        pl.when(pl.col("technician").is_null() | (pl.col("technician").cast(pl.Utf8) == ""))
        .then(pl.lit("Não atribuído"))
        .otherwise(pl.col("technician").cast(pl.Utf8))
        .alias("technician_label"),

        pl.when(pl.col("root_category").is_null() | (pl.col("root_category").cast(pl.Utf8) == ""))
        .then(pl.lit("Sem categoria"))
        .otherwise(pl.col("root_category").cast(pl.Utf8))
        .alias("root_category_label"),

        pl.when(pl.col("group_name").is_null() | (pl.col("group_name").cast(pl.Utf8) == ""))
        .then(pl.lit("—"))
        .otherwise(pl.col("group_name").map_elements(last_group_label, return_dtype=pl.Utf8))
        .alias("group_label"),

        pl.col("date_created").dt.strftime("%Y-%m").alias("created_month"),
        pl.when(pl.col("date_solved").is_not_null())
        .then(pl.col("date_solved").dt.strftime("%Y-%m"))
        .otherwise(None)
        .alias("solved_month"),

        (pl.col("resolution_duration").cast(pl.Float64, strict=False) / 3600.0)
        .round(2)
        .alias("resolution_hours"),

        (
            pl.col("is_sla_late").fill_null(False) |
            pl.col("is_overdue_resolve").fill_null(False)
        ).alias("sla_breached"),
    ])

    df = df.with_columns([
        pl.col("status_norm")
        .replace(list(STATUS_LABELS.keys()), list(STATUS_LABELS.values()), default="Outro")
        .alias("status_label"),

        pl.col("status_norm").is_in(["solved", "closed"]).alias("is_resolved"),

        pl.col("type_id")
        .cast(pl.Utf8)
        .replace(["1", "2"], ["Incidente", "Requisição"], default="—")
        .alias("type_label"),

        pl.col("priority_id")
        .cast(pl.Utf8)
        .replace([str(k) for k in PRIORITY_LABELS.keys()], list(PRIORITY_LABELS.values()), default="—")
        .alias("priority_label"),
    ])

    df = df.with_columns([
        (pl.col("is_resolved") & ~pl.col("sla_breached")).alias("resolved_on_time"),
        (pl.col("is_resolved") & pl.col("sla_breached")).alias("resolved_late"),
    ])

    return df


# ── Sidebar ──────────────────────────────────────────────────────────────────
def render_sidebar() -> dict:
    st.sidebar.title("📊 Central de Tickets")
    st.sidebar.markdown("---")

    instance_opt = st.sidebar.selectbox(
        "Instância",
        ["PETA + GMX", "PETA", "GMX"],
        index=0,
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
        "Criado de",
        value=date.today() - timedelta(days=365),
        max_value=date.today(),
    )
    date_to = st.sidebar.date_input(
        "Criado até",
        value=date.today(),
        max_value=date.today(),
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


# ── Filters ──────────────────────────────────────────────────────────────────
def apply_filters(df: pl.DataFrame, filters: dict) -> pl.DataFrame:
    if df.is_empty():
        return df

    if "date_created" in df.columns:
        df = df.filter(
            pl.col("date_created").is_between(
                pl.lit(filters["date_from"]),
                pl.lit(filters["date_to"]),
            )
        )

    if filters["status"]:
        status_col = "status_norm" if "status_norm" in df.columns else "status_key"
        df = df.filter(pl.col(status_col).is_in(filters["status"]))

    if filters["type_id"]:
        df = df.filter(pl.col("type_id") == filters["type_id"])

    if filters["priority_id"]:
        df = df.filter(pl.col("priority_id") == filters["priority_id"])

    if filters["sla_only"]:
        df = df.filter(pl.col("sla_breached").eq(True))

    return df


# ── KPI row ──────────────────────────────────────────────────────────────────
def render_kpis(df: pl.DataFrame, filters: dict) -> None:
    total = df.height
    incidents = df.filter(pl.col("type_id") == 1).height if "type_id" in df.columns else 0
    requests = df.filter(pl.col("type_id") == 2).height if "type_id" in df.columns else 0
    processing = df.filter(pl.col("status_norm") == "processing").height if "status_norm" in df.columns else 0
    pending = df.filter(pl.col("status_norm") == "pending").height if "status_norm" in df.columns else 0
    sla_late = df.filter(pl.col("sla_breached")).height if "sla_breached" in df.columns else 0

    resolved = df.filter(pl.col("is_resolved")).height if "is_resolved" in df.columns else 0
    resolved_on_time = df.filter(pl.col("resolved_on_time")).height if "resolved_on_time" in df.columns else 0
    resolved_late = df.filter(pl.col("resolved_late")).height if "resolved_late" in df.columns else 0

    period_days = current_period_days(filters)
    avg_received_day = round(total / period_days, 2)

    on_time_pct = round((resolved_on_time / resolved) * 100, 1) if resolved else 0
    late_pct = round((resolved_late / resolved) * 100, 1) if resolved else 0

    row1 = st.columns(4)
    row2 = st.columns(5)

    metrics1 = [
        ("Total", total),
        ("Incidentes", incidents),
        ("Requisições", requests),
        ("Resolvidos", resolved),
    ]
    metrics2 = [
        ("% no prazo", f"{on_time_pct}%"),
        ("% fora do prazo", f"{late_pct}%"),
        ("Recebidos/dia", avg_received_day),
        ("Em Atendimento", processing),
        ("Pendentes", pending),
    ]

    for col, (label, value) in zip(row1, metrics1):
        col.metric(label, value)

    for col, (label, value) in zip(row2, metrics2):
        col.metric(label, value)

    if sla_late > 0:
        st.caption(f"⚠️ {sla_late} ticket(s) com SLA excedido no recorte atual.")


# ── Charts ───────────────────────────────────────────────────────────────────
def chart_status(df: pl.DataFrame) -> go.Figure:
    if df.is_empty() or "status_label" not in df.columns:
        return go.Figure()

    counts = (
        df.group_by(["status_norm", "status_label"])
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
    )

    pdf = counts.to_pandas()
    color_map = {
        STATUS_LABELS.get(k, "Outro"): STATUS_COLORS.get(k, "#94a3b8")
        for k in STATUS_COLORS.keys()
    }

    fig = px.pie(
        pdf,
        names="status_label",
        values="count",
        color="status_label",
        color_discrete_map=color_map,
        hole=0.45,
    )
    fig.update_traces(textposition="inside", textinfo="percent+label")
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=300)
    return fig


def chart_trend_30d(df: pl.DataFrame) -> go.Figure:
    if df.is_empty() or "date_created" not in df.columns:
        return go.Figure()

    today = datetime.now().date()
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    labels = [d.strftime("%d/%m") for d in days]

    opened = []
    closed = []

    for d in days:
        start = datetime.combine(d, datetime.min.time())
        end = datetime.combine(d, datetime.max.time())

        opened.append(
            df.filter(pl.col("date_created").is_between(pl.lit(start), pl.lit(end))).height
        )

        if "date_solved" in df.columns:
            closed_df = df.filter(
                pl.col("is_resolved") &
                pl.col("date_solved").is_not_null() &
                pl.col("date_solved").is_between(pl.lit(start), pl.lit(end))
            )
            closed.append(closed_df.height)
        else:
            closed.append(0)

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=opened,
            name="Abertos",
            fill="tozeroy",
            line=dict(color="#3b82f6"),
            fillcolor="rgba(59,130,246,0.10)",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=closed,
            name="Resolvidos",
            fill="tozeroy",
            line=dict(color="#22c55e"),
            fillcolor="rgba(34,197,94,0.10)",
        )
    )
    fig.update_layout(
        margin=dict(t=0, b=0, l=0, r=0),
        height=300,
        legend=dict(orientation="h", y=1.12),
        xaxis_title=None,
        yaxis_title=None,
    )
    return fig


def chart_by_priority(df: pl.DataFrame) -> go.Figure:
    if df.is_empty() or "priority_id" not in df.columns:
        return go.Figure()

    counts = (
        df.group_by("priority_id")
        .agg(pl.len().alias("count"))
        .sort("priority_id")
        .with_columns(pl.col("priority_id").cast(pl.Int64, strict=False))
    )

    priorities = counts["priority_id"].to_list()
    labels = [PRIORITY_LABELS.get(v, f"P{v}") for v in priorities]
    colors = [PRIORITY_COLORS.get(v, "#94a3b8") for v in priorities]

    fig = px.bar(
        x=labels,
        y=counts["count"].to_list(),
        color=labels,
        color_discrete_sequence=colors,
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(t=0, b=0, l=0, r=0),
        height=300,
        xaxis_title=None,
        yaxis_title=None,
    )
    return fig


def chart_by_entity(df: pl.DataFrame, top: int = 15) -> go.Figure:
    if df.is_empty() or "entity_clean" not in df.columns:
        return go.Figure()

    counts = (
        df.group_by("entity_clean")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )

    fig = px.bar(
        counts.to_pandas(),
        x="count",
        y="entity_clean",
        orientation="h",
        color_discrete_sequence=["#2563eb"],
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(t=0, b=0, l=0, r=0),
        height=max(320, top * 24),
        xaxis_title=None,
        yaxis_title=None,
        yaxis=dict(autorange="reversed"),
    )
    return fig


def chart_by_technician(df: pl.DataFrame, top: int = 10) -> go.Figure:
    if df.is_empty() or "technician_label" not in df.columns:
        return go.Figure()

    counts = (
        df.group_by("technician_label")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )

    fig = px.bar(
        counts.to_pandas(),
        x="count",
        y="technician_label",
        orientation="h",
        color_discrete_sequence=["#16a34a"],
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(t=0, b=0, l=0, r=0),
        height=max(320, top * 24),
        xaxis_title=None,
        yaxis_title=None,
        yaxis=dict(autorange="reversed"),
    )
    return fig


def chart_by_category(df: pl.DataFrame, top: int = 10) -> go.Figure:
    if df.is_empty() or "root_category_label" not in df.columns:
        return go.Figure()

    counts = (
        df.group_by("root_category_label")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
    )

    fig = px.bar(
        counts.to_pandas(),
        x="count",
        y="root_category_label",
        orientation="h",
        color_discrete_sequence=["#7c3aed"],
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(t=0, b=0, l=0, r=0),
        height=max(320, top * 24),
        xaxis_title=None,
        yaxis_title=None,
        yaxis=dict(autorange="reversed"),
    )
    return fig


def chart_request_type(df: pl.DataFrame) -> go.Figure:
    if df.is_empty() or "request_type" not in df.columns:
        return go.Figure()

    counts = (
        df.filter(pl.col("request_type").is_not_null() & (pl.col("request_type").cast(pl.Utf8) != ""))
        .group_by("request_type")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(8)
    )

    if counts.is_empty():
        return go.Figure()

    fig = px.pie(counts.to_pandas(), names="request_type", values="count", hole=0.40)
    fig.update_traces(textposition="inside", textinfo="percent+label")
    fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0), height=300)
    return fig


def chart_technician_status(df: pl.DataFrame, top: int = 12) -> go.Figure:
    if df.is_empty() or "technician_label" not in df.columns or "status_label" not in df.columns:
        return go.Figure()

    top_techs = (
        df.group_by("technician_label")
        .agg(pl.len().alias("total"))
        .sort("total", descending=True)
        .head(top)
    )

    base = (
        df.join(top_techs.select("technician_label"), on="technician_label", how="inner")
        .group_by(["technician_label", "status_label"])
        .agg(pl.len().alias("count"))
    )

    tech_order = top_techs["technician_label"].to_list()[::-1]
    pdf = base.to_pandas()

    fig = px.bar(
        pdf,
        x="count",
        y="technician_label",
        color="status_label",
        orientation="h",
        category_orders={"technician_label": tech_order},
    )
    fig.update_layout(
        barmode="stack",
        height=max(340, top * 30),
        margin=dict(t=0, b=0, l=0, r=0),
        xaxis_title=None,
        yaxis_title=None,
        legend_title=None,
    )
    return fig


def chart_technician_monthly(df: pl.DataFrame, technician: str) -> go.Figure:
    if df.is_empty() or not technician or "technician_label" not in df.columns:
        return go.Figure()

    base = df.filter(pl.col("technician_label") == technician)

    opened = (
        base.filter(pl.col("created_month").is_not_null())
        .group_by("created_month")
        .agg(pl.len().alias("Recebidos"))
        .rename({"created_month": "Mês"})
        .sort("Mês")
    )

    resolved = (
        base.filter(pl.col("is_resolved") & pl.col("solved_month").is_not_null())
        .group_by("solved_month")
        .agg(pl.len().alias("Resolvidos"))
        .rename({"solved_month": "Mês"})
        .sort("Mês")
    )

    pdf_opened = safe_pandas(opened)
    pdf_resolved = safe_pandas(resolved)

    if pdf_opened.empty and pdf_resolved.empty:
        return go.Figure()

    monthly = (
        pd.merge(pdf_opened, pdf_resolved, on="Mês", how="outer")
        .fillna(0)
        .sort_values("Mês")
    )

    if "Recebidos" in monthly.columns:
        monthly["Recebidos"] = monthly["Recebidos"].astype(int)
    else:
        monthly["Recebidos"] = 0

    if "Resolvidos" in monthly.columns:
        monthly["Resolvidos"] = monthly["Resolvidos"].astype(int)
    else:
        monthly["Resolvidos"] = 0

    fig = go.Figure()
    fig.add_trace(go.Bar(x=monthly["Mês"], y=monthly["Recebidos"], name="Recebidos", marker_color="#2563eb"))
    fig.add_trace(go.Bar(x=monthly["Mês"], y=monthly["Resolvidos"], name="Resolvidos", marker_color="#16a34a"))
    fig.update_layout(
        barmode="group",
        height=340,
        margin=dict(t=0, b=0, l=0, r=0),
        xaxis_title=None,
        yaxis_title=None,
        legend=dict(orientation="h", y=1.12),
    )
    return fig


def chart_avg_duration_by_category(df: pl.DataFrame, top: int = 12) -> go.Figure:
    if df.is_empty() or "root_category_label" not in df.columns or "resolution_hours" not in df.columns:
        return go.Figure()

    avg_df = (
        df.filter(
            pl.col("resolution_hours").is_not_null() &
            (pl.col("resolution_hours") > 0)
        )
        .group_by("root_category_label")
        .agg([
            pl.mean("resolution_hours").round(2).alias("avg_hours"),
            pl.len().alias("tickets"),
        ])
        .sort("avg_hours", descending=True)
        .head(top)
    )

    if avg_df.is_empty():
        return go.Figure()

    fig = px.bar(
        avg_df.to_pandas(),
        x="avg_hours",
        y="root_category_label",
        orientation="h",
        text="avg_hours",
        color_discrete_sequence=["#0ea5e9"],
    )
    fig.update_traces(texttemplate="%{text}h", textposition="outside")
    fig.update_layout(
        showlegend=False,
        height=max(340, top * 28),
        margin=dict(t=0, b=0, l=0, r=20),
        xaxis_title="Horas",
        yaxis_title=None,
        yaxis=dict(autorange="reversed"),
    )
    return fig


def chart_resolved_monthly_by_category(df: pl.DataFrame, top: int = 6) -> go.Figure:
    if df.is_empty() or "root_category_label" not in df.columns or "solved_month" not in df.columns:
        return go.Figure()

    resolved = df.filter(pl.col("is_resolved") & pl.col("solved_month").is_not_null())
    if resolved.is_empty():
        return go.Figure()

    top_cats = (
        resolved.group_by("root_category_label")
        .agg(pl.len().alias("total"))
        .sort("total", descending=True)
        .head(top)
    )

    monthly = (
        resolved.join(top_cats.select("root_category_label"), on="root_category_label", how="inner")
        .group_by(["solved_month", "root_category_label"])
        .agg(pl.len().alias("count"))
        .sort("solved_month")
    )

    fig = px.bar(
        monthly.to_pandas(),
        x="solved_month",
        y="count",
        color="root_category_label",
    )
    fig.update_layout(
        barmode="stack",
        height=360,
        margin=dict(t=0, b=0, l=0, r=0),
        xaxis_title=None,
        yaxis_title=None,
        legend_title=None,
    )
    return fig


# ── Tables ───────────────────────────────────────────────────────────────────
def technician_status_table(df: pl.DataFrame) -> pd.DataFrame:
    if df.is_empty() or "technician_label" not in df.columns or "status_label" not in df.columns:
        return pd.DataFrame()

    pdf = df.select(["technician_label", "status_label"]).to_pandas()
    if pdf.empty:
        return pd.DataFrame()

    out = pd.crosstab(pdf["technician_label"], pdf["status_label"]).reset_index()

    ordered_status = [v for v in STATUS_LABELS.values() if v in out.columns]
    other_cols = [c for c in out.columns if c not in ["technician_label", *ordered_status]]
    out = out[["technician_label", *ordered_status, *other_cols]]

    total_cols = [c for c in out.columns if c != "technician_label"]
    out["Total"] = out[total_cols].sum(axis=1)
    return out.sort_values(["Total", "technician_label"], ascending=[False, True])


def technician_monthly_table(df: pl.DataFrame, technician: str) -> pd.DataFrame:
    if df.is_empty() or not technician:
        return pd.DataFrame()

    base = df.filter(pl.col("technician_label") == technician)

    opened = (
        base.filter(pl.col("created_month").is_not_null())
        .group_by("created_month")
        .agg(pl.len().alias("Recebidos"))
        .rename({"created_month": "Mês"})
        .sort("Mês")
        .to_pandas()
    )

    resolved = (
        base.filter(pl.col("is_resolved") & pl.col("solved_month").is_not_null())
        .group_by("solved_month")
        .agg(pl.len().alias("Resolvidos"))
        .rename({"solved_month": "Mês"})
        .sort("Mês")
        .to_pandas()
    )

    if opened.empty and resolved.empty:
        return pd.DataFrame()

    out = pd.merge(opened, resolved, on="Mês", how="outer").fillna(0).sort_values("Mês")
    out["Recebidos"] = out.get("Recebidos", 0).astype(int)
    out["Resolvidos"] = out.get("Resolvidos", 0).astype(int)
    return out


def category_duration_table(df: pl.DataFrame) -> pd.DataFrame:
    if df.is_empty() or "root_category_label" not in df.columns:
        return pd.DataFrame()

    out = (
        df.filter(
            pl.col("resolution_hours").is_not_null() &
            (pl.col("resolution_hours") > 0)
        )
        .group_by("root_category_label")
        .agg([
            pl.len().alias("Tickets"),
            pl.mean("resolution_hours").round(2).alias("Média (h)"),
            pl.median("resolution_hours").round(2).alias("Mediana (h)"),
        ])
        .sort("Média (h)", descending=True)
    )

    return safe_pandas(out)


def category_resolved_monthly_table(df: pl.DataFrame) -> pd.DataFrame:
    if df.is_empty():
        return pd.DataFrame()

    out = (
        df.filter(pl.col("is_resolved") & pl.col("solved_month").is_not_null())
        .group_by(["solved_month", "root_category_label"])
        .agg(pl.len().alias("Resolvidos"))
        .rename({"solved_month": "Mês", "root_category_label": "Categoria"})
        .sort(["Mês", "Resolvidos"], descending=[False, True])
    )
    return safe_pandas(out)


# ── Tabs ─────────────────────────────────────────────────────────────────────
def render_overview_tab(df: pl.DataFrame, filters: dict) -> None:
    render_kpis(df, filters)

    st.markdown("---")

    c1, c2 = st.columns([1, 2])
    with c1:
        st.markdown("#### Tickets por Status")
        st.plotly_chart(chart_status(df), use_container_width=True)
    with c2:
        st.markdown("#### Tendência 30 dias")
        st.plotly_chart(chart_trend_30d(df), use_container_width=True)

    c3, c4 = st.columns(2)
    with c3:
        st.markdown("#### Por Prioridade")
        st.plotly_chart(chart_by_priority(df), use_container_width=True)
    with c4:
        st.markdown("#### Canal de Requisição")
        st.plotly_chart(chart_request_type(df), use_container_width=True)

    c5, c6 = st.columns(2)
    with c5:
        st.markdown("#### Por Técnico (top 10)")
        st.plotly_chart(chart_by_technician(df), use_container_width=True)
    with c6:
        st.markdown("#### Por Categoria Raiz (top 10)")
        st.plotly_chart(chart_by_category(df), use_container_width=True)

    st.markdown("#### Por Entidade (top 15)")
    st.plotly_chart(chart_by_entity(df), use_container_width=True)


def render_technicians_tab(df: pl.DataFrame) -> None:
    st.subheader("Análise por Técnico")

    if df.is_empty() or "technician_label" not in df.columns:
        st.info("Sem dados para exibir nesta aba.")
        return

    c1, c2 = st.columns([1.15, 1.85])

    with c1:
        st.markdown("#### Total por status para cada técnico")
        status_tbl = technician_status_table(df)
        st.dataframe(status_tbl, use_container_width=True, height=430)

    with c2:
        st.markdown("#### Distribuição de status por técnico")
        st.plotly_chart(chart_technician_status(df), use_container_width=True)

    st.markdown("---")

    tech_options = sorted(df["technician_label"].drop_nulls().unique().to_list())
    if not tech_options:
        st.info("Nenhum técnico encontrado.")
        return

    selected_tech = st.selectbox("Técnico para análise mensal", tech_options, index=0)

    c3, c4 = st.columns([1.8, 1.2])
    with c3:
        st.markdown("#### Chamados recebidos e resolvidos por mês")
        st.plotly_chart(chart_technician_monthly(df, selected_tech), use_container_width=True)
    with c4:
        st.markdown("#### Tabela mensal")
        st.dataframe(
            technician_monthly_table(df, selected_tech),
            use_container_width=True,
            height=340,
        )


def render_categories_tab(df: pl.DataFrame) -> None:
    st.subheader("Análise por Categoria")

    c1, c2 = st.columns([1.5, 1.5])
    with c1:
        st.markdown("#### Duração média de chamados por categoria raiz")
        st.plotly_chart(chart_avg_duration_by_category(df), use_container_width=True)
    with c2:
        st.markdown("#### Total de tickets resolvidos por mês / categoria raiz")
        st.plotly_chart(chart_resolved_monthly_by_category(df), use_container_width=True)

    st.markdown("---")

    c3, c4 = st.columns(2)
    with c3:
        st.markdown("#### Tabela de duração média")
        st.dataframe(
            category_duration_table(df),
            use_container_width=True,
            height=360,
        )
    with c4:
        st.markdown("#### Tabela de resolvidos por mês")
        st.dataframe(
            category_resolved_monthly_table(df),
            use_container_width=True,
            height=360,
        )


def render_sla_tab(df: pl.DataFrame) -> None:
    st.subheader("Análise de SLA")

    if df.is_empty():
        st.info("Sem dados para análise de SLA.")
        return

    sla_df = df.filter(pl.col("sla_breached")) if "sla_breached" in df.columns else pl.DataFrame()
    active_sla = sla_df.filter(~pl.col("is_resolved")) if not sla_df.is_empty() else pl.DataFrame()

    resolved = df.filter(pl.col("is_resolved")).height if "is_resolved" in df.columns else 0
    resolved_on_time = df.filter(pl.col("resolved_on_time")).height if "resolved_on_time" in df.columns else 0
    resolved_late = df.filter(pl.col("resolved_late")).height if "resolved_late" in df.columns else 0

    on_time_pct = round((resolved_on_time / resolved) * 100, 1) if resolved else 0
    late_pct = round((resolved_late / resolved) * 100, 1) if resolved else 0
    sla_pct = round((sla_df.height / len(df)) * 100, 1) if len(df) > 0 else 0

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("SLA excedido total", sla_df.height)
    col2.metric("SLA excedido em aberto", active_sla.height)
    col3.metric("% com SLA excedido", f"{sla_pct}%")
    col4.metric("% resolvidos no prazo", f"{on_time_pct}%")
    col5.metric("% resolvidos fora do prazo", f"{late_pct}%")

    if not active_sla.is_empty():
        st.markdown("#### Críticos não resolvidos — top 20")

        now = datetime.now()

        display = active_sla.with_columns([
            pl.col("status_label").alias("Status"),
            pl.col("priority_label").alias("Prioridade"),
            pl.col("entity_clean").alias("Entidade"),
            pl.col("technician_label").alias("Técnico"),
            pl.col("requester_fullname").fill_null("—").alias("Solicitante"),
            pl.when(pl.col("due_date").is_not_null())
            .then(
                pl.col("due_date").map_elements(
                    lambda d: max(0, (now - d).days) if d else 0,
                    return_dtype=pl.Int64,
                )
            )
            .otherwise(0)
            .alias("Dias em atraso"),
        ])

        cols_show = [
            "ticket_id", "title", "Entidade", "Status", "Prioridade",
            "Técnico", "Solicitante", "due_date", "Dias em atraso"
        ]
        cols_show = [c for c in cols_show if c in display.columns]

        out = display.select(cols_show)

        if "Dias em atraso" in out.columns:
            out = out.sort("Dias em atraso", descending=True)

        st.dataframe(out.head(20).to_pandas(), use_container_width=True, height=420)

    if not sla_df.is_empty() and "entity_clean" in sla_df.columns:
        st.markdown("#### SLA excedido por entidade")
        ent = (
            sla_df.group_by("entity_clean")
            .agg(pl.len().alias("count"))
            .sort("count", descending=True)
            .head(10)
        )
        fig = px.bar(
            ent.to_pandas(),
            x="count",
            y="entity_clean",
            orientation="h",
            color_discrete_sequence=["#dc2626"],
        )
        fig.update_layout(
            xaxis_title=None,
            yaxis_title=None,
            height=320,
            margin=dict(t=0, b=0, l=0, r=0),
            yaxis=dict(autorange="reversed"),
            showlegend=False,
        )
        st.plotly_chart(fig, use_container_width=True)


def render_reports_tab(df: pl.DataFrame) -> None:
    st.subheader("Relatórios")

    if df.is_empty():
        st.info("Sem dados para exibir.")
        return

    with st.expander("Filtros adicionais", expanded=True):
        c1, c2, c3 = st.columns(3)

        entities = ["Todas"] + sorted(df["entity_clean"].drop_nulls().unique().to_list()) if "entity_clean" in df.columns else ["Todas"]
        techs = ["Todos"] + sorted(df["technician_label"].drop_nulls().unique().to_list()) if "technician_label" in df.columns else ["Todos"]
        cats = ["Todas"] + sorted(df["root_category_label"].drop_nulls().unique().to_list()) if "root_category_label" in df.columns else ["Todas"]

        sel_entity = c1.selectbox("Entidade", entities)
        sel_tech = c2.selectbox("Técnico", techs)
        sel_cat = c3.selectbox("Categoria", cats)
        search = st.text_input("Buscar no título", placeholder="Digite para filtrar…")

    result = df

    if "entity_clean" in result.columns and sel_entity != "Todas":
        result = result.filter(pl.col("entity_clean") == sel_entity)

    if "technician_label" in result.columns and sel_tech != "Todos":
        result = result.filter(pl.col("technician_label") == sel_tech)

    if "root_category_label" in result.columns and sel_cat != "Todas":
        result = result.filter(pl.col("root_category_label") == sel_cat)

    if search and "title" in result.columns:
        result = result.filter(pl.col("title").str.contains(search, literal=True))

    st.markdown(f"**{result.height}** tickets encontrados")

    display_cols = [c for c in [
        "ticket_id", "instance", "title", "status_label", "type_label", "priority_label",
        "entity_clean", "technician_label", "requester_fullname", "group_label",
        "root_category_label", "request_type", "date_created", "date_mod", "date_solved",
        "resolution_hours", "sla_breached",
    ] if c in result.columns]

    out = result.select(display_cols).rename({
        "status_label": "Status",
        "type_label": "Tipo",
        "priority_label": "Prioridade",
        "entity_clean": "Entidade",
        "technician_label": "Técnico",
        "requester_fullname": "Solicitante",
        "group_label": "Grupo",
        "root_category_label": "Categoria Raiz",
        "request_type": "Canal",
        "date_created": "Criado em",
        "date_mod": "Atualizado em",
        "date_solved": "Resolvido em",
        "resolution_hours": "Duração (h)",
        "sla_breached": "SLA excedido",
        "ticket_id": "Ticket",
        "instance": "Instância",
        "title": "Título",
    })

    st.dataframe(out.to_pandas(), use_container_width=True, height=520)

    csv = out.to_pandas().to_csv(index=False).encode("utf-8")
    st.download_button(
        "⬇️ Exportar CSV",
        csv,
        "tickets.csv",
        "text/csv",
        use_container_width=True,
    )


# ── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    inject_custom_css()

    filters = render_sidebar()

    raw_df = load_tickets(filters["instances"])
    raw_df = enrich_df(raw_df)

    if raw_df.is_empty():
        st.warning("Nenhum ticket encontrado para os filtros selecionados.")
        return

    df = apply_filters(raw_df, filters)

    n_total = len(raw_df)
    n_filtered = len(df)

    st.title("Central de Tickets Analytics")
    st.caption(
        f"📊 {n_filtered:,} tickets exibidos de {n_total:,} carregados  •  "
        f"Cache atualizado: {datetime.now().strftime('%H:%M:%S')}"
    )

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📈 Visão Geral",
        "👨‍🔧 Técnicos",
        "🗂️ Categorias",
        "🔴 SLA",
        "📋 Relatórios",
    ])

    with tab1:
        render_overview_tab(df, filters)
    with tab2:
        render_technicians_tab(df)
    with tab3:
        render_categories_tab(df)
    with tab4:
        render_sla_tab(df)
    with tab5:
        render_reports_tab(df)


if __name__ == "__main__":
    main()
