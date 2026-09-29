"""
CYBER SHIFT — Configuration File
Central configuration for SMTP Email Server, Authentication, and One-Time Play rules.
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
# SECURITY & AUTH SETTINGS
# ==============================================================================
OTP_EXPIRY_MINUTES = 10  # OTP valid for 10 minutes
OTP_LENGTH = 6           # 6-digit numeric OTP

# In local development/testing mode, set to True to return the OTP in API responses
# for easy browser testing when an SMTP server is unavailable. Set to False for production!
DEV_SHOW_OTP_IN_RESPONSE = True

# Server hosting configuration
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 5000
DATABASE_FILE = "cyber_shift.db"
