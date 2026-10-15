#!/usr/bin/env bash
# Starts server.py fully detached from the terminal.
# Usage: ./start.sh        (logs -> server.log, PID -> server.pid)

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/server.pid"
LOG_FILE="$APP_DIR/server.log"
PYTHON="${PYTHON:-python3}"

cd "$APP_DIR" || exit 1

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Server already running (PID $(cat "$PID_FILE")). Stop it with: kill \$(cat $PID_FILE)"
    exit 0
fi

# setsid + nohup: survives terminal/SSH logout; stdin closed, output to log file
setsid nohup "$PYTHON" -u server.py >> "$LOG_FILE" 2>&1 < /dev/null &
echo $! > "$PID_FILE"
disown 2>/dev/null

echo "Server started in background (PID $(cat "$PID_FILE"))."
echo "Logs: $LOG_FILE"
