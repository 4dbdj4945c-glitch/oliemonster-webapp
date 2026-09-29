#!/bin/bash
# Werkt de Supabase-database bij naar de migraties in prisma/migrations. Dit is
# het enige script voor schemawijzigingen; de oude db-push-*.sh zijn vervangen.
#
# De eerste keer (als 0_basis nog niet in de database geregistreerd staat)
# controleert het eerst of de database precies gelijk is aan de basismigratie
# (prisma/basis-schema.prisma is het schema waaruit 0_basis gemaakt is). Is er
# een verschil, dan stopt het script met een melding en het verschil als SQL, en
# is er niets gewijzigd. Is er geen verschil, dan registreert het 0_basis als
# toegepast zonder iets uit te voeren: de tabellen staan er immers al.
#
# Daarna, en bij elke volgende keer, voert het de migraties uit die nog niet
# gedraaid zijn (prisma migrate deploy). Vaker draaien kan geen kwaad: staat
# alles er al, dan gebeurt er niets.
#
# Gebruikt de directe verbinding, want via de pooler kan Prisma geen schema
# wijzigen. Draaien vanuit deze projectmap: ./db-bijwerken.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.production; set +a
export DATABASE_URL="$POSTGRES_URL_NON_POOLING"

status=$(node scripts/migratie-status.mjs)

if [ "$status" = "onbekend" ]; then
  echo ""
  echo "GESTOPT: er staan migraties in de database die niet in prisma/migrations staan."
  echo "Er is niets gewijzigd. Vraag na waar die vandaan komen voordat je verdergaat."
  exit 1
fi

if [ "$status" = "basis-ontbreekt" ]; then
  echo "Eerste keer: controleren of de database gelijk is aan de basismigratie 0_basis..."
  verschil=$(mktemp)
  set +e
  npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/basis-schema.prisma \
    --script --exit-code > "$verschil"
  code=$?
  set -e
  if [ "$code" -eq 2 ]; then
    echo ""
    echo "GESTOPT: de database wijkt af van de basismigratie 0_basis. Er is niets gewijzigd."
    echo "Dit is de SQL die de database gelijk zou trekken met 0_basis (NIET zomaar uitvoeren):"
    echo "--------------------------------------------------------------------------------"
    cat "$verschil"
    echo "--------------------------------------------------------------------------------"
    echo "Staan hier alleen toevoegingen (CREATE, ADD COLUMN), dan is waarschijnlijk een oud"
    echo "db-push-script nog niet gedraaid. Staat er DROP in, dan heeft de database iets wat"
    echo "het schema niet kent: eerst uitzoeken, niets weggooien."
    rm -f "$verschil"
    exit 1
  elif [ "$code" -ne 0 ]; then
    cat "$verschil"
    rm -f "$verschil"
    echo "GESTOPT: de vergelijking met de database is mislukt (zie hierboven). Er is niets gewijzigd."
    exit 1
  fi
  rm -f "$verschil"
  echo "De database is gelijk aan 0_basis. 0_basis wordt geregistreerd als toegepast."
  npx prisma migrate resolve --applied 0_basis
fi

echo "Openstaande migraties uitvoeren..."
if ! npx prisma migrate deploy; then
  echo ""
  echo "GESTOPT: een migratie is mislukt (zie de melding hierboven). De migraties daarvoor"
  echo "zijn wel uitgevoerd. Prisma blokkeert nu tot de mislukte migratie is afgehandeld."
  echo "Niet zomaar opnieuw draaien. Zoek eerst uit wat er misging; is er niets van die"
  echo "migratie in de database blijven staan, markeer hem dan als teruggedraaid met"
  echo "  npx prisma migrate resolve --rolled-back <naam van de migratie>"
  echo "(met DATABASE_URL naar de directe verbinding) en draai daarna dit script opnieuw."
  exit 1
fi
echo "Klaar: de database is bij."
