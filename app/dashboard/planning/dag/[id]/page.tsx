// Het dagscherm (veldscherm) van één monsterdag: /dashboard/planning/dag/12.
// Hier kom je via Start dag op Vandaag of Dag openen in de planning.

import { notFound } from 'next/navigation';
import Dagscherm from '@/app/components/planning/Dagscherm';

export default async function DagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <Dagscherm key={id} dagId={Number(id)} />;
}
