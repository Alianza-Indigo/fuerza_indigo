import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma-client/client';
import { env } from '@/platform/config/env';

/**
 * Cliente Prisma sobre Neon (ADR-0002).
 *
 * Se usa el adaptador de `node-postgres`, que funciona igual contra Neon por
 * TCP y contra un PostgreSQL local, de modo que las pruebas de integración se
 * ejecutan contra el mismo camino de código que producción.
 *
 * La aplicación se conecta con `DATABASE_URL` (conexión agrupada y rol de
 * aplicación **sin** privilegios de modificación sobre las bitácoras). Las
 * migraciones usan `DIRECT_URL`, que es un rol distinto.
 */

const globalForPrisma = globalThis as unknown as { prismaClient: PrismaClient | undefined };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
  return new PrismaClient({ adapter });
}

/** Cliente compartido del proceso. En desarrollo sobrevive a la recarga. */
export function db(): PrismaClient {
  globalForPrisma.prismaClient ??= createClient();
  return globalForPrisma.prismaClient;
}

/** Solo para pruebas: sustituye el cliente compartido. */
export function setDbClientForTests(client: PrismaClient | undefined): void {
  globalForPrisma.prismaClient = client;
}

export type { PrismaClient };
