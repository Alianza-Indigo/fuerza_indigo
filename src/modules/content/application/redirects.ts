import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Redirecciones de contenido (PRD §16.1, ADR-0041).
 *
 * Una dirección publicada es una promesa: alguien la escribió en un volante, la
 * mandó por mensaje o la citó en un oficio. Cuando un contenido cambia de sitio,
 * la dirección vieja tiene que seguir llevando a alguna parte, y con el código
 * de estado correcto para que los buscadores trasladen lo que ya tenían.
 *
 * Por eso la redirección **sobrevive a la página**: se guarda por dirección de
 * origen, no como un campo de la página, y `toPath` permite apuntar a una ruta
 * fija cuando el destino no es una página del gestor.
 */

const slugOrigen = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/, {
    error: () => 'La dirección de origen se escribe sin la barra inicial. Por ejemplo: comunicado-2025.',
  });

export const createRedirectSchema = z
  .object({
    fromSlug: slugOrigen,
    /** Página del gestor a la que apunta. */
    toPageId: z.uuid().optional(),
    /** Ruta interna fija cuando el destino no es una página del gestor. */
    toPath: z
      .string()
      .trim()
      .max(400)
      .regex(/^\/[^\s]*$/, { error: () => 'La ruta de destino empieza con una barra. Por ejemplo: /noticias.' })
      .optional(),
    permanent: z.boolean().default(true),
  })
  .refine((valor) => (valor.toPageId === undefined) !== (valor.toPath === undefined), {
    error: () => 'Elige un destino: o una página del gestor, o una ruta fija. No las dos ni ninguna.',
    path: ['toPageId'],
  });

export type CreateRedirectInput = z.input<typeof createRedirectSchema>;

export const deleteRedirectSchema = z.object({ redirectId: z.uuid() });

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface RedirectTarget {
  readonly path: string;
  readonly permanent: boolean;
}

/**
 * Resuelve una dirección de origen a su destino, o `null` si no hay ninguna.
 *
 * No sigue cadenas: si el destino de una redirección es a su vez el origen de
 * otra, se devuelve el primer salto y ya. Seguir la cadena invitaría a un ciclo
 * y a una petición que nunca termina; el precio es un salto extra en el
 * navegador, que es barato y visible.
 */
export async function resolveRedirect(fromSlug: string): Promise<RedirectTarget | null> {
  const normalizado = fromSlug.trim().toLowerCase().replace(/^\/+/, '');
  if (normalizado === '') return null;

  const fila = await db().contentRedirect.findUnique({
    where: { fromSlug: normalizado },
    select: { id: true, permanent: true, toPath: true, toPage: { select: { slug: true, status: true } } },
  });
  if (fila === null) return null;

  // Un destino archivado o sin publicar no es destino: mandar ahí produciría un
  // 404 detrás de una redirección, que es peor que el 404 directo.
  const destino =
    fila.toPage !== null && fila.toPage.status === 'PUBLISHED' ? `/${fila.toPage.slug}` : fila.toPath;
  if (destino === null || destino === undefined) return null;

  // El contador es informativo: sirve para retirar las que ya nadie usa. Si el
  // incremento falla, la persona igual tiene que llegar a su destino.
  await db()
    .contentRedirect.update({ where: { id: fila.id }, data: { hitCount: { increment: 1 } } })
    .catch(() => undefined);

  return { path: destino, permanent: fila.permanent };
}

export async function createRedirect(
  actor: ActorContext,
  input: CreateRedirectInput,
): Promise<UseCaseResult<{ redirectId: string }>> {
  const parsed = createRedirectSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'content.redirect.manage', { kind: 'ContentRedirect', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ocupado = await db().contentPage.findUnique({ where: { slug: data.fromSlug }, select: { status: true } });
  if (ocupado !== null && ocupado.status === 'PUBLISHED') {
    return fail(
      errors.conflict(
        'Esa dirección la ocupa una página publicada. La redirección nunca se usaría.',
        'slug de origen ocupado por una página publicada',
      ),
    );
  }

  const yaExiste = await db().contentRedirect.findUnique({
    where: { fromSlug: data.fromSlug },
    select: { id: true },
  });
  if (yaExiste !== null) {
    return fail(
      errors.conflict('Ya hay una redirección para esa dirección. Bórrala antes de crear otra.', 'origen duplicado'),
    );
  }

  if (data.toPageId !== undefined) {
    const destino = await db().contentPage.findUnique({ where: { id: data.toPageId }, select: { id: true } });
    if (destino === null) return fail(errors.notFound('página de destino inexistente', 'No encontramos la página de destino.'));
  }

  const resultado = await transaction(async (tx) => {
    const fila = await tx.contentRedirect.create({
      data: {
        fromSlug: data.fromSlug,
        toPageId: data.toPageId ?? null,
        toPath: data.toPath ?? null,
        permanent: data.permanent,
        createdByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_REDIRECT_CREATED,
      objectKind: 'ContentRedirect',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: {
        fromSlug: data.fromSlug,
        toPageId: data.toPageId ?? null,
        toPath: data.toPath ?? null,
        permanent: data.permanent,
      },
    });

    return { redirectId: fila.id };
  });

  return ok(resultado);
}

export async function deleteRedirect(
  actor: ActorContext,
  input: z.infer<typeof deleteRedirectSchema>,
): Promise<UseCaseResult<{ redirectId: string }>> {
  const parsed = deleteRedirectSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'content.redirect.manage', { kind: 'ContentRedirect', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fila = await db().contentRedirect.findUnique({
    where: { id: parsed.data.redirectId },
    select: { id: true, fromSlug: true, hitCount: true },
  });
  if (fila === null) return fail(errors.notFound('redirección inexistente', 'No encontramos esa redirección.'));

  await transaction(async (tx) => {
    await tx.contentRedirect.delete({ where: { id: fila.id } });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_REDIRECT_DELETED,
      objectKind: 'ContentRedirect',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { fromSlug: fila.fromSlug, hitCount: fila.hitCount },
    });
  });

  return ok({ redirectId: fila.id });
}

export interface RedirectRow {
  readonly id: string;
  readonly fromSlug: string;
  readonly destino: string;
  readonly destinoVigente: boolean;
  readonly permanent: boolean;
  readonly hitCount: number;
  readonly createdAt: Date;
}

export async function listRedirects(actor: ActorContext): Promise<UseCaseResult<readonly RedirectRow[]>> {
  const decision = can(actor, 'content.redirect.manage', { kind: 'ContentRedirect', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().contentRedirect.findMany({
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      fromSlug: true,
      toPath: true,
      permanent: true,
      hitCount: true,
      createdAt: true,
      toPage: { select: { slug: true, status: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      fromSlug: fila.fromSlug,
      destino: fila.toPage !== null ? `/${fila.toPage.slug}` : (fila.toPath ?? ''),
      destinoVigente: fila.toPage !== null ? fila.toPage.status === 'PUBLISHED' : fila.toPath !== null,
      permanent: fila.permanent,
      hitCount: fila.hitCount,
      createdAt: fila.createdAt,
    })),
  );
}
