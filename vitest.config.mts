import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { userInfo } from 'node:os';

// Tests voor lib/ en een paar API-routes. De tests in tests/db en tests/routes
// draaien tegen de lokale testdatabase (zie README.md, Lokale database). Die
// wordt per testbestand gewist en opnieuw gevuld met prisma/nepdata.ts.
//
// Standaard ids_portal_test op deze computer (Homebrew PostgreSQL, ingelogd als
// je eigen macOS-gebruiker); in CI zet de workflow TEST_DATABASE_URL.
process.env.TEST_DATABASE_URL ??= `postgresql://${userInfo().username}@localhost:5432/ids_portal_test`;

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/hulp/globalSetup.ts'],
    setupFiles: ['tests/hulp/setup.ts'],
    // Eén database voor alle bestanden: niet tegelijk draaien.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      SESSION_SECRET: 'testsleutel-alleen-voor-vitest-0123456789abcdef',
    },
  },
});
