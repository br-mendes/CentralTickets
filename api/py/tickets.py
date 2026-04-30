"""
GET /api/py/tickets?instance=PETA,GMX&status=processing&type_id=1&priority_id=4
                   &entity=X&technician=Y&search=texto&page=1&page_size=100

Paginated ticket list with server-side Polars filtering.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import polars as pl
import math

from _utils import (
    fetch_tickets, process_entity, last_group_label, fmt_duration,
    PRIORITY_LABELS, STATUS_LABELS,
)

app = FastAPI(title="CentralTickets Tickets API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/py/tickets")
def get_tickets(
    instance: str = Query(default="PETA,GMX"),
    status: str = Query(default=""),
    type_id: int | None = Query(default=None),
    priority_id: int | None = Query(default=None),
    sla_late: bool = Query(default=False),
    search: str = Query(default=""),
    entity: str = Query(default=""),
    technician: str = Query(default=""),
    category: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    days: int = Query(default=365, ge=1, le=730),
):
    instances = [i.strip().upper() for i in instance.split(",") if i.strip()]
    valid = {"PETA", "GMX"}
    if not instances or any(i not in valid for i in instances):
        raise HTTPException(status_code=400, detail="instance inválido. Use PETA, GMX ou PETA,GMX")

    df, data_truncated = fetch_tickets(instances, days)

    if df.is_empty():
        return {"tickets": [], "total": 0, "page": page, "page_size": page_size, "pages": 0, "data_truncated": False}

    # ── Filters ───────────────────────────────────────────────────────
    if status and "status_key" in df.columns:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        # support approval alias
        expanded = []
        for s in statuses:
            expanded.append(s)
            if s == "approval":
                expanded.append("pending-approval")
            elif s == "pending-approval":
                expanded.append("approval")
        df = df.filter(pl.col("status_key").is_in(expanded))

    if type_id is not None and "type_id" in df.columns:
        df = df.filter(pl.col("type_id") == type_id)

    if priority_id is not None and "priority_id" in df.columns:
        df = df.filter(pl.col("priority_id") == priority_id)

    if sla_late and "is_sla_late" in df.columns:
        df = df.filter(pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True))

    if entity and "entity" in df.columns:
        df = df.filter(
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8) == entity
        )

    if technician and "technician" in df.columns:
        df = df.filter(pl.col("technician") == technician)

    if category and "root_category" in df.columns:
        df = df.filter(pl.col("root_category") == category)

    if search and "title" in df.columns:
        df = df.filter(
            pl.col("title").str.contains(search, literal=True) |
            pl.col("ticket_id").cast(pl.Utf8).str.contains(search, literal=True)
        )

    total = df.height
    pages = math.ceil(total / page_size) if total > 0 else 0
    offset = (page - 1) * page_size

    page_df = (
        df.with_columns([
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean"),
            pl.col("status_key").replace(list(STATUS_LABELS.keys()), list(STATUS_LABELS.values()), default="—").alias("status_label"),
            pl.col("priority_id").cast(pl.Utf8).replace(
                [str(k) for k in PRIORITY_LABELS.keys()], list(PRIORITY_LABELS.values()), default="—"
            ).alias("priority_label"),
            pl.col("resolution_duration").map_elements(fmt_duration, return_dtype=pl.Utf8).alias("resolution_fmt")
            if "resolution_duration" in df.columns else pl.lit("—").alias("resolution_fmt"),
        ])
        .slice(offset, page_size)
    )

    tickets = []
    for row in page_df.to_dicts():
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
        tickets.append(row)

    return {
        "tickets": tickets,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "data_truncated": data_truncated,
    }


handler = Mangum(app, lifespan="off")
