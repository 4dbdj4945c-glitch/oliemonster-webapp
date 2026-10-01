import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/apiRoute';
import { haalMonsterJaren } from '@/lib/monsterLijst';

// GET - De analysejaren met monsters, met per jaar het aantal en hoeveel er
// genomen zijn (geannuleerde tellen niet als genomen). Voor de jaarkeuze op de
// oliemonsterpagina en de tegels op het dashboard. Een kijker met een eigen
// kijkjaar krijgt alleen dat jaar.
export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Fout bij ophalen van de jaren' },
  async (_request, _context, sessie) => {
    // Kijkjaar en klant (lib/afscherming.ts): een kijker telt alleen wat hij mag zien.
    const jaren = await haalMonsterJaren(sessie);
    return NextResponse.json({ jaren });
  }
);
