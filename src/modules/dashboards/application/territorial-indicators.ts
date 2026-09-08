import { z } from 'zod';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { aplicarUmbral, UMBRAL_DE_PRIVACIDAD, type Celda } from '@/platform/privacy/threshold';

/**
 * Indicadores territoriales de formación (PRD §6.3, §24 Fase 9 criterio 3).
 *
 * **Agregado no es anónimo, tampoco en un territorio.** Cuántas personas
 * asistieron a los eventos de una delegación pequeña puede señalar a una: si en
 * una sección de veinte agremiados solo tres fueron a un taller, la cifra dice
 * quiénes con más precisión que una lista. Por eso las cuentas de personas
 * —asistencias, constancias— pasan por el umbral de privacidad y, por debajo de
 * él, **se suprimen enteras** (`@/platform/privacy/threshold`). El número de
 * eventos, en cambio, no señala a nadie: un evento es un acto público, no una
 * persona, y se publica en crudo.
 *
 * **Y sigue acotado.** Los indicadores territoriales alcanzan la subárbol de la
 * unidad que se consulta, no el sistema entero: un panel de cifras es un sitio
 * cómodo para saltarse una frontera sin que se note.
 */

export interface IndicadoresTerritoriales {
  readonly unidad: { readonly publicId: string; readonly name: string };
  readonly desde: Date;
  readonly hasta: Date;
  readonly umbral: number;
  /** Eventos realizados en el periodo, en la unidad y sus descendientes. */
  readonly eventosRealizados: number;
  /** Personas que asistieron. Cuenta de personas: pasa por el umbral. */
  readonly asistentes: Celda;
  /** Constancias vigentes emitidas. Cuenta de personas: pasa por el umbral. */
  readonly constanciasEmitidas: Celda;
  /** Cuántas celdas se suprimieron por el umbral. Se dice, no se esconde. */
  readonly celdasSuprimidas: number;
}

export const territorialIndicatorsSchema = z.object({
  unitPublicId: z.string().trim().min(1).max(30),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type TerritorialIndicatorsInput = z.infer<typeof territorialIndicatorsSchema>;

export async function territorialIndicators(
  actor: ActorContext,
  input: TerritorialIndicatorsInput,
): Promise<UseCaseResult<IndicadoresTerritoriales>> {
  const parsed = territorialIndicatorsSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ form: ['Parámetros de indicadores inválidos.'] }));
  const data = parsed.data;

  const decision = can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const unidad = await db().territorialUnit.findUnique({
    where: { publicId: data.unitPublicId },
    select: { publicId: true, name: true, path: true },
  });
  if (unidad === null) return fail(errors.notFound('La unidad territorial no existe.'));

  const desde = new Date(`${data.desde}T00:00:00.000Z`);
  const hasta = new Date(`${data.hasta}T23:59:59.999Z`);
  if (hasta < desde) return fail(errors.validation({ hasta: ['El fin no puede ser anterior al inicio.'] }));

  // La subárbol: la unidad y sus descendientes, por prefijo de ruta
  // materializada (ADR-0027).
  const enSubarbol = {
    event: {
      territorialUnit: { path: { startsWith: unidad.path } },
      startsAt: { gte: desde, lte: hasta },
    },
  };

  const [eventosRealizados, asistentes, constancias] = await Promise.all([
    db().event.count({
      where: { territorialUnit: { path: { startsWith: unidad.path } }, startsAt: { gte: desde, lte: hasta } },
    }),
    db().eventRegistration.count({ where: { ...enSubarbol, attendanceAt: { not: null } } }),
    db().eventRegistration.count({
      where: { ...enSubarbol, constancyDocumentId: { not: null }, constancyRevokedAt: null },
    }),
  ]);

  const celdaAsistentes = aplicarUmbral(asistentes);
  const celdaConstancias = aplicarUmbral(constancias);
  const celdasSuprimidas = [celdaAsistentes, celdaConstancias].filter((c) => !c.publicable).length;

  return ok({
    unidad: { publicId: unidad.publicId, name: unidad.name },
    desde,
    hasta,
    umbral: UMBRAL_DE_PRIVACIDAD,
    eventosRealizados,
    asistentes: celdaAsistentes,
    constanciasEmitidas: celdaConstancias,
    celdasSuprimidas,
  });
}
