"""
CYBER SHIFT — Flask Backend Server
Handles API endpoints, static UI serving, OTP authentication, dynamic question configuration,
attempt limits enforcement, and Enterprise Admin Dashboard REST APIs.
"""

from flask import Flask, request, jsonify, send_from_directory, Response
import os
import json
import re
import csv
import io
import datetime

from config import (SERVER_HOST, SERVER_PORT, SMTP_HOST, SMTP_PORT, SMTP_FROM, 
                    DEV_SHOW_OTP_IN_RESPONSE, ALLOWED_DOMAINS, ADMIN_EMAILS, is_admin_email)
from database import (init_db, create_otp, verify_otp, get_user_by_session, get_session_revocation_reason,
                      delete_session, record_mission_completion, get_db, get_all_config, save_game_config_item,
                      log_audit_action, get_audit_logs, get_admin_dashboard_stats, get_all_users_admin_view,
                      get_user_detailed_progress, reset_user_attempts, get_questions_summary,
                      get_effective_max_attempts, get_user_attempt_counts)

app = Flask(__name__, static_folder=".", static_url_path="")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Cybersecurity mascot image uploaded from the admin dashboard
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
MASCOT_MAX_BYTES = 5 * 1024 * 1024
# Raster formats only (SVG can carry script). Detected from file signature, not the client's filename.
MASCOT_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)

def detect_image_ext(data: bytes):
    for sig, ext in MASCOT_SIGNATURES:
        if data.startswith(sig):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None

def mascot_url(cfg: dict) -> str:
    """Public URL for the current mascot (versioned by filename so browsers refetch after an upload)."""
    name = cfg.get("mascot_file") or ""
    return f"/api/mascot?v={name}" if name else ""

def get_bearer_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header:
        return auth_header.replace("Bearer ", "").strip()
    return request.args.get("token", "").strip()


def is_domain_allowed(email: str) -> bool:
    """True if the email's domain is on the ALLOW_DOMAIN list (an empty list allows all)."""
    if not ALLOWED_DOMAINS:
        return True
    return email.rsplit("@", 1)[-1].lower() in ALLOWED_DOMAINS

def domain_error():
    allowed = ", ".join("@" + d for d in ALLOWED_DOMAINS)
    return jsonify({
        "status": "error",
        "code": "domain_not_allowed",
        "message": f"Access restricted: only {allowed} email addresses can sign in."
    }), 403

def require_session():
    """Resolves the bearer token to a user. Returns (user, None) or (None, 401 response with a reason code)."""
    token = get_bearer_token()
    user = get_user_by_session(token)
    if user and is_domain_allowed(user["email"]):
        user["isAdmin"] = is_admin_email(user["email"])
        return user, None
    if user:
        delete_session(token)
        code, message = "domain_not_allowed", "Your email domain is no longer permitted to access this game."
    elif get_session_revocation_reason(token) == "replaced":
        code, message = "session_replaced", "You were signed out because your account signed in from another browser or device."
    else:
        code, message = "session_expired", "Invalid or expired session. Please log in again."
    return None, (jsonify({"status": "error", "code": code, "message": message}), 401)

def require_admin():
    """Resolves bearer token and verifies administrator privileges."""
    user, error = require_session()
    if error:
        return None, error
    if not is_admin_email(user["email"]):
        return None, (jsonify({
            "status": "error",
            "code": "admin_access_required",
            "message": "Access restricted: Administrator privileges are required to view or modify dashboard settings."
        }), 403)
    return user, None

# Initialize database on startup
with app.app_context():
    init_db()

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(".", path)):
        return send_from_directory(".", path)
    return send_from_directory(".", "index.html")

# ==============================================================================
# PUBLIC & AUTHENTICATION ENDPOINTS
# ==============================================================================

@app.route("/api/config", methods=["GET"])
def get_public_config():
    """Returns public SMTP configuration info and current game settings for verification."""
    cfg = get_all_config()
    return jsonify({
        "smtpHost": SMTP_HOST,
        "smtpPort": SMTP_PORT,
        "smtpFrom": SMTP_FROM,
        "devMode": DEV_SHOW_OTP_IN_RESPONSE,
        "allowedDomains": ALLOWED_DOMAINS,
        "adminEmails": ADMIN_EMAILS,
        "maxAttemptsPerUser": cfg["max_attempts_per_user"],
        "itQuestionsPerGame": cfg["it_questions_per_game"],
        "otQuestionsPerGame": cfg["ot_questions_per_game"],
        "categoryConfig": cfg["category_config"],
        "mascotUrl": mascot_url(cfg)
    })

