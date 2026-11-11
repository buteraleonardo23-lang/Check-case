#!/usr/bin/env bash
# Esegue i test del database su un Postgres VUOTO.
# Uso: DATABASE_URL=postgres://... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Imposta DATABASE_URL verso un database Postgres vuoto}"
Q=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)
"${Q[@]}" -f supabase/tests/stubs.sql
err=$(mktemp)
"${Q[@]}" -f supabase/setup_completo.sql 2>"$err" || { cat "$err"; exit 1; }
"${Q[@]}" -f supabase/tests/helpers.sql
"${Q[@]}" -f supabase/tests/scenario.sql 2>&1 | grep -E "ok  |TEST FALLITO|ERROR|TUTTI" | sed -E "s/^(psql:[^ ]* )?(NOTICE|ERROR):  /  /; s/^ +/  /"
