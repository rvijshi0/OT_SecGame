"""
CYBER SHIFT — Database & Security Model
Handles SQLite database initialization, user tracking (800+ players),
OTP generation/validation, session management, and single-attempt enforcement.
"""

import sqlite3
import hashlib
import secrets
import datetime
from config import DATABASE_FILE, OTP_EXPIRY_MINUTES, SESSION_EXPIRY_HOURS

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table — tracks email and single-play status for IT and OT missions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            it_played INTEGER DEFAULT 0,
            it_score INTEGER DEFAULT NULL,
            it_grade TEXT DEFAULT NULL,
            it_played_at TIMESTAMP DEFAULT NULL,
            ot_played INTEGER DEFAULT 0,
            ot_score INTEGER DEFAULT NULL,
            ot_grade TEXT DEFAULT NULL,
            ot_played_at TIMESTAMP DEFAULT NULL
        )
    """)
    
    # OTPs table — stores hashed OTP codes with expiration & single-use tracking
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            is_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Sessions table — authenticated user access tokens
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP DEFAULT NULL,
            revoked_reason TEXT DEFAULT NULL
        )
    """)
    # Migrate databases created before session revocation existed
    session_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(sessions)")}
    if "revoked_at" not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMP DEFAULT NULL")
    if "revoked_reason" not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN revoked_reason TEXT DEFAULT NULL")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email)")
    
    # Mission Logs table — audit trail of decision choices and mission attempts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mission_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            grade TEXT NOT NULL,
            decisions_json TEXT NOT NULL,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

def hash_otp(otp_code: str) -> str:
    return hashlib.sha256(otp_code.encode('utf-8')).hexdigest()

def get_or_create_user(email: str):
    email = email.strip().lower()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        cursor.execute("INSERT INTO users (email) VALUES (?)", (email,))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
    conn.close()
    return dict(user)

def create_otp(email: str) -> str:
    email = email.strip().lower()
    get_or_create_user(email)
    
    # Generate 6-digit numeric OTP
    otp_code = f"{secrets.randbelow(900000) + 100000:06d}"
    otp_hash = hash_otp(otp_code)
    
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Invalidate previous unused OTPs for this email
    cursor.execute("UPDATE otps SET is_used = 1 WHERE email = ? AND is_used = 0", (email,))
    
    cursor.execute(
        "INSERT INTO otps (email, otp_hash, expires_at, is_used) VALUES (?, ?, ?, 0)",
        (email, otp_hash, expires_at)
    )
    conn.commit()
    conn.close()
    
    return otp_code

def verify_otp(email: str, otp_code: str):
    email = email.strip().lower()
    otp_hash = hash_otp(otp_code.strip())
    now = datetime.datetime.utcnow()
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        """SELECT * FROM otps 
           WHERE email = ? AND otp_hash = ? AND is_used = 0 AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1""",
        (email, otp_hash, now)
    )
    otp_record = cursor.fetchone()
    
    if not otp_record:
        conn.close()
        return None, "Invalid or expired OTP code. Please request a new one."
    
    # Mark OTP as used
    cursor.execute("UPDATE otps SET is_used = 1 WHERE id = ?", (otp_record["id"],))

    # Housekeeping: drop expired sessions
    cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))

    # Single active session per user: the new login displaces any existing ones
    cursor.execute(
        """UPDATE sessions SET revoked_at = ?, revoked_reason = 'replaced'
           WHERE email = ? AND revoked_at IS NULL""",
        (now, email)
    )

    # Generate session token
    token = secrets.token_hex(32)
    session_expires = now + datetime.timedelta(hours=SESSION_EXPIRY_HOURS)
    cursor.execute(
        "INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)",
        (token, email, session_expires)
    )
    
    conn.commit()
    
    # Get user profile
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    
    return {"token": token, "user": dict(user), "expires_at": to_iso_utc(session_expires)}, None

def to_iso_utc(value) -> str:
    """Normalizes a naive-UTC datetime (or its SQLite string form) to ISO-8601 with 'Z'."""
    if isinstance(value, str):
        value = datetime.datetime.fromisoformat(value)
    return value.replace(microsecond=0).isoformat() + "Z"

def get_user_by_session(token: str):
    if not token:
        return None
    now = datetime.datetime.utcnow()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT u.*, s.expires_at AS session_expires_at FROM sessions s
           JOIN users u ON s.email = u.email
           WHERE s.token = ? AND s.expires_at > ? AND s.revoked_at IS NULL""",
        (token, now)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    user = dict(row)
    user["session_expires_at"] = to_iso_utc(user["session_expires_at"])
    return user

def get_session_revocation_reason(token: str):
    """Why a token is no longer valid: 'replaced' (signed in elsewhere) or None (unknown/expired)."""
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT revoked_reason FROM sessions WHERE token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return row["revoked_reason"] if row else None

def delete_session(token: str) -> bool:
    """Revokes a session token (sign-out). Returns True if a session was removed."""
    if not token:
        return False
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    removed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return removed

def record_mission_completion(email: str, mission_id: str, score: int, grade: str, decisions_json: str):
    email = email.strip().lower()
    mission_id = mission_id.lower().strip()
    now = datetime.datetime.utcnow()
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return False, "User account not found."
    
    if mission_id == "it":
        if user["it_played"] == 1:
            conn.close()
            return False, "Strict policy enforcement: You have already completed the IT Mission. Only 1 attempt is allowed."
        cursor.execute(
            """UPDATE users SET it_played = 1, it_score = ?, it_grade = ?, it_played_at = ?
               WHERE email = ?""",
            (score, grade, now, email)
        )
    elif mission_id == "ot":
        if user["ot_played"] == 1:
            conn.close()
            return False, "Strict policy enforcement: You have already completed the OT Mission. Only 1 attempt is allowed."
        cursor.execute(
            """UPDATE users SET ot_played = 1, ot_score = ?, ot_grade = ?, ot_played_at = ?
               WHERE email = ?""",
            (score, grade, now, email)
        )
    else:
        conn.close()
        return False, "Invalid mission ID specified."
    
    # Audit log entry
    cursor.execute(
        """INSERT INTO mission_logs (email, mission_id, score, grade, decisions_json)
           VALUES (?, ?, ?, ?, ?)""",
        (email, mission_id, score, grade, decisions_json)
    )
    
    conn.commit()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    updated_user = cursor.fetchone()
    conn.close()
    
    return True, dict(updated_user)
