import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


BASE_DIR = Path(__file__).resolve().parent

DB_NAME = BASE_DIR.parent / "memory.db"


SUCCESS_TYPES = {
    "guidance_provided",
    "reminder_completed",
    "facility_lookup_completed",
    "escalation_created",
    "task_completed",
    "other_success",
}


FAILURE_TYPES = {
    "user_hangup",
    "incomplete_task",
    "tool_failure",
    "api_error",
    "no_response",
    "other_failure",
}


def _connect():
    conn = sqlite3.connect(
        str(DB_NAME),
        timeout=10,
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_analytics_database():

    conn = _connect()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS call_analytics (
            call_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds REAL,
            channel TEXT NOT NULL DEFAULT 'browser',
            language TEXT,
            purpose TEXT,
            outcome TEXT NOT NULL DEFAULT 'in_progress',
            success_type TEXT,
            failure_type TEXT,
            latency_ms REAL,
            notes TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.commit()

    conn.close()


init_analytics_database()


def create_call(
    call_id: str,
    user_id: str,
    started_at: str,
    channel: str,
):

    conn = _connect()

    conn.execute(
        """
        INSERT OR REPLACE INTO call_analytics
        (
            call_id,
            user_id,
            started_at,
            channel,
            outcome,
            created_at
        )
        VALUES (
            ?,
            ?,
            ?,
            ?,
            'in_progress',
            ?
        )
        """,
        (
            call_id,
            user_id,
            started_at,
            channel,
            datetime.now(
                timezone.utc
            ).isoformat(
                timespec="seconds"
            ),
        ),
    )

    conn.commit()

    conn.close()


def update_call_context(
    call_id: str,
    *,
    language: Optional[str] = None,
    purpose: Optional[str] = None,
    latency_ms: Optional[float] = None,
):

    fields = []

    values = []

    if language:

        fields.append(
            "language = ?"
        )

        values.append(
            language.strip()
        )

    if purpose:

        fields.append(
            "purpose = ?"
        )

        values.append(
            purpose.strip()
        )

    if latency_ms is not None:

        fields.append(
            "latency_ms = ?"
        )

        values.append(
            float(latency_ms)
        )

    if not fields:
        return

    values.append(
        call_id
    )

    conn = _connect()

    conn.execute(
        f"""
        UPDATE call_analytics
        SET {', '.join(fields)}
        WHERE call_id = ?
        """,
        values,
    )

    conn.commit()

    conn.close()


def finalize_call(
    call_id: str,
    *,
    outcome: str,
    ended_at: str,
    success_type: Optional[str] = None,
    failure_type: Optional[str] = None,
    language: Optional[str] = None,
    purpose: Optional[str] = None,
    latency_ms: Optional[float] = None,
    notes: Optional[str] = None,
):

    outcome = (
        outcome
        .strip()
        .lower()
    )

    if outcome not in {
        "success",
        "failed",
    }:

        outcome = "failed"


    if outcome == "success":

        failure_type = None

        if (
            success_type
            not in SUCCESS_TYPES
        ):

            success_type = (
                "other_success"
            )

    else:

        success_type = None

        if (
            failure_type
            not in FAILURE_TYPES
        ):

            failure_type = (
                "other_failure"
            )


    conn = _connect()

    row = conn.execute(
        """
        SELECT started_at
        FROM call_analytics
        WHERE call_id = ?
        """,
        (call_id,),
    ).fetchone()


    if not row:

        conn.close()

        return False


    try:

        start_dt = datetime.fromisoformat(
            row["started_at"]
        )

        end_dt = datetime.fromisoformat(
            ended_at
        )

        duration = max(
            0.0,
            (
                end_dt - start_dt
            ).total_seconds(),
        )

    except Exception:

        duration = None


    conn.execute(
        """
        UPDATE call_analytics
        SET
            ended_at = ?,
            duration_seconds = ?,
            outcome = ?,
            success_type = ?,
            failure_type = ?,
            language = COALESCE(?, language),
            purpose = COALESCE(?, purpose),
            latency_ms = COALESCE(?, latency_ms),
            notes = ?
        WHERE call_id = ?
        """,
        (
            ended_at,
            duration,
            outcome,
            success_type,
            failure_type,
            language.strip()
            if language
            else None,
            purpose.strip()
            if purpose
            else None,
            float(latency_ms)
            if latency_ms is not None
            else None,
            notes,
            call_id,
        ),
    )

    conn.commit()

    conn.close()

    return True


def get_analytics(
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    channel: Optional[str] = None,
    language: Optional[str] = None,
    outcome: Optional[str] = None,
):

    conn = _connect()

    where = [
        "1=1"
    ]

    params = []


    if start_date:

        where.append(
            "started_at >= ?"
        )

        params.append(
            start_date
            + "T00:00:00"
        )


    if end_date:

        where.append(
            "started_at < ?"
        )

        params.append(
            end_date
            + "T23:59:59"
        )


    if channel:

        where.append(
            "channel = ?"
        )

        params.append(
            channel
        )


    if language:

        where.append(
            "language = ?"
        )

        params.append(
            language
        )


    if outcome in {
        "success",
        "failed",
    }:

        where.append(
            "outcome = ?"
        )

        params.append(
            outcome
        )


    rows = conn.execute(
        f"""
        SELECT
            call_id,
            started_at,
            ended_at,
            duration_seconds,
            channel,
            language,
            purpose,
            outcome,
            success_type,
            failure_type,
            latency_ms
        FROM call_analytics
        WHERE {' AND '.join(where)}
        ORDER BY started_at DESC
        """,
        params,
    ).fetchall()


    records = [
        dict(row)
        for row in rows
    ]

    conn.close()


    total = len(records)

    successful = sum(
        1
        for row in records
        if row["outcome"]
        == "success"
    )

    failed = sum(
        1
        for row in records
        if row["outcome"]
        == "failed"
    )


    success_rate = (
        round(
            (
                successful
                / total
            )
            * 100,
            1,
        )
        if total
        else 0.0
    )


    latencies = [
        row["latency_ms"]
        for row in records
        if row["latency_ms"]
        is not None
    ]


    durations = [
        row["duration_seconds"]
        for row in records
        if row["duration_seconds"]
        is not None
    ]


    failure_breakdown = {}

    for row in records:

        if row["outcome"] != "failed":
            continue

        key = (
            row["failure_type"]
            or "other_failure"
        )

        failure_breakdown[key] = (
            failure_breakdown.get(
                key,
                0,
            )
            + 1
        )


    success_breakdown = {}

    for row in records:

        if row["outcome"] != "success":
            continue

        key = (
            row["success_type"]
            or "other_success"
        )

        success_breakdown[key] = (
            success_breakdown.get(
                key,
                0,
            )
            + 1
        )


    by_day = {}

    for row in records:

        day = row[
            "started_at"
        ][:10]

        if day not in by_day:

            by_day[day] = {
                "date": day,
                "total": 0,
                "successful": 0,
                "failed": 0,
            }

        by_day[day]["total"] += 1

        if (
            row["outcome"]
            == "success"
        ):

            by_day[day][
                "successful"
            ] += 1

        else:

            by_day[day][
                "failed"
            ] += 1


    languages = sorted(
        {
            row["language"]
            for row in records
            if row["language"]
        }
    )


    channels = sorted(
        {
            row["channel"]
            for row in records
            if row["channel"]
        }
    )


    return {
        "metrics": {
            "total_calls": total,
            "successful_calls":
                successful,
            "failed_calls":
                failed,
            "success_rate":
                success_rate,
            "average_latency_ms":
                round(
                    sum(latencies)
                    / len(latencies),
                    1,
                )
                if latencies
                else 0,
            "min_latency_ms":
                round(
                    min(latencies),
                    1,
                )
                if latencies
                else 0,
            "max_latency_ms":
                round(
                    max(latencies),
                    1,
                )
                if latencies
                else 0,
            "average_duration_seconds":
                round(
                    sum(durations)
                    / len(durations),
                    1,
                )
                if durations
                else 0,
        },

        "failure_breakdown":
            failure_breakdown,

        "success_breakdown":
            success_breakdown,

        "by_day":
            sorted(
                by_day.values(),
                key=lambda item:
                    item["date"],
            ),

        "calls":
            records,

        "filters": {
            "languages":
                languages,
            "channels":
                channels,
        },
    }