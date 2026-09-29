// Zet vóór de tests het schema in de testdatabase met de echte migraties
// (prisma migrate deploy), precies zoals productie het krijgt.
import { execSync } from 'node:child_process';
import { magLokaalWissen } from '../../prisma/nepdata';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!magLokaalWissen(url)) {
    throw new Error('TEST_DATABASE_URL moet naar een database op deze computer wijzen: de tests wissen hem.');
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
