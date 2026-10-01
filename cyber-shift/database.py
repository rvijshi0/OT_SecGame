"""
CYBER SHIFT — Database & Security Model
Handles SQLite database initialization, user tracking (800+ players),
OTP generation/validation, session management, dynamic attempt controls,
question categorization, and Admin Dashboard analytics persistence.
"""

import sqlite3
import hashlib
import secrets
import datetime
import json
from config import DATABASE_FILE, OTP_EXPIRY_MINUTES, SESSION_EXPIRY_HOURS

def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Users table — tracks email, activity timestamps, scores, and attempt overrides
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            it_played INTEGER DEFAULT 0,
            it_score INTEGER DEFAULT NULL,
            it_grade TEXT DEFAULT NULL,
            it_played_at TIMESTAMP DEFAULT NULL,
            ot_played INTEGER DEFAULT 0,
            ot_score INTEGER DEFAULT NULL,
            ot_grade TEXT DEFAULT NULL,
            ot_played_at TIMESTAMP DEFAULT NULL,
            custom_max_attempts INTEGER DEFAULT NULL,
            attempts_reset_count INTEGER DEFAULT 0
        )
    """)
    
    # Schema migrations for existing database files
    user_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(users)")}
    if "last_active_at" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP DEFAULT NULL")
    if "custom_max_attempts" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN custom_max_attempts INTEGER DEFAULT NULL")
    if "attempts_reset_count" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN attempts_reset_count INTEGER DEFAULT 0")

    # 2. OTPs table — stores hashed OTP codes
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
    
    # 3. Sessions table — authenticated user access tokens
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
    session_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(sessions)")}
    if "revoked_at" not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMP DEFAULT NULL")
    if "revoked_reason" not in session_cols:
        cursor.execute("ALTER TABLE sessions ADD COLUMN revoked_reason TEXT DEFAULT NULL")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email)")
    
    # 4. Mission Logs table — audit trail of decision choices and completed mission attempts
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
    
    # 5. Game Config table — dynamic settings (max_attempts, category question allocations)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_by TEXT DEFAULT 'system'
        )
    """)

    # Populate default configuration settings if not existing
    default_configs = {
        "max_attempts_per_user": "3",
        "it_questions_per_game": "10",
        "ot_questions_per_game": "10",
        "category_config": json.dumps({
            "IT": { "messages": 2, "accounts": 2, "ai": 2, "reporting": 2, "devices": 2 },
            "OT": { "vendor": 2, "usb": 2, "boundary": 2, "safety": 2, "incident": 2 }
        })
    }
    for k, v in default_configs.items():
        cursor.execute("INSERT OR IGNORE INTO game_config (key, value) VALUES (?, ?)", (k, v))
        
    # 6. Questions table — persistent store of all IT and OT questions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            mission TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT,
            location TEXT,
            story TEXT NOT NULL,
            visual_json TEXT,
            clues_json TEXT,
            question_text TEXT NOT NULL,
            answers_json TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            difficulty TEXT DEFAULT 'medium'
        )
    """)

    # 7. User Attempts table — tracks individual attempt sessions (in-progress vs completed)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            attempt_number INTEGER NOT NULL,
            questions_json TEXT NOT NULL,
            current_scene_index INTEGER DEFAULT 0,
            decisions_json TEXT DEFAULT '{}',
            score INTEGER DEFAULT 0,
            risk INTEGER DEFAULT 0,
            grade TEXT DEFAULT NULL,
            status TEXT DEFAULT 'in_progress',
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP DEFAULT NULL
        )
    """)

    # 8. Audit Logs table — tracks administrative actions & configuration updates
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_email TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Sync questions from game-data.js on startup
    sync_questions_on_startup(cursor)
    
    conn.commit()
    conn.close()

