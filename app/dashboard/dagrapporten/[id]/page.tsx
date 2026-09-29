// Een dagrapport invullen, laten tekenen of bekijken: /dashboard/dagrapporten/12.

import { notFound } from 'next/navigation';
import Dagrapportscherm from '@/app/components/dagrapport/Dagrapportscherm';

export default async function DagrapportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <Dagrapportscherm key={id} dagrapportId={Number(id)} />;
}
