"""
FastAPI backend for CentralTickets
Serves data to both Next.js frontend and Streamlit dashboard
"""
import os
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import polars as pl
from supabase import create_client, Client

app = FastAPI(title="CentralTickets Backend", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    return create_client(url, key)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/api/tickets")
async def get_tickets(
    instances: str = "PETA,GMX",
    status: str = None,
    priority: int = None,
    limit: int = 1000,
):
    """Get tickets with optional filters"""
    try:
        sb = get_supabase_client()

        query = sb.from("tickets_cache").select(
            "ticket_id,instance,title,status_id,status_key,type_id,priority_id,"
            "entity,technician,group_name,request_type,date_created,date_mod,"
            "is_sla_late,is_overdue_resolve,due_date,resolution_duration"
        ).in_("instance", instances.split(",")).eq("is_deleted", False)

        if status:
            query = query.eq("status_key", status)
        if priority:
            query = query.eq("priority_id", priority)

        result = query.limit(limit).execute()

        # Convert to Polars for processing
        df = pl.DataFrame(result.data) if result.data else pl.DataFrame()

        return {
            "count": len(df),
            "data": df.to_dicts() if not df.is_empty() else []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard KPI statistics"""
    try:
        sb = get_supabase_client()

        # Get active tickets (not closed/solved)
        active = sb.from("tickets_cache").select(
            "ticket_id,status_key,type_id,priority_id,is_sla_late,is_overdue_resolve"
        ).in_("instance", ["PETA", "GMX"]).eq("is_deleted", False).neq(
            "status_key", "closed"
        ).neq("status_key", "solved").execute()

        active_df = pl.DataFrame(active.data) if active.data else pl.DataFrame()

        stats = {
            "total_active": len(active_df),
            "incidents": len(active_df.filter(pl.col("type_id") == 1)) if "type_id" in active_df.columns else 0,
            "requests": len(active_df.filter(pl.col("type_id") == 2)) if "type_id" in active_df.columns else 0,
            "sla_late": len(active_df.filter(
                pl.col("is_sla_late").eq(True) | pl.col("is_overdue_resolve").eq(True)
            )) if "is_sla_late" in active_df.columns else 0,
        }

        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dashboard/trend")
async def get_trend_30d():
    """Get 30-day trend data"""
    try:
        sb = get_supabase_client()
        cutoff = (datetime.now() - timedelta(days=30)).isoformat()

        result = sb.from("tickets_cache").select(
            "ticket_id,date_created,status_key"
        ).in_("instance", ["PETA", "GMX"]).eq("is_deleted", False).gte(
            "date_created", cutoff
        ).execute()

        df = pl.DataFrame(result.data) if result.data else pl.DataFrame()

        # Group by date
        if not df.is_empty() and "date_created" in df.columns:
            trend = df.with_columns(
                pl.col("date_created").str.slice(0, 10).alias("date")
            ).group_by("date").agg(
                pl.len().alias("count")
            ).sort("date")

            return {
                "data": trend.to_dicts(),
                "start": cutoff,
                "end": datetime.now().isoformat()
            }

        return {"data": [], "start": cutoff, "end": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
