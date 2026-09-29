import { SessionOptions } from 'iron-session';

export interface SessionData {
  userId?: number;
  username?: string;
  role?: string;
  isLoggedIn: boolean;
  requiresPasswordChange?: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

// Alleen voor lokaal ontwikkelen. In productie bestaat er geen reservesleutel:
// een sleutel die in de code staat is publiek, en daarmee kan iedereen een
// sessie namaken.
const ONTWIKKELSLEUTEL = 'complex_password_at_least_32_characters_long_CHANGE_THIS';

/**
 * De sleutel waarmee de sessiecookie versleuteld wordt. Ontbreekt SESSION_SECRET
 * in productie, dan faalt elk verzoek dat een sessie nodig heeft, met een
 * duidelijke melding in de logs. Liever even niet inloggen dan inloggen met een
 * sleutel die iedereen kan lezen. Tijdens `next build` wordt dit niet gelezen.
 */
export function sessieSleutel(): string {
  const sleutel = process.env.SESSION_SECRET;
  if (sleutel && sleutel.length >= 32) return sleutel;
  if (process.env.NODE_ENV === 'production') {
    const melding = sleutel
      ? 'SESSION_SECRET is te kort: minimaal 32 tekens. Pas hem aan in Vercel (Settings > Environment Variables) en deploy opnieuw.'
      : 'SESSION_SECRET ontbreekt. Zet hem in Vercel (Settings > Environment Variables, minimaal 32 tekens) en deploy opnieuw. Zonder die sleutel kan niemand inloggen.';
    console.error(melding);
    throw new Error(melding);
  }
  return sleutel || ONTWIKKELSLEUTEL;
}

export const sessionOptions: SessionOptions = {
  // Een getter, zodat de sleutel pas bij een verzoek gelezen wordt en niet al
  // tijdens het bouwen. iron-session leest hem bij elke aanroep opnieuw.
  get password() {
    return sessieSleutel();
  },
  cookieName: 'oliemonster_session',
  cookieOptions: {
    httpOnly: true,
    // Secure moet true zijn in productie
    secure: process.env.NODE_ENV === 'production',
    // Langere maxAge voor betere persistentie (30 dagen)
    maxAge: 60 * 60 * 24 * 30, // 30 dagen
    // SameSite=None voor iframe support
    // BELANGRIJK: Dit betekent dat de cookie werkt in iframe context,
    // maar sommige browsers (vooral Safari) kunnen deze cookies verwijderen
    // bij het afsluiten van de browser of na een tijd van inactiviteit.
    // Dit is een trade-off voor iframe functionaliteit.
    sameSite: 'none',
    // Path moet expliciet worden ingesteld
    path: '/',
  },
};
