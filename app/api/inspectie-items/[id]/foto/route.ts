import { POST as fotoToevoegen } from '../fotos/route';

// Oud adres, voor een telefoon met een oude versie van de portal in de offline
// wachtrij: POST voegt nu een foto toe (vervangt niet meer), net als .../fotos.
export const POST = fotoToevoegen;
