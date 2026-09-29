"""
CYBER SHIFT — SMTP Email Sender
Sends OTP authentication emails using configured SMTP server parameters (IP, Port, From-address).
Includes robust exception handling so game operations continue gracefully if SMTP host is offline.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import SMTP_HOST, SMTP_PORT, SMTP_USE_TLS, SMTP_USER, SMTP_PASS, SMTP_FROM

def send_otp_email(to_email: str, otp_code: str) -> tuple[bool, str]:
    """
    Sends 6-digit OTP verification code via SMTP.
    Returns (success_boolean, message_string).
    """
    subject = "CYBER SHIFT — Your One-Time Password (OTP) for Cybersecurity Awareness Game"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 20px; }}
        .card {{ max-width: 500px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
        .badge {{ display: inline-block; background-color: #0284c7; color: white; padding: 4px 12px; border-radius: 9999px; font-weight: bold; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }}
        h2 {{ color: #38bdf8; margin-top: 15px; margin-bottom: 5px; }}
        .otp-box {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 2px dashed #38bdf8; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; }}
        .otp-code {{ font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #38bdf8; }}
        .footer {{ font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; border-top: 1px solid #334155; padding-top: 15px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">CYBER SHIFT SECURITY</span>
        <h2>Cybersecurity Awareness Verification</h2>
        <p>Hello,</p>
        <p>You requested access to play <strong>CYBER SHIFT — Cybersecurity Awareness Game</strong>. Use the One-Time Password (OTP) below to authenticate your account:</p>
        
        <div class="otp-box">
          <div class="otp-code">{otp_code}</div>
        </div>
        
        <p><strong>Security Notice:</strong></p>
        <ul>
          <li>This OTP is valid for <strong>10 minutes</strong>.</li>
          <li>Each participant is permitted <strong>ONE (1) attempt</strong> to play the IT Mission and OT Mission.</li>
          <li>Do not share this OTP code with anyone.</li>
        </ul>
        
        <div class="footer">
          CYBER SHIFT Enterprise Awareness Campaign &bull; Protected System &bull; Hardcoded SMTP: {SMTP_HOST}:{SMTP_PORT}
        </div>
      </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        if SMTP_USE_TLS:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5)
            server.starttls()
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5)
            
        if SMTP_USER and SMTP_PASS:
            server.login(SMTP_USER, SMTP_PASS)
            
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        server.quit()
        return True, f"OTP email sent successfully to {to_email} via SMTP ({SMTP_HOST}:{SMTP_PORT})."
    except Exception as e:
        err_msg = f"SMTP dispatch notice: Could not reach SMTP server ({SMTP_HOST}:{SMTP_PORT}): {str(e)}"
        print(f"[SMTP WARNING] {err_msg}")
        return False, err_msg
