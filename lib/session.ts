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
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};
