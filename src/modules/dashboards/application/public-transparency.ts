import { db } from '@/platform/db/client';
import { ok, type UseCaseResult } from '@/platform/kernel/result';
import { aplicarUmbral, UMBRAL_DE_PRIVACIDAD, type Celda } from '@/platform/privacy/threshold';

/**
 * Transparencia pública (PRD §6.1, §6.4, §24 Fase 9).
 *
 * **Cifras de la organización, no de las personas.** La transparencia publica lo
 * que la organización rinde a quien quiera verlo: cuántas personas la integran,
 * cuánta vida institucional tiene, cuánta formación imparte. Son hechos
 * institucionales —un número de agremiados, de asambleas, de eventos— que se
 * publican en crudo. Pero las cuentas de **participación** de personas pasan por
 * el umbral de privacidad: si en la organización entera solo dos personas
 * asistieron a formación, publicar el dos empieza a señalar a quiénes, así que
 * por debajo del umbral se suprime (`@/platform/privacy/threshold`).
 *
 * **No sale ningún identificador.** Ni nombres, ni folios, ni identificadores
 * públicos: solo cuentas. Es la diferencia entre transparencia y una lista.
 *
 * Ruta pública, sin sesión: cualquiera puede verla, y por eso no recibe ni
 * consulta ningún dato de quien mira.
 */

export interface TransparenciaPublica {
  readonly generadoEl: Date;
  /** Personas agremiadas con membresía activa. Hecho institucional. */
  readonly agremiadosActivos: number;
  /** Personas con afiliación honoraria activa. Hecho institucional. */
  readonly afiliadosHonorarios: number;
  /** Unidades territoriales vivas. Hecho institucional. */
  readonly unidadesTerritoriales: number;
  /** Asambleas con quórum declarado. Hecho institucional. */
  readonly asambleasCelebradas: number;
  /** Eventos y cursos ya concluidos. Hecho institucional. */
  readonly eventosRealizados: number;
  /** Personas que asistieron a formación. Cuenta de personas: pasa por el umbral. */
  readonly personasFormadas: Celda;
  /** Constancias de participación vigentes. Cuenta de personas: pasa por el umbral. */
  readonly constanciasVigentes: Celda;
  readonly umbral: number;
}

export async function transparenciaPublica(): Promise<UseCaseResult<TransparenciaPublica>> {
  const ahora = new Date();

  const [
    agremiadosActivos,
    afiliadosHonorarios,
    unidadesTerritoriales,
    asambleasCelebradas,
    eventosRealizados,
    personasFormadas,
    constanciasVigentes,
  ] = await Promise.all([
    db().membership.count({ where: { status: 'ACTIVE', category: 'UNION_MEMBER' } }),
    db().membership.count({ where: { status: 'ACTIVE', category: 'HONORARY_AFFILIATE' } }),
    db().territorialUnit.count({ where: { status: 'ACTIVE', dissolvedOn: null } }),
    db().assembly.count({ where: { quorumDeclaredAt: { not: null } } }),
    db().event.count({ where: { status: { not: 'CANCELLED' }, endsAt: { lt: ahora } } }),
    db().eventRegistration.count({ where: { attendanceAt: { not: null } } }),
    db().eventRegistration.count({ where: { constancyDocumentId: { not: null }, constancyRevokedAt: null } }),
  ]);

  return ok({
    generadoEl: ahora,
    agremiadosActivos,
    afiliadosHonorarios,
    unidadesTerritoriales,
    asambleasCelebradas,
    eventosRealizados,
    personasFormadas: aplicarUmbral(personasFormadas),
    constanciasVigentes: aplicarUmbral(constanciasVigentes),
    umbral: UMBRAL_DE_PRIVACIDAD,
  });
}
