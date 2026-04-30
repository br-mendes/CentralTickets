"""
GET /api/py/sla?instance=PETA,GMX&days=365&entity=

Detailed SLA compliance analytics:
- Overall compliance rate
- Compliance by entity, technician, and month
- Mean time to resolve (late vs on-time)
- Open SLA-late tickets sorted by urgency
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta

import polars as pl
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from _utils import (
    fetch_tickets, process_entity, last_group_label, fmt_duration,
    PRIORITY_LABELS, STATUS_LABELS,
)

app = FastAPI(title="CentralTickets SLA API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _compliance(total: int, late: int) -> float:
    return round((1 - late / total) * 100, 1) if total > 0 else 100.0


def _by_dimension(df: pl.DataFrame, col: str, transform=None, top: int = 20) -> list[dict]:
    if col not in df.columns or "is_sla_late" not in df.columns:
        return []
    work = df
    if transform:
        work = work.with_columns(
            pl.col(col).map_elements(transform, return_dtype=pl.Utf8).alias("_dim")
        )
    else:
        work = work.with_columns(pl.col(col).alias("_dim"))

    work = work.filter(pl.col("_dim").is_not_null() & (pl.col("_dim") != "") & (pl.col("_dim") != "—"))

    result = (
        work.group_by("_dim")
        .agg([
            pl.len().alias("total"),
            (pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)).sum().alias("late"),
        ])
        .sort("total", descending=True)
        .head(top)
        .with_columns(
            pl.struct(["total", "late"])
            .map_elements(lambda r: _compliance(r["total"], r["late"]), return_dtype=pl.Float64)
            .alias("compliance_pct")
        )
        .rename({"_dim": "name"})
        .to_dicts()
    )
    return result


def _by_month(df: pl.DataFrame) -> list[dict]:
    if "date_created" not in df.columns or "is_sla_late" not in df.columns:
        return []
    work = df.filter(pl.col("date_created").is_not_null()).with_columns(
        pl.col("date_created").dt.strftime("%Y-%m").alias("month")
    )
    rows = (
        work.group_by("month")
        .agg([
            pl.len().alias("total"),
            (pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)).sum().alias("late"),
        ])
        .sort("month")
        .with_columns(
            pl.struct(["total", "late"])
            .map_elements(lambda r: _compliance(r["total"], r["late"]), return_dtype=pl.Float64)
            .alias("compliance_pct")
        )
        .to_dicts()
    )
    return rows


def _mttr(df: pl.DataFrame) -> dict:
    if "resolution_duration" not in df.columns or "is_sla_late" not in df.columns:
        return {}
    resolved = df.filter(
        pl.col("status_key").is_in(["solved", "closed"]) &
        pl.col("resolution_duration").is_not_null() &
        (pl.col("resolution_duration") > 0)
    )
    on_time = resolved.filter(
        ~pl.col("is_sla_late").eq(True) & ~pl.col("is_overdue_resolve").eq(True)
    )
    late = resolved.filter(
        pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
    )
    return {
        "overall":  fmt_duration(resolved["resolution_duration"].mean() if not resolved.is_empty() else None),
        "on_time":  fmt_duration(on_time["resolution_duration"].mean() if not on_time.is_empty() else None),
        "late":     fmt_duration(late["resolution_duration"].mean() if not late.is_empty() else None),
        "resolved_count": resolved.height,
    }


def _open_late(df: pl.DataFrame, top: int = 20) -> list[dict]:
    if "is_sla_late" not in df.columns:
        return []
    now = datetime.now()

    def days_overdue(dt):
        if dt is None:
            return 0
        try:
            return max(0, (now - dt.replace(tzinfo=None)).days)
        except (AttributeError, TypeError, ValueError):
            return 0

    sla = (
        df.filter(
            (pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)) &
            ~pl.col("status_key").is_in(["closed", "solved"])
        )
        .with_columns([
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean"),
            pl.col("status_key").replace(STATUS_LABELS, default="—").alias("status_label"),
            pl.col("priority_id").cast(pl.Utf8).replace(
                {str(k): v for k, v in PRIORITY_LABELS.items()}, default="—"
            ).alias("priority_label"),
        ])
    )

    if "due_date" in sla.columns:
        sla = sla.with_columns(
            pl.col("due_date").map_elements(days_overdue, return_dtype=pl.Int64).alias("days_overdue")
        ).sort("days_overdue", descending=True)

    cols = ["ticket_id", "instance", "title", "entity_clean", "status_label",
            "priority_label", "technician", "requester_fullname", "due_date", "days_overdue"]
    cols = [c for c in cols if c in sla.columns]
    rows = sla.select(cols).head(top).to_dicts()
    for row in rows:
        if "due_date" in row and row["due_date"] is not None:
            row["due_date"] = str(row["due_date"])
    return rows


@app.get("/api/py/sla")
def sla_analytics(
    instance: str = Query(default="PETA,GMX"),
    days: int = Query(default=365, ge=1, le=730),
    entity: str = Query(default=""),
):
    instances = [i.strip().upper() for i in instance.split(",") if i.strip()]
    if not instances or any(i not in {"PETA", "GMX"} for i in instances):
        raise HTTPException(status_code=400, detail="instance inválido. Use PETA, GMX ou PETA,GMX")

    df = fetch_tickets(instances, days)

    if df.is_empty():
        return {
            "instances": instances, "days": days,
            "summary": {"total": 0, "late": 0, "compliance_pct": 100.0},
            "by_entity": [], "by_technician": [], "by_month": [],
            "mttr": {}, "open_late": [],
        }

    # Optional entity filter (post-fetch)
    if entity and "entity" in df.columns:
        df = df.filter(
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8) == entity
        )

    # Summary
    total = df.height
    late = df.filter(
        pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
    ).height if "is_sla_late" in df.columns else 0

    return {
        "instances": instances,
        "days": days,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total": total,
            "late": late,
            "on_time": total - late,
            "compliance_pct": _compliance(total, late),
        },
        "by_entity":      _by_dimension(df, "entity", transform=process_entity, top=20),
        "by_technician":  _by_dimension(df, "technician", top=20),
        "by_group":       _by_dimension(df, "group_name", transform=last_group_label, top=15),
        "by_month":       _by_month(df),
        "mttr":           _mttr(df),
        "open_late":      _open_late(df, top=20),
    }


handler = Mangum(app, lifespan="off")
