#!/bin/bash
# Zet het Prisma-schema (inclusief de tabellen en velden van de planningsmodule:
# SampleObject, OilSample.objectId en de annuleervelden) in de Supabase-database.
# Gebruikt de directe verbinding, want via de pooler kan Prisma geen schema
# wijzigen. Draaien vanuit deze projectmap: ./db-push-planning.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