def sync_questions_on_startup(cursor):
    import os, re
    filepath = os.path.join(os.path.dirname(__file__), "game-data.js")
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    pattern = re.compile(r"\{\s*id:\s*'(IT-\d+|OT-\d+)',\s*mission:\s*'(IT|OT)',\s*topic:\s*'([^']+)',\s*art:\s*'([^']+)',\s*title:\s*'([^']+)',\s*subtitle:\s*'([^']+)'", re.MULTILINE)
    matches = pattern.findall(text)
    for m in matches:
        q_id, mission, category, art, title, subtitle = m
        cursor.execute(
            """INSERT OR IGNORE INTO questions (id, mission, category, title, subtitle, location, story, question_text, answers_json, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 1)""",
            (q_id, mission, category, title, subtitle, "Workplace", title + " - " + subtitle, "What should you do?")
        )

# ==============================================================================
# AUDIT LOGS & CONFIGURATION HELPERS
# ==============================================================================

def log_audit_action(admin_email: str, action: str, details: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO audit_logs (admin_email, action, details) VALUES (?, ?, ?)",
        (admin_email, action, details)
    )
    conn.commit()
    conn.close()

def get_audit_logs(limit: int = 100):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_all_config():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM game_config")
    cfg = {r["key"]: r["value"] for r in cursor.fetchall()}
    conn.close()

    # Parse numeric & JSON types
    max_attempts = int(cfg.get("max_attempts_per_user", 3))
    it_q_per_game = int(cfg.get("it_questions_per_game", 10))
    ot_q_per_game = int(cfg.get("ot_questions_per_game", 10))
    cat_cfg = json.loads(cfg.get("category_config", "{}"))

    return {
        "max_attempts_per_user": max_attempts,
        "it_questions_per_game": it_q_per_game,
        "ot_questions_per_game": ot_q_per_game,
        "category_config": cat_cfg
    }

def save_game_config_item(admin_email: str, key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.datetime.utcnow()
    cursor.execute(
        "INSERT OR REPLACE INTO game_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)",
        (key, value, now, admin_email)
    )
    conn.commit()
    conn.close()

# ==============================================================================
# OTP & SESSION MANAGEMENT
# ==============================================================================

def hash_otp(otp_code: str) -> str:
    return hashlib.sha256(otp_code.encode('utf-8')).hexdigest()

def get_or_create_user(email: str):
    email = email.strip().lower()
    now = datetime.datetime.utcnow()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        cursor.execute("INSERT INTO users (email, last_active_at) VALUES (?, ?)", (email, now))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
    else:
        cursor.execute("UPDATE users SET last_active_at = ? WHERE email = ?", (now, email))
        conn.commit()
    conn.close()
    return dict(user)

def create_otp(email: str) -> str:
    email = email.strip().lower()
    get_or_create_user(email)
    
    otp_code = f"{secrets.randbelow(900000) + 100000:06d}"
    otp_hash = hash_otp(otp_code)
    
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    conn = get_db()
    cursor = conn.cursor()
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
    
    cursor.execute("UPDATE otps SET is_used = 1 WHERE id = ?", (otp_record["id"],))
    cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    cursor.execute(
        """UPDATE sessions SET revoked_at = ?, revoked_reason = 'replaced'
           WHERE email = ? AND revoked_at IS NULL""",
        (now, email)
    )

    token = secrets.token_hex(32)
    session_expires = now + datetime.timedelta(hours=SESSION_EXPIRY_HOURS)
    cursor.execute(
        "INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)",
        (token, email, session_expires)
    )
    
    cursor.execute("UPDATE users SET last_active_at = ? WHERE email = ?", (now, email))
    conn.commit()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    
    return {"token": token, "user": dict(user), "expires_at": to_iso_utc(session_expires)}, None

def to_iso_utc(value) -> str:
    if isinstance(value, str):
        try:
            value = datetime.datetime.fromisoformat(value)
        except Exception:
            return value
    if value is None:
        return None
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
    if row:
        cursor.execute("UPDATE users SET last_active_at = ? WHERE id = ?", (now, row["id"]))
        conn.commit()
    conn.close()
    if not row:
        return None
    user = dict(row)
    user["session_expires_at"] = to_iso_utc(user["session_expires_at"])
    return user

def get_session_revocation_reason(token: str):
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT revoked_reason FROM sessions WHERE token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return row["revoked_reason"] if row else None

def delete_session(token: str) -> bool:
    if not token:
        return False
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    removed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return removed

# ==============================================================================
# ATTEMPT & USER MANAGEMENT FOR ADMIN & GAME
# ==============================================================================

def get_effective_max_attempts(user_row: dict) -> int:
    """Returns the effective max attempts allowed for a user (custom or global default)."""
    if user_row.get("custom_max_attempts") is not None:
        return int(user_row["custom_max_attempts"])
    cfg = get_all_config()
    return cfg["max_attempts_per_user"]

def get_user_attempt_counts(email: str, mission_id: str):
    """Returns (completed_attempts, in_progress_attempt, total_attempts_started)."""
    email = email.strip().lower()
    mission_id = mission_id.upper().strip()
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT COUNT(*) as count FROM user_attempts WHERE email = ? AND mission_id = ? AND status = 'completed'",
        (email, mission_id)
    )
    completed_attempts = cursor.fetchone()["count"]
    
    cursor.execute(
        "SELECT * FROM user_attempts WHERE email = ? AND mission_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1",
        (email, mission_id)
    )
    in_prog = cursor.fetchone()
    
    cursor.execute(
        "SELECT COUNT(*) as count FROM user_attempts WHERE email = ? AND mission_id = ?",
        (email, mission_id)
    )
    total_started = cursor.fetchone()["count"]
    conn.close()
    
    return completed_attempts, (dict(in_prog) if in_prog else None), total_started

