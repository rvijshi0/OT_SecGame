"""
CYBER SHIFT - Configuration File
Central configuration for SMTP Email Server, Authentication, Admin Access, and One-Time Play rules.
"""

import os

# ==============================================================================
# SMTP SERVER CONFIGURATION
# Set your organization's SMTP server IP, Port, and Sender Address here.
# ==============================================================================
SMTP_HOST = os.getenv("SMTP_HOST", "10.0.0.1")          # Hardcoded SMTP Server IP / Host
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))           # Hardcoded SMTP Server Port (25, 587, 465)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "False").lower() in ("true", "1", "yes") # Enable TLS if required
SMTP_USER = os.getenv("SMTP_USER", "")                  # SMTP Auth Username (if required, else empty)
SMTP_PASS = os.getenv("SMTP_PASS", "")                  # SMTP Auth Password (if required, else empty)
SMTP_FROM = os.getenv("SMTP_FROM", "security-game@company.com") # From address for OTP emails

# ==============================================================================
# ADMIN ACCOUNTS CONFIGURATION
# Email addresses listed here are granted Admin Dashboard access.
# Multiple email addresses can be separated by a semicolon (;) or comma (,).
# ==============================================================================
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@company.com;security-admin@company.com")
ADMIN_EMAILS = [e.strip().lower() for e in ADMIN_EMAIL.replace(",", ";").split(";") if e.strip()]

def is_admin_email(email: str) -> bool:
    """True if the given email belongs to the configured administrator list."""
    if not email:
        return False
    return email.strip().lower() in ADMIN_EMAILS

# ==============================================================================
# ACCESS CONTROL - EMAIL DOMAIN ALLOW-LIST
# Only users whose email belongs to one of these domains can sign in.
# Separate multiple domains with commas, e.g. "company.com, subsidiary.com".
# Matching is exact: "company.com" does NOT admit "mail.company.com" unless listed.
# Leave empty ("") to allow any domain - not recommended for production.
# ==============================================================================
ALLOW_DOMAIN = os.getenv("ALLOW_DOMAIN", "company.com")
ALLOWED_DOMAINS = [d.strip().lower().lstrip("@") for d in ALLOW_DOMAIN.split(",") if d.strip()]

# ==============================================================================
# SECURITY & AUTH SETTINGS
# ==============================================================================
OTP_EXPIRY_MINUTES = 10  # OTP valid for 10 minutes
OTP_LENGTH = 6           # 6-digit numeric OTP
SESSION_EXPIRY_HOURS = int(os.getenv("SESSION_EXPIRY_HOURS", "24"))  # Login session lifetime

# In local development/testing mode, set to True to return the OTP in API responses
# for easy browser testing when an SMTP server is unavailable. Set to False for production!
DEV_SHOW_OTP_IN_RESPONSE = True

# Server hosting configuration
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 5000
DATABASE_FILE = "cyber_shift.db"

