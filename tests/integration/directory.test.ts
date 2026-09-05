import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import {
  exportInternalDirectory,
  internalDirectory,
  myDirectoryState,
  publicDirectory,
  publicEntry,
  publishDirectoryEntry,
  registerBeneficiary,
  setDirectoryPreference,
  withdrawDirectoryConsent,
} from '@/modules/membership';
import { publishConsentVersion } from '@/platform/consent';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Directorio interno, publicación pública y retiro (PRD §7.2, §7.3;
 * F4-DIR-001 a F4-DIR-003).
 *
 * La promesa que se prueba: **el directorio público se deriva exclusivamente de
 * autorizaciones expresas**, y retirar la autorización lo retira de verdad.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('directorio');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Directorio',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  // El texto de consentimiento para el directorio se publica: la semilla lo
  // deja en borrador a propósito, y sin él nadie puede autorizar nada.
  const texto = await base.prisma.consentVersion.findFirstOrThrow({
    where: { code: 'CONSENT_DIRECTORY_PUBLICATION' },
    select: { id: true },
  });
  const publicado = await publishConsentVersion(secretaria, {
    consentVersionId: texto.id,
    effectiveFrom: '2026-01-01',
  });
  if (!publicado.ok) throw publicado.error;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

let contador = 0;

/** Una persona agremiada con cuenta y contexto propio. */
async function agremiada(nombre: string, opciones: { birthDate?: Date } = {}) {
  contador += 1;
  const persona = await crearPersonaConCuenta(base.prisma, {
    givenName: `${nombre}${contador}`,
    familyName: 'Del Directorio',
  });
  if (opciones.birthDate !== undefined) {
    await base.prisma.person.update({
      where: { id: persona.personId },
      data: { birthDate: opciones.birthDate },
    });
  }
  await nombrar(base.prisma, {
    userId: persona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  await crearMembresia(base.prisma, {
    personId: persona.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
  });
  return { persona, suyo: await contextoDe(base.prisma, persona) };
}

describe('directorio interno (F4-DIR-001)', () => {
  it('trae a quien tiene membresía, y no al registro maestro entero', async () => {
    const { persona } = await agremiada('Aparece');
    const suelta = await crearPersonaConCuenta(base.prisma, {
      givenName: 'NoAfiliada',
      familyName: 'Del Registro',
    });

    const listado = await internalDirectory(secretaria);
    expect(listado.ok, listado.ok ? '' : JSON.stringify(listado.error)).toBe(true);
    if (!listado.ok) return;

    const ids = listado.data.map((fila) => fila.personId);
    expect(ids).toContain(persona.personId);
    expect(ids).not.toContain(suelta.personId);
  });

  it('quien sostiene dos calidades ocupa dos filas distinguibles', async () => {
    // Defecto `D-F4-016`: la fila es una membresía, no una persona. Quien es
    // agremiada y honoraria a la vez aparece dos veces, y si la pantalla las
    // identifica por la persona acaba con dos hijos con la misma clave: React
    // puede duplicar una y omitir la otra. Lo que distingue a las dos filas es
    // el número de miembro, que es único por membresía.
    const { persona } = await agremiada('DosCalidades');
    await crearMembresia(base.prisma, {
      personId: persona.personId,
      legalEntityId: entidadId,
      typeCode: 'AFILIADO_HONORARIO',
    });

    const listado = await internalDirectory(secretaria);
    expect(listado.ok, listado.ok ? '' : JSON.stringify(listado.error)).toBe(true);
    if (!listado.ok) return;

    const suyas = listado.data.filter((fila) => fila.personId === persona.personId);
    expect(suyas).toHaveLength(2);
    expect(new Set(suyas.map((fila) => fila.memberNumber)).size).toBe(2);
    expect(new Set(suyas.map((fila) => fila.category))).toEqual(
      new Set(['UNION_MEMBER', 'HONORARY_AFFILIATE']),
    );
  });

  it('la situación de cuotas solo sale para quien puede leer pagos (PRD §7.2)', async () => {
    await agremiada('ConCuotas');

    const comoSecretaria = await internalDirectory(secretaria);
    expect(comoSecretaria.ok).toBe(true);
    if (!comoSecretaria.ok) return;
    // La Secretaría Ejecutiva sí lee pagos.
    expect(comoSecretaria.data.some((fila) => fila.duesStatus !== null)).toBe(true);

    // Una persona agremiada ve el directorio interno y no las cuotas ajenas.
    const { suyo } = await agremiada('SinCuotas');
    const comoAgremiada = await internalDirectory(suyo);
    expect(comoAgremiada.ok, comoAgremiada.ok ? '' : JSON.stringify(comoAgremiada.error)).toBe(true);
    if (!comoAgremiada.ok) return;
    expect(comoAgremiada.data.every((fila) => fila.duesStatus === null)).toBe(true);
  });

  it('exportar exige motivo y respeta el alcance de quien exporta', async () => {
    const sinMotivo = await exportInternalDirectory(secretaria, { reason: 'porque sí' });
    expect(sinMotivo.ok).toBe(false);

    const exportado = await exportInternalDirectory(secretaria, {
      reason: 'Se comparte con la comisión de organización para preparar la asamblea de octubre.',
    });
    expect(exportado.ok, exportado.ok ? '' : JSON.stringify(exportado.error)).toBe(true);
    if (!exportado.ok) return;
    expect(exportado.data.fileName).toMatch(/directorio-interno-.*\.csv/);
    expect(exportado.data.content).toContain('situacion_de_cuotas');

    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'directory.internal.exported' },
      orderBy: { occurredAt: 'desc' },
      select: { reason: true },
    });
    expect(asiento.reason).toMatch(/comisión de organización/);
  });

  it('quien no tiene la facultad no lee el directorio', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Directorio' });
    await nombrar(base.prisma, {
      userId: quien.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, quien);

    const intento = await internalDirectory(suyo);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('el directorio público se deriva de autorizaciones expresas (F4-DIR-002)', () => {
  it('nadie aparece sin haberlo autorizado', async () => {
    const { persona } = await agremiada('NoAutoriza');
    const publico = await publicDirectory();
    expect(publico.some((ficha) => JSON.stringify(ficha.fields).includes(persona.personId))).toBe(false);

    // Y publicar sin preferencia se rechaza con una razón, no en silencio.
    const intento = await publishDirectoryEntry(secretaria, { personId: persona.personId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });

  it('la persona elige cuánto se ve, y solo eso se publica', async () => {
    const { persona, suyo } = await agremiada('Autoriza');

    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    expect(preferencia.ok, preferencia.ok ? '' : JSON.stringify(preferencia.error)).toBe(true);

    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    expect(publicada.ok, publicada.ok ? '' : JSON.stringify(publicada.error)).toBe(true);
    if (!publicada.ok) return;

    const ficha = await publicEntry(publicada.data.slug);
    expect(ficha).not.toBeNull();
    expect(ficha?.fields['nombre']).toContain('Autoriza');
    // Eligió nombre y territorio: el perfil profesional no viaja.
    expect(ficha?.fields['titular']).toBeUndefined();
    expect(ficha?.fields['correoProfesional']).toBeUndefined();
    // Y sin autorizar indexación, no es indexable.
    expect(ficha?.indexable).toBe(false);
  });

  it('la indexación es una autorización aparte de aparecer', async () => {
    const { persona, suyo } = await agremiada('Indexa');
    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
      allowSearchEngineIndexing: true,
    });
    if (!preferencia.ok) throw preferencia.error;

    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    if (!publicada.ok) throw publicada.error;
    expect(publicada.data.indexable).toBe(true);
  });

  it('marcar la indexación sin aparecer no guarda una autorización que no autoriza nada', async () => {
    const { persona, suyo } = await agremiada('Oculta');
    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'HIDDEN',
      allowSearchEngineIndexing: true,
    });
    if (!preferencia.ok) throw preferencia.error;

    const fila = await base.prisma.directoryPreference.findFirstOrThrow({
      where: { personId: persona.personId, revokedAt: null },
      select: { allowSearchEngineIndexing: true },
    });
    expect(fila.allowSearchEngineIndexing).toBe(false);
  });

  it('no se publica a una persona menor de edad (PRD §7.3)', async () => {
    const hoy = new Date();
    const { persona, suyo } = await agremiada('Menor', {
      birthDate: new Date(Date.UTC(hoy.getUTCFullYear() - 15, hoy.getUTCMonth(), hoy.getUTCDate())),
    });

    const intento = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) {
      expect(intento.error.code).toBe('RULE_VIOLATION');
      expect(intento.error.message).toMatch(/menores de edad/i);
    }
  });

  it('no se publica a quien tiene una atención con privacidad reforzada', async () => {
    const { persona, suyo } = await agremiada('Protegida');
    const atencion = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Pidió acompañamiento y su expediente lleva privacidad reforzada.',
    });
    if (!atencion.ok) throw atencion.error;

    const intento = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toMatch(/privacidad reforzada/i);
  });

  it('sin texto de consentimiento publicado no se autoriza nada', async () => {
    const versiones = await base.prisma.consentVersion.findMany({
      where: { code: 'CONSENT_DIRECTORY_PUBLICATION', status: 'PUBLISHED' },
      select: { id: true },
    });
    await base.sql.query(`UPDATE consent_version SET status = 'DRAFT' WHERE id = ANY($1::uuid[])`, [
      versiones.map((una) => una.id),
    ]);

    const { persona, suyo } = await agremiada('SinTexto');
    const intento = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toMatch(/texto de consentimiento publicado/i);

    await base.sql.query(`UPDATE consent_version SET status = 'PUBLISHED' WHERE id = ANY($1::uuid[])`, [
      versiones.map((una) => una.id),
    ]);
  });
});

