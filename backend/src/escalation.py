import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

DB_NAME = str(
    BASE_DIR.parent / "escalations.db"
)


def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_escalation_database():

    conn = get_connection()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS escalations (
            ticket_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,

            reason TEXT NOT NULL,
            summary TEXT NOT NULL,
            agent_checked TEXT,

            urgency TEXT NOT NULL,

            language TEXT,
            follow_up_method TEXT,

            status TEXT NOT NULL DEFAULT 'OPEN'
        )
        """
    )

    conn.commit()
    conn.close()


init_escalation_database()


# ============================================================
# REDACT SENSITIVE INFORMATION
# ============================================================

def redact_sensitive_information(text: str) -> str:

    if not text:
        return ""

    text = str(text)

    text = re.sub(
        r"\b(?:otp|one[- ]time password|verification code)"
        r"\s*[:\-]?\s*\d{4,8}\b",
        "[REDACTED OTP]",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\b(?:pin|upi pin|atm pin)"
        r"\s*[:\-]?\s*\d{4,6}\b",
        "[REDACTED PIN]",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\b(?:password|passcode)"
        r"\s*[:\-]?\s*\S+",
        "[REDACTED PASSWORD]",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\b\d{12,19}\b",
        "[REDACTED ACCOUNT NUMBER]",
        text,
    )

    return text


# ============================================================
# CREATE TICKET
# ============================================================

def create_escalation(
    *,
    user_id: str,
    reason: str,
    summary: str,
    agent_checked: str,
    urgency: str,
    language: str,
    follow_up_method: str,
) -> str:

    urgency = urgency.strip().upper()

    if urgency not in {
        "LOW",
        "MEDIUM",
        "HIGH",
        "EMERGENCY",
    }:
        urgency = "MEDIUM"

    ticket_id = (
        "ESC-"
        + uuid.uuid4().hex[:6].upper()
    )

    created_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    conn = get_connection()

    conn.execute(
        """
        INSERT INTO escalations (
            ticket_id,
            user_id,
            created_at,
            reason,
            summary,
            agent_checked,
            urgency,
            language,
            follow_up_method,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
        """,
        (
            ticket_id,
            user_id,
            created_at,
            reason.strip(),
            redact_sensitive_information(summary),
            redact_sensitive_information(agent_checked),
            urgency,
            language.strip(),
            follow_up_method.strip(),
        ),
    )

    conn.commit()
    conn.close()

    return ticket_id


# ============================================================
# GET TICKETS
# ============================================================

def get_all_escalations():

    conn = get_connection()

    rows = conn.execute(
        """
        SELECT
            ticket_id,
            user_id,
            created_at,
            reason,
            summary,
            agent_checked,
            urgency,
            language,
            follow_up_method,
            status
        FROM escalations
        ORDER BY created_at DESC
        """
    ).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# UPDATE STATUS
# ============================================================

def update_escalation_status(
    ticket_id: str,
    status: str,
) -> bool:

    status = status.strip().upper()

    if status not in {
        "OPEN",
        "IN PROGRESS",
        "RESOLVED",
    }:
        return False

    conn = get_connection()

    cursor = conn.execute(
        """
        UPDATE escalations
        SET status = ?
        WHERE ticket_id = ?
        """,
        (
            status,
            ticket_id,
        ),
    )

    conn.commit()

    updated = cursor.rowcount > 0

    conn.close()

    return updated