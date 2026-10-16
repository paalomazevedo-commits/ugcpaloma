#!/usr/bin/env bash
# Roda a estrutura do banco + testes de isolamento num Postgres local descartável.
# Uso: bash scripts/testar-banco.sh   (precisa do Postgres instalado e do usuário postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=cardapio_teste
run() { sudo -u postgres psql -q -v ON_ERROR_STOP=1 "$@"; }
run -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/00_imitacao_supabase.sql supabase/migrations/*.sql supabase/seed.sql supabase/tests/isolamento.sql; do
  run -d "$DB" -f "$f"
done
run -c "drop database $DB"