describe('retirar la autorización lo retira de verdad (F4-DIR-003)', () => {
  it('la ficha desaparece del directorio y deja de ser indexable', async () => {
    const { persona, suyo } = await agremiada('Retira');
    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'PROFESSIONAL_PROFILE',
      allowSearchEngineIndexing: true,
    });
    if (!preferencia.ok) throw preferencia.error;
    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    if (!publicada.ok) throw publicada.error;

    expect(await publicEntry(publicada.data.slug)).not.toBeNull();

    const retirada = await withdrawDirectoryConsent(suyo, {
      personId: persona.personId,
      reason: 'Ya no quiero aparecer.',
    });
    expect(retirada.ok, retirada.ok ? '' : JSON.stringify(retirada.error)).toBe(true);
    if (!retirada.ok) return;
    expect(retirada.data.withdrawn).toBe(1);
    // Devuelve las direcciones para que la capa web invalide su caché: sin eso
    // la página seguiría en pie hasta que alguien la recargara.
    expect(retirada.data.paths).toContain(`/directorio/${publicada.data.slug}`);

    // Ya no se sirve, ni sale en el listado.
    expect(await publicEntry(publicada.data.slug)).toBeNull();
    const publico = await publicDirectory();
    expect(publico.some((ficha) => ficha.slug === publicada.data.slug)).toBe(false);

    // Pero la evidencia queda: la fila sigue, marcada como retirada.
    const fila = await base.prisma.directoryPublication.findFirstOrThrow({
      where: { slug: publicada.data.slug },
      select: { withdrawnAt: true, indexable: true },
    });
    expect(fila.withdrawnAt).not.toBeNull();
    expect(fila.indexable).toBe(false);
  });

  it('el acuse del retiro sobrevive al formulario que se lleva por delante', async () => {
    // Defecto `D-F4-015`: el acuse vivía dentro del formulario de retirar, y ese
    // formulario desaparece con el retiro —ya no queda nada que retirar—. Quien
    // ejercía su derecho se quedaba sin ninguna constancia de haberlo ejercido.
    const { persona, suyo } = await agremiada('Acusa');

    const antes = await myDirectoryState(suyo, persona.personId);
    if (!antes.ok) throw antes.error;
    expect(antes.data.withdrawnAt).toBeNull();

    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    if (!preferencia.ok) throw preferencia.error;
    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    if (!publicada.ok) throw publicada.error;

    // Mientras está publicada no hay retiro que acusar.
    const publicadaEstado = await myDirectoryState(suyo, persona.personId);
    if (!publicadaEstado.ok) throw publicadaEstado.error;
    expect(publicadaEstado.data.publishedSlug).toBe(publicada.data.slug);
    expect(publicadaEstado.data.withdrawnAt).toBeNull();

    const retirada = await withdrawDirectoryConsent(suyo, {
      personId: persona.personId,
      reason: 'Prefiero no aparecer.',
    });
    if (!retirada.ok) throw retirada.error;

    // Y después el hecho está ahí para contarlo, tantas veces como se recargue.
    const despues = await myDirectoryState(suyo, persona.personId);
    if (!despues.ok) throw despues.error;
    expect(despues.data.publishedSlug).toBeNull();
    expect(despues.data.withdrawnAt).not.toBeNull();

    const otraVez = await myDirectoryState(suyo, persona.personId);
    if (!otraVez.ok) throw otraVez.error;
    expect(otraVez.data.withdrawnAt).not.toBeNull();
  });

  it('retirar dos veces no finge que había algo que retirar', async () => {
    const { persona, suyo } = await agremiada('Dos');
    const preferencia = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'NAME_AND_TERRITORY',
    });
    if (!preferencia.ok) throw preferencia.error;
    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    if (!publicada.ok) throw publicada.error;

    const primera = await withdrawDirectoryConsent(suyo, {
      personId: persona.personId,
      reason: 'Prefiero no aparecer.',
    });
    if (!primera.ok) throw primera.error;

    const segunda = await withdrawDirectoryConsent(suyo, {
      personId: persona.personId,
      reason: 'Prefiero no aparecer.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('cambiar de preferencia retira lo publicado antes', async () => {
    const { persona, suyo } = await agremiada('Cambia');
    const primera = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'PROFESSIONAL_PROFILE',
    });
    if (!primera.ok) throw primera.error;
    const publicada = await publishDirectoryEntry(suyo, { personId: persona.personId });
    if (!publicada.ok) throw publicada.error;

    const segunda = await setDirectoryPreference(suyo, {
      personId: persona.personId,
      visibility: 'HIDDEN',
    });
    expect(segunda.ok, segunda.ok ? '' : JSON.stringify(segunda.error)).toBe(true);

    // Al elegir no aparecer, lo que estaba publicado deja de estarlo en el acto.
    expect(await publicEntry(publicada.data.slug)).toBeNull();

    const estado = await myDirectoryState(suyo, persona.personId);
    expect(estado.ok).toBe(true);
    if (!estado.ok) return;
    expect(estado.data.visibility).toBe('HIDDEN');
    expect(estado.data.publishedSlug).toBeNull();
  });

  it('nadie decide sobre la ficha de otra persona sin la facultad', async () => {
    const { persona } = await agremiada('Ajena');
    const { suyo: deOtra } = await agremiada('Entrometida');

    const intento = await setDirectoryPreference(deOtra, {
      personId: persona.personId,
      visibility: 'PROFESSIONAL_PROFILE',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});
