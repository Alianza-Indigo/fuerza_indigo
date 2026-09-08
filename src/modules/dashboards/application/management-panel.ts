import { ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { applicationQueue } from '@/modules/membership';
import { requestList } from '@/modules/support';
import { pendingManualPayments, reconciliationList, refundQueue } from '@/modules/billing';
import { obligationList } from '@/modules/bargaining';

/**
 * El tablero de gestión: lo que hay que decidir, por rol (PRD §5.5, §6.3, §6.4;
 * §24 Fase 9 criterio 6).
 *
 * **Un tablero abre con decisiones, no con métricas.** El criterio lo dice con
 * todas sus letras: «los paneles muestran decisiones accionables, no métricas
 * decorativas». Por eso cada fila que sale de aquí es una cola de trabajo con
 * algo pendiente y un enlace a donde se atiende; una cola vacía no aparece, y si
 * no hay ninguna, la pantalla lo dice en vez de inventar tarjetas.
 *
 * **El tablero es el mismo para todos los roles; lo que cambia es lo que cada
 * quien alcanza.** No hay un panel de la Secretaría y otro de la delegación:
 * cada cola pregunta a su módulo, que evalúa el permiso y acota al alcance de
 * quien mira. A quien no puede tocar una cola, esa cola ni se le cuenta —el
 * caso de uso de origen responde «prohibido» y aquí se omite—. Así el mismo
 * tablero sirve a la delegación territorial con lo suyo y a la Secretaría con lo
 * de toda la organización, sin una lista por rol que se desincronice.
 *
 * Vive en su propio módulo, `dashboards`, porque compone lo de varios y no es de
 * ninguno: lee las colas por sus interfaces públicas (docs/ARCHITECTURE.md §4),
 * nunca por dentro.
 */

export interface TareaDeGestion {
  /** Estable, para que la pantalla no invente claves. */
  readonly id: string;
  /** Qué hay que hacer, en una frase. */
  readonly titulo: string;
  /** Por qué importa. */
  readonly detalle: string;
  /** Cuántos elementos esperan. Siempre mayor que cero: una cola vacía no sale. */
  readonly cantidad: number;
  /** Dónde se atiende. Siempre hay uno: una tarea sin acción sería una métrica. */
  readonly accion: { readonly href: string; readonly etiqueta: string };
}

export interface PanelDeGestion {
  readonly tareas: readonly TareaDeGestion[];
  readonly generadoEl: Date;
}

/**
 * Una fuente del tablero: cuenta lo pendiente de una cola y, si hay algo,
 * construye su tarea. Devuelve `null` cuando la persona no alcanza la cola
 * —el caso de uso de origen respondió «prohibido»— o cuando no hay nada
 * pendiente: en ambos casos la tarea no aparece.
 */
type Fuente = (actor: ActorContext) => Promise<TareaDeGestion | null>;

const afiliacionPorRevisar: Fuente = async (actor) => {
  // La Secretaría o la delegación revisan las solicitudes que ya llegaron y
  // esperan una decisión: enviadas y en revisión. Las que esperan al solicitante
  // —documentación o aclaración— no cuentan como trabajo de quien revisa.
  const enviadas = await applicationQueue(actor, { status: 'SUBMITTED' });
  if (!enviadas.ok) return null;
  const enRevision = await applicationQueue(actor, { status: 'UNDER_REVIEW' });
  const cantidad = enviadas.data.length + (enRevision.ok ? enRevision.data.length : 0);
  if (cantidad === 0) return null;
  return {
    id: 'afiliacion-por-revisar',
    titulo: `${cantidad} solicitud(es) de afiliación por revisar`,
    detalle: 'Personas que pidieron afiliarse y esperan una resolución. Cada día que pasa es una persona esperando.',
    cantidad,
    accion: { href: '/gestion/afiliacion/solicitudes', etiqueta: 'Revisar solicitudes' },
  };
};

const mensajesSinAtender: Fuente = async (actor) => {
  const recibidos = await requestList(actor, { status: 'RECEIVED' });
  if (!recibidos.ok) return null;
  const enTriage = await requestList(actor, { status: 'TRIAGE' });
  const cantidad = recibidos.data.length + (enTriage.ok ? enTriage.data.length : 0);
  if (cantidad === 0) return null;
  return {
    id: 'mensajes-sin-atender',
    titulo: `${cantidad} mensaje(s) sin atender`,
    detalle: 'Solicitudes de apoyo o contacto que aún nadie ha canalizado. Algunas piden ayuda que no espera.',
    cantidad,
    accion: { href: '/gestion/mensajes', etiqueta: 'Atender mensajes' },
  };
};

const pagosPorConfirmar: Fuente = async (actor) => {
  const pendientes = await pendingManualPayments(actor);
  if (!pendientes.ok) return null;
  const cantidad = pendientes.data.length;
  if (cantidad === 0) return null;
  return {
    id: 'pagos-por-confirmar',
    titulo: `${cantidad} pago(s) manual(es) por confirmar`,
    detalle: 'Transferencias o efectivo declarados que esperan que alguien los confirme para surtir efecto.',
    cantidad,
    accion: { href: '/gestion/finanzas/pagos', etiqueta: 'Confirmar pagos' },
  };
};

const RESUELVEN_LA_DEVOLUCION = new Set(['REQUESTED', 'APPROVED']);

const devolucionesPorResolver: Fuente = async (actor) => {
  const cola = await refundQueue(actor);
  if (!cola.ok) return null;
  const cantidad = cola.data.filter((r) => RESUELVEN_LA_DEVOLUCION.has(r.status)).length;
  if (cantidad === 0) return null;
  return {
    id: 'devoluciones-por-resolver',
    titulo: `${cantidad} devolución(es) por resolver`,
    detalle: 'Devoluciones pedidas o aprobadas que esperan que alguien las apruebe o las procese.',
    cantidad,
    accion: { href: '/gestion/finanzas/pagos', etiqueta: 'Resolver devoluciones' },
  };
};

const CORTES_ABIERTOS = new Set(['OPEN', 'WITH_DIFFERENCES']);

const conciliacionPorCerrar: Fuente = async (actor) => {
  const cortes = await reconciliationList(actor);
  if (!cortes.ok) return null;
  const cantidad = cortes.data.filter((c) => CORTES_ABIERTOS.has(c.status)).length;
  if (cantidad === 0) return null;
  return {
    id: 'conciliacion-por-cerrar',
    titulo: `${cantidad} corte(s) de conciliación por cerrar`,
    detalle: 'Periodos con diferencias sin explicar o sin cerrar. Lo que no cuadra hay que nombrarlo, no arrastrarlo.',
    cantidad,
    accion: { href: '/gestion/finanzas/libro', etiqueta: 'Revisar conciliación' },
  };
};

const NO_ENTREGADAS = new Set(['PENDING', 'PREPARED']);
const DIAS_DE_AVISO = 30;

const obligacionesPorVencer: Fuente = async (actor) => {
  const cola = await obligationList(actor);
  if (!cola.ok) return null;
  const limite = new Date(Date.now() + DIAS_DE_AVISO * 24 * 60 * 60 * 1000);
  // Obligaciones ante autoridad sin entregar: las vencidas y las que vencen
  // pronto. Un plazo ante autoridad que se pasa no se recupera.
  const cantidad = cola.data.filter(
    (o) => NO_ENTREGADAS.has(o.status) && (o.overdue || o.dueAt <= limite),
  ).length;
  if (cantidad === 0) return null;
  return {
    id: 'obligaciones-por-vencer',
    titulo: `${cantidad} obligación(es) ante autoridad por vencer`,
    detalle: 'Reportes y avisos ante autoridad con plazo cerca o ya pasado. Un plazo ante autoridad no se recupera.',
    cantidad,
    accion: { href: '/institucional/cumplimiento', etiqueta: 'Revisar obligaciones' },
  };
};

// El orden es el del daño de no atenderlas: primero las personas que esperan una
// decisión, después los plazos ante autoridad, después el dinero que espera
// confirmarse.
const FUENTES: readonly Fuente[] = [
  afiliacionPorRevisar,
  mensajesSinAtender,
  obligacionesPorVencer,
  pagosPorConfirmar,
  devolucionesPorResolver,
  conciliacionPorCerrar,
];

/**
 * El tablero de gestión de quien mira: las colas con trabajo pendiente que esa
 * persona puede atender, en orden de urgencia. Nunca falla por permiso: una cola
 * que no alcanza sencillamente no aparece.
 */
export async function panelDeGestion(actor: ActorContext): Promise<UseCaseResult<PanelDeGestion>> {
  const resultados = await Promise.all(FUENTES.map((fuente) => fuente(actor)));
  const tareas = resultados.filter((t): t is TareaDeGestion => t !== null);
  return ok({ tareas, generadoEl: new Date() });
}
