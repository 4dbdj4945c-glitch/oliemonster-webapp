#!/bin/bash
# VERVANGEN door ./db-bijwerken.sh (migraties in prisma/migrations). Niet meer draaien.
# Zet het Prisma-schema in de Supabase-database, inclusief alles van de
# planningsmodule: SampleObject, OilSample.objectId, de annuleervelden
# (cancelReason, cancelledAt, cancelledBy, cancelReasonInPdf) en de planning zelf
# (SamplePlan en SamplePlanStop). Eén keer draaien is genoeg voor alle fasen.
# Gebruikt de directe verbinding, want via de pooler kan Prisma geen schema
# wijzigen. Draaien vanuit deze projectmap: ./db-push-planning.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
