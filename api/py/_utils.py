"""Shared helpers for FastAPI endpoints."""
import re
import json
import os
from datetime import datetime, timedelta

import polars as pl
from supabase import create_client, Client

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
STATUS_LABELS = {
    "new": "Novo", "processing": "Em Atendimento", "pending": "Pendente",
    "solved": "Solucionado", "closed": "Fechado",
    "pending-approval": "Aprovação", "approval": "Aprovação",
}
STATUS_ID_MAP = {
    1: "new", 2: "processing", 3: "processing",
    4: "pending", 5: "solved", 6: "closed", 7: "approval",
}
TYPE_LABELS = {1: "Incidente", 2: "Requisição"}

ONE_YEAR_DAYS = 365
PAGE_SIZE = 1000


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set")
    return create_client(url, key)


def fetch_tickets(
    instances: list[str], days: int = ONE_YEAR_DAYS, max_pages: int = 25
) -> tuple[pl.DataFrame, bool]:
    """Return (df, truncated). truncated=True when the page cap was hit."""
    sb = get_supabase()
    one_year_ago = (datetime.now() - timedelta(days=days)).isoformat()
    rows: list[dict] = []
    from_row = 0
    pages_read = 0
    truncated = False

    while pages_read < max_pages:
        resp = (
            sb.table("tickets_cache")
            .select(",".join(COLS))
            .in_("instance", instances)
            .neq("is_deleted", True)
            .or_(f"status_key.not.in.(closed,solved),date_created.gte.{one_year_ago}")
            .order("date_mod", desc=True)
            .order("ticket_id", desc=True)
            .range(from_row, from_row + PAGE_SIZE - 1)
            .execute()
        )
        pages_read += 1
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < PAGE_SIZE:
            break
        from_row += PAGE_SIZE
    else:
        truncated = True

    if not rows:
        return pl.DataFrame(), truncated

    df = pl.DataFrame(rows, infer_schema_length=500)

    for col in ("date_created", "date_mod", "date_solved", "due_date"):
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).str.to_datetime(format=None, strict=False)
            )
    for col in ("ticket_id", "status_id", "type_id", "priority_id", "urgency",
                "resolution_duration", "waiting_duration"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Int64, strict=False))

    return df, truncated


def process_entity(entity: str | None) -> str:
    if not entity:
        return "—"
    s = re.sub(r"^PETA\s+GRUPO\s*>\s*", "", entity, flags=re.IGNORECASE)
    s = re.sub(r"^GMX\s+TECNOLOGIA\s*>\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^PETA\s*>\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^GMX\s*>\s*", "", s, flags=re.IGNORECASE)
    return s.strip() or entity


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
    return s.split(">")[-1].strip() or s


def fmt_duration(seconds: float | None) -> str:
    if not seconds or seconds <= 0:
        return "—"
    h = int(seconds // 3600)
    d, rh = divmod(h, 24)
    if d > 0:
        return f"{d}d {rh}h" if rh else f"{d}d"
    return f"{h}h"