def record_mission_completion(email: str, mission_id: str, score: int, grade: str, decisions_json: str):
    email = email.strip().lower()
    mission_id = mission_id.upper().strip()
    now = datetime.datetime.utcnow()
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return False, "User account not found."
    
    user_dict = dict(user)
    max_allowed = get_effective_max_attempts(user_dict)
    
    # Check completed attempts
    cursor.execute(
        "SELECT COUNT(*) as count FROM user_attempts WHERE email = ? AND mission_id = ? AND status = 'completed'",
        (email, mission_id)
    )
    completed_count = cursor.fetchone()["count"]
    
    if completed_count >= max_allowed:
        conn.close()
        return False, f"Attempt limit reached: You have completed all {max_allowed} allowed attempt(s) for the {mission_id} Mission."
    
    # Update active attempt session if exists, otherwise create completed attempt
    cursor.execute(
        """SELECT * FROM user_attempts 
           WHERE email = ? AND mission_id = ? AND status = 'in_progress' 
           ORDER BY started_at DESC LIMIT 1""",
        (email, mission_id)
    )
    active_att = cursor.fetchone()
    if active_att:
        cursor.execute(
            """UPDATE user_attempts SET status = 'completed', score = ?, grade = ?, decisions_json = ?, completed_at = ?
               WHERE id = ?""",
            (score, grade, decisions_json, now, active_att["id"])
        )
    else:
        cursor.execute(
            """INSERT INTO user_attempts (email, mission_id, attempt_number, questions_json, decisions_json, score, grade, status, completed_at)
               VALUES (?, ?, ?, '[]', ?, ?, ?, 'completed', ?)""",
            (email, mission_id, completed_count + 1, decisions_json, score, grade, now)
        )

    # Update users summary table
    if mission_id == "IT":
        cursor.execute(
            """UPDATE users SET it_played = 1, it_score = ?, it_grade = ?, it_played_at = ?, last_active_at = ?
               WHERE email = ?""",
            (score, grade, now, now, email)
        )
    else:
        cursor.execute(
            """UPDATE users SET ot_played = 1, ot_score = ?, ot_grade = ?, ot_played_at = ?, last_active_at = ?
               WHERE email = ?""",
            (score, grade, now, now, email)
        )
    
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

