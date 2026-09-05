import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { MembershipCategory, MembershipStatus } from '@prisma-client/enums';

/**
 * Directorio interno, publicación pública y retiro del consentimiento
 * (PRD §7.2, §7.3; F4-DIR-001, F4-DIR-002, F4-DIR-003).
 *
 * Dos directorios que se parecen y no son lo mismo:
 *
 * - El **interno** lo consulta quien tiene la facultad, y muestra a las
 *   personas afiliadas de la organización. No depende de que nadie autorice
 *   nada: es el padrón mirado desde dentro.
 * - El **público** se deriva **exclusivamente** de autorizaciones expresas
 *   (PRD §7.1). Nadie aparece por omisión, ni por ser agremiado, ni por tener
 *   perfil profesional. Aparece quien dijo que sí, con lo que dijo que sí.
 *
 * La regla que atraviesa el archivo: **la publicación se deriva de la
 * preferencia, no al revés**. Una ficha pública no se edita; se retira la
 * autorización y se publica otra. Así lo publicado siempre corresponde a algo
 * que alguien autorizó, y se puede demostrar cuál.
 */

/* -------------------------------------------------------------------------- */
/* Directorio interno (F4-DIR-001)                                            */
/* -------------------------------------------------------------------------- */

export interface DirectoryEntry {
  readonly personId: string;
  readonly personName: string;
  readonly memberNumber: string | null;
  readonly category: MembershipCategory | null;
  readonly membershipStatus: MembershipStatus | null;
  readonly territory: string | null;
  readonly section: string | null;
  readonly occupation: string | null;
  readonly availability: string | null;
  readonly headline: string | null;
  readonly professionalEmail: string | null;
  readonly professionalPhone: string | null;
  readonly verifiedSkills: readonly string[];
  readonly credentialValidUntil: Date | null;
  /**
   * Situación de cuotas. Solo para quien tiene la facultad de leer pagos
   * (PRD §7.2): quien busca a una persona en el directorio no necesita saber
   * si está al corriente, y enseñárselo convierte una búsqueda en un juicio.
   */
  readonly duesStatus: string | null;
}

export interface DirectoryFilters {
  readonly query?: string;
  readonly category?: MembershipCategory;
  readonly status?: MembershipStatus;
  readonly specialtyId?: string;
  readonly territorialUnitId?: string;
  readonly availability?: string;
  /** Solo quienes tienen credencial vigente hoy. */
  readonly withValidCredential?: boolean;
}

