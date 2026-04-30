"""
GET /api/py/analytics?instance=PETA,GMX&days=365

Returns pre-aggregated dashboard stats computed with Polars server-side.
The frontend receives ~20 aggregated values instead of thousands of raw rows.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta, date

import polars as pl
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from _utils import (
    fetch_tickets, get_supabase, process_entity, last_group_label, fmt_duration,
    PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS,
)

app = FastAPI(title="CentralTickets Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _top_counts(df: pl.DataFrame, col: str, top: int = 10, transform=None) -> list[dict]:
    if col not in df.columns:
        return []
    series = df[col]
    if transform:
        series = series.map_elements(transform, return_dtype=pl.Utf8)
    return (
        df.with_columns(series.alias("_key"))
        .filter(pl.col("_key").is_not_null() & (pl.col("_key") != "") & (pl.col("_key") != "—"))
        .group_by("_key")
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(top)
        .rename({"_key": "name"})
        .to_dicts()
    )


def _trend_30d(df: pl.DataFrame) -> dict:
    if "date_created" not in df.columns:
        return {"labels": [], "opened": [], "closed": []}

    today = datetime.now().date()
    labels, opened, closed = [], [], []

    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        start = datetime.combine(d, datetime.min.time())
        end = datetime.combine(d, datetime.max.time())
        labels.append(d.strftime("%d/%m"))
        opened.append(
            df.filter(pl.col("date_created").is_between(pl.lit(start), pl.lit(end))).height
        )
        closed_count = (
            df.filter(
                pl.col("status_key").is_in(["closed", "solved"]) &
                pl.col("date_solved").is_not_null() &
                pl.col("date_solved").is_between(pl.lit(start), pl.lit(end))
            ).height
            if "date_solved" in df.columns else 0
        )
        closed.append(closed_count)

    return {"labels": labels, "opened": opened, "closed": closed}


def _resolution_rate(df: pl.DataFrame, days: int) -> dict:
    cutoff = datetime.now() - timedelta(days=days)
    if "date_created" not in df.columns:
        return {"rate": 0, "resolved": 0, "total": 0}
    in_period = df.filter(pl.col("date_created") >= pl.lit(cutoff))
    resolved = in_period.filter(pl.col("status_key").is_in(["solved", "closed"]))
    total = in_period.height
    return {
        "rate": round(resolved.height / total * 100, 1) if total > 0 else 0,
        "resolved": resolved.height,
        "total": total,
    }


def _sla_critical(df: pl.DataFrame, top: int = 8) -> list[dict]:
    if "is_sla_late" not in df.columns:
        return []
    now = datetime.now()
    sla = (
        df.filter(
            (pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)) &
            ~pl.col("status_key").is_in(["closed", "solved"])
        )
        .with_columns([
            pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean"),
            pl.col("status_key").replace(list(STATUS_LABELS.keys()), list(STATUS_LABELS.values()), default="—").alias("status_label"),
            pl.col("priority_id").cast(pl.Utf8).replace(
                [str(k) for k in PRIORITY_LABELS.keys()], list(PRIORITY_LABELS.values()), default="—"
            ).alias("priority_label"),
        ])
    )

    if "due_date" in sla.columns:
        def days_overdue(dt):
            if dt is None:
                return 0
            try:
                delta = now - dt.replace(tzinfo=None)
                return max(0, delta.days)
            except (AttributeError, TypeError, ValueError):
                return 0
        sla = sla.with_columns(
            pl.col("due_date").map_elements(days_overdue, return_dtype=pl.Int64).alias("days_overdue")
        ).sort("days_overdue", descending=True)

    cols = ["ticket_id", "instance", "title", "entity_clean", "status_label",
            "priority_label", "technician", "requester_fullname", "due_date", "days_overdue"]
    cols = [c for c in cols if c in sla.columns]

    result = sla.select(cols).head(top).to_dicts()
    for row in result:
        if "due_date" in row and row["due_date"] is not None:
            row["due_date"] = str(row["due_date"])
    return result


@app.get("/api/py/analytics")
def analytics(
    instance: str = Query(default="PETA,GMX"),
    days: int = Query(default=365, ge=1, le=730),
):
    instances = [i.strip().upper() for i in instance.split(",") if i.strip()]
    valid = {"PETA", "GMX"}
    if not instances or any(i not in valid for i in instances):
        raise HTTPException(status_code=400, detail="instance inválido. Use PETA, GMX ou PETA,GMX")

    df, data_truncated = fetch_tickets(instances, days)

    if df.is_empty():
        return {
            "total": 0, "instances": instances, "generated_at": datetime.now().isoformat(),
            "last_sync": None, "data_truncated": data_truncated,
            "kpis": {
                "total": 0, "incidents": 0, "requests": 0,
                "new": 0, "processing": 0, "pending": 0, "approval": 0,
                "solved": 0, "closed": 0, "sla_late": 0, "sla_late_active": 0,
                "avg_resolution": "—", "avg_pending_hours": 0,
            },
            "by_status": [], "by_type": [], "by_priority": [],
            "by_entity": [], "by_technician": [], "by_category": [],
            "by_group": [], "by_request_type": [],
            "trend_30d": {"labels": [], "opened": [], "closed": []},
            "resolution_rate_7d": {"rate": 0, "resolved": 0, "total": 0},
            "resolution_rate_30d": {"rate": 0, "resolved": 0, "total": 0},
            "sla_critical": [], "sla_total": 0,
            "approval_tickets": [], "instance_breakdown": {},
        }

    # ── KPIs ─────────────────────────────────────────────────────────
    total = df.height
    by_status = df.group_by("status_key").agg(pl.len().alias("count")).to_dicts() if "status_key" in df.columns else []
    status_map = {r["status_key"]: r["count"] for r in by_status}

    incidents = df.filter(pl.col("type_id") == 1).height if "type_id" in df.columns else 0
    requests  = df.filter(pl.col("type_id") == 2).height if "type_id" in df.columns else 0

    sla_late = df.filter(
        pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
    ).height if "is_sla_late" in df.columns else 0

    # Average resolution time
    resolved_df = df.filter(
        pl.col("status_key").is_in(["solved", "closed"]) &
        (pl.col("resolution_duration").is_not_null()) &
        (pl.col("resolution_duration") > 0)
    ) if "resolution_duration" in df.columns else pl.DataFrame()
    avg_resolution_sec = (
        resolved_df["resolution_duration"].mean()
        if not resolved_df.is_empty() else None
    )

    # Average pending time (hours since date_mod for pending tickets)
    pending_df = df.filter(pl.col("status_key").is_in(["pending"])) if "status_key" in df.columns else pl.DataFrame()
    now_dt = datetime.now()
    avg_pending_hours = 0
    if not pending_df.is_empty() and "date_mod" in pending_df.columns:
        def hours_ago(dt):
            if dt is None:
                return 0
            try:
                return max(0, int((now_dt - dt.replace(tzinfo=None)).total_seconds() / 3600))
            except (AttributeError, TypeError, ValueError):
                return 0
        hours = pending_df["date_mod"].map_elements(hours_ago, return_dtype=pl.Int64)
        avg_pending_hours = int(hours.mean() or 0)

    # ── Instance breakdown ────────────────────────────────────────────
    instance_breakdown = {}
    for inst in instances:
        sub = df.filter(pl.col("instance").str.to_uppercase() == inst) if "instance" in df.columns else pl.DataFrame()
        sub_status = sub.group_by("status_key").agg(pl.len().alias("count")).to_dicts() if not sub.is_empty() else []
        sub_map = {r["status_key"]: r["count"] for r in sub_status}
        instance_breakdown[inst] = {
            "total": sub.height,
            "new": sub_map.get("new", 0),
            "processing": sub_map.get("processing", 0),
            "pending": sub_map.get("pending", 0),
            "approval": sub_map.get("approval", 0) + sub_map.get("pending-approval", 0),
            "solved": sub_map.get("solved", 0),
            "closed": sub_map.get("closed", 0),
        }

    # ── Priority breakdown ────────────────────────────────────────────
    by_priority_raw = []
    if "priority_id" in df.columns:
        by_priority_raw = (
            df.group_by("priority_id")
            .agg(pl.len().alias("count"))
            .sort("priority_id")
            .with_columns(
                pl.col("priority_id").cast(pl.Int64, strict=False)
                .map_elements(lambda x: PRIORITY_LABELS.get(x, f"P{x}"), return_dtype=pl.Utf8)
                .alias("label")
            )
            .to_dicts()
        )

    # ── Approval tickets (top 5 for dashboard preview) ───────────────
    approval_tickets = []
    if "status_key" in df.columns:
        appr_df = (
            df.filter(pl.col("status_key").is_in(["approval", "pending-approval"]))
            .with_columns(
                pl.col("entity").map_elements(process_entity, return_dtype=pl.Utf8).alias("entity_clean")
            )
        )
        appr_df = appr_df.select(
            [c for c in ["ticket_id", "instance", "title", "entity_clean"] if c in appr_df.columns]
        ).head(5)
        approval_tickets = appr_df.to_dicts()

    # ── SLA critical count (direct filter) and preview (capped helper) ──
    sla_late_active = df.filter(
        (pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True))
        & ~pl.col("status_key").is_in(["closed", "solved"])
    ).height if "is_sla_late" in df.columns else 0
    sla_critical_preview = _sla_critical(df, top=8)

    # ── Last sync ─────────────────────────────────────────────────────
    last_sync = None
    try:
        sb = get_supabase()
        sync_resp = sb.table("sync_control").select("last_sync").order("last_sync", desc=True).limit(1).execute()
        if sync_resp.data:
            last_sync = sync_resp.data[0]["last_sync"]
    except Exception:
        pass

    # ── Build response ────────────────────────────────────────────────
    return {
        "total": total,
        "instances": instances,
        "generated_at": datetime.now().isoformat(),
        "last_sync": last_sync,
        "data_truncated": data_truncated,
        "kpis": {
            "total": total,
            "incidents": incidents,
            "requests": requests,
            "new": status_map.get("new", 0),
            "processing": status_map.get("processing", 0),
            "pending": status_map.get("pending", 0),
            "approval": status_map.get("approval", 0) + status_map.get("pending-approval", 0),
            "solved": status_map.get("solved", 0),
            "closed": status_map.get("closed", 0),
            "sla_late": sla_late,
            "sla_late_active": sla_late_active,
            "avg_resolution": fmt_duration(avg_resolution_sec),
            "avg_pending_hours": avg_pending_hours,
        },
        "instance_breakdown": instance_breakdown,
        "by_status": [
            {"key": r["status_key"], "label": STATUS_LABELS.get(r["status_key"], r["status_key"]), "count": r["count"]}
            for r in by_status
        ],
        "by_type": [
            {"type_id": r["type_id"], "label": TYPE_LABELS.get(r["type_id"], "—"), "count": r["count"]}
            for r in (df.group_by("type_id").agg(pl.len().alias("count")).to_dicts() if "type_id" in df.columns else [])
        ],
        "by_priority": by_priority_raw,
        "by_entity": _top_counts(df, "entity", top=16, transform=process_entity),
        "by_technician": _top_counts(df, "technician", top=10),
        "by_category": _top_counts(df, "root_category", top=10),
        "by_group": _top_counts(df, "group_name", top=15, transform=last_group_label),
        "by_request_type": _top_counts(df, "request_type", top=8),
        "trend_30d": _trend_30d(df),
        "resolution_rate_7d": _resolution_rate(df, 7),
        "resolution_rate_30d": _resolution_rate(df, 30),
        "sla_critical": sla_critical_preview,
        "sla_total": sla_late,
        "approval_tickets": approval_tickets,
    }


handler = Mangum(app, lifespan="off")
