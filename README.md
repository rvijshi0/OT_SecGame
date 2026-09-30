# CYBER SHIFT — Enterprise Cybersecurity Awareness Game

![CYBER SHIFT](https://img.shields.io/badge/Security-IT%20%2B%20OT%20Awareness-38bdf8?style=for-the-badge&logo=shield)
![Python](https://img.shields.io/badge/Backend-Python%20Flask-3776ab?style=for-the-badge&logo=python)
![SQLite](https://img.shields.io/badge/Database-SQLite3-003b57?style=for-the-badge&logo=sqlite)
![Status](https://img.shields.io/badge/Status-Production%20Ready-10b981?style=for-the-badge)

**CYBER SHIFT** is an interactive, browser-based cybersecurity awareness game designed for enterprise-wide campaigns (supporting 800+ participants). It combines scenario-based decision making across two critical domains: **IT Security** and **Industrial Control / Operational Technology (OT) Security**.

---

## 🎯 Key Features 1

- 🖥️ **Two Connected Missions**:
  - **Mission 1: THE LAST 15 MINUTES (IT Security)** — Business Email Compromise (BEC), MFA fatigue/storm attacks, unapproved AI tool data leakage, prompt injection, and deepfake verification.
  - **Mission 2: LINE DOWN (OT Security)** — Vendor access management, unknown USB removable media, IT/OT convergence, HMI anomaly escalation, and safety-first operational decisions.
- 🔐 **Email OTP Authentication**:
  - Requires participants to enter their corporate email address.
  - Dispatches a 6-digit One-Time Password (OTP) via your organization's SMTP email server.
  - Validates OTP with a 10-minute expiry window and single-use token issuance.
- 🔒 **Strict Single-Play Policy Enforcement**:
  - Guarantees campaign integrity by limiting each participant to **ONE (1) attempt per mission**.
  - Server-side enforcement (HTTP 403 Forbidden on replay attempts).
  - Frontend mission cards automatically lock upon completion and display the final score badge.
- 📊 **Analytics & Leaderboard**:
  - Real-time score tracking across Security, Reputation, and Operational Risk.
  - SQLite backend database storing player attempts, decision breakdown, and completion timestamps.
  - Campaign Leaderboard featuring anonymized top scores for employee privacy.
- 🎨 **Modern Cyber Aesthetic**:
  - Built with glassmorphism UI, sleek dark mode theme, SVG character animations, micro-interactions, and responsive layout.
  - Zero external JavaScript framework dependencies — runs lightweight in any browser.

---

## 🛠️ Project Structure

```text
OT_SecGame/
├── cyber-shift/
│   ├── config.py           # Hardcoded/Configurable SMTP host, port, sender email & security settings
│   ├── server.py           # Flask REST API server & static UI router
│   ├── database.py         # SQLite database schema, user session tracking & 1-attempt policy lock
│   ├── emailer.py          # SMTP email delivery for OTP verification
│   ├── index.html          # Main HTML web page
│   ├── styles.css          # Core CSS design system, typography, micro-animations & auth modal
│   ├── bundle.js           # Single-file bundled game engine, scenarios, renderers & auth client
│   ├── requirements.txt    # Python dependencies (Flask)
│   └── game-data.js        # SCORM / Data definitions
├── .gitignore              # Excludes SQLite database files, python cache & environment files
├── LICENSE                 # MIT Open Source License
└── README.md               # Project documentation & deployment guide
```

---

## 🚀 Quick Start & Installation

### Prerequisites

- **Python 3.11** or higher
- Access to an internal SMTP server (or use dev mode for offline testing)

### Step 1: Clone the Repository

```bash
git clone https://github.com/rvijshi0/OT_SecGame.git
cd OT_SecGame/cyber-shift
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Configure SMTP Server Settings

Edit `cyber-shift/config.py` to match your organization's mail server details:

```python
# cyber-shift/config.py
SMTP_HOST = "10.0.0.1"                   # Your SMTP Server IP or Hostname
SMTP_PORT = 25                           # Your SMTP Server Port (25, 587, 465)
SMTP_USE_TLS = False                     # Set to True if TLS is required
SMTP_FROM = "security-game@company.com"  # Sender address for OTP emails

# Set to False in Production to send real SMTP emails!
DEV_SHOW_OTP_IN_RESPONSE = True          # When True, OTP is shown in prompt for dev testing
```

### Step 4: Run the Server

```bash
python server.py
```

Output:
```text
======================================================================
  CYBER SHIFT SERVER RUNNING
  SMTP Server: 10.0.0.1:25 | From: security-game@company.com
  Single-Play Enforcement: Active (1 Attempt per User per Mission)
  URL: http://localhost:5000
======================================================================
```

### Step 5: Play the Game

Open your web browser and navigate to **`http://localhost:5000`**.

1. Enter your corporate email address (e.g. `employee@company.com`).
2. Receive your 6-digit OTP code.
3. Enter the OTP code to log in.
4. Play Mission 1 (IT) and Mission 2 (OT).

---

## ⚙️ Configuration & Environment Variables

You can also configure settings via environment variables:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SMTP_HOST` | `10.0.0.1` | SMTP Server IP address or hostname |
| `SMTP_PORT` | `25` | SMTP Server Port |
| `SMTP_USE_TLS` | `False` | Set to `True` for TLS encryption |
| `SMTP_USER` | `""` | Optional SMTP authentication username |
| `SMTP_PASS` | `""` | Optional SMTP authentication password |
| `SMTP_FROM` | `security-game@company.com` | From-address for OTP emails |

---

## 🔒 Security & Privacy Notice

- **Awareness Only**: Scenarios are educational enterprise simulations. No real operational passwords, real plant identifiers, or attack instructions are included.
- **Privacy & Anonymity**: The leaderboard automatically anonymizes email addresses (e.g. `j***@company.com`) to protect employee privacy.
- **Single-Play Enforcement**: Once a user completes a mission, their score is saved in the SQLite database and their account is locked from playing that mission again.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
