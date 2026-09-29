#!/bin/bash
# VERVANGEN door ./db-bijwerken.sh (migraties in prisma/migrations). Niet meer draaien.
# Zet het Prisma-schema in de Supabase-database, inclusief alles van veilig
# verwijderen: de kolommen OilSample.deletedAt en OilSample.deletedBy (plus een
# index op deletedAt). Daarmee gaat een verwijderd monster naar de prullenbak
# in plaats van dat het met pogingen en al gewist wordt.
#
# Zolang dit script niet gedraaid is, werkt de portal gewoon door, maar weigert
# de knop Monster verwijderen met een nette melding: een harde delete als
# terugval is precies wat we niet meer willen.
# Eén keer draaien is genoeg. Gebruikt de directe verbinding, want via de pooler
# kan Prisma geen schema wijzigen. Draaien vanuit deze projectmap: ./db-push-veilig-verwijderen.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
