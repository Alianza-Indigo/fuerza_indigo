import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import { withReason, type ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Registro maestro de persona (PRD §3.1, F4-AFI-001).
 *
 * Una sola regla gobierna este archivo: **cada ser humano tiene un solo
 * registro**. Sobre él conviven todas sus relaciones con el ecosistema —
 * agremiada, honoraria, beneficiaria, familiar, profesional— sin que ninguna lo
 * duplique.
 *
 * La duplicidad no se evita prohibiendo: se evita **avisando a tiempo**. Un alta
 * que se parece a alguien que ya existe se detiene y muestra a quién se parece;
 * quien la captura decide si es la misma persona o no, y si dice que no, queda
 * dicho quién lo dijo. Una comprobación automática que decidiera sola acabaría
 * fusionando a dos hermanas con el mismo nombre, y deshacer eso es mucho más
 * caro que confirmarlo.
 */

/**
 * Normalización para comparar nombres (ADR-0070).
 *
 * Sin acentos y en minúsculas, porque «Muñoz» y «Munoz» son la misma persona
 * escrita por dos personas distintas, y el padrón no puede tener dos filas por
 * una diferencia de teclado.
 *
 * Reproduce **exactamente** lo que hace el disparador `person_clave_de_comparacion`
 * al escribir `Person.matchKey`. Si las dos formas se separaran, la búsqueda
 * dejaría de encontrar lo que la base guardó, y lo haría en silencio: por eso
 * hay una prueba que compara las dos contra la misma lista de nombres.
 */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave de comparación tal como la escribe el disparador. */
export function matchKeyOf(persona: {
  givenName: string;
  familyName: string;
  secondFamilyName?: string | null;
}): string {
  return normalizeForMatch(
    `${persona.givenName} ${persona.familyName} ${persona.secondFamilyName ?? ''}`,
  );
}

const nombre = (etiqueta: string, max = 80) =>
  z.string().trim().min(1, { error: () => `Escribe ${etiqueta}.` }).max(max);

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor));

const identidad = {
  givenName: nombre('el nombre'),
  middleName: opcional(80),
  familyName: nombre('el primer apellido'),
  secondFamilyName: opcional(80),
  preferredName: opcional(80),
  /**
   * Fecha de calendario, sin hora. Se guarda como `date` y por eso se compara
   * como texto: convertirla a instante la movería un día en media república
   * (ADR-0051).
   */
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 1990-05-17.' })
    .optional()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor)),
  genderIdentity: z.enum(['WOMAN', 'MAN', 'NON_BINARY', 'OTHER', 'UNDISCLOSED']).default('UNDISCLOSED'),
  nationality: opcional(60),
  primaryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor))
    .refine((valor) => valor === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor), {
      error: () => 'Escribe un correo electrónico válido o deja el campo vacío.',
    }),
  primaryPhone: opcional(40),
  alternateContact: opcional(200),
  addressLine: opcional(400),
  postalCode: opcional(15),
  stateCode: opcional(10),
  municipalityCode: opcional(15),
  territorialUnitId: z.uuid().optional(),
} as const;

export const registerPersonSchema = z.object({
  ...identidad,
  /**
   * Confirmación de que no es ninguna de las coincidencias que se mostraron.
   *
   * Empieza en falso a propósito: quien captura tiene que **ver** las
   * coincidencias antes de poder decir que no lo son.
   */
  confirmedDistinct: z.boolean().default(false),
});

export type RegisterPersonInput = z.input<typeof registerPersonSchema>;

export const updatePersonSchema = z.object({
  ...identidad,
  personId: z.uuid(),
  rowVersion: z.coerce.number().int().min(0),
});

export type UpdatePersonInput = z.input<typeof updatePersonSchema>;

export const mergePeopleSchema = z.object({
  /** La que se conserva. */
  keepPersonId: z.uuid({ error: () => 'Elige el registro que se conserva.' }),
  /** La que queda como remisión a la anterior. */
  mergePersonId: z.uuid({ error: () => 'Elige el registro duplicado.' }),
  reason: z
    .string()
    .trim()
    .min(20, { error: () => 'Explica en qué te basas para afirmar que son la misma persona. Mínimo veinte caracteres.' })
    .max(600),
});

export type MergePeopleInput = z.input<typeof mergePeopleSchema>;

/** Coincidencia encontrada, con la razón por la que se parece. */
export interface DuplicateCandidate {
  readonly personId: string;
  readonly publicId: string;
  readonly displayName: string;
  readonly birthDate: string | null;
  readonly territory: string | null;
  readonly hasAccount: boolean;
  readonly archived: boolean;
  /** Qué coincidió, en palabras. */
  readonly matchedOn: readonly string[];
  readonly strength: 'ALTA' | 'MEDIA';
}

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

function nombreCompleto(persona: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

interface CriteriosDeBusqueda {
  readonly givenName: string;
  readonly familyName: string;
  readonly secondFamilyName: string | null;
  readonly birthDate: string | null;
  readonly primaryEmail: string | null;
  readonly primaryPhone: string | null;
  readonly excludePersonId?: string;
}

/**
 * Busca registros que puedan ser la misma persona.
 *
 * El filtro va sobre `Person.matchKey`, que el motor mantiene sin acentos y en
 * minúsculas (ADR-0070): así «Guadalupe Muñoz» encuentra a «Guadalupe Munoz»,
 * que es el caso que más duplicados produce en México. Se compara por prefijo
 * —nombre y primer apellido— porque el segundo apellido falta muy a menudo, y
 * exigirlo dejaría fuera justo las capturas incompletas que hay que detectar.
 */
async function buscarCoincidencias(criterios: CriteriosDeBusqueda): Promise<DuplicateCandidate[]> {
  const prefijo = normalizeForMatch(`${criterios.givenName} ${criterios.familyName}`);
  const telefono = criterios.primaryPhone === null ? null : criterios.primaryPhone.replace(/\D/g, '');

  const posibles = await db().person.findMany({
    where: {
      OR: [
        { matchKey: { startsWith: prefijo } },
        ...(criterios.primaryEmail === null ? [] : [{ primaryEmail: criterios.primaryEmail }]),
        ...(telefono === null || telefono === '' ? [] : [{ primaryPhone: { contains: telefono } }]),
      ],
      ...(criterios.excludePersonId === undefined ? {} : { id: { not: criterios.excludePersonId } }),
    },
    take: 200,
    select: {
      id: true,
      publicId: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      birthDate: true,
      primaryEmail: true,
      primaryPhone: true,
      mergedIntoPersonId: true,
      archivedAt: true,
      territorialUnit: { select: { name: true } },
      user: { select: { id: true } },
    },
  });

  const candidatas: DuplicateCandidate[] = [];

  for (const posible of posibles) {
    const razones: string[] = [];
    let fuerte = false;

    if (criterios.primaryEmail !== null && posible.primaryEmail === criterios.primaryEmail) {
      razones.push('el mismo correo electrónico');
      fuerte = true;
    }

    if (telefono !== null && telefono !== '' && posible.primaryPhone !== null) {
      if (posible.primaryPhone.replace(/\D/g, '') === telefono) {
        razones.push('el mismo teléfono');
        fuerte = true;
      }
    }

    const mismoNombre = matchKeyOf(posible).startsWith(prefijo);

    if (mismoNombre) {
      const mismoSegundoApellido =
        normalizeForMatch(posible.secondFamilyName ?? '') ===
        normalizeForMatch(criterios.secondFamilyName ?? '');

      const fechaPosible = posible.birthDate === null ? null : posible.birthDate.toISOString().slice(0, 10);
      if (criterios.birthDate !== null && fechaPosible === criterios.birthDate) {
        razones.push('el mismo nombre y la misma fecha de nacimiento');
        fuerte = true;
      } else if (mismoSegundoApellido && criterios.secondFamilyName !== null) {
        razones.push('los dos apellidos y el nombre');
      } else {
        razones.push('el nombre y el primer apellido');
      }
    }

    if (razones.length === 0) continue;

    candidatas.push({
      personId: posible.id,
      publicId: posible.publicId,
      displayName: nombreCompleto(posible),
      birthDate: posible.birthDate === null ? null : posible.birthDate.toISOString().slice(0, 10),
      territory: posible.territorialUnit?.name ?? null,
      hasAccount: posible.user !== null,
      archived: posible.archivedAt !== null || posible.mergedIntoPersonId !== null,
      matchedOn: razones,
      strength: fuerte ? 'ALTA' : 'MEDIA',
    });
  }

  return candidatas.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'ALTA' ? -1 : 1));
}

