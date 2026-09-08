import { db } from '@/platform/db/client';
import { ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { formatDate } from '@/platform/i18n/format';

/**
 * Alertas de vencimientos (PRD §24 Fase 9).
 *
 * **Avisa antes de que sea tarde, y una sola vez.** Un vencimiento —una
 * membresía, un nombramiento— se avisa cuando se acerca, no cuando ya pasó (eso
 * lo hace el trabajo que da de baja). El aviso entra al centro de notificaciones
 * de la persona, con su enlace a donde se renueva.
 *
 * **No se repite.** Correr el trabajo cada día no debe llenar el buzón de la
 * misma persona con el mismo aviso. El aviso lleva `relatedKind` y `relatedId`
 * —qué vence y cuál—, y antes de crear uno se comprueba que no exista ya: la
 * segunda pasada no crea nada. No hizo falta una tabla que recuerde qué se avisó;
 * el propio aviso es la marca.
 *
 * **Respeta la preferencia.** El aviso entra al centro con su categoría
 * —`MEMBERSHIP`, `APPOINTMENT`—, y el centro ya filtra por la preferencia de la
 * persona (bloque B): quien silenció esa categoría no lo ve. Lo obligatorio de
 * gobierno no se puede silenciar, pero un vencimiento propio no es de esa clase:
 * es un aviso que la persona puede decidir no recibir.
 */

/** Cuánta antelación merece un vencimiento para empezar a avisarlo. */
const DIAS_DE_AVISO = 30;

const RELACION_MEMBRESIA = 'MEMBERSHIP_EXPIRY';
const RELACION_NOMBRAMIENTO = 'OFFICE_TERM_EXPIRY';

/**
 * Crea un aviso si no existe ya uno para el mismo vencimiento. Devuelve 1 si lo
 * creó, 0 si ya estaba: así el trabajo es idempotente sin llevar registro aparte.
 */
async function avisarUnaVez(input: {
  personId: string;
  relatedKind: string;
  relatedId: string;
  category: 'MEMBERSHIP' | 'APPOINTMENT';
  title: string;
  body: string;
  linkPath: string;
}): Promise<number> {
  const yaExiste = await db().notification.findFirst({
    where: { personId: input.personId, relatedKind: input.relatedKind, relatedId: input.relatedId },
    select: { id: true },
  });
  if (yaExiste !== null) return 0;

  await db().notification.create({
    data: {
      personId: input.personId,
      category: input.category,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath,
      channels: ['IN_APP'],
      relatedKind: input.relatedKind,
      relatedId: input.relatedId,
    },
  });
  return 1;
}

export async function dispatchExpiryAlerts(
  _actor: ActorContext,
): Promise<UseCaseResult<{ membershipAlerts: number; officeTermAlerts: number }>> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + DIAS_DE_AVISO * 24 * 60 * 60 * 1000);

  const membresias = await db().membership.findMany({
    where: { status: 'ACTIVE', expiresAt: { not: null, gte: ahora, lte: limite } },
    select: { id: true, personId: true, expiresAt: true },
  });

  let membershipAlerts = 0;
  for (const m of membresias) {
    if (m.expiresAt === null) continue;
    membershipAlerts += await avisarUnaVez({
      personId: m.personId,
      relatedKind: RELACION_MEMBRESIA,
      relatedId: m.id,
      category: 'MEMBERSHIP',
      title: 'Tu membresía está por vencer',
      body: `Tu membresía vence el ${formatDate(m.expiresAt)}. Renuévala para no perder tus derechos como agremiado.`,
      linkPath: '/mi/afiliacion',
    });
  }

  // El nombramiento vence por fecha del calendario: se compara con el día de hoy.
  const hoy = new Date(`${ahora.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const limiteDia = new Date(`${limite.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const nombramientos = await db().officeTerm.findMany({
    where: { endedEarlyOn: null, endsOn: { gte: hoy, lte: limiteDia } },
    select: { id: true, personId: true, endsOn: true },
  });

  let officeTermAlerts = 0;
  for (const t of nombramientos) {
    officeTermAlerts += await avisarUnaVez({
      personId: t.personId,
      relatedKind: RELACION_NOMBRAMIENTO,
      relatedId: t.id,
      category: 'APPOINTMENT',
      title: 'Tu nombramiento está por concluir',
      body: `Tu nombramiento concluye el ${formatDate(t.endsOn)}. Prepara la renovación o la entrega del cargo.`,
      linkPath: '/institucional/nombramientos',
    });
  }

  return ok({ membershipAlerts, officeTermAlerts });
}
