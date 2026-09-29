#!/bin/bash
# Zet het Prisma-schema in de Supabase-database, inclusief alles van fase 0 van
# het portaalplan: de nieuwe tabel Uitnodiging voor de eenmalige links waarmee
# een nieuwe gebruiker (of iemand na een wachtwoordreset) zelf een wachtwoord
# instelt. Er verandert niets aan bestaande tabellen of kolommen.
#
# Zolang dit script niet gedraaid is, werkt de portal gewoon door en loggen
# bestaande gebruikers met hun wachtwoord in zoals altijd. Alleen een link maken
# (Nieuwe gebruiker, Wachtwoord resetten, Nieuwe link) geeft een nette melding.
# Inloggen zonder wachtwoord kan ook zonder dit script al niet meer.
# Eén keer draaien is genoeg. Gebruikt de directe verbinding, want via de pooler
# kan Prisma geen schema wijzigen. Draaien vanuit deze projectmap: ./db-push-fase0.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
DATABASE_URL="$POSTGRES_URL_NON_POOLING" npx prisma db push