/** Consulta explícita de posibles duplicados, para la pantalla de fusión. */
export async function findDuplicates(
  actor: ActorContext,
  input: { personId: string },
): Promise<UseCaseResult<{ person: DuplicateCandidate; candidates: readonly DuplicateCandidate[] }>> {
  const decision = can(actor, 'identity.person.read', { kind: 'Person', isBulk: true, containsPersonalData: true });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const persona = await db().person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      publicId: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      birthDate: true,
      primaryEmail: true,
      primaryPhone: true,
      archivedAt: true,
      mergedIntoPersonId: true,
      territorialUnit: { select: { name: true } },
      user: { select: { id: true } },
    },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));

  const candidatas = await buscarCoincidencias({
    givenName: persona.givenName,
    familyName: persona.familyName,
    secondFamilyName: persona.secondFamilyName,
    birthDate: persona.birthDate === null ? null : persona.birthDate.toISOString().slice(0, 10),
    primaryEmail: persona.primaryEmail,
    primaryPhone: persona.primaryPhone,
    excludePersonId: persona.id,
  });

  return ok({
    person: {
      personId: persona.id,
      publicId: persona.publicId,
      displayName: nombreCompleto(persona),
      birthDate: persona.birthDate === null ? null : persona.birthDate.toISOString().slice(0, 10),
      territory: persona.territorialUnit?.name ?? null,
      hasAccount: persona.user !== null,
      archived: persona.archivedAt !== null || persona.mergedIntoPersonId !== null,
      matchedOn: [],
      strength: 'ALTA',
    },
    candidates: candidatas,
  });
}

export interface RegisteredPerson {
  readonly personId: string;
  readonly publicId: string;
  readonly displayName: string;
}

/**
 * Alta del registro maestro.
 *
 * Devuelve `CONFLICT` con las coincidencias encontradas mientras no se confirme
 * expresamente que se trata de otra persona.
 */
