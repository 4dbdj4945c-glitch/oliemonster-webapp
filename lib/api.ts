/**
 * Wrapper voor fetch API calls die automatisch credentials include
 * Dit is nodig voor cookies in iframe context
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include', // Altijd credentials meesturen
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