function nombre(persona: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

function habilidades(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((uno): uno is string => typeof uno === 'string') : [];
}

/**
 * Directorio interno con los filtros del PRD §7.2.
 *
 * Se consulta sobre **membresías**, no sobre personas: el directorio de la
 * organización es quien pertenece a ella, y una persona del registro maestro
 * que nunca se afilió no está en el directorio de nadie.
 */
export async function internalDirectory(
  actor: ActorContext,
  filtros: DirectoryFilters = {},
): Promise<UseCaseResult<DirectoryEntry[]>> {
  const decision = can(actor, 'directory.internal.read', {
    kind: 'Membership',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // La situación de cuotas es un dato aparte y con su propia facultad. Quien no
  // la tiene no recibe la columna vacía: no la recibe.
  const veCuotas = can(actor, 'billing.payment.read', { kind: 'Payment', isBulk: true }).allowed;

  const texto = (filtros.query ?? '').trim();
  const ahora = new Date();

  const filas = await db().membership.findMany({
    where: {
      ...(filtros.category === undefined ? {} : { category: filtros.category }),
      ...(filtros.status === undefined ? { status: { in: ['ACTIVE', 'SUSPENDED'] } } : { status: filtros.status }),
      ...(filtros.territorialUnitId === undefined ? {} : { territorialUnitId: filtros.territorialUnitId }),
      ...(texto === ''
        ? {}
        : {
            OR: [
              { memberNumber: { contains: texto, mode: 'insensitive' as const } },
              { person: { familyName: { contains: texto, mode: 'insensitive' as const } } },
              { person: { givenName: { contains: texto, mode: 'insensitive' as const } } },
            ],
          }),
      ...(filtros.specialtyId === undefined
        ? {}
        : {
            person: {
              professionalProfile: { specialties: { some: { specialtyId: filtros.specialtyId } } },
            },
          }),
      ...(filtros.availability === undefined
        ? {}
        : { person: { professionalProfile: { availability: filtros.availability as 'AVAILABLE' } } }),
      ...(filtros.withValidCredential === true
        ? {
            person: {
              credentials: {
                some: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }] },
              },
            },
          }
        : {}),
    },
    orderBy: [{ person: { familyName: 'asc' } }, { memberNumber: 'asc' }],
    take: 500,
    select: {
      personId: true,
      memberNumber: true,
      category: true,
      status: true,
      territorialUnit: { select: { name: true } },
      section: { select: { name: true } },
      person: {
        select: {
          givenName: true,
          middleName: true,
          familyName: true,
          secondFamilyName: true,
          professionalProfile: {
            select: {
              headline: true,
              availability: true,
              professionalEmail: true,
              professionalPhone: true,
              verifiedSkills: true,
              specialties: { select: { specialty: { select: { name: true } } }, take: 1 },
            },
          },
          credentials: {
            where: { status: 'ACTIVE' },
            orderBy: { issuedAt: 'desc' },
            take: 1,
            select: { expiresAt: true },
          },
        },
      },
    },
  });

  const cuotasPorPersona = new Map<string, string>();
  if (veCuotas && filas.length > 0) {
    const morosos = await db().subscription.findMany({
      where: {
        billingAccount: { personId: { in: filas.map((fila) => fila.personId) } },
        status: { in: ['PAST_DUE', 'UNPAID'] },
      },
      select: { billingAccount: { select: { personId: true } }, status: true },
    });
    for (const suscripcion of morosos) {
      const personId = suscripcion.billingAccount.personId;
      if (personId !== null) cuotasPorPersona.set(personId, suscripcion.status);
    }
  }

  return ok(
    filas.map((fila) => ({
      personId: fila.personId,
      personName: nombre(fila.person),
      memberNumber: fila.memberNumber,
      category: fila.category,
      membershipStatus: fila.status,
      territory: fila.territorialUnit?.name ?? null,
      section: fila.section?.name ?? null,
      occupation: fila.person.professionalProfile?.specialties[0]?.specialty.name ?? null,
      availability: fila.person.professionalProfile?.availability ?? null,
      headline: fila.person.professionalProfile?.headline ?? null,
      professionalEmail: fila.person.professionalProfile?.professionalEmail ?? null,
      professionalPhone: fila.person.professionalProfile?.professionalPhone ?? null,
      verifiedSkills: habilidades(fila.person.professionalProfile?.verifiedSkills),
      credentialValidUntil: fila.person.credentials[0]?.expiresAt ?? null,
      duesStatus: veCuotas ? (cuotasPorPersona.get(fila.personId) ?? 'AL_CORRIENTE') : null,
    })),
  );
}

export const exportDirectorySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(20, {
      error: () =>
        'Escribe para qué se va a usar. Un directorio exportado sale del sistema y deja de estar protegido por él.',
    })
    .max(600),
});

export type ExportDirectoryInput = z.infer<typeof exportDirectorySchema>;

