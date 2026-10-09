'use client';
import { useEffect, useState } from 'react';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

export async function chatApi<T>(pad: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/chatbot/${pad}`, {
      method, cache: 'no-store', signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(GEEN_VERBINDING);
  }
  if (!res.ok) throw new Error(await foutTekst(res, 'De chatbot kon het verzoek niet verwerken.'));
  return res.json() as Promise<T>;
}
export function useChatData<T>(pad: string) {
  const [state, setState] = useState<{ pad: string; data?: T; fout?: string }>({ pad });
  const [versie, setVersie] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    chatApi<T>(pad, 'GET', undefined, controller.signal)
      .then(data => setState({ pad, data }))
      .catch(error => { if (!controller.signal.aborted) setState({ pad, fout: error instanceof Error ? error.message : 'Ophalen mislukt.' }); });
    return () => controller.abort();
  }, [pad, versie]);
  const actueel = state.pad === pad ? state : { pad };
  return { ...actueel, laden: actueel.data === undefined && !actueel.fout, opnieuw: () => { setState({ pad }); setVersie(v => v + 1); } };
}
export function foutMelding(error: unknown) { return error instanceof Error ? error.message : 'Opslaan is niet gelukt. Probeer het opnieuw.'; }
