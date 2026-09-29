"""
CYBER SHIFT — Flask Backend Server
Handles API endpoints, static UI serving, OTP authentication, and single-attempt enforcement.
"""

from flask import Flask, request, jsonify, send_from_directory
import os
import json
import re
from config import SERVER_HOST, SERVER_PORT, SMTP_HOST, SMTP_PORT, SMTP_FROM, DEV_SHOW_OTP_IN_RESPONSE
from database import init_db, create_otp, verify_otp, get_user_by_session, record_mission_completion, get_db

app = Flask(__name__, static_folder=".", static_url_path="")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

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
# API ENDPOINTS
# ==============================================================================

@app.route("/api/config", methods=["GET"])
def get_public_config():
    """Returns public SMTP configuration info for verification."""
    return jsonify({
        "smtpHost": SMTP_HOST,
        "smtpPort": SMTP_PORT,
        "smtpFrom": SMTP_FROM,
        "devMode": DEV_SHOW_OTP_IN_RESPONSE
    })

@app.route("/api/auth/request-otp", methods=["POST"])
def request_otp():
    """Generates 6-digit OTP and sends it via SMTP."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    
    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"status": "error", "message": "Please enter a valid email address (e.g. employee@company.com)."}), 400
    
    try:
        from emailer import send_otp_email
        
        # Check if user already completed both missions
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()
        
        if user and user["it_played"] == 1 and user["ot_played"] == 1:
            return jsonify({
                "status": "completed_all",
                "message": "You have already completed both IT and OT missions! Only 1 attempt is permitted per user.",
                "user": dict(user)
            }), 403
            
        otp_code = create_otp(email)
        sent, smtp_msg = send_otp_email(email, otp_code)
        
        res = {
            "status": "success",
            "message": f"OTP has been sent to {email}. Please check your inbox.",
            "email": email,
            "smtpDelivered": sent
        }
        
        # Include OTP in response if DEV_SHOW_OTP_IN_RESPONSE is enabled for easy offline testing
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
        
    result, err = verify_otp(email, otp_code)
    if err:
        return jsonify({"status": "error", "message": err}), 400
        
    return jsonify({
        "status": "success",
        "token": result["token"],
        "user": result["user"]
    }), 200

@app.route("/api/user/status", methods=["GET"])
def get_user_status():
    """Returns current user status and single-play restriction state."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    
    user = get_user_by_session(token)
    if not user:
        return jsonify({"status": "error", "message": "Invalid or expired session. Please log in again."}), 401
        
    return jsonify({
        "status": "success",
        "user": user
    }), 200

@app.route("/api/mission/complete", methods=["POST"])
def complete_mission_endpoint():
    """Records mission completion and permanently locks further attempts for that mission."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    
    user = get_user_by_session(token)
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized. Invalid session token."}), 401
        
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
        
    return jsonify({
        "status": "success",
        "message": "Mission results recorded. One-time play locked for this mission.",
        "user": res
    }), 200

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    """Campaign dashboard showing completion stats across participants."""
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
    
    # Anonymize email addresses for privacy (e.g. j***@company.com)
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

if __name__ == "__main__":
    init_db()
    print("=" * 70)
    print(f"  CYBER SHIFT SERVER RUNNING")
    print(f"  SMTP Server: {SMTP_HOST}:{SMTP_PORT} | From: {SMTP_FROM}")
    print(f"  Single-Play Enforcement: Active (1 Attempt per User per Mission)")
    print(f"  URL: http://localhost:{SERVER_PORT}")
    print("=" * 70)
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=True)