@app.route("/api/mascot", methods=["GET"])
def get_mascot_image():
    """Serves the uploaded Cybersecurity mascot image (404 when none is configured)."""
    name = get_all_config()["mascot_file"]
    if not name or not os.path.isfile(os.path.join(UPLOAD_DIR, name)):
        return jsonify({"status": "error", "message": "No mascot image configured."}), 404
    resp = send_from_directory(UPLOAD_DIR, name)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp

@app.route("/api/auth/request-otp", methods=["POST"])
def request_otp():
    """Generates 6-digit OTP and sends it via SMTP."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    
    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"status": "error", "message": "Please enter a valid email address (e.g. employee@company.com)."}), 400
    
    if not is_domain_allowed(email):
        return domain_error()
    
    try:
        from emailer import send_otp_email
        
        # Check if user already reached their attempt limit
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            u_dict = dict(user)
            max_allowed = get_effective_max_attempts(u_dict)
            it_completed, _, _ = get_user_attempt_counts(email, "IT")
            ot_completed, _, _ = get_user_attempt_counts(email, "OT")
            
            # Non-admin users who completed all allowed attempts receive an informative lock message
            if not is_admin_email(email) and it_completed >= max_allowed and ot_completed >= max_allowed:
                return jsonify({
                    "status": "completed_all",
                    "message": f"You have already completed all {max_allowed} permitted attempt(s) for both IT and OT missions!",
                    "user": u_dict
                }), 403
            
        otp_code = create_otp(email)
        sent, smtp_msg = send_otp_email(email, otp_code)
        
        res = {
            "status": "success",
            "message": f"OTP has been sent to {email}. Please check your inbox.",
            "email": email,
            "smtpDelivered": sent
        }
        
        if DEV_SHOW_OTP_IN_RESPONSE:
            res["devOtp"] = otp_code
            res["devNotice"] = "DEV MODE: OTP shown here for offline testing without live SMTP server."
            
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to request OTP: {str(e)}"}), 500

@app.route("/api/auth/verify-otp", methods=["POST"])
def verify_otp_endpoint():
    """Verifies 6-digit OTP code and returns session token + user profile."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    otp_code = data.get("otp", "").strip()
    
    if not email or not otp_code:
        return jsonify({"status": "error", "message": "Email and OTP code are required."}), 400
    
    if not is_domain_allowed(email):
        return domain_error()
        
    result, err = verify_otp(email, otp_code)
    if err:
        return jsonify({"status": "error", "message": err}), 400
    
    user = result["user"]
    user["isAdmin"] = is_admin_email(email)
    user["effectiveMaxAttempts"] = get_effective_max_attempts(user)
        
    return jsonify({
        "status": "success",
        "token": result["token"],
        "user": user,
        "expiresAt": result["expires_at"]
    }), 200

@app.route("/api/auth/logout", methods=["POST"])
def logout_endpoint():
    """Signs the user out by revoking their session token server-side."""
    delete_session(get_bearer_token())
    return jsonify({"status": "success", "message": "You have been signed out."}), 200

@app.route("/api/user/status", methods=["GET"])
def get_user_status():
    """Returns current user status, single-play restriction state, and admin flag."""
    user, error = require_session()
    if error:
        return error
    
    user["effectiveMaxAttempts"] = get_effective_max_attempts(user)
    it_completed, _, _ = get_user_attempt_counts(user["email"], "IT")
    ot_completed, _, _ = get_user_attempt_counts(user["email"], "OT")
    user["itCompletedAttempts"] = it_completed
    user["otCompletedAttempts"] = ot_completed
        
    return jsonify({
        "status": "success",
        "user": user,
        "expiresAt": user["session_expires_at"]
    }), 200

