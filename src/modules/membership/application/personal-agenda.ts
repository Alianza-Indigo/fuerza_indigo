import { ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { ownSubscriptions } from '@/modules/billing';
import { personConsents } from '@/platform/consent';
import { myApplications } from './application-queries';
import { personMemberships } from './memberships';
import { personCredentials } from './credentials';
import { myDirectoryState } from './directory';

/**
 * Lo que la persona tiene pendiente, ordenado por lo que de verdad urge
 * (PRD §5.5, F4-UI-001).
 *
 * **Un panel abre con decisiones, no con métricas.** El PRD §5.5 lo dice con
 * todas sus letras —«cada panel abrirá con prioridades reales: pagos
 * pendientes, documentos faltantes, citas próximas, votaciones abiertas, casos
 * que requieren atención o renovaciones»— y el §24 lo repite como criterio:
 * «los paneles muestran decisiones accionables, no métricas decorativas».
 *
 * Por eso aquí **no** hay contadores. Cada fila que sale de esta función es
 * algo que alguien puede hacer hoy, con el enlace a donde se hace. Si no hay
 * nada que hacer, la lista viene vacía y la pantalla lo dice, en vez de
 * inventar tarjetas para llenar el espacio.
 *
 * **El orden lo decide el daño de no atenderlo**, no la fecha ni el módulo:
 * primero lo que tiene plazo y se pierde —una aclaración—, después lo que
 * bloquea un trámite en curso, después lo que caduca solo, y al final lo que
 * conviene revisar. Una lista ordenada por fecha pondría un consentimiento
 * opcional por encima de un plazo que vence mañana.
 *
 * Vive en `membership` porque es la calidad de la persona la que ordena su
 * relación con la organización, y el grafo de módulos ya permite que
 * `membership` lea de `billing` (docs/ARCHITECTURE.md §4). Al revés no: por eso
 * un cobro confirmado avisa por la bandeja de salida y no llama a nadie.
 */

/** Cuánta antelación merece un vencimiento para empezar a avisarlo. */
const DIAS_DE_AVISO = 30;

export type UrgenciaDePendiente = 'PLAZO' | 'BLOQUEA' | 'CADUCA' | 'REVISAR';

export interface Pendiente {
  /** Estable, para que la pantalla no tenga que inventar claves. */
  readonly id: string;
  readonly urgencia: UrgenciaDePendiente;
  /** Qué pasa, en una frase que se entiende sin contexto. */
  readonly titulo: string;
  /** Por qué importa y qué ocurre si no se atiende. */
  readonly detalle: string;
  /** Dónde se hace. Siempre hay uno: un pendiente sin acción es una métrica. */
  readonly accion: { readonly href: string; readonly etiqueta: string };
  /** Fecha límite, cuando la hay. */
  readonly venceEl: Date | null;
}

const PESO: Record<UrgenciaDePendiente, number> = { PLAZO: 0, BLOQUEA: 1, CADUCA: 2, REVISAR: 3 };

/** Días que faltan para una fecha, redondeando hacia arriba. */
function diasHasta(fecha: Date, ahora: Date): number {
  return Math.ceil((fecha.getTime() - ahora.getTime()) / 86_400_000);
}

function enPalabras(dias: number): string {
  if (dias < 0) return `venció hace ${Math.abs(dias)} día(s)`;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vencen ${dias} días`;
}

export interface AgendaPersonal {
  readonly pendientes: readonly Pendiente[];
  /** Membresías vivas, para encabezar el panel con lo que la persona es. */
  readonly calidades: readonly {
    readonly memberNumber: string;
    readonly categoria: string;
    readonly estado: string;
    readonly expiresAt: Date | null;
  }[];
  readonly credencialesVigentes: number;
  readonly apareceEnDirectorio: boolean;
}

/**
 * Reúne la agenda de la persona.
 *
 * Cada consulta va por el caso de uso del módulo que le corresponde, no por una
 * consulta cruzada a sus tablas (regla 3 de `ARCHITECTURE.md` §4.2). Eso
 * significa que **cada una vuelve a decidir sus permisos**: si a la persona le
 * falta una facultad, esa parte del panel sencillamente no aparece, sin que el
 * panel entero se caiga ni tenga que saber por qué.
 */
export async function personalAgenda(
  actor: ActorContext,
  ahora: Date = new Date(),
): Promise<UseCaseResult<AgendaPersonal>> {
  const personId = actor.personId;
  if (personId === null) {
    return ok({ pendientes: [], calidades: [], credencialesVigentes: 0, apareceEnDirectorio: false });
  }

  const [solicitudes, membresias, credenciales, suscripciones, consentimientos, directorio] =
    await Promise.all([
      myApplications(actor),
      personMemberships(actor, personId),
      personCredentials(actor, personId),
      ownSubscriptions(actor),
      personConsents(actor, { personId }),
      myDirectoryState(actor, personId),
    ]);

  const pendientes: Pendiente[] = [];

  // 1. Una aclaración con plazo. Es lo único que se pierde por dejarlo pasar.
  if (solicitudes.ok) {
    for (const solicitud of solicitudes.data) {
      if (solicitud.status === 'CLARIFICATION_REQUIRED' && solicitud.clarificationDueAt !== null) {
        const dias = diasHasta(solicitud.clarificationDueAt, ahora);
        pendientes.push({
          id: `aclaracion:${solicitud.id}`,
          urgencia: 'PLAZO',
          titulo: `Te pedimos una aclaración sobre tu solicitud ${solicitud.folio}`,
          detalle:
            dias < 0
              ? 'El plazo pasó. Sigue abierta: contestar es lo que la desbloquea, y nadie la ha rechazado por el retraso.'
              : `Contesta antes de que se agote el plazo: ${enPalabras(dias)}.`,
          accion: { href: `/mi/afiliacion/${solicitud.id}`, etiqueta: 'Contestar' },
          venceEl: solicitud.clarificationDueAt,
        });
      }

      // 2. Documentación que falta o que se devolvió.
      if (solicitud.status === 'DOCUMENTATION_PENDING' || solicitud.documents.rejected > 0) {
        pendientes.push({
          id: `documentos:${solicitud.id}`,
          urgencia: 'BLOQUEA',
          titulo: `Falta documentación en tu solicitud ${solicitud.folio}`,
          detalle:
            solicitud.documents.rejected > 0
              ? `${solicitud.documents.rejected} documento(s) hay que volver a subir para que la revisión pueda seguir.`
              : 'La revisión no puede seguir hasta que subas lo que falta.',
          accion: { href: `/mi/afiliacion/${solicitud.id}`, etiqueta: 'Ver qué falta' },
          venceEl: null,
        });
      }

      // 3. Aprobada y esperando el pago: la membresía no nace hasta que se cubre.
      if (solicitud.status === 'PENDING_PAYMENT') {
        pendientes.push({
          id: `pago:${solicitud.id}`,
          urgencia: 'BLOQUEA',
          titulo: `Tu solicitud ${solicitud.folio} está resuelta y espera el pago`,
          detalle: 'La membresía se activa cuando el cobro queda confirmado. Nada más queda pendiente.',
          accion: { href: `/mi/afiliacion/${solicitud.id}`, etiqueta: 'Pagar la cuota' },
          venceEl: null,
        });
      }

      // 4. Un borrador que nadie envió no es una solicitud todavía.
      if (solicitud.status === 'DRAFT') {
        pendientes.push({
          id: `borrador:${solicitud.id}`,
          urgencia: 'REVISAR',
          titulo: `Dejaste una solicitud a medias (${solicitud.folio})`,
          detalle: 'Nada llega a Fuerza Índigo hasta que la envías. Puedes seguir donde la dejaste.',
          accion: { href: `/mi/afiliacion/${solicitud.id}`, etiqueta: 'Continuar' },
          venceEl: null,
        });
      }
    }
  }

  // 5. Cuotas en mora. La suscripción lo dice antes que ningún recordatorio.
  if (suscripciones.ok) {
    for (const suscripcion of suscripciones.data) {
      if (suscripcion.status === 'PAST_DUE' || suscripcion.status === 'UNPAID') {
        pendientes.push({
          id: `cuota:${suscripcion.id}`,
          urgencia: 'BLOQUEA',
          titulo: `Tu cuota de ${suscripcion.concept} está atrasada`,
          detalle:
            suscripcion.gracePeriodEndsAt === null
              ? 'Ponerte al corriente evita que la membresía se suspenda.'
              : `Tienes hasta el periodo de gracia para regularizarla: ${enPalabras(diasHasta(suscripcion.gracePeriodEndsAt, ahora))}.`,
          accion: { href: '/mi/pagos', etiqueta: 'Ver mis pagos' },
          venceEl: suscripcion.gracePeriodEndsAt,
        });
      }
    }
  }

  // 6. Una membresía suspendida es de las primeras cosas que la persona tiene
  //    que saber. No la resuelve un clic —la levanta ponerse al corriente o el
  //    fin del procedimiento—, pero enterarse por una etiqueta gris en una
  //    tarjeta de abajo no es enterarse. El PRD §5.5 llama a esto «casos que
  //    requieren atención», y esto lo es.
  if (membresias.ok) {
    for (const membresia of membresias.data) {
      if (membresia.status !== 'SUSPENDED' && membresia.status !== 'DISCIPLINARY_PROCESS') continue;

      const ultimo = membresia.events
        .filter((evento) => evento.toStatus === membresia.status)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];

      pendientes.push({
        id: `suspension:${membresia.memberNumber}`,
        urgencia: 'BLOQUEA',
        titulo:
          membresia.status === 'SUSPENDED'
            ? `Tu membresía ${membresia.memberNumber} está suspendida`
            : `Tu membresía ${membresia.memberNumber} está en un procedimiento disciplinario`,
        detalle:
          ultimo === undefined
            ? 'Sigues siendo miembro: una suspensión es una pausa, no una baja. Revisa tu afiliación para saber qué la levanta.'
            : `Sigues siendo miembro: una suspensión es una pausa, no una baja. Motivo registrado: ${ultimo.reason}`,
        accion: { href: '/mi/afiliacion', etiqueta: 'Ver mi afiliación' },
        venceEl: null,
      });
    }
  }

  // 7. Membresía por vencer. Renovar la devuelve; no renovar no da de baja a
  //    nadie, pero la deja fuera de vigor (ADR-0083).
  const calidades: AgendaPersonal['calidades'] = membresias.ok
    ? membresias.data
        .filter((una) => ['ACTIVE', 'SUSPENDED', 'DISCIPLINARY_PROCESS'].includes(una.status))
        .map((una) => ({
          memberNumber: una.memberNumber,
          categoria: una.category,
          estado: una.status,
          expiresAt: una.expiresAt,
        }))
    : [];

  for (const calidad of calidades) {
    if (calidad.expiresAt === null) continue;
    const dias = diasHasta(calidad.expiresAt, ahora);
    if (dias > DIAS_DE_AVISO) continue;
    pendientes.push({
      id: `vigencia:${calidad.memberNumber}`,
      urgencia: 'CADUCA',
      titulo: `Tu membresía ${calidad.memberNumber} ${dias < 0 ? 'venció' : 'está por vencer'}`,
      detalle:
        dias < 0
          ? 'Renovarla la devuelve. Nadie te dio de baja: se acabó la vigencia.'
          : `Renuévala para no quedarte sin vigencia: ${enPalabras(dias)}.`,
      accion: { href: '/mi/afiliacion', etiqueta: 'Ver mi afiliación' },
      venceEl: calidad.expiresAt,
    });
  }

  // 8. Credencial por vencer o que dejó de valer.
  const vigentes = credenciales.ok ? credenciales.data.filter((una) => una.status === 'ACTIVE') : [];
  for (const credencial of vigentes) {
    if (credencial.expiresAt === null) continue;
    const dias = diasHasta(credencial.expiresAt, ahora);
    if (dias > DIAS_DE_AVISO) continue;
    pendientes.push({
      id: `credencial:${credencial.id}`,
      urgencia: 'CADUCA',
      titulo: 'Tu credencial está por vencer',
      detalle: `Cuando venza dejará de acreditarte ante quien la verifique: ${enPalabras(dias)}.`,
      accion: { href: '/mi/credencial', etiqueta: 'Ver mi credencial' },
      venceEl: credencial.expiresAt,
    });
  }

  // 9. Un consentimiento retirado que la persona quizá quiera reponer no se
  //    empuja: retirarlo fue una decisión suya. Lo que sí se ofrece es revisar
  //    qué hay otorgado, que es un derecho y no una tarea.
  if (consentimientos.ok && consentimientos.data.length === 0) {
    pendientes.push({
      id: 'consentimientos:vacio',
      urgencia: 'REVISAR',
      titulo: 'No tienes ningún consentimiento registrado',
      detalle:
        'Aquí decides para qué puede usar la organización tus datos, y puedes retirarlo cuando quieras.',
      accion: { href: '/mi/consentimientos', etiqueta: 'Revisar mis consentimientos' },
      venceEl: null,
    });
  }

  pendientes.sort((a, b) => {
    if (PESO[a.urgencia] !== PESO[b.urgencia]) return PESO[a.urgencia] - PESO[b.urgencia];
    if (a.venceEl !== null && b.venceEl !== null) return a.venceEl.getTime() - b.venceEl.getTime();
    if (a.venceEl !== null) return -1;
    if (b.venceEl !== null) return 1;
    return a.titulo.localeCompare(b.titulo);
  });

  return ok({
    pendientes,
    calidades,
    credencialesVigentes: vigentes.length,
    apareceEnDirectorio: directorio.ok && directorio.data.publishedSlug !== null,
  });
}
