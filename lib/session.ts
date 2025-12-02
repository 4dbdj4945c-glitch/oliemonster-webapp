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

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_CHANGE_THIS',
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
