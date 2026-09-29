import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Elke query loggen alleen tijdens het ontwikkelen; in productie en in de tests
// zou dat de logs vullen met SQL (en de parameters erin).
const queriesLoggen = process.env.NODE_ENV === 'development';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: queriesLoggen ? ['query'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
