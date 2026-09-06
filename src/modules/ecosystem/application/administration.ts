import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { accesoDeLaFicha, moduloDeLaFicha, type FichaDelEcosistema } from '../domain/link';

/**
 * Administración del catálogo del ecosistema (PRD §12; F7-CAT-002, F7-UI-002).
 *
 * Lo que se administra es **una ficha y una dirección**. Nada más, porque nada
 * más se guarda: no hay derechos que conceder ni operación que configurar.
 *
 * La dirección es la parte delicada, y por eso se trata aparte. Es lo único de
 * esta pantalla que decide **a dónde** se manda a una persona que confía en el
 * sitio, y cambiarla no se parece a corregir una errata: se audita con su
 * propia acción, con el valor anterior y el nuevo. Si un día alguien acaba
 * donde no debía, la pregunta va a ser quién puso esa dirección y cuándo, y
 * tiene que haber respuesta.
 */

/**
 * La dirección, validada con la misma exigencia que la base.
 *
 * Vacía significa **retirar el acceso**, no guardar una cadena vacía: la
 * ausencia se representa con nulo y con nada más. Y `https` no es una
 * preferencia: mandar a alguien por texto plano a una plataforma donde va a
 * escribir su contraseña es un daño real, no un detalle de estilo.
 */
const direccionExterna = z
  .string()
  .trim()
  .max(400)
  .refine((valor) => valor === '' || /^https:\/\/[^\s]+$/.test(valor), {
    error: () => 'La dirección tiene que empezar por https:// y no llevar espacios. Déjala vacía para retirar el acceso.',
  })
  .transform((valor) => (valor === '' ? null : valor));

