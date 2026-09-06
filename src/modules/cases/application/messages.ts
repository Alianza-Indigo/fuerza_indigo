import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { CaseMessageAudience } from '@prisma-client/enums';
import { ALCANCE_DE_LECTURA, type ClaseDeLectura } from '../domain/audience';
import { CAMPOS_PARA_DECIDIR, esParteDelExpediente, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Comunicaciones del expediente (PRD §10.2, §10.3).
 *
 * **La audiencia decide quién lee, no cómo se pinta.** Una nota reservada que
 * la consulta trajera y la pantalla escondiera ya viajó al navegador de quien
 * no debía verla; el recorte se hace en la consulta, con la tabla de alcances
 * que declara el dominio.
 *
 * **No se escribe en un cajón que no se puede abrir.** Escribir una nota
 * reservada exige la misma facultad que leerla. Sin esa regla, cualquiera del
 * equipo podría dejar una nota que después no puede consultar ni corregir, y
 * que solo existe para quien sí puede: una vía para meter información en un
 * sitio del que ya no se le puede sacar.
 *
 * **Una comunicación enviada no se reescribe.** Se admite la corrección previa
 * al primer acuse —quien todavía no la ha leído no ha leído nada distinto— y
 * queda escrito que se corrigió. Después del acuse, no: reescribir lo que
 * alguien ya leyó cambia lo que se le dijo, y lo que se le dijo es el hecho.
 */

const AUDIENCIAS = ['PERSON_AND_TEAM', 'TEAM_ONLY', 'SUPERVISION_ONLY'] as const;

export const sendMessageSchema = z.object({
  caseId: z.uuid(),
  audience: z.enum(AUDIENCIAS satisfies readonly CaseMessageAudience[], {
    error: () => 'Elige a quién va dirigida.',
  }),
  body: z
    .string()
    .trim()
    .min(5, { error: () => 'Escribe la comunicación: al menos cinco caracteres.' })
    .max(50_000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  messageId: z.uuid(),
  body: z.string().trim().min(5).max(50_000),
});

export type EditMessageInput = z.infer<typeof editMessageSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Un acuse guardado: quién leyó y cuándo. */
export interface Acuse {
  readonly personId: string;
  readonly leidoEl: string;
}

/**
 * Lee los acuses de una fila sin fiarse de su forma.
 *
 * Es una columna `Json`: puede contener lo que sea si alguien escribió mal, y
 * un `as` la haría pasar por buena hasta que reventara al recorrerla.
 */
export function acusesDe(valor: unknown): readonly Acuse[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((entrada) => {
    if (typeof entrada !== 'object' || entrada === null) return [];
    const bruto = entrada as Record<string, unknown>;
    const personId = bruto['personId'];
    const leidoEl = bruto['leidoEl'];
    return typeof personId === 'string' && typeof leidoEl === 'string' ? [{ personId, leidoEl }] : [];
  });
}

/**
 * Qué clase de lectura tiene el actor sobre este expediente.
 *
 * Devuelve `null` cuando no alcanza ninguna. Es la única función que traduce
 * «quién eres respecto de este expediente» en «qué audiencias lees», y por eso
 * la usan tanto la lectura como el envío.
 */
export async function claseDeLectura(
  actor: ActorContext,
  expediente: { id: string; legalEntityId: string; domain: 'UNION_DEFENSE' | 'SOCIAL_ATTENTION'; territorialUnit: { path: string } | null },
): Promise<ClaseDeLectura | null> {
  const asignada = await estaAsignada(actor, expediente.id);

  if (asignada) {
    const reservado = can(actor, 'cases.message.read_reserved', recursoDelExpediente(expediente), {
      hasLiveAssignment: () => true,
    });
    if (reservado.allowed) return 'SUPERVISION';

    const equipo = can(actor, 'cases.case.read', recursoDelExpediente(expediente), {
      hasLiveAssignment: () => true,
    });
    if (equipo.allowed) return 'EQUIPO';
  }

  // Quien es parte lee lo suyo por su propia facultad, sin compartimento: los
  // compartimentos separan áreas de la organización, no a una persona de su
  // propio expediente.
  const parte = await esParteDelExpediente(actor, expediente.id);
  if (parte) {
    const propia = can(
      actor,
      'cases.case.read_own',
      { kind: 'Case', id: expediente.id, legalEntityId: expediente.legalEntityId },
      { hasLiveAssignment: () => true },
    );
    if (propia.allowed) return 'PERSONA';
  }

  return null;
}

export async function sendMessage(
  actor: ActorContext,
  input: SendMessageInput,
): Promise<UseCaseResult<{ messageId: string }>> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(
      errors.conflict('Ese expediente está cerrado. Reábrelo si hay que seguir comunicando algo dentro de él.'),
    );
  }

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(actor, 'cases.message.send', recursoDelExpediente(expediente), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // No se escribe en un cajón que no se puede abrir.
  if (data.audience === 'SUPERVISION_ONLY') {
    const reservado = can(actor, 'cases.message.read_reserved', recursoDelExpediente(expediente), {
      hasLiveAssignment: () => asignada,
    });
    if (!reservado.allowed) {
      // Es una regla del expediente, no una negativa del motor: quien la
      // recibe está en el equipo y ya sabe que el expediente existe, así que
      // decirle por qué no puede no revela nada y le ahorra el intento.
      return fail(
        errors.ruleViolation(
          'Escribir una nota reservada exige la misma facultad que leerla. Sin ella quedaría una nota que ni siquiera quien la escribió puede volver a consultar.',
        ),
      );
    }
  }

  const enviada = await transaction(async (tx) => {
    const fila = await tx.caseMessage.create({
      data: {
        caseId: expediente.id,
        authorId: actor.userId ?? null,
        audience: data.audience,
        body: data.body,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    // La bitácora dice que se comunicó y a quién; **no** qué se dijo. Un evento
    // que copiara el cuerpo pondría la nota reservada en una tabla que lee más
    // gente que la propia nota.
    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'MESSAGE_SENT',
        actorId: actor.actorId,
        summary:
          data.audience === 'PERSON_AND_TEAM'
            ? 'Se comunicó algo a la persona.'
            : data.audience === 'TEAM_ONLY'
              ? 'Nota interna del equipo.'
              : 'Nota reservada.',
        payload: { audiencia: data.audience, mensaje: fila.id },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_MESSAGE_SENT,
      objectKind: 'CaseMessage',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: { folio: expediente.folio, audiencia: data.audience },
    });

    return fila;
  });

  return ok({ messageId: enviada.id });
}

export async function editMessage(
  actor: ActorContext,
  input: EditMessageInput,
): Promise<UseCaseResult<{ messageId: string }>> {
  const parsed = editMessageSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const mensaje = await db().caseMessage.findUnique({
    where: { id: data.messageId },
    select: {
      id: true,
      authorId: true,
      audience: true,
      readReceipts: true,
      case: { select: { ...CAMPOS_PARA_DECIDIR, folio: true } },
    },
  });
  if (mensaje === null) return fail(errors.notFound('Esa comunicación no existe.'));

  const asignada = await estaAsignada(actor, mensaje.case.id);
  const decision = can(actor, 'cases.message.send', recursoDelExpediente(mensaje.case), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Corrige quien escribió. Que otra persona reescriba lo que alguien dijo, y
  // que siga apareciendo con su nombre, es peor que no poder corregir.
  if (mensaje.authorId === null || mensaje.authorId !== actor.userId) {
    return fail(
      errors.ruleViolation('Solo quien la escribió puede corregirla: seguiría apareciendo con su nombre.'),
    );
  }

  if (acusesDe(mensaje.readReceipts).length > 0) {
    return fail(
      errors.conflict(
        'Alguien ya la leyó. Lo que se le dijo es un hecho y no se reescribe: escribe otra comunicación con la corrección.',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.caseMessage.update({
      where: { id: mensaje.id },
      data: { body: data.body, editedAt: new Date(), updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_MESSAGE_EDITED,
      objectKind: 'CaseMessage',
      objectId: mensaje.id,
      outcome: 'SUCCESS',
      legalEntityId: mensaje.case.legalEntityId,
      metadata: { folio: mensaje.case.folio, audiencia: mensaje.audience },
    });
  });

  return ok({ messageId: mensaje.id });
}

/**
 * Deja acuse de las comunicaciones que la persona acaba de leer.
 *
 * Se registra al leer el expediente, no con un botón: un acuse que dependa de
 * que alguien pulse «enterado» no prueba que se le dijo, prueba que pulsó. Solo
 * lo dejan quienes son **parte**: el equipo no acusa recibo de sus propias
 * notas internas.
 */
export async function registrarAcuses(
  personId: string,
  mensajes: readonly { id: string; audience: CaseMessageAudience; readReceipts: unknown }[],
): Promise<void> {
  const ahora = new Date().toISOString();
  const pendientes = mensajes.filter(
    (mensaje) =>
      ALCANCE_DE_LECTURA.PERSONA.includes(mensaje.audience as 'PERSON_AND_TEAM') &&
      !acusesDe(mensaje.readReceipts).some((acuse) => acuse.personId === personId),
  );
  if (pendientes.length === 0) return;

  await transaction(async (tx) => {
    for (const mensaje of pendientes) {
      await tx.caseMessage.update({
        where: { id: mensaje.id },
        data: {
          // Se reescribe la lista entera con la nueva entrada al final. Prisma
          // exige objetos planos para una columna `Json`, así que el acuse se
          // arma aquí en vez de reutilizar el tipo del dominio.
          readReceipts: [
            ...acusesDe(mensaje.readReceipts).map((acuse) => ({
              personId: acuse.personId,
              leidoEl: acuse.leidoEl,
            })),
            { personId, leidoEl: ahora },
          ],
        },
      });
    }
  });
}