/** Escapa un campo para un archivo separado por comas. */
function campo(valor: string | null): string {
  if (valor === null) return '';
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/**
 * Exporta el directorio interno (PRD §7.2).
 *
 * «Las exportaciones deberán respetar el mismo alcance del usuario», dice el
 * PRD, y por eso esto no consulta la base por su cuenta: llama a
 * `internalDirectory` con el mismo actor. Lo que la persona no puede ver en
 * pantalla no aparece en su archivo, sin que haya que acordarse de repetir el
 * filtro en dos sitios.
 *
 * La situación de cuotas se hereda de esa misma llamada: quien no la ve en
 * pantalla tampoco la exporta.
 */
export async function exportInternalDirectory(
  actor: ActorContext,
  input: ExportDirectoryInput,
): Promise<UseCaseResult<{ fileName: string; content: string; rows: number }>> {
  const parsed = exportDirectorySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'directory.internal.export', {
    kind: 'Membership',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const listado = await internalDirectory(actor);
  if (!listado.ok) return listado;

  const conCuotas = listado.data.some((fila) => fila.duesStatus !== null);
  const encabezado = [
    'numero_de_miembro',
    'nombre',
    'calidad_exacta',
    'estado_de_membresia',
    'territorio',
    'seccion',
    'oficio_o_profesion',
    'disponibilidad',
    'correo_profesional',
    'telefono_profesional',
    'vigencia_de_credencial',
    ...(conCuotas ? ['situacion_de_cuotas'] : []),
  ].join(',');

  const cuerpo = listado.data.map((fila) =>
    [
      campo(fila.memberNumber),
      campo(fila.personName),
      campo(fila.category),
      campo(fila.membershipStatus),
      campo(fila.territory),
      campo(fila.section),
      campo(fila.occupation),
      campo(fila.availability),
      campo(fila.professionalEmail),
      campo(fila.professionalPhone),
      campo(fila.credentialValidUntil === null ? 'sin credencial vigente' : fila.credentialValidUntil.toISOString().slice(0, 10)),
      ...(conCuotas ? [campo(fila.duesStatus)] : []),
    ].join(','),
  );

  // La marca temporal que pide el PRD §7.2 va en el nombre del archivo y en el
  // asiento: quien reciba el archivo sabe de cuándo es, y quien revise la
  // bitácora sabe quién lo sacó y para qué.
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DIRECTORY_EXPORTED,
      objectKind: 'Membership',
      objectId: 'directorio-interno',
      outcome: 'SUCCESS',
      reason: parsed.data.reason,
      metadata: { filas: listado.data.length, incluyeCuotas: conCuotas, marca },
    });
  });

  return ok({
    fileName: `directorio-interno-${marca}.csv`,
    content: `\ufeff${encabezado}\n${cuerpo.join('\n')}\n`,
    rows: listado.data.length,
  });
}

/* -------------------------------------------------------------------------- */
/* Preferencia de publicación (F4-DIR-002)                                    */
/* -------------------------------------------------------------------------- */

export const setDirectoryPreferenceSchema = z.object({
  personId: z.uuid(),
  visibility: z.enum(['HIDDEN', 'NAME_AND_TERRITORY', 'PROFESSIONAL_PROFILE'], {
    error: () => 'Di cuánto quieres que se vea.',
  }),
  showPhoto: z.boolean().default(false),
  showProfessionalContact: z.boolean().default(false),
  allowSearchEngineIndexing: z.boolean().default(false),
});

export type SetDirectoryPreferenceInput = z.input<typeof setDirectoryPreferenceSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Edad cumplida, calculada sobre el calendario. */
function esMenorDeEdad(birthDate: Date | null): boolean {
  if (birthDate === null) return false;
  const hoy = new Date();
  const cumple = new Date(
    Date.UTC(birthDate.getUTCFullYear() + 18, birthDate.getUTCMonth(), birthDate.getUTCDate()),
  );
  return cumple > hoy;
}

/**
 * Convierte un nombre en una dirección pública estable.
 *
 * Sin acentos ni signos, en minúsculas y con guiones. Si dos personas comparten
 * nombre, el segundo lleva sufijo: la dirección es pública y tiene que ser
 * única, pero **no lleva el identificador interno** —una dirección que expone
 * un identificador de base invita a probar el siguiente—.
 */
