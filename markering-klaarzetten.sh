#!/bin/bash
# Eenmalig: zet de nog niet uitgevoerde complexen van de opdracht "markeren met
# stickers" klaar als concept-inspectie Markering (scripts/markering-klaarzetten.mjs).
# Laat eerst zien wat het gaat doen en vraagt om bevestiging.
# Draaien vanuit deze projectmap: ./markering-klaarzetten.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
export DATABASE_URL="$POSTGRES_URL_NON_POOLING"
node scripts/markering-klaarzetten.mjs