@app.route("/api/mission/complete", methods=["POST"])
def complete_mission_endpoint():
    """Records mission completion and updates attempt count."""
    user, error = require_session()
    if error:
        return error
        
    data = request.get_json(silent=True) or {}
    mission_id = data.get("missionId", "")
    score = data.get("score", 0)
    grade = data.get("grade", "F")
    decisions = data.get("decisions", {})
    
    decisions_json = json.dumps(decisions)
    
    success, res = record_mission_completion(
        email=user["email"],
        mission_id=mission_id,
        score=score,
        grade=grade,
        decisions_json=decisions_json
    )
    
    if not success:
        return jsonify({"status": "forbidden", "message": res}), 403
    
    res["isAdmin"] = is_admin_email(user["email"])
    res["effectiveMaxAttempts"] = get_effective_max_attempts(res)
        
    return jsonify({
        "status": "success",
        "message": "Mission results recorded successfully.",
        "user": res
    }), 200

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    """Campaign dashboard showing top completion scores across participants."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT email, it_score, it_grade, ot_score, ot_grade, 
               (COALESCE(it_score, 0) + COALESCE(ot_score, 0)) as total_score
        FROM users 
        WHERE it_played = 1 OR ot_played = 1
        ORDER BY total_score DESC LIMIT 20
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    
    for r in rows:
        em = r["email"]
        if "@" in em:
            name, domain = em.split("@", 1)
            r["email_anon"] = (name[0] + "***@" + domain) if len(name) > 1 else em
        else:
            r["email_anon"] = em
            
    cursor.execute("SELECT COUNT(*) as total_users FROM users")
    total_users = cursor.fetchone()["total_users"]
    
    cursor.execute("SELECT COUNT(*) as total_completed FROM users WHERE it_played = 1 AND ot_played = 1")
    total_completed = cursor.fetchone()["total_completed"]
    
    conn.close()
    
    return jsonify({
        "status": "success",
        "totalParticipants": total_users,
        "fullyCompleted": total_completed,
        "topScores": rows
    })

# ==============================================================================
# ENTERPRISE ADMIN DASHBOARD ENDPOINTS (PROTECTED BY BACKEND ADMIN AUTH)
# ==============================================================================

@app.route("/api/admin/config", methods=["GET"])
def get_admin_config():
    """Returns administrative configuration, question category allocations, and attempt limits."""
    admin_user, error = require_admin()
    if error:
        return error
        
    cfg = get_all_config()
    summary = get_questions_summary()
    
    return jsonify({
        "status": "success",
        "adminEmails": ADMIN_EMAILS,
        "config": cfg,
        "mascotUrl": mascot_url(cfg),
        "availableQuestionsSummary": summary
    }), 200

@app.route("/api/admin/mascot", methods=["POST"])
def upload_mascot():
    """Replaces the Cybersecurity mascot image (PNG, JPG, GIF or WEBP, max 5 MB)."""
    admin_user, error = require_admin()
    if error:
        return error

    upload = request.files.get("image")
    if not upload:
        return jsonify({"status": "error", "message": "No image file was uploaded."}), 400
    data = upload.read(MASCOT_MAX_BYTES + 1)
    if len(data) > MASCOT_MAX_BYTES:
        return jsonify({"status": "error", "message": "Image is too large. Maximum size is 5 MB."}), 400
    ext = detect_image_ext(data)
    if not ext:
        return jsonify({"status": "error", "message": "Unsupported file. Upload a PNG, JPG, GIF or WEBP image."}), 400

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = f"mascot-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}.{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(data)

    old = get_all_config()["mascot_file"]
    save_game_config_item(admin_user["email"], "mascot_file", name)
    if old and old != name:
        try:
            os.remove(os.path.join(UPLOAD_DIR, old))
        except OSError:
            pass

    log_audit_action(admin_user["email"], "UPDATE_MASCOT", f"Uploaded Cybersecurity mascot image ({ext}, {len(data)} bytes)")
    return jsonify({"status": "success", "message": "Mascot image updated.", "mascotUrl": mascot_url({"mascot_file": name})}), 200

@app.route("/api/admin/mascot", methods=["DELETE"])
def reset_mascot():
    """Removes the uploaded mascot so the game falls back to the built-in 3D character."""
    admin_user, error = require_admin()
    if error:
        return error

    old = get_all_config()["mascot_file"]
    save_game_config_item(admin_user["email"], "mascot_file", "")
    if old:
        try:
            os.remove(os.path.join(UPLOAD_DIR, old))
        except OSError:
            pass

    log_audit_action(admin_user["email"], "RESET_MASCOT", "Removed Cybersecurity mascot image; reverted to default 3D character")
    return jsonify({"status": "success", "message": "Mascot reset to the default character.", "mascotUrl": ""}), 200

@app.route("/api/admin/config", methods=["POST"])
def update_admin_config():
    """Saves updated max attempts, game-level question counts, and category question distribution."""
    admin_user, error = require_admin()
    if error:
        return error
        
    data = request.get_json(silent=True) or {}
    
    max_attempts = data.get("max_attempts_per_user")
    it_q_count = data.get("it_questions_per_game")
    ot_q_count = data.get("ot_questions_per_game")
    cat_cfg = data.get("category_config")
    
    summary = get_questions_summary()
    
    # Validation Rule 1: Attempt limits must be >= 1
    if max_attempts is not None:
        try:
            max_attempts = int(max_attempts)
            if max_attempts < 1:
                return jsonify({"status": "error", "message": "Max attempts per user must be at least 1."}), 400
            save_game_config_item(admin_user["email"], "max_attempts_per_user", str(max_attempts))
        except ValueError:
            return jsonify({"status": "error", "message": "Invalid max attempts value."}), 400

    # Category & Game Questions Validation Rules
    if cat_cfg is not None and isinstance(cat_cfg, dict):
        for mission in ("IT", "OT"):
            if mission in cat_cfg and isinstance(cat_cfg[mission], dict):
                mission_cats = cat_cfg[mission]
                avail_cats = summary.get(mission, {})
                
                cat_sum = 0
                for cat_name, count_val in mission_cats.items():
                    try:
                        c_num = int(count_val)
                    except ValueError:
                        return jsonify({"status": "error", "message": f"Invalid question count for category '{cat_name}'."}), 400
                    
                    avail_count = avail_cats.get(cat_name, 0)
                    if c_num > avail_count:
                        return jsonify({
                            "status": "error",
                            "message": f"Category '{cat_name}' in {mission} configured with {c_num} questions, but only {avail_count} questions are available."
                        }), 400
                    cat_sum += c_num
                
                target_game_count = int(it_q_count if mission == "IT" else ot_q_count)
                if cat_sum != target_game_count:
                    return jsonify({
                        "status": "error",
                        "message": f"Sum of {mission} category questions ({cat_sum}) does not match the target questions per game ({target_game_count})."
                    }), 400

        if it_q_count is not None:
            save_game_config_item(admin_user["email"], "it_questions_per_game", str(it_q_count))
        if ot_q_count is not None:
            save_game_config_item(admin_user["email"], "ot_questions_per_game", str(ot_q_count))
            
        save_game_config_item(admin_user["email"], "category_config", json.dumps(cat_cfg))

    log_audit_action(
        admin_user["email"],
        "UPDATE_CONFIG",
        f"Updated configuration: max_attempts={max_attempts}, IT_Q={it_q_count}, OT_Q={ot_q_count}"
    )

    return jsonify({
        "status": "success",
        "message": "Configuration successfully validated and saved.",
        "config": get_all_config()
    }), 200

@app.route("/api/admin/users", methods=["GET"])
def get_admin_users():
    """Returns interactive user list with progress, attempt usage, and scores."""
    admin_user, error = require_admin()
    if error:
        return error
        
    users = get_all_users_admin_view()
    stats = get_admin_dashboard_stats()
    
    return jsonify({
        "status": "success",
        "stats": stats,
        "users": users
    }), 200

@app.route("/api/admin/user/<email>", methods=["GET"])
def get_admin_user_detail(email):
    """Returns detailed attempt history and decision breakdown for a specific user."""
    admin_user, error = require_admin()
    if error:
        return error
        
    detail = get_user_detailed_progress(email)
    if not detail:
        return jsonify({"status": "error", "message": "User not found."}), 404
        
    return jsonify({
        "status": "success",
        "user": detail["user"],
        "logs": detail["logs"],
        "attempts": detail["attempts"]
    }), 200

@app.route("/api/admin/user/reset-attempts", methods=["POST"])
def reset_user_attempts_endpoint():
    """Resets attempts or modifies attempt limits for a specific user."""
    admin_user, error = require_admin()
    if error:
        return error
        
    data = request.get_json(silent=True) or {}
    target_email = data.get("email", "").strip().lower()
    new_max = data.get("newMaxAttempts", None)
    
    if not target_email:
        return jsonify({"status": "error", "message": "Target email is required."}), 400
        
    success, msg = reset_user_attempts(admin_user["email"], target_email, new_max)
    if not success:
        return jsonify({"status": "error", "message": msg}), 400
        
    return jsonify({
        "status": "success",
        "message": msg
    }), 200

@app.route("/api/admin/questions", methods=["GET"])
def get_admin_questions():
    """Returns all questions grouped by mission and category."""
    admin_user, error = require_admin()
    if error:
        return error
        
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions ORDER BY mission, category, id")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    summary = get_questions_summary()
    
    return jsonify({
        "status": "success",
        "questions": rows,
        "summary": summary
    }), 200

@app.route("/api/admin/questions/edit", methods=["POST"])
def edit_question_endpoint():
    """Edits question parameters or toggles active status."""
    admin_user, error = require_admin()
    if error:
        return error
        
    data = request.get_json(silent=True) or {}
    q_id = data.get("id", "")
    is_active = 1 if data.get("isActive", True) else 0
    
    if not q_id:
        return jsonify({"status": "error", "message": "Question ID required."}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE questions SET is_active = ? WHERE id = ?", (is_active, q_id))
    conn.commit()
    conn.close()
    
    log_audit_action(admin_user["email"], "EDIT_QUESTION", f"Updated question {q_id} (is_active={is_active})")
    
    return jsonify({"status": "success", "message": f"Question {q_id} updated."}), 200

@app.route("/api/admin/analytics", methods=["GET"])
def get_admin_analytics():
    """Returns comprehensive campaign analytics, category performance, and frequently missed questions."""
    admin_user, error = require_admin()
    if error:
        return error
        
    stats = get_admin_dashboard_stats()
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT decisions_json, mission_id FROM mission_logs")
    logs = cursor.fetchall()
    
    category_stats = {}
    question_errors = {}
    
    for l in logs:
        try:
            m_id = l["mission_id"].upper()
            dec = json.loads(l["decisions_json"])
            if isinstance(dec, dict):
                for q_id, val in dec.items():
                    grade = val.get("grade") if isinstance(val, dict) else val
                    is_correct = (grade == "best")
                    
                    question_errors.setdefault(q_id, {"attempts": 0, "incorrect": 0})
                    question_errors[q_id]["attempts"] += 1
                    if not is_correct:
                        question_errors[q_id]["incorrect"] += 1
        except Exception:
            pass
            
    missed_questions = []
    for q_id, data in question_errors.items():
        if data["attempts"] > 0:
            err_rate = round((data["incorrect"] / data["attempts"]) * 100, 1)
            missed_questions.append({
                "questionId": q_id,
                "attempts": data["attempts"],
                "incorrect": data["incorrect"],
                "errorRatePct": err_rate
            })
            
    missed_questions.sort(key=lambda x: x["errorRatePct"], reverse=True)
    conn.close()
    
    return jsonify({
        "status": "success",
        "stats": stats,
        "mostMissedQuestions": missed_questions[:10]
    }), 200

@app.route("/api/admin/analytics/export", methods=["GET"])
def export_analytics_csv():
    """Generates and streams a downloadable CSV report of all users and gameplay scores."""
    admin_user, error = require_admin()
    if error:
        return error
        
    users = get_all_users_admin_view()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # CSV Header
    writer.writerow([
        "User ID", "Email Address", "First Sign-in", "Last Active", 
        "Game Status", "Stage", "Max Attempts Allowed", "Attempts Used", "Attempts Remaining",
        "IT Played", "IT Score", "IT Grade", "OT Played", "OT Score", "OT Grade", "Total Score",
        "Questions Attempted", "Questions Correct", "Questions Incorrect", "Completion %"
    ])
    
    for u in users:
        writer.writerow([
            u["id"], u["email"], u["createdAt"], u["lastActiveAt"],
            u["status"], u["stage"], u["maxAttempts"], u["attemptsUsed"], u["attemptsRemaining"],
            "Yes" if u["itPlayed"] else "No", u["itScore"] or 0, u["itGrade"] or "N/A",
            "Yes" if u["otPlayed"] else "No", u["otScore"] or 0, u["otGrade"] or "N/A", u["totalScore"],
            u["questionsAttempted"], u["questionsCorrect"], u["questionsIncorrect"], f"{u['completionPct']}%"
        ])
        
    log_audit_action(admin_user["email"], "EXPORT_CSV", "Exported campaign user progress report to CSV.")
    
    response = Response(output.getvalue(), mimetype="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=Cyber_Shift_Campaign_Report.csv"
    return response

@app.route("/api/admin/audit-logs", methods=["GET"])
def get_admin_audit_logs():
    """Returns timeline of administrative actions."""
    admin_user, error = require_admin()
    if error:
        return error
        
    logs = get_audit_logs(limit=100)
    return jsonify({
        "status": "success",
        "auditLogs": logs
    }), 200

if __name__ == "__main__":
    init_db()
    print("=" * 75)
    print(f"  CYBER SHIFT ENTERPRISE SERVER RUNNING")
    print(f"  SMTP Server: {SMTP_HOST}:{SMTP_PORT} | From: {SMTP_FROM}")
    print(f"  Admin Email Accounts: {', '.join(ADMIN_EMAILS)}")
    print(f"  Allowed Domains: {', '.join(ALLOWED_DOMAINS) if ALLOWED_DOMAINS else 'ANY'}")
    print(f"  URL: http://localhost:{SERVER_PORT}")
    print("=" * 75)
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=True)
