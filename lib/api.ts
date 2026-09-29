/**
 * fetch voor JSON-verzoeken naar de eigen API, met credentials: 'include'.
 *
 * Voor verzoeken naar de portal zelf is dat niet nodig: een relatieve URL
 * ('/api/...') is same-origin, en dan stuurt de browser de sessiecookie
 * standaard mee, ook binnen de iframe op mourik.itsdoneservices.nl (de cookie
 * staat op SameSite=None). Daarom is de oude FetchPatcher, die elke fetch in de
 * app ombouwde, weg. Gebruik apiFetch alleen als je de cookie expliciet mee
 * wilt sturen, bijvoorbeeld bij een verzoek naar een ander domein van de portal.
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
