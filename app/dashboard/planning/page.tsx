// De planning van de oliemonsters: /dashboard/planning (huidig jaar) of
// /dashboard/planning?jaar=2027. Dezelfde planning staat ook als tab op de
// oliemonsterpagina van dat jaar; dit is de vaste plek in de navigatie.

import PlanningPagina from '@/app/components/planning/PlanningPagina';
import { geldigJaar } from '@/lib/modules';

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ jaar?: string }> }) {
  const { jaar } = await searchParams;
  const n = jaar && /^\d{4}$/.test(jaar) ? Number(jaar) : NaN;
  const gekozen = geldigJaar(n) ? n : new Date().getFullYear();
  return <PlanningPagina key={gekozen} jaar={gekozen} />;
}
