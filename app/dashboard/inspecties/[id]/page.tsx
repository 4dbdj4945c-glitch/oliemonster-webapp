// Een inspectie invullen of bekijken: /dashboard/inspecties/12.

import { notFound } from 'next/navigation';
import Invulscherm from '@/app/components/inspecties/Invulscherm';

export default async function InspectiePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <Invulscherm key={id} inspectieId={Number(id)} />;
}