export const editarFichaSchema = z.object({
  linkId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(20).max(400),
  audienceText: z.string().trim().min(10).max(300),
  externalUrl: direccionExterna,
  accentToken: z.enum(['SINDICATO', 'ALIANZA', 'CIAN', 'CENI', 'HERRAMIENTAS']).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export type EditarFichaInput = z.input<typeof editarFichaSchema>;

export async function editarFicha(
  actor: ActorContext,
  input: EditarFichaInput,
): Promise<UseCaseResult<{ linkId: string; direccionCambiada: boolean }>> {
  const parsed = editarFichaSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'ecosystem.link.manage', { kind: 'EcosystemLink', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const antes = await db().ecosystemLink.findUnique({
    where: { id: data.linkId },
    select: { id: true, code: true, externalUrl: true },
  });
  if (antes === null) return fail(errors.notFound('Esa ficha no existe.', 'ficha inexistente'));

  const direccionCambiada = antes.externalUrl !== data.externalUrl;

  await transaction(async (tx) => {
    await tx.ecosystemLink.update({
      where: { id: data.linkId },
      data: {
        name: data.name,
        summary: data.summary,
        audienceText: data.audienceText,
        externalUrl: data.externalUrl,
        accentToken: data.accentToken,
        sortOrder: data.sortOrder,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ECOSYSTEM_LINK_UPDATED,
      objectKind: 'EcosystemLink',
      objectId: data.linkId,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: antes.code, sortOrder: data.sortOrder },
    });

    // Un asiento aparte, con el antes y el después. La ficha entera cambia por
    // muchas razones y casi todas son de redacción; la dirección cambia por una
    // sola, y es la que importa reconstruir.
    if (direccionCambiada) {
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.ECOSYSTEM_LINK_URL_CHANGED,
        objectKind: 'EcosystemLink',
        objectId: data.linkId,
        outcome: 'SUCCESS',
        legalEntityId: null,
        metadata: { code: antes.code, anterior: antes.externalUrl, nueva: data.externalUrl },
      });
    }
  });

  return ok({ linkId: data.linkId, direccionCambiada });
}

export const cambiarVisibilidadSchema = z.object({
  linkId: z.uuid(),
  publicar: z.boolean(),
});

export type CambiarVisibilidadInput = z.infer<typeof cambiarVisibilidadSchema>;

/**
 * Publicar u ocultar una ficha.
 *
 * Ocultar **no borra**: una plataforma que se cae una semana no debería perder
 * su ficha, su orden y su texto, que alguien escribió con cuidado. Y publicar
 * escribe la fecha, porque la base exige que «publicada» sea un hecho con su
 * instante y no un adjetivo que dice la interfaz.
 *
 * Publicar sin dirección **se permite**, y es deliberado: la ficha sirve para
 * saber qué es esa plataforma aunque su acceso todavía no esté configurado, y
 * la tarjeta lo dice en voz alta. Negarlo obligaría a inventar una dirección
 * para poder contar que la plataforma existe.
 */
export async function cambiarVisibilidad(
  actor: ActorContext,
  input: CambiarVisibilidadInput,
): Promise<UseCaseResult<{ linkId: string; publicada: boolean }>> {
  const parsed = cambiarVisibilidadSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'ecosystem.link.manage', { kind: 'EcosystemLink', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ficha = await db().ecosystemLink.findUnique({
    where: { id: data.linkId },
    select: { id: true, code: true, operationalStatus: true },
  });
  if (ficha === null) return fail(errors.notFound('Esa ficha no existe.', 'ficha inexistente'));

  await transaction(async (tx) => {
    await tx.ecosystemLink.update({
      where: { id: data.linkId },
      data: data.publicar
        ? { operationalStatus: 'ACTIVE', publishedAt: new Date(), updatedByActorId: actor.actorId }
        : { operationalStatus: 'HIDDEN', publishedAt: null, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: data.publicar ? AUDIT_ACTIONS.ECOSYSTEM_LINK_PUBLISHED : AUDIT_ACTIONS.ECOSYSTEM_LINK_HIDDEN,
      objectKind: 'EcosystemLink',
      objectId: data.linkId,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: ficha.code },
    });
  });

  return ok({ linkId: data.linkId, publicada: data.publicar });
}

/** Una ficha del catálogo tal como la ve quien lo administra, con su estado. */
export interface FichaAdministrable extends FichaDelEcosistema {
  readonly id: string;
  readonly publicada: boolean;
  readonly accentToken: string | null;
  readonly sortOrder: number;
  readonly direccionConfigurada: string | null;
}

/**
 * El catálogo entero, incluida la parte oculta.
 *
 * Es una función distinta de la que sirve al público, y no una bandera en
 * aquella. Una bandera `incluirOcultas` acaba pasada en verdadero desde la ruta
 * pública el día que alguien reutiliza la consulta con prisa; dos funciones con
 * dos nombres no se confunden.
 */
export async function catalogoCompleto(
  actor: ActorContext,
): Promise<UseCaseResult<readonly FichaAdministrable[]>> {
  const decision = can(actor, 'ecosystem.link.manage', { kind: 'EcosystemLink', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fichas = await db().ecosystemLink.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      summary: true,
      audienceText: true,
      accentToken: true,
      externalUrl: true,
      operationalStatus: true,
      sortOrder: true,
      legalEntity: { select: { shortName: true } },
    },
  });

  return ok(
    fichas.map((ficha) => ({
      id: ficha.id,
      code: ficha.code,
      name: ficha.name,
      summary: ficha.summary,
      audienceText: ficha.audienceText,
      modulo: moduloDeLaFicha(ficha.accentToken),
      accesoUrl: accesoDeLaFicha(ficha.externalUrl),
      responsable: ficha.legalEntity?.shortName ?? null,
      publicada: ficha.operationalStatus === 'ACTIVE',
      accentToken: ficha.accentToken,
      sortOrder: ficha.sortOrder,
      direccionConfigurada: ficha.externalUrl,
    })),
  );
}

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join('.') || 'formulario';
    (salida[clave] ??= []).push(issue.message);
  }
  return salida;
}
