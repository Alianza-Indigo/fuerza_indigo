import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, territorialReach } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { compartimentoDeExpediente } from '@/platform/authz/compartments';
import type { CasePriority, CaseStatus } from '@prisma-client/enums';
import { PANELES, panelPorCodigo, type PanelDeCoordinacion } from '../domain/panels';
import { filtroTerritorial } from './assignment';

/**
 * Los tres paneles de coordinación (PRD §24 Fase 6).
 *
 * **Un panel es la vista de quien reparte, no la de quien atiende.** La lista
 * de expedientes propios ya existe y solo trae los asignados; esto trae los del
 * área, incluidos los que **no lleva nadie**, que son justamente los que no
 * aparecerían en ninguna otra pantalla. Por eso lo abre la facultad de asignar
 * y no la de leer: quien reparte necesita ver lo que hay que repartir, y quien
 * no reparte no tiene por qué ver el área entera.
 *
 * **Sigue siendo acceso acotado.** El panel solo alcanza su entidad, su
 * compartimento y el territorio de quien pregunta. Coordinar no es una llave
 * maestra: una delegación de Jalisco coordina Jalisco.
 *
 * **Lo que enseña son hechos, no un resumen tranquilizador.** Cuántos no lleva
 * nadie, cuántos llevan más de lo debido sin primera respuesta, cuántos tienen
 * el plazo encima y cuántos arrastran un riesgo sin recoger. Un panel que solo
 * contara expedientes abiertos serviría para no enterarse.
 */

export interface FilaDePanel {
  readonly id: string;
  readonly publicId: string;
  readonly folio: string;
  readonly materia: string;
  readonly prioridad: CasePriority;
  readonly estado: CaseStatus;
  readonly abiertoEl: Date;
  readonly plazo: Date | null;
  readonly responsable: string | null;
  readonly sinValorar: boolean;
  readonly fueraDePlazo: boolean;
  readonly riesgoSinRecoger: boolean;
  readonly tareasPendientes: number;
}

export interface PanelData {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly totales: {
    readonly abiertos: number;
    readonly sinResponsable: number;
    readonly sinValorar: number;
    readonly fueraDePlazo: number;
    readonly conRiesgoSinRecoger: number;
  };
  readonly expedientes: readonly FilaDePanel[];
}

/** Los paneles que este actor puede abrir. Vacío no es prohibido: es ninguno. */
export async function panelsForActor(actor: ActorContext): Promise<UseCaseResult<readonly PanelDeCoordinacion[]>> {
  const entidades = await db().legalEntity.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });
  const porCodigo = new Map(entidades.map((entidad) => [entidad.code, entidad.id]));

  const alcanzables = PANELES.filter((panel) => {
    const entidadId = porCodigo.get(panel.entidad);
    if (entidadId === undefined) return false;
    return can(
      { ...actor, reason: 'consulta de los paneles de coordinación disponibles' },
      'cases.case.assign',
      {
        kind: 'Case',
        legalEntityId: entidadId,
        compartment: compartimentoDeExpediente(panel.dominio),
      },
    ).allowed;
  });

  return ok(alcanzables);
}

const ABIERTOS = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_THIRD_PARTY', 'REFERRED'] as const;

/** Cuánto puede esperar un expediente su primera respuesta, según su prioridad. */
const HORAS_PARA_LA_PRIMERA_RESPUESTA: Record<CasePriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  NORMAL: 72,
  LOW: 168,
};

export async function casePanel(actor: ActorContext, codigo: string): Promise<UseCaseResult<PanelData>> {
  const panel = panelPorCodigo(codigo);
  if (panel === null) return fail(errors.notFound('Ese panel no existe.'));

  const entidad = await db().legalEntity.findUnique({
    where: { code: panel.entidad },
    select: { id: true },
  });
  if (entidad === null) return fail(errors.notFound('La entidad de ese panel no existe.'));

  const decision = can(
    { ...actor, reason: `consulta del panel de ${panel.nombre}` },
    'cases.case.assign',
    {
      kind: 'Case',
      legalEntityId: entidad.id,
      compartment: compartimentoDeExpediente(panel.dominio),
    },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const territorio = filtroTerritorial(territorialReach(actor, 'cases.case.assign'));
  const ahora = new Date();

  const filas = await db().case.findMany({
    where: {
      legalEntityId: entidad.id,
      domain: panel.dominio,
      caseType: { in: [...panel.materias] },
      status: { in: [...ABIERTOS] },
      ...(territorio ?? {}),
    },
    orderBy: [
      { priority: 'desc' },
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { openedAt: 'asc' },
    ],
    take: 300,
    select: {
      id: true,
      publicId: true,
      folio: true,
      caseType: true,
      priority: true,
      status: true,
      openedAt: true,
      dueAt: true,
      firstResponseAt: true,
      assignments: {
        where: { unassignedAt: null, assignmentRole: 'OWNER' },
        select: {
          user: {
            select: {
              person: {
                select: {
                  givenName: true,
                  middleName: true,
                  familyName: true,
                  secondFamilyName: true,
                  preferredName: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } } },
          emergencyFlags: { where: { acknowledgedAt: null, closedAt: null } },
        },
      },
    },
  });

  const expedientes: FilaDePanel[] = filas.map((fila) => {
    const responsable = fila.assignments[0];
    const limite = new Date(
      fila.openedAt.getTime() + HORAS_PARA_LA_PRIMERA_RESPUESTA[fila.priority] * 60 * 60 * 1000,
    );
    return {
      id: fila.id,
      publicId: fila.publicId,
      folio: fila.folio,
      materia: fila.caseType,
      prioridad: fila.priority,
      estado: fila.status,
      abiertoEl: fila.openedAt,
      plazo: fila.dueAt,
      responsable: responsable === undefined ? null : nombreCompleto(responsable.user.person),
      // Sin valorar es «pasó su plazo de primera respuesta», no «nunca se
      // valoró»: un expediente abierto hace diez minutos no está desatendido.
      sinValorar: fila.firstResponseAt === null && limite < ahora,
      fueraDePlazo: fila.dueAt !== null && fila.dueAt < ahora,
      riesgoSinRecoger: fila._count.emergencyFlags > 0,
      tareasPendientes: fila._count.tasks,
    };
  });

  return ok({
    codigo: panel.codigo,
    nombre: panel.nombre,
    descripcion: panel.descripcion,
    totales: {
      abiertos: expedientes.length,
      sinResponsable: expedientes.filter((fila) => fila.responsable === null).length,
      sinValorar: expedientes.filter((fila) => fila.sinValorar).length,
      fueraDePlazo: expedientes.filter((fila) => fila.fueraDePlazo).length,
      conRiesgoSinRecoger: expedientes.filter((fila) => fila.riesgoSinRecoger).length,
    },
    expedientes,
  });
}
