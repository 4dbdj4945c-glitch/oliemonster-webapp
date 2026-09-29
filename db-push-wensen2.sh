#!/bin/bash
# VERVANGEN door ./db-bijwerken.sh (migraties in prisma/migrations). Niet meer draaien.
# Zet het Prisma-schema in de Supabase-database, inclusief alles van de vier
# wensen uit ronde 2:
#   1. de tweede foto (OilSample.partPhotoUrl en SampleAttempt.partPhotoUrl);
#   2. de status Niet bereikbaar (OilSample.isUnreachable, unreachableReason,
#      unreachableNote, unreachablePhotoUrl, unreachableAt, unreachableBy);
#   3. de rol alleen lezen met een eigen kijkjaar (User.viewYear).
# Punt 4 (de knop Monster nemen) gebruikt dezelfde kolommen en heeft niets extra nodig.
# Eén keer draaien is genoeg. Gebruikt de directe verbinding, want via de pooler
# kan Prisma geen schema wijzigen. Draaien vanuit deze projectmap: ./db-push-wensen2.sh
#
# Zet daarna de bestaande kijkers om naar de nieuwe rol. Dat doet het script zelf,
# met prisma/migreer-alleen-lezen.ts: viewer_oil2025 wordt alleen_lezen met viewYear 2025.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx tsx prisma/migreer-alleen-lezen.ts