export async function registerPerson(
  actor: ActorContext,
  input: RegisterPersonInput,
): Promise<UseCaseResult<RegisteredPerson>> {
  const parsed = registerPersonSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'identity.person.update', { kind: 'Person' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const datos = parsed.data;

  const coincidencias = await buscarCoincidencias({
    givenName: datos.givenName,
    familyName: datos.familyName,
    secondFamilyName: datos.secondFamilyName,
    birthDate: datos.birthDate,
    primaryEmail: datos.primaryEmail,
    primaryPhone: datos.primaryPhone,
  });

  const vivas = coincidencias.filter((candidata) => !candidata.archived);
  if (vivas.length > 0 && !datos.confirmedDistinct) {
    return fail(
      errors.conflict(
        vivas.length === 1
          ? `Ya hay un registro que coincide en ${vivas[0]!.matchedOn.join(' y ')}: ${vivas[0]!.displayName}. Revísalo antes de crear otro.`
          : `Hay ${vivas.length} registros que se parecen a esta persona. Revísalos antes de crear otro.`,
        `posible duplicidad: ${vivas.map((candidata) => candidata.publicId).join(', ')}`,
      ),
    );
  }

  const creada = await transaction(async (tx) => {
    const persona = await tx.person.create({
      data: {
        publicId: newPublicId(),
        givenName: datos.givenName,
        middleName: datos.middleName,
        familyName: datos.familyName,
        secondFamilyName: datos.secondFamilyName,
        preferredName: datos.preferredName,
        birthDate: datos.birthDate === null ? null : new Date(`${datos.birthDate}T00:00:00.000Z`),
        genderIdentity: datos.genderIdentity,
        nationality: datos.nationality,
        primaryEmail: datos.primaryEmail,
        primaryPhone: datos.primaryPhone,
        alternateContact: datos.alternateContact,
        addressLine: datos.addressLine,
        postalCode: datos.postalCode,
        stateCode: datos.stateCode,
        municipalityCode: datos.municipalityCode,
        territorialUnitId: datos.territorialUnitId ?? null,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, publicId: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.PERSON_CREATED,
      objectKind: 'Person',
      objectId: persona.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: persona.id,
      // Se guarda que hubo coincidencias y que alguien las descartó: es la única
      // forma de auditar después una duplicidad que se creó a sabiendas.
      metadata:
        vivas.length === 0
          ? { coincidencias: 0 }
          : { coincidencias: vivas.length, descartadas: vivas.map((c) => c.publicId) },
    });

    return persona;
  });

  return ok({
    personId: creada.id,
    publicId: creada.publicId,
    displayName: [datos.givenName, datos.familyName, datos.secondFamilyName]
      .filter((parte): parte is string => parte !== null && parte !== '')
      .join(' '),
  });
}

/** Edición del registro maestro, con concurrencia optimista. */
export async function updatePerson(
  actor: ActorContext,
  input: UpdatePersonInput,
): Promise<UseCaseResult<{ personId: string; rowVersion: number }>> {
  const parsed = updatePersonSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'identity.person.update', { kind: 'Person' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const datos = parsed.data;

  const actual = await db().person.findUnique({
    where: { id: datos.personId },
    select: { id: true, mergedIntoPersonId: true },
  });
  if (actual === null) return fail(errors.notFound('persona inexistente'));
  if (actual.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Este registro quedó fusionado con otro. Edita el registro que se conservó.',
        'la persona está fusionada',
      ),
    );
  }

  const actualizada = await transaction(async (tx) => {
    const filas = await tx.person.updateMany({
      where: { id: datos.personId, rowVersion: datos.rowVersion },
      data: {
        givenName: datos.givenName,
        middleName: datos.middleName,
        familyName: datos.familyName,
        secondFamilyName: datos.secondFamilyName,
        preferredName: datos.preferredName,
        birthDate: datos.birthDate === null ? null : new Date(`${datos.birthDate}T00:00:00.000Z`),
        genderIdentity: datos.genderIdentity,
        nationality: datos.nationality,
        primaryEmail: datos.primaryEmail,
        primaryPhone: datos.primaryPhone,
        alternateContact: datos.alternateContact,
        addressLine: datos.addressLine,
        postalCode: datos.postalCode,
        stateCode: datos.stateCode,
        municipalityCode: datos.municipalityCode,
        territorialUnitId: datos.territorialUnitId ?? null,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    if (filas.count === 0) return null;

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.PERSON_UPDATED,
      objectKind: 'Person',
      objectId: datos.personId,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: datos.personId,
    });

    return datos.rowVersion + 1;
  });

  if (actualizada === null) {
    return fail(
      errors.conflict(
        'Alguien más modificó este registro mientras lo editabas. Vuelve a abrirlo para ver los datos actuales.',
        'rowVersion no coincide',
      ),
    );
  }

  return ok({ personId: datos.personId, rowVersion: actualizada });
}

/**
 * Lo que se traslada al registro que se conserva.
 *
 * Todo lo operativo se mueve, porque la premisa de la fusión es que se trata del
 * mismo ser humano y su expediente tiene que quedar completo en un solo sitio.
 *
 * Lo que **no** aparece aquí y no es olvido:
 *
 *  · El directorio. Una preferencia de publicación no se edita ni se traspasa:
 *    se otorga. El motor lo impide y está bien que lo impida, así que la fusión
 *    retira la publicación del duplicado y revoca su preferencia. Quien quedó
 *    vuelve a decidir su aparición pública, que es de quien es esa decisión.
 *  · Las credenciales. El código firmado de una credencial acredita un registro
 *    concreto, con su nombre impreso; reapuntarla a otro registro sería cambiar
 *    lo que el QR afirma sin cambiar el QR. Se revocan, y el bloque de
 *    credenciales emite las nuevas.
 */
const TRASLADOS = [
  'membershipApplication',
  'membership',
  'protectedBeneficiary',
  'consent',
  'billingAccount',
  'fileObject',
  'notification',
  'supportRequest',
  'organizationUser',
  'professionalProfile',
] as const;

export interface MergeResult {
  readonly keptPersonId: string;
  readonly mergedPersonId: string;
  readonly movedRows: Readonly<Record<string, number>>;
  readonly accountDisabled: boolean;
  /** Publicaciones retiradas y credenciales revocadas por la fusión. */
  readonly withdrawn: { readonly directoryEntries: number; readonly credentials: number };
}

/**
 * Resuelve una duplicidad sin borrar historial (PRD §3.1).
 *
 * Qué hace, exactamente:
 *
 *  · Traslada al registro que se conserva todo lo operativo —membresías,
 *    solicitudes, expedientes, archivos, consentimientos, credenciales—.
 *  · Deja el registro duplicado **en pie**, marcado como fusionado y archivado.
 *    No se borra: los identificadores que ya circularon tienen que seguir
 *    resolviendo a algo, y ese algo tiene que decir a dónde fue la persona.
 *  · Si el duplicado tenía cuenta, la deshabilita y cierra sus sesiones. Una
 *    identidad fusionada que puede seguir entrando es dos personas otra vez.
 *
 * Qué **no** hace: fusionar cuando las dos tienen una membresía viva de la misma
 * categoría. Eso no es una duplicidad de captura; es una situación que alguien
 * tiene que resolver dando de baja una, con su motivo, antes de fusionar.
 */
export async function mergePeople(
  actor: ActorContext,
  input: MergePeopleInput,
): Promise<UseCaseResult<MergeResult>> {
  const parsed = mergePeopleSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const { keepPersonId, mergePersonId, reason } = parsed.data;

  if (keepPersonId === mergePersonId) {
    return fail(errors.validation({ mergePersonId: ['Son el mismo registro.'] }));
  }

  // El motivo lo pone el propio caso de uso a partir de su entrada validada, y
  // no se confía en que lo haya puesto quien llama. Un permiso que exige motivo
  // escrito y lo toma de un contexto que otra capa arma es un permiso que se
  // cumple solo si esa capa se acuerda.
  const conMotivo = withReason(actor, reason);

  const decision = can(conMotivo, 'identity.person.merge', { kind: 'Person' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const [conservada, duplicada] = await Promise.all([
    db().person.findUnique({
      where: { id: keepPersonId },
      select: { id: true, mergedIntoPersonId: true },
    }),
    db().person.findUnique({
      where: { id: mergePersonId },
      select: {
        id: true,
        mergedIntoPersonId: true,
        user: { select: { id: true, status: true } },
      },
    }),
  ]);

  if (conservada === null || duplicada === null) return fail(errors.notFound('persona inexistente'));
  if (conservada.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'El registro que quieres conservar ya está fusionado con otro. Elige el que quedó vivo.',
        'la persona conservada ya está fusionada',
      ),
    );
  }
  if (duplicada.mergedIntoPersonId !== null) {
    return fail(errors.conflict('Ese registro ya se fusionó antes.', 'duplicidad ya resuelta'));
  }

  // La cuenta del duplicado se deshabilita como parte de la fusión, así que
  // hace falta la facultad de deshabilitar cuentas. Ejercerla sin tenerla, por
  // venir de paso dentro de otra operación, es exactamente como se pierden los
  // límites de un permiso.
  const tieneCuentaViva = duplicada.user !== null && duplicada.user.status !== 'DISABLED';
  if (tieneCuentaViva) {
    const puedeDeshabilitar = can(conMotivo, 'identity.user.disable', { kind: 'User' });
    if (!puedeDeshabilitar.allowed) {
      return fail(
        errors.forbidden(
          explain(puedeDeshabilitar.reason!),
          'El registro duplicado tiene una cuenta activa y fusionarlo exige cerrarla. No tienes esa facultad.',
        ),
      );
    }
  }

  const categoriasVivas = await db().membership.findMany({
    where: { personId: { in: [keepPersonId, mergePersonId] }, status: 'ACTIVE' },
    select: { personId: true, category: true },
  });
  const enConflicto = categoriasVivas
    .filter((una) => una.personId === keepPersonId)
    .filter((una) => categoriasVivas.some((otra) => otra.personId === mergePersonId && otra.category === una.category));

  if (enConflicto.length > 0) {
    const etiqueta = enConflicto
      .map((una) => (una.category === 'UNION_MEMBER' ? 'agremiada' : 'honoraria'))
      .join(' y ');
    return fail(
      errors.conflict(
        `Los dos registros tienen una membresía ${etiqueta} activa. Da de baja una de las dos, con su motivo, antes de fusionar.`,
        'membresías activas de la misma categoría en ambos registros',
      ),
    );
  }

  const resultado = await transaction(async (tx) => {
    const movidas: Record<string, number> = {};
    for (const tabla of TRASLADOS) {
      movidas[tabla] = await trasladar(tx, tabla, mergePersonId, keepPersonId);
    }

    // El directorio y las credenciales del duplicado se retiran en vez de
    // moverse, por lo dicho arriba en `TRASLADOS`.
    const ahora = new Date();
    const publicaciones = await tx.directoryPublication.updateMany({
      where: { personId: mergePersonId, withdrawnAt: null },
      data: { withdrawnAt: ahora, indexable: false },
    });
    await tx.directoryPreference.updateMany({
      where: { personId: mergePersonId, revokedAt: null },
      data: { revokedAt: ahora },
    });
    const credenciales = await tx.memberCredential.updateMany({
      where: { personId: mergePersonId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      data: {
        status: 'REVOKED',
        revokedAt: ahora,
        revokeReason: `Fusión de registros duplicados: ${reason}`,
        updatedByActorId: actor.actorId,
      },
    });

    await tx.person.update({
      where: { id: mergePersonId },
      data: {
        mergedIntoPersonId: keepPersonId,
        archivedAt: new Date(),
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    let cuentaCerrada = false;
    if (duplicada.user !== null && duplicada.user.status !== 'DISABLED') {
      await tx.user.update({
        where: { id: duplicada.user.id },
        data: {
          status: 'DISABLED',
          sessionVersion: { increment: 1 },
          updatedByActorId: actor.actorId,
          rowVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId: duplicada.user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ADMIN_ACTION' },
      });
      await tx.roleAssignment.updateMany({
        where: { userId: duplicada.user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: `Fusión de registros duplicados: ${reason}` },
      });
      cuentaCerrada = true;
    }

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.PERSON_MERGED,
      objectKind: 'Person',
      objectId: mergePersonId,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: keepPersonId,
      reason,
      metadata: {
        conservada: keepPersonId,
        trasladadas: movidas,
        cuentaCerrada,
        publicacionesRetiradas: publicaciones.count,
        credencialesRevocadas: credenciales.count,
      },
    });

    return {
      movidas,
      cuentaCerrada,
      retiradas: { directoryEntries: publicaciones.count, credentials: credenciales.count },
    };
  });

  return ok({
    keptPersonId: keepPersonId,
    mergedPersonId: mergePersonId,
    movedRows: resultado.movidas,
    accountDisabled: resultado.cuentaCerrada,
    withdrawn: resultado.retiradas,
  });
}

/**
 * Reapunta las filas de una tabla al registro que se conserva.
 *
 * Se escribe con un mapa explícito y no con acceso dinámico al cliente para que
 * el compilador siga viendo qué tablas se tocan: una fusión que dejara filas
 * atrás sería una persona partida en dos, y el error no daría la cara hasta que
 * alguien echara de menos su expediente.
 */
async function trasladar(
  tx: Tx,
  tabla: (typeof TRASLADOS)[number],
  desde: string,
  hacia: string,
): Promise<number> {
  const where = { personId: desde };
  const data = { personId: hacia };
  switch (tabla) {
    case 'membershipApplication':
      return (await tx.membershipApplication.updateMany({ where, data })).count;
    case 'membership':
      return (await tx.membership.updateMany({ where, data })).count;
    case 'protectedBeneficiary':
      return (await tx.protectedBeneficiary.updateMany({ where, data })).count;
    case 'consent':
      return (await tx.consent.updateMany({ where, data })).count;
    case 'billingAccount':
      return (await tx.billingAccount.updateMany({ where, data })).count;
    case 'fileObject':
      return (await tx.fileObject.updateMany({ where: { ownerPersonId: desde }, data: { ownerPersonId: hacia } }))
        .count;
    case 'notification':
      return (await tx.notification.updateMany({ where, data })).count;
    case 'supportRequest':
      return (await tx.supportRequest.updateMany({ where, data })).count;
    case 'organizationUser':
      return (await tx.organizationUser.updateMany({ where, data })).count;
    case 'professionalProfile':
      return (await tx.professionalProfile.updateMany({ where, data })).count;
  }
}

/**
 * El registro maestro tal como el PRD §3.1 manda presentarlo: separado por
 * bloques, para que se vea que una sola persona sostiene todas sus relaciones.
 */
export interface PersonRecord {
  readonly personId: string;
  readonly publicId: string;
  readonly rowVersion: number;
  readonly identity: {
    readonly givenName: string;
    readonly middleName: string | null;
    readonly familyName: string;
    readonly secondFamilyName: string | null;
    readonly preferredName: string | null;
    readonly birthDate: string | null;
    readonly genderIdentity: string;
    readonly nationality: string | null;
  };
  readonly contact: {
    readonly primaryEmail: string | null;
    readonly primaryPhone: string | null;
    readonly alternateContact: string | null;
  };
  readonly address: {
    readonly addressLine: string | null;
    readonly postalCode: string | null;
    readonly stateCode: string | null;
    readonly municipalityCode: string | null;
    readonly territorialUnitId: string | null;
    readonly territory: string | null;
  };
  readonly account: { readonly hasAccount: boolean; readonly status: string | null };
  readonly qualities: readonly {
    readonly kind: 'MEMBRESIA' | 'BENEFICIARIA';
    readonly label: string;
    readonly status: string;
    readonly since: Date;
  }[];
  readonly relationships: readonly {
    readonly id: string;
    readonly kind: string;
    readonly otherPersonName: string;
    readonly direction: 'DESDE' | 'HACIA';
    readonly live: boolean;
  }[];
  readonly merge: { readonly mergedInto: string | null; readonly mergedFrom: readonly string[] };
}

/**
 * Lectura del registro maestro.
 *
 * Exige `identity.person.read`, y la máscara de campos del motor decide si el
 * contacto y el domicilio salen o no: quien puede administrar cuentas no
 * necesariamente puede leer dónde vive alguien (docs/PERMISSIONS.md §8).
 */
export async function personRecord(
  actor: ActorContext,
  input: { personId: string },
): Promise<UseCaseResult<PersonRecord>> {
  const decision = can(actor, 'identity.person.read', {
    kind: 'Person',
    id: input.personId,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const oculto = decision.fieldMask !== undefined;

  const persona = await db().person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      publicId: true,
      rowVersion: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      preferredName: true,
      birthDate: true,
      genderIdentity: true,
      nationality: true,
      primaryEmail: true,
      primaryPhone: true,
      alternateContact: true,
      addressLine: true,
      postalCode: true,
      stateCode: true,
      municipalityCode: true,
      territorialUnitId: true,
      mergedIntoPersonId: true,
      territorialUnit: { select: { name: true } },
      user: { select: { status: true } },
      mergedFrom: { select: { publicId: true } },
      memberships: {
        orderBy: { startedAt: 'desc' },
        select: {
          status: true,
          startedAt: true,
          membershipType: { select: { name: true } },
        },
      },
      beneficiaryRecords: {
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true, legalEntity: { select: { shortName: true } } },
      },
      careRelationshipsFrom: {
        select: {
          id: true,
          kind: true,
          revokedAt: true,
          toPerson: { select: { givenName: true, familyName: true, secondFamilyName: true, middleName: true } },
        },
      },
      careRelationshipsTo: {
        select: {
          id: true,
          kind: true,
          revokedAt: true,
          fromPerson: { select: { givenName: true, familyName: true, secondFamilyName: true, middleName: true } },
        },
      },
    },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));

  return ok({
    personId: persona.id,
    publicId: persona.publicId,
    rowVersion: persona.rowVersion,
    identity: {
      givenName: persona.givenName,
      middleName: persona.middleName,
      familyName: persona.familyName,
      secondFamilyName: persona.secondFamilyName,
      preferredName: persona.preferredName,
      birthDate: oculto || persona.birthDate === null ? null : persona.birthDate.toISOString().slice(0, 10),
      genderIdentity: persona.genderIdentity,
      nationality: persona.nationality,
    },
    contact: {
      primaryEmail: persona.primaryEmail,
      primaryPhone: oculto ? null : persona.primaryPhone,
      alternateContact: oculto ? null : persona.alternateContact,
    },
    address: {
      addressLine: oculto ? null : persona.addressLine,
      postalCode: oculto ? null : persona.postalCode,
      stateCode: oculto ? null : persona.stateCode,
      municipalityCode: oculto ? null : persona.municipalityCode,
      territorialUnitId: persona.territorialUnitId,
      territory: persona.territorialUnit?.name ?? null,
    },
    account: { hasAccount: persona.user !== null, status: persona.user?.status ?? null },
    qualities: [
      ...persona.memberships.map((membresia) => ({
        kind: 'MEMBRESIA' as const,
        label: membresia.membershipType.name,
        status: membresia.status,
        since: membresia.startedAt,
      })),
      ...persona.beneficiaryRecords.map((registro) => ({
        kind: 'BENEFICIARIA' as const,
        label: `Persona beneficiaria — ${registro.legalEntity.shortName}`,
        status: registro.status,
        since: registro.createdAt,
      })),
    ],
    relationships: [
      ...persona.careRelationshipsFrom.map((relacion) => ({
        id: relacion.id,
        kind: relacion.kind,
        otherPersonName: nombreCompleto(relacion.toPerson),
        direction: 'DESDE' as const,
        live: relacion.revokedAt === null,
      })),
      ...persona.careRelationshipsTo.map((relacion) => ({
        id: relacion.id,
        kind: relacion.kind,
        otherPersonName: nombreCompleto(relacion.fromPerson),
        direction: 'HACIA' as const,
        live: relacion.revokedAt === null,
      })),
    ],
    merge: {
      mergedInto: persona.mergedIntoPersonId,
      mergedFrom: persona.mergedFrom.map((otra) => otra.publicId),
    },
  });
}

export interface PersonSummary {
  readonly personId: string;
  readonly publicId: string;
  readonly displayName: string;
  readonly territory: string | null;
  readonly hasAccount: boolean;
  readonly qualities: readonly string[];
  readonly mergedInto: string | null;
}

/**
 * Búsqueda del registro maestro por nombre, correo o identificador público.
 *
 * Devuelve también los registros fusionados, marcados como tales: quien busca
 * por un identificador viejo tiene que encontrarlo y ver a dónde fue, no
 * quedarse sin resultados y volver a dar de alta a la misma persona.
 */
export async function searchPeople(
  actor: ActorContext,
  input: { query?: string; limit?: number } = {},
): Promise<UseCaseResult<PersonSummary[]>> {
  const decision = can(actor, 'identity.person.read', {
    kind: 'Person',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const texto = (input.query ?? '').trim();
  const filas = await db().person.findMany({
    take: Math.min(input.limit ?? 50, 200),
    orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }],
    ...(texto === ''
      ? {}
      : {
          where: {
            OR: [
              { givenName: { contains: texto, mode: 'insensitive' as const } },
              { familyName: { contains: texto, mode: 'insensitive' as const } },
              { secondFamilyName: { contains: texto, mode: 'insensitive' as const } },
              { primaryEmail: { contains: texto, mode: 'insensitive' as const } },
              { publicId: texto },
            ],
          },
        }),
    select: {
      id: true,
      publicId: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      mergedIntoPersonId: true,
      territorialUnit: { select: { name: true } },
      user: { select: { id: true } },
      memberships: {
        where: { status: 'ACTIVE' },
        select: { membershipType: { select: { name: true } } },
      },
      beneficiaryRecords: {
        where: { status: { notIn: ['CLOSED', 'ARCHIVED'] } },
        select: { id: true },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      personId: fila.id,
      publicId: fila.publicId,
      displayName: nombreCompleto(fila),
      territory: fila.territorialUnit?.name ?? null,
      hasAccount: fila.user !== null,
      qualities: [
        ...fila.memberships.map((membresia) => membresia.membershipType.name),
        ...(fila.beneficiaryRecords.length === 0 ? [] : ['Persona beneficiaria']),
      ],
      mergedInto: fila.mergedIntoPersonId,
    })),
  );
}