function aDireccion(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Registra lo que la persona autoriza a publicar.
 *
 * Cinco cosas que este caso de uso comprueba antes de dejar publicar nada, y
 * ninguna es opcional:
 *
 * 1. **Hay un texto de consentimiento publicado** para la publicación en
 *    directorio. Sin texto vigente no hay nada que aceptar, y una autorización
 *    sin texto es una casilla marcada.
 * 2. **La persona lo otorgó**, y la autorización queda atada a la versión
 *    exacta del texto que aceptó (PRD §7.3).
 * 3. **No es menor de edad.** El PRD §7.3 exige base y autorización específicas
 *    aprobadas institucionalmente, y eso no existe todavía: mientras no exista,
 *    la respuesta es no.
 * 4. **No tiene una atención con privacidad reforzada.** Un beneficiario
 *    protegido no aparece públicamente por omisión (PRD §7.3), y quien pidió
 *    ayuda con privacidad reforzada tampoco por decisión de un formulario.
 * 5. **Lo anterior se retira** al registrar lo nuevo: dos preferencias vivas
 *    dejarían sin respuesta la pregunta de cuál rige.
 */
export async function setDirectoryPreference(
  actor: ActorContext,
  input: SetDirectoryPreferenceInput,
): Promise<UseCaseResult<{ preferenceId: string; visibility: string }>> {
  const parsed = setDirectoryPreferenceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const datos = parsed.data;

  const propia = datos.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'directory.publication.manage_own' : 'directory.publication.manage',
    { kind: 'DirectoryPreference', id: datos.personId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const persona = await db().person.findUnique({
    where: { id: datos.personId },
    select: { id: true, birthDate: true, mergedIntoPersonId: true },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));
  if (persona.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Ese registro quedó fusionado con otro. Configura la publicación sobre el registro que se conservó.',
        'la persona está fusionada',
      ),
    );
  }

  const publica = datos.visibility !== 'HIDDEN';

  if (publica && esMenorDeEdad(persona.birthDate)) {
    return fail(
      errors.ruleViolation(
        'No publicamos a personas menores de edad. Hace falta una base y una autorización específicas que la organización todavía no ha aprobado.',
        'intento de publicar a una persona menor de edad (PRD §7.3)',
      ),
    );
  }

  if (publica) {
    const reforzada = await db().protectedBeneficiary.findFirst({
      where: {
        personId: datos.personId,
        privacyLevel: 'REINFORCED',
        status: { notIn: ['CLOSED', 'ARCHIVED'] },
      },
      select: { publicId: true },
    });
    if (reforzada !== null) {
      return fail(
        errors.ruleViolation(
          'Esta persona tiene una atención con privacidad reforzada. Publicarla en el directorio contradiría esa protección.',
          'intento de publicar a una persona con atención de privacidad reforzada (PRD §7.3)',
        ),
      );
    }
  }

  const texto = await db().consentVersion.findFirst({
    where: { code: 'CONSENT_DIRECTORY_PUBLICATION', status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  });
  if (texto === null) {
    return fail(
      errors.ruleViolation(
        'Todavía no hay un texto de consentimiento publicado para el directorio. Sin él nadie puede autorizar nada.',
        'sin versión publicada de CONSENT_DIRECTORY_PUBLICATION',
      ),
    );
  }

  const creada = await transaction(async (tx) => {
    // Lo anterior se retira en el mismo acto, y con él lo que estuviera
    // publicado a su amparo: la ficha pública nunca sobrevive a la
    // autorización que la sostenía.
    await tx.directoryPreference.updateMany({
      where: { personId: datos.personId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.directoryPublication.updateMany({
      where: { personId: datos.personId, withdrawnAt: null },
      data: { withdrawnAt: new Date(), indexable: false },
    });

    const preferencia = await tx.directoryPreference.create({
      data: {
        personId: datos.personId,
        visibility: datos.visibility,
        showPhoto: datos.showPhoto,
        showProfessionalContact: datos.showProfessionalContact,
        // Indexar solo tiene sentido si se aparece. Marcar la casilla con
        // visibilidad oculta guardaría una autorización que no autoriza nada.
        allowSearchEngineIndexing: publica && datos.allowSearchEngineIndexing,
        consentVersionId: texto.id,
        createdByActorId: actor.actorId,
      },
      select: { id: true, visibility: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DIRECTORY_PREFERENCE_GRANTED,
      objectKind: 'DirectoryPreference',
      objectId: preferencia.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: datos.personId,
      metadata: {
        visibilidad: datos.visibility,
        foto: datos.showPhoto,
        contacto: datos.showProfessionalContact,
        indexable: publica && datos.allowSearchEngineIndexing,
        texto: `CONSENT_DIRECTORY_PUBLICATION v${texto.version}`,
        propia,
      },
    });

    return preferencia;
  });

  return ok({ preferenceId: creada.id, visibility: creada.visibility });
}

/* -------------------------------------------------------------------------- */
/* Publicación y retiro (F4-DIR-002, F4-DIR-003)                              */
/* -------------------------------------------------------------------------- */

/**
 * Publica la ficha que autoriza la preferencia vigente.
 *
 * **Solo copia lo autorizado.** Los campos publicados se arman aquí a partir de
 * la visibilidad y de los interruptores de la preferencia; no hay un formulario
 * donde alguien escriba qué se publica. Si la persona autorizó nombre y
 * territorio, la ficha lleva nombre y territorio aunque su perfil profesional
 * esté lleno.
 *
 * La instantánea se guarda con la ficha y no se lee en vivo del perfil: lo
 * publicado tiene que poder demostrarse tal como estuvo publicado, y un perfil
 * que cambia después cambiaría la historia.
 */
export async function publishDirectoryEntry(
  actor: ActorContext,
  input: { personId: string },
): Promise<UseCaseResult<{ publicationId: string; slug: string; indexable: boolean }>> {
  const propia = input.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'directory.publication.manage_own' : 'directory.publication.manage',
    { kind: 'DirectoryPublication', id: input.personId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const preferencia = await db().directoryPreference.findFirst({
    where: { personId: input.personId, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
    select: {
      id: true,
      visibility: true,
      showPhoto: true,
      showProfessionalContact: true,
      allowSearchEngineIndexing: true,
    },
  });
  if (preferencia === null) {
    return fail(
      errors.ruleViolation(
        'Esta persona no ha autorizado aparecer en el directorio público.',
        'sin preferencia vigente: el directorio público se deriva exclusivamente de autorizaciones expresas',
      ),
    );
  }
  if (preferencia.visibility === 'HIDDEN') {
    return fail(
      errors.ruleViolation(
        'Esta persona eligió no aparecer.',
        'preferencia vigente con visibilidad oculta',
      ),
    );
  }

  const persona = await db().person.findUniqueOrThrow({
    where: { id: input.personId },
    select: {
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      territorialUnit: { select: { name: true } },
      professionalProfile: {
        select: {
          headline: true,
          credentialsSummary: true,
          availability: true,
          professionalEmail: true,
          professionalPhone: true,
          verifiedSkills: true,
          specialties: { select: { specialty: { select: { name: true } } } },
        },
      },
    },
  });

  const nombreCompleto = nombre(persona);
  const perfil = persona.professionalProfile;

  const campos: Record<string, unknown> = {
    nombre: nombreCompleto,
    territorio: persona.territorialUnit?.name ?? null,
  };
  if (preferencia.visibility === 'PROFESSIONAL_PROFILE' && perfil !== null) {
    campos['titular'] = perfil.headline;
    campos['resumen'] = perfil.credentialsSummary;
    campos['disponibilidad'] = perfil.availability;
    campos['especialidades'] = perfil.specialties.map((una) => una.specialty.name);
    campos['habilidadesVerificadas'] = habilidades(perfil.verifiedSkills);
  }
  if (preferencia.showProfessionalContact && perfil !== null) {
    campos['correoProfesional'] = perfil.professionalEmail;
    campos['telefonoProfesional'] = perfil.professionalPhone;
  }
  campos['muestraFoto'] = preferencia.showPhoto;

  const base = aDireccion(nombreCompleto) || 'persona';
  const ocupadas = await db().directoryPublication.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const usadas = new Set(ocupadas.map((una) => una.slug));
  let slug = base;
  let sufijo = 2;
  while (usadas.has(slug)) {
    slug = `${base}-${sufijo}`;
    sufijo += 1;
  }

  const publicada = await transaction(async (tx) => {
    await tx.directoryPublication.updateMany({
      where: { personId: input.personId, withdrawnAt: null },
      data: { withdrawnAt: new Date(), indexable: false },
    });

    const fila = await tx.directoryPublication.create({
      data: {
        personId: input.personId,
        slug,
        publishedFields: campos as never,
        indexable: preferencia.allowSearchEngineIndexing,
        sourcePreferenceId: preferencia.id,
      },
      select: { id: true, slug: true, indexable: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DIRECTORY_PUBLISHED,
      objectKind: 'DirectoryPublication',
      objectId: fila.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: input.personId,
      metadata: { slug: fila.slug, indexable: fila.indexable, visibilidad: preferencia.visibility },
    });

    return fila;
  });

  return ok({ publicationId: publicada.id, slug: publicada.slug, indexable: publicada.indexable });
}

export const withdrawDirectorySchema = z.object({
  personId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, { error: () => 'Escribe por qué se retira. Con diez caracteres basta.' })
    .max(600),
});

export type WithdrawDirectoryInput = z.infer<typeof withdrawDirectorySchema>;

/**
 * Retira la autorización y con ella la ficha pública (F4-DIR-003).
 *
 * Tres efectos, en un solo acto y sin depender de que nadie haga el segundo:
 *
 * 1. **La preferencia queda revocada**, así que no hay autorización que sostenga
 *    ninguna publicación.
 * 2. **La ficha se marca retirada y deja de ser indexable.** La fila permanece
 *    como evidencia de qué estuvo publicado y cuándo: borrarla dejaría a la
 *    organización sin poder demostrar que retiró lo que dijo que retiraría.
 * 3. **La caché de la ficha se invalida** y la dirección deja de responder. Sin
 *    esto, retirar el consentimiento dejaría la página en pie hasta que a
 *    alguien se le ocurriera recargarla, que es lo mismo que no retirarla.
 *
 * Quien retira devuelve las direcciones afectadas para que la capa web
 * invalide su caché: el módulo no conoce el enrutador, y meterlo aquí ataría el
 * dominio a un detalle del marco.
 */
export async function withdrawDirectoryConsent(
  actor: ActorContext,
  input: WithdrawDirectoryInput,
): Promise<UseCaseResult<{ withdrawn: number; paths: string[] }>> {
  const parsed = withdrawDirectorySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const propia = parsed.data.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'directory.publication.manage_own' : 'directory.publication.manage',
    { kind: 'DirectoryPublication', id: parsed.data.personId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const vivas = await db().directoryPublication.findMany({
    where: { personId: parsed.data.personId, withdrawnAt: null },
    select: { id: true, slug: true },
  });
  const preferencias = await db().directoryPreference.count({
    where: { personId: parsed.data.personId, revokedAt: null },
  });

  if (vivas.length === 0 && preferencias === 0) {
    return fail(
      errors.conflict('Esta persona no tiene ninguna autorización vigente que retirar.', 'nada que retirar'),
    );
  }

  const ahora = new Date();
  await transaction(async (tx) => {
    await tx.directoryPreference.updateMany({
      where: { personId: parsed.data.personId, revokedAt: null },
      data: { revokedAt: ahora },
    });
    await tx.directoryPublication.updateMany({
      where: { personId: parsed.data.personId, withdrawnAt: null },
      data: { withdrawnAt: ahora, indexable: false },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DIRECTORY_WITHDRAWN,
      objectKind: 'DirectoryPublication',
      objectId: parsed.data.personId,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: parsed.data.personId,
      reason: parsed.data.reason,
      metadata: { fichas: vivas.length, direcciones: vivas.map((una) => una.slug) },
    });
  });

  return ok({
    withdrawn: vivas.length,
    paths: ['/directorio', ...vivas.map((una) => `/directorio/${una.slug}`)],
  });
}

/* -------------------------------------------------------------------------- */
/* Lectura pública                                                            */
/* -------------------------------------------------------------------------- */

export interface PublicEntry {
  readonly slug: string;
  readonly fields: Record<string, unknown>;
  readonly indexable: boolean;
  readonly publishedAt: Date;
}

/**
 * Las fichas públicas vigentes.
 *
 * Sin actor y sin permisos: es la parte pública. Lo que la hace segura no es
 * quién pregunta, sino que la consulta **solo devuelve lo que alguien autorizó**
 * —fichas no retiradas— y **solo los campos que se guardaron** al publicarlas.
 */
export async function publicDirectory(): Promise<PublicEntry[]> {
  const filas = await db().directoryPublication.findMany({
    where: { withdrawnAt: null },
    orderBy: { publishedAt: 'desc' },
    take: 500,
    select: { slug: true, publishedFields: true, indexable: true, publishedAt: true },
  });
  return filas.map((fila) => ({
    slug: fila.slug,
    fields: (fila.publishedFields ?? {}) as Record<string, unknown>,
    indexable: fila.indexable,
    publishedAt: fila.publishedAt,
  }));
}

/** Una ficha pública por su dirección. Devuelve `null` si se retiró. */
export async function publicEntry(slug: string): Promise<PublicEntry | null> {
  const fila = await db().directoryPublication.findFirst({
    where: { slug, withdrawnAt: null },
    select: { slug: true, publishedFields: true, indexable: true, publishedAt: true },
  });
  if (fila === null) return null;
  return {
    slug: fila.slug,
    fields: (fila.publishedFields ?? {}) as Record<string, unknown>,
    indexable: fila.indexable,
    publishedAt: fila.publishedAt,
  };
}

/** Lo que la persona tiene autorizado hoy, para su propia pantalla. */
export async function myDirectoryState(
  actor: ActorContext,
  personId: string,
): Promise<
  UseCaseResult<{
    visibility: string;
    showPhoto: boolean;
    showProfessionalContact: boolean;
    allowSearchEngineIndexing: boolean;
    publishedSlug: string | null;
    indexable: boolean;
    /**
     * Cuándo se retiró la última ficha, si ya no hay ninguna viva.
     *
     * Está aquí para que la pantalla pueda **acusar recibo del retiro** después
     * de que el formulario de retirar haya desaparecido —desaparece porque ya
     * no queda nada que retirar— (defecto `D-F4-015`, ADR-0089). El acuse no
     * puede vivir dentro de la acción que se lleva su propio formulario por
     * delante: se saca del hecho, y así sobrevive a una recarga.
     */
    withdrawnAt: Date | null;
  }>
> {
  const propia = personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'directory.publication.manage_own' : 'directory.publication.manage',
    { kind: 'DirectoryPreference', id: personId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const preferencia = await db().directoryPreference.findFirst({
    where: { personId, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
    select: {
      visibility: true,
      showPhoto: true,
      showProfessionalContact: true,
      allowSearchEngineIndexing: true,
    },
  });
  const publicacion = await db().directoryPublication.findFirst({
    where: { personId, withdrawnAt: null },
    select: { slug: true, indexable: true },
  });

  const retirada =
    publicacion !== null
      ? null
      : await db().directoryPublication.findFirst({
          where: { personId, withdrawnAt: { not: null } },
          orderBy: { withdrawnAt: 'desc' },
          select: { withdrawnAt: true },
        });

  return ok({
    visibility: preferencia?.visibility ?? 'HIDDEN',
    showPhoto: preferencia?.showPhoto ?? false,
    showProfessionalContact: preferencia?.showProfessionalContact ?? false,
    allowSearchEngineIndexing: preferencia?.allowSearchEngineIndexing ?? false,
    publishedSlug: publicacion?.slug ?? null,
    indexable: publicacion?.indexable ?? false,
    withdrawnAt: retirada?.withdrawnAt ?? null,
  });
}
