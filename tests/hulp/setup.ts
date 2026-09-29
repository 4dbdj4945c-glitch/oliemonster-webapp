// Next.js-functies die buiten een echte aanvraag niet werken, vervangen door
// een eenvoudige koekjestrommel (zie tests/hulp/verzoek.ts).
import { vi } from 'vitest';
import { koekjes } from './verzoek';

vi.mock('next/headers', () => ({
  cookies: async () => koekjes,
  headers: async () => new Headers(),
}));
