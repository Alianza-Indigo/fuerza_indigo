import { db } from '@/platform/db/client';
import { env } from '@/platform/config/env';
import { mailerCapability } from '@/platform/mail/mailer';
import { stuckJobs } from '@/platform/jobs/queue';
import { GLOBAL_CHAIN, verifyAuditChain } from '@/platform/audit/audit-service';
import { transaction } from '@/platform/db/unit-of-work';

/**
 * Salud técnica del sistema (docs/ARCHITECTURE.md §12).
 *
 * Cada comprobación responde a una pregunta que alguien tendría que hacerse a
 * las tres de la mañana. Ninguna revela datos ni valores de configuración.
 */

export type CheckStatus = 'ok' | 'degraded' | 'failed';

export interface HealthCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly durationMs: number;
}

export interface HealthReport {
  readonly status: CheckStatus;
  readonly checkedAt: string;
  readonly checks: readonly HealthCheck[];
}

async function timed(name: string, run: () => Promise<Omit<HealthCheck, 'name' | 'durationMs'>>): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const result = await run();
    return { name, ...result, durationMs: Date.now() - started };
  } catch (error) {
    return {
      name,
      status: 'failed',
      detail: error instanceof Error ? error.message.slice(0, 200) : 'error desconocido',
      durationMs: Date.now() - started,
    };
  }
}

export async function healthReport(): Promise<HealthReport> {
  const checks = await Promise.all([
    timed('base_de_datos', async () => {
      await db().$queryRaw`SELECT 1`;
      return { status: 'ok' as const, detail: 'conexión establecida' };
    }),

    timed('migraciones', async () => {
      const rows = await db().$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
        SELECT migration_name, finished_at
          FROM _prisma_migrations
         ORDER BY started_at DESC
         LIMIT 1
      `;
      const last = rows[0];
      if (last === undefined) return { status: 'failed' as const, detail: 'no hay migraciones aplicadas' };
      if (last.finished_at === null) {
        return { status: 'failed' as const, detail: `la migración ${last.migration_name} quedó a medias` };
      }
      return { status: 'ok' as const, detail: `última migración aplicada: ${last.migration_name}` };
    }),

    timed('semilla', async () => {
      const [roles, permissions, entities] = await Promise.all([
        db().role.count(),
        db().permission.count(),
        db().legalEntity.count(),
      ]);
      if (roles === 0 || permissions === 0 || entities === 0) {
        return { status: 'failed' as const, detail: 'faltan datos base: ejecute npm run db:seed' };
      }
      return { status: 'ok' as const, detail: `${roles} roles, ${permissions} permisos, ${entities} entidades jurídicas` };
    }),

    timed('bitacora_encadenada', async () => {
      const result = await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN));
      return result.ok
        ? { status: 'ok' as const, detail: `${result.verified} eventos verificados en la cadena global` }
        : {
            status: 'failed' as const,
            detail: `cadena rota en la posición ${result.brokenAtSequence}: ${result.reason}`,
          };
    }),

    timed('trabajos_programados', async () => {
      const stuck = await stuckJobs();
      const total = stuck.reduce((sum, entry) => sum + entry.count, 0);
      if (total === 0) return { status: 'ok' as const, detail: 'sin trabajos agotados' };
      return {
        status: 'degraded' as const,
        detail: `${total} trabajo(s) agotaron sus reintentos: ${stuck.map((s) => s.jobType).join(', ')}`,
      };
    }),

    timed('bandeja_de_salida', async () => {
      const pending = await db().outboxMessage.count({ where: { status: 'PENDING' } });
      if (pending === 0) return { status: 'ok' as const, detail: 'sin mensajes pendientes' };
      if (pending > 100) return { status: 'degraded' as const, detail: `${pending} mensajes pendientes de entrega` };
      return { status: 'ok' as const, detail: `${pending} mensajes en cola` };
    }),

    timed('correo', () => {
      // Lo declara el propio adaptador. Antes esta comprobación tenía su lista
      // aparte y daba por sano todo lo que no fuera la consola, incluido SMTP,
      // que lanza al primer envío: el panel decía que el correo funcionaba
      // mientras ninguna invitación salía (`D-F1-017`).
      const { capability, detail } = mailerCapability();
      const status =
        capability === 'DELIVERS' ? ('ok' as const) : capability === 'LOGS_ONLY' ? ('degraded' as const) : ('failed' as const);
      return Promise.resolve({ status, detail });
    }),

    timed('firma_de_credenciales', () => {
      const keyring = env().QR_SIGNING_SECRET;
      return Promise.resolve({
        status: 'ok' as const,
        detail: `llavero con ${keyring.all.length} clave(s); activa: ${keyring.active.keyId}`,
      });
    }),
  ]);

  const status: CheckStatus = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'degraded')
      ? 'degraded'
      : 'ok';

  return { status, checkedAt: new Date().toISOString(), checks };
}