def reset_user_attempts(admin_email: str, target_email: str, new_max_attempts: int = None):
    """Resets a user's attempt locks / grants additional attempt allowance."""
    target_email = target_email.strip().lower()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (target_email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return False, "User not found."
    
    now = datetime.datetime.utcnow()
    
    # If resetting attempts, we allow them to replay by setting custom_max_attempts or resetting in-progress records
    if new_max_attempts is not None:
        cursor.execute(
            "UPDATE users SET custom_max_attempts = ?, attempts_reset_count = attempts_reset_count + 1, last_active_at = ? WHERE email = ?",
            (new_max_attempts, now, target_email)
        )
    else:
        # Increase attempts allowance by +1
        curr_max = get_effective_max_attempts(dict(user))
        cursor.execute(
            "UPDATE users SET custom_max_attempts = ?, attempts_reset_count = attempts_reset_count + 1, last_active_at = ? WHERE email = ?",
            (curr_max + 1, now, target_email)
        )
    
    # Also reset users table flags if needed so cards unlock
    cursor.execute("UPDATE users SET it_played = 0, ot_played = 0 WHERE email = ?", (target_email,))
    
    conn.commit()
    conn.close()
    
    log_audit_action(
        admin_email,
        "RESET_USER_ATTEMPTS",
        f"Reset attempts for user {target_email}. New max attempts allowance set."
    )
    return True, f"Successfully reset attempts for {target_email}."

# ==============================================================================
# QUESTION MANAGEMENT & DYNAMIC SELECTION
# ==============================================================================

def sync_questions_from_gamedata(scenarios_list):
    """Syncs scenarios from game-data.js into persistent DB questions table."""
    conn = get_db()
    cursor = conn.cursor()
    for s in scenarios_list:
        s_id = s["id"]
        mission = s.get("mission", "IT")
        category = s.get("topic", "general")
        title = s.get("title", "")
        subtitle = s.get("subtitle", "")
        location = s.get("location", "")
        story = s.get("story", "")
        visual_json = json.dumps(s.get("visual", {}))
        clues_json = json.dumps(s.get("clues", []))
        question_text = s.get("question", s.get("sequence", {}).get("prompt", "What should you do?"))
        answers_json = json.dumps(s.get("answers", s.get("sequence", {})))
        
        cursor.execute(
            """INSERT OR REPLACE INTO questions 
               (id, mission, category, title, subtitle, location, story, visual_json, clues_json, question_text, answers_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (s_id, mission, category, title, subtitle, location, story, visual_json, clues_json, question_text, answers_json)
        )
    conn.commit()
    conn.close()

def get_questions_summary():
    """Returns dynamic availability breakdown of active questions per game and category."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mission, category, COUNT(*) as count 
        FROM questions 
        WHERE is_active = 1 
        GROUP BY mission, category
    """)
    rows = cursor.fetchall()
    conn.close()
    
    summary = {"IT": {}, "OT": {}}
    for r in rows:
        m = r["mission"].upper()
        if m in summary:
            summary[m][r["category"]] = r["count"]
            
    return summary

# ==============================================================================
# ADMIN DASHBOARD ANALYTICS & USER LIST
# ==============================================================================

def get_admin_dashboard_stats():
    """Returns overall participation, completion, and accuracy statistics."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as total FROM users")
    total_users = cursor.fetchone()["total"]
    
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE it_played = 1 OR ot_played = 1")
    users_started = cursor.fetchone()["count"]
    
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE it_played = 1 AND ot_played = 1")
    users_completed = cursor.fetchone()["count"]
    
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE (it_played = 1 OR ot_played = 1) AND NOT (it_played = 1 AND ot_played = 1)")
    users_in_progress = cursor.fetchone()["count"]
    
    cursor.execute("SELECT AVG(it_score) as avg_it, AVG(ot_score) as avg_ot FROM users WHERE it_played = 1 OR ot_played = 1")
    avg_scores = cursor.fetchone()
    
    conn.close()
    
    return {
        "totalUsers": total_users,
        "usersStarted": users_started,
        "usersCompleted": users_completed,
        "usersInProgress": users_in_progress,
        "avgItScore": round(avg_scores["avg_it"] or 0, 1),
        "avgOtScore": round(avg_scores["avg_ot"] or 0, 1)
    }

def get_all_users_admin_view():
    """Returns list of all registered users with detailed progress and attempt status."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users ORDER BY last_active_at DESC, created_at DESC")
    users = [dict(u) for u in cursor.fetchall()]
    
    cfg = get_all_config()
    global_max = cfg["max_attempts_per_user"]
    
    result = []
    for u in users:
        email = u["email"]
        effective_max = u["custom_max_attempts"] if u["custom_max_attempts"] is not None else global_max
        
        # Calculate attempts used
        cursor.execute("SELECT COUNT(*) as count FROM user_attempts WHERE email = ? AND status = 'completed'", (email,))
        completed_attempts = cursor.fetchone()["count"]
        
        # Calculate total questions & decision breakdown from mission logs
        cursor.execute("SELECT decisions_json FROM mission_logs WHERE email = ?", (email,))
        logs = cursor.fetchall()
        
        total_questions = 0
        total_correct = 0
        total_incorrect = 0
        for l in logs:
            try:
                dec = json.loads(l["decisions_json"])
                if isinstance(dec, dict):
                    for k, val in dec.items():
                        total_questions += 1
                        if isinstance(val, dict):
                            if val.get("grade") == "best" or val.get("correct") is True:
                                total_correct += 1
                            else:
                                total_incorrect += 1
                        elif val == "best":
                            total_correct += 1
                        else:
                            total_incorrect += 1
            except Exception:
                pass

        # Determine stage & status
        if u["it_played"] == 1 and u["ot_played"] == 1:
            status = "Completed"
            game_type = "IT & OT"
            stage = "All Missions Finished"
        elif u["it_played"] == 1:
            status = "In Progress"
            game_type = "IT (OT Pending)"
            stage = "IT Completed, OT Next"
        elif u["ot_played"] == 1:
            status = "In Progress"
            game_type = "OT (IT Pending)"
            stage = "OT Completed, IT Next"
        else:
            status = "Not Started"
            game_type = "None"
            stage = "Registered"

        attempts_used = max(completed_attempts, (1 if u["it_played"] == 1 or u["ot_played"] == 1 else 0))
        attempts_remaining = max(0, effective_max - attempts_used)

        result.append({
            "id": u["id"],
            "email": u["email"],
            "createdAt": to_iso_utc(u["created_at"]),
            "lastActiveAt": to_iso_utc(u["last_active_at"]),
            "gameType": game_type,
            "stage": stage,
            "status": status,
            "itPlayed": u["it_played"],
            "itScore": u["it_score"],
            "itGrade": u["it_grade"],
            "itPlayedAt": to_iso_utc(u["it_played_at"]),
            "otPlayed": u["ot_played"],
            "otScore": u["ot_score"],
            "otGrade": u["ot_grade"],
            "otPlayedAt": to_iso_utc(u["ot_played_at"]),
            "totalScore": (u["it_score"] or 0) + (u["ot_score"] or 0),
            "questionsAttempted": total_questions,
            "questionsCorrect": total_correct,
            "questionsIncorrect": total_incorrect,
            "completionPct": 100 if status == "Completed" else (50 if status == "In Progress" else 0),
            "maxAttempts": effective_max,
            "attemptsUsed": attempts_used,
            "attemptsRemaining": attempts_remaining,
            "resetsCount": u["attempts_reset_count"]
        })
        
    conn.close()
    return result

def get_user_detailed_progress(email: str):
    """Returns detailed history and category breakdown for a single user."""
    email = email.strip().lower()
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return None
        
    user_dict = dict(user)
    
    cursor.execute("SELECT * FROM mission_logs WHERE email = ? ORDER BY completed_at DESC", (email,))
    logs = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM user_attempts WHERE email = ? ORDER BY started_at DESC", (email,))
    attempts = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return {
        "user": user_dict,
        "logs": logs,
        "attempts": attempts
    }
