import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, territorialReach } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { compartimentoDe } from '../domain/access';
import { aplicarUmbral, UMBRAL_DE_PRIVACIDAD, type Celda } from '../domain/indicators';
import { filtroTerritorial } from './assignment';
import type { CaseDomain, CaseOutcome, CasePriority, SupportRequestType } from '@prisma-client/enums';

/**
 * Indicadores anonimizados de casos (PRD §24 Fase 6).
 *
 * **Agregado no es anónimo.** Un conteo por materia, territorio y resultado con
 * una sola fila detrás dice qué le pasó a esa persona, dónde y cómo acabó, y
 * quien conoce el barrio no necesita más. Por eso cada celda pasa por el umbral
 * y las que quedan por debajo **se suprimen enteras**: una cifra redondeada
 * sigue diciendo que hubo algo.
 *
 * **De aquí no sale ningún identificador.** Ni folios, ni identificadores
 * públicos, ni nombres: solo cuentas y medianas. Es la diferencia entre un
 * indicador y una lista con menos columnas.
 *
 * **Y sigue acotado.** Los indicadores no son el sistema entero visto desde
 * arriba: alcanzan el compartimento y el territorio de quien pregunta, igual
 * que todo lo demás. Un panel de cifras es un sitio cómodo para saltarse una
 * frontera sin que se note.
 */

export interface Indicadores {
  readonly desde: Date;
  readonly hasta: Date;
  readonly umbral: number;
  /** Expedientes abiertos en el periodo, por materia. */
  readonly porMateria: readonly { readonly materia: SupportRequestType; readonly celda: Celda }[];
  /** Cerrados en el periodo, por resultado. */
  readonly porResultado: readonly { readonly resultado: CaseOutcome; readonly celda: Celda }[];
  /** Abiertos en el periodo, por prioridad. */
  readonly porPrioridad: readonly { readonly prioridad: CasePriority; readonly celda: Celda }[];
  /** Mediana de horas hasta la primera respuesta, cuando hay suficientes. */
  readonly medianaDePrimeraRespuestaEnHoras: number | null;
  /** Marcas de riesgo levantadas en el periodo. */
  readonly riesgosLevantados: Celda;
  /** Cuántas celdas se suprimieron por el umbral. Se dice, no se esconde. */
  readonly celdasSuprimidas: number;
}

/** Mediana de una lista de números. Con lista vacía, nada. */
function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((una, otra) => una - otra);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1]! + orden[medio]!) / 2 : orden[medio]!;
}

export async function caseIndicators(
  actor: ActorContext,
  rango: { desde: string; hasta: string },
): Promise<UseCaseResult<Indicadores>> {
  const desde = new Date(`${rango.desde}T00:00:00.000Z`);
  const hasta = new Date(`${rango.hasta}T23:59:59.999Z`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return fail(errors.validation({ rango: ['Esas fechas no se entienden.'] }));
  }
  if (desde > hasta) {
    return fail(errors.validation({ rango: ['La fecha de inicio va después de la de fin.'] }));
  }

  const dominios: CaseDomain[] = [];
  if (actor.compartments.has('UNION')) dominios.push('UNION_DEFENSE');
  if (actor.compartments.has('SOCIAL')) dominios.push('SOCIAL_ATTENTION');
  if (dominios.length === 0) {
    return fail(errors.forbidden('sin compartimento no hay indicadores de casos que consultar'));
  }

  const decision = can(actor, 'cases.indicator.read', {
    kind: 'Case',
    compartment: compartimentoDe(dominios[0]!),
    isBulk: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const territorio = filtroTerritorial(territorialReach(actor, 'cases.indicator.read'));
  const alcance = { domain: { in: dominios }, ...(territorio ?? {}) };

  const [porMateria, porPrioridad, porResultado, primerasRespuestas, riesgos] = await Promise.all([
    db().case.groupBy({
      by: ['caseType'],
      where: { ...alcance, openedAt: { gte: desde, lte: hasta } },
      _count: { _all: true },
    }),
    db().case.groupBy({
      by: ['priority'],
      where: { ...alcance, openedAt: { gte: desde, lte: hasta } },
      _count: { _all: true },
    }),
    db().case.groupBy({
      by: ['closeOutcome'],
      where: { ...alcance, closedAt: { gte: desde, lte: hasta }, closeOutcome: { not: null } },
      _count: { _all: true },
    }),
    db().case.findMany({
      where: { ...alcance, openedAt: { gte: desde, lte: hasta }, firstResponseAt: { not: null } },
      select: { openedAt: true, firstResponseAt: true },
    }),
    db().emergencyFlag.count({
      where: { raisedAt: { gte: desde, lte: hasta }, case: alcance },
    }),
  ]);

  let suprimidas = 0;
  const conUmbral = <T>(filas: readonly { clave: T; total: number }[]): { clave: T; celda: Celda }[] =>
    filas.map((fila) => {
      const celda = aplicarUmbral(fila.total);
      if (!celda.publicable) suprimidas += 1;
      return { clave: fila.clave, celda };
    });

  const materias = conUmbral(
    porMateria.map((fila) => ({ clave: fila.caseType, total: fila._count._all })),
  );
  const prioridades = conUmbral(
    porPrioridad.map((fila) => ({ clave: fila.priority, total: fila._count._all })),
  );
  const resultados = conUmbral(
    porResultado.flatMap((fila) =>
      fila.closeOutcome === null ? [] : [{ clave: fila.closeOutcome, total: fila._count._all }],
    ),
  );

  const celdaDeRiesgos = aplicarUmbral(riesgos);
  if (!celdaDeRiesgos.publicable) suprimidas += 1;

  // La mediana también pasa por el umbral: con dos expedientes detrás, la
  // mediana **es** uno de los dos, y publicarla es publicar ese caso.
  const horas = primerasRespuestas.map(
    (fila) => (fila.firstResponseAt!.getTime() - fila.openedAt.getTime()) / (60 * 60 * 1000),
  );
  const medianaDePrimeraRespuestaEnHoras = aplicarUmbral(horas.length).publicable
    ? (mediana(horas) ?? null)
    : null;

  return ok({
    desde,
    hasta,
    umbral: UMBRAL_DE_PRIVACIDAD,
    porMateria: materias.map((fila) => ({ materia: fila.clave, celda: fila.celda })),
    porResultado: resultados.map((fila) => ({ resultado: fila.clave, celda: fila.celda })),
    porPrioridad: prioridades.map((fila) => ({ prioridad: fila.clave, celda: fila.celda })),
    medianaDePrimeraRespuestaEnHoras,
    riesgosLevantados: celdaDeRiesgos,
    celdasSuprimidas: suprimidas,
  });
}
