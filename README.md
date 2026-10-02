# CYBER SHIFT — Enterprise Cybersecurity Awareness Game

![CYBER SHIFT](https://img.shields.io/badge/Security-IT%20%2B%20OT%20Awareness-38bdf8?style=for-the-badge&logo=shield)
![3D Graphics](https://img.shields.io/badge/Graphics-Three.js%203D-ff4500?style=for-the-badge&logo=three.js)
![Voice Narration](https://img.shields.io/badge/Audio-Deep%20Voice%20Narration-00d4ff?style=for-the-badge)
![Backend](https://img.shields.io/badge/Backend-Python%20Flask-3776ab?style=for-the-badge&logo=python)
![Database](https://img.shields.io/badge/Database-SQLite3-003b57?style=for-the-badge&logo=sqlite)
![Status](https://img.shields.io/badge/Status-Production%20Ready-10b981?style=for-the-badge)

**CYBER SHIFT** is an interactive, browser-based cybersecurity awareness game designed for enterprise-wide campaigns (supporting 800+ participants). It combines scenario-based decision making across two critical domains: **IT Security** and **Industrial Control / Operational Technology (OT) Security**.

---

## 🎯 Key Features

- 🖥️ **Two Connected Missions**:
  - **Mission 1: THE LAST 15 MINUTES (Office & online safety)** — safe AI usage (shadow AI prevention), credentials protection, data exfiltration blocking, fake payment emails/texts, and secure device habits.
  - **Mission 2: LINE DOWN (Factory & plant safety)** — default password elimination, unauthorized USB/dongle blocking, internet isolation, mandatory cyber security assessments, unapproved remote sharing tool (TeamViewer/AnyDesk) blocking, and safety-first plant choices.
- 🕶️ **Interactive 3D Cyber Characters (Three.js)**:
  - Futuristic 3D Cyberpunk hero & operator avatar models rendered with WebGL.
  - Features glowing cyber visors, spinning internal tech cores, rotating orbital tech rings, animated particle fields, dynamic neon lighting, and interactive mouse cursor tracking.
- 🗣️ **Deep Male Voice Narration System**:
  - Voice audio engine built with the Web Speech API (`window.speechSynthesis`) that reads out situation scenario titles, workplace stories, and character dialogue.
  - Modulated for a natural, steady, and articulate male tone (`pitch: 0.95`, `rate: 0.80`).
  - Topbar voice control toggle (`🔊 Voice ON` / `🗣️ Speaking...` / `🔇 Voice OFF`) with live soundwave equalizer animation.
- 👑 **Enterprise Admin Dashboard & Dynamic Configuration**:
  - Dedicated administrative dashboard accessible to authorized admin accounts.
  - **Overview**: Real-time KPI summary of registered users, attempt progress, completion rates, and average scores.
  - **User Tracking**: Interactive table tracking employee progress, current stage, attempts used/remaining, scores, and individual attempt log resetting.
  - **Dynamic Attempt Limits**: Configurable global maximum attempt limits per user across campaign settings.
  - **Dynamic Question Configuration**: Configure exact target question counts per game and category question allocations (IT vs OT) with live validation and persistent backend saving.
  - **Analytics & Frequently Missed Questions**: Identify top security gaps and most frequently missed scenario questions across participants.
  - **Audit Logs**: Administrative activity log tracking all configuration edits, attempt resets, and CSV report exports.
- 📥 **Authenticated CSV Export Reports**:
  - One-click downloadable CSV reports (`/api/admin/analytics/export`) containing complete participant completion records, individual mission scores, attempt usages, and question accuracy statistics.
- 🎲 **50 Plain-English Scenarios** (25 per mission) written for non-technical staff:
  - Each player gets a randomized, seeded selection of scenarios per mission, guaranteed to cover every badge topic.
  - Answer choices are shuffled for every question; each scenario features illustrations, mock-ups (emails, texts, calls, control screens), and immediate post-choice rationale.
- 🔐 **Email OTP Authentication & Single-Play Policy**:
  - Dispatches 6-digit One-Time Password (OTP) codes via internal SMTP mail servers.
  - Enforces strict single-play policy: **1 attempt allowed per user per mission** to preserve campaign measurement integrity.

---

## 🛠️ Project Structure

```text
OT_SecGame/
├── cyber-shift/
│   ├── config.py           # Configurable SMTP host, port, sender email, admin emails & domain whitelist
│   ├── server.py           # Flask REST API server, authentication, admin endpoints & CSV export stream
│   ├── database.py         # SQLite database schema, user session tracking, attempt limits & config persistence
│   ├── emailer.py          # SMTP email delivery for OTP verification
│   ├── index.html          # Main HTML page with Three.js WebGL library integration
│   ├── styles.css          # GameX-inspired dark gaming UI design system, glassmorphism & equalizer animations
│   ├── bundle.js           # Main application engine, 3D character renderer, voice narration & Admin UI
│   ├── requirements.txt    # Python dependencies (Flask)
│   └── game-data.js        # All scenario content, missions, topics & badges
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

### Step 3: Configure SMTP & Admin Email Settings

Edit `cyber-shift/config.py` to match your mail server details and administrator email accounts:

```python
# cyber-shift/config.py
SMTP_HOST = "10.0.0.1"                   # Your SMTP Server IP or Hostname
SMTP_PORT = 25                           # Your SMTP Server Port (25, 587, 465)
SMTP_FROM = "security-game@company.com"  # Sender address for OTP emails

# Authorized Administrator Emails (grants access to Enterprise Admin Dashboard)
ADMIN_EMAILS = ["admin@company.com", "security-admin@company.com"]

# Set to False in Production to send real SMTP emails!
DEV_SHOW_OTP_IN_RESPONSE = True          # When True, OTP is shown in prompt for dev testing
```

### Step 4: Run the Server

```bash
python server.py
```

Output:
```text
===========================================================================
  CYBER SHIFT ENTERPRISE SERVER RUNNING
  SMTP Server: 10.0.0.1:25 | From: security-game@company.com
  Admin Email Accounts: admin@company.com, security-admin@company.com
  Allowed Domains: company.com
  URL: http://localhost:5000
===========================================================================
```

### Step 5: Play the Game

Open your web browser and navigate to **`http://localhost:5000`**.

1. Enter your corporate email address (e.g. `employee@company.com`).
2. Receive your 6-digit OTP code.
3. Enter the OTP code to log in.
4. Play Mission 1 (IT) and Mission 2 (OT).
5. Sign in as an administrator email to access the **Enterprise Admin Dashboard**.

---

## ⚙️ Configuration & Environment Variables

You can configure settings in `config.py` or via environment variables:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SMTP_HOST` | `10.0.0.1` | SMTP Server IP address or hostname |
| `SMTP_PORT` | `25` | SMTP Server Port |
| `SMTP_FROM` | `security-game@company.com` | From-address for OTP emails |
| `SESSION_EXPIRY_HOURS` | `24` | Lifetime of a login session in hours |
| `ADMIN_EMAILS` | `admin@company.com` | Comma-separated list of administrator email addresses |
| `ALLOW_DOMAIN` | `company.com` | Email domain(s) allowed to sign in |

---

## 🔒 Security & Privacy Notice

- **Awareness Only**: Scenarios are educational enterprise simulations. No real operational passwords or sensitive plant vulnerabilities are exposed.
- **Privacy & Anonymity**: Public Leaderboard automatically anonymizes player email addresses (e.g. `e***@company.com`).
- **Single-Play Policy Enforcement**: Once a participant completes a mission, server-side policy enforcement prevents replaying the mission to guarantee fair assessment.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
