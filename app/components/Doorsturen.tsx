'use client';

// Doorsturen met een volledige paginalading. Voor app/dashboard/layout.tsx: een
// redirect() op de server tijdens een client-navigatie (router.push, Link)
// leverde bij de doorsturing naar de jaarpagina van een kijker een leeg scherm
// op. Bij zo'n navigatie rendert de layout dit in plaats van redirect(), en de
// browser laadt de bestemming opnieuw; de server stuurt dan gewoon goed door.

import { useEffect } from 'react';

export default function Doorsturen({ naar }: { naar: string }) {
  useEffect(() => {
    window.location.replace(naar);
  }, [naar]);
  return (
    <div className="laadscherm" role="status">
      Laden...
    </div>
  );
}
