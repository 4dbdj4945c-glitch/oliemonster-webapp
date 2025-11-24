// In-memory store voor rate limiting
// Voor productie met meerdere servers zou je Redis moeten gebruiken
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuten

export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; resetTime?: Date } {
  const now = Date.now();
  const attempt = loginAttempts.get(identifier);

  // Cleanup oude entries (ouder dan 1 uur)
  if (loginAttempts.size > 1000) {
    for (const [key, value] of loginAttempts.entries()) {
      if (now > value.resetTime + 60 * 60 * 1000) {
        loginAttempts.delete(key);
      }
    }
  }

  // Geen eerdere pogingen of reset tijd is verstreken
  if (!attempt || now > attempt.resetTime) {
    loginAttempts.set(identifier, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
    };
  }

  // Nog binnen de rate limit
  if (attempt.count < MAX_ATTEMPTS) {
    attempt.count++;
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - attempt.count,
    };
  }

  // Rate limit bereikt
  return {
    allowed: false,
    remainingAttempts: 0,
    resetTime: new Date(attempt.resetTime),
  };
}

export function resetRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}
