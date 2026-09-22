#!/bin/bash
# Zet het Prisma-schema (inclusief de tabellen van de module Acquisitie) in de
# Supabase-database. Gebruikt de directe verbinding, want via de pooler kan Prisma
# geen schema wijzigen. Draaien vanuit deze projectmap: ./db-push-acquisitie.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
