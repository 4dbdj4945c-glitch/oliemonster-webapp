import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Versie van deze build, voor de cachenaam van de service worker (public/sw.js):
  // elke deploy een eigen cache, de oude wordt bij het activeren opgeruimd. Geen
  // nieuwe omgevingsvariabele: de commit van Vercel, anders het bouwmoment.
  env: {
    NEXT_PUBLIC_BOUW: (process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())).slice(0, 12),
  },

  // De rapporten (GET /api/rapport, het inspectierapport en het inhuurdossier) lezen de Inter-bestanden van de schijf; die
  // moeten dus mee in de serverfunctie. jsPDF en sharp niet bundelen maar als
  // gewone Node-pakketten laden (jsPDF kiest dan zijn Node-versie).
  outputFileTracingIncludes: {
    '/api/rapport': ['./lib/rapport/fonts/**'],
    '/api/inspecties/[id]/rapport': ['./lib/rapport/fonts/**'],
    '/api/eigen-dossier/inhuurdossier': ['./lib/rapport/fonts/**'],
    '/api/dagrapporten/[id]/pdf': ['./lib/rapport/fonts/**'],
  },
  serverExternalPackages: ['jspdf', 'jspdf-autotable', 'sharp', 'pdf-lib'],

  // Oude adressen van de oliemonsterpagina's blijven werken. /dashboard/oliemonsters
  // was de pagina van 2025 (daar landt de Mourik-kijker), /dashboard/oliemonsters2026
  // die van 2026. Tijdelijk (307), zodat een browser het niet voorgoed onthoudt.
  async redirects() {
    return [
      { source: '/dashboard/oliemonsters', destination: '/dashboard/oliemonsters/2025', permanent: false },
      { source: '/dashboard/oliemonsters2026', destination: '/dashboard/oliemonsters/2026', permanent: false },
    ];
  },

  // Headers configuratie voor iframe embedding
  async headers() {
    return [
      {
        // Pas headers toe op alle routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://www.itsdoneservices.nl',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://www.itsdoneservices.nl https://itsdoneservices.nl https://mourik.itsdoneservices.nl",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
