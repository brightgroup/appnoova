#!/usr/bin/env bash
# Backup diario de Supabase (schema public). Llamado por LaunchAgent en macOS.
set -euo pipefail

ROOT="/Users/johngarcia/appnoova"
LOG_DIR="${ROOT}/backups"
LOG_FILE="${LOG_DIR}/backup.log"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/libpq/bin/pg_dump}"

mkdir -p "$LOG_DIR"
cd "$ROOT"

{
  echo "=== $(date -Iseconds) backup inicio ==="
  /opt/homebrew/bin/npm run backup:db
  echo "=== $(date -Iseconds) backup OK ==="
} >>"$LOG_FILE" 2>&1

# Rotación: borrar .sql más viejos que RETENTION_DAYS
find "$LOG_DIR" -maxdepth 1 -name 'supabase-*.sql' -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
