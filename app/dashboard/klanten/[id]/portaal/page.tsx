'use client';

// Het klantportaal van één klant, zoals een kijker van die klant het ziet
// (alleen admin, knop Klantportaal bekijken in het klantdossier). Zelfde
// component en zelfde API als voor de kijker, met ?klantId=.

import { useParams } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import KlantPortaal from '@/app/components/portaal/KlantPortaal';

export default function KlantPortaalVoorbeeld() {
  const user = useGebruiker();
  const { id } = useParams<{ id: string }>();
  const klantId = /^\d+$/.test(id) ? Number(id) : undefined;
  return <KlantPortaal gebruikersnaam={user.username} klantId={klantId} voorbeeld />;
}
