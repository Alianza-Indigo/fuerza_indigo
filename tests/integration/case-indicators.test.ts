import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import { caseIndicators, openCase } from '@/modules/cases';
import { UMBRAL_DE_PRIVACIDAD, aplicarUmbral } from '@/modules/cases/domain';
import type { SupportRequestType } from '@prisma-client/enums';

/**
 * Indicadores anonimizados con umbral de privacidad
 * (PRD §24 Fase 6; F6-CAS-014).
 *
 * Cinco promesas que se comprueban ejecutando:
 *
 *  · Una celda por debajo del umbral **no se publica**, y se suprime entera.
 *  · **Cero sí se publica**: «ninguno» no identifica a nadie.
 *  · La **mediana** también pasa por el umbral: con dos casos detrás, la
 *    mediana es uno de los dos.
 *  · De los indicadores **no sale ningún identificador**.
 *  · Siguen acotados por compartimento y territorio, como todo lo demás.
 */

let base: TestDatabase;
let fuerzaId: string;
let mide: PersonaDePrueba;
let midePeroSocial: PersonaDePrueba;
let mideJalisco: PersonaDePrueba;
let jalisco: { id: string };
let nayarit: { id: string };

/**
 * Cada envío viene de un origen distinto.
 *
 * La entrada pública limita a cinco envíos por hora **desde el mismo origen**
 * (PRD §20.4), y estas pruebas necesitan más de cinco expedientes para pasar el
 * umbral de privacidad. Reutilizar una huella modelaría a una sola persona
 * escribiendo diez veces, que es justo lo que ese límite existe para cortar; lo
 * que las pruebas quieren decir es diez personas distintas.
 */
let envios = 0;
function contextoDeEnvio() {
  envios += 1;
  return { correlationId: `prueba-indicadores-${envios}`, ipHash: `huella-${envios}` };
}

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

const RANGO = { desde: '2020-01-01', hasta: '2099-12-31' };

beforeAll(async () => {
  base = await createTestDatabase('indicadores');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  const alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true },
  });
  jalisco = unidades[0]!;
  nayarit = unidades[1]!;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });

  mide = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Mide' });
  await nombrar(base.prisma, {
    userId: mide.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  midePeroSocial = await crearPersonaConCuenta(base.prisma, { givenName: 'Mide', familyName: 'Lo Social' });
  await nombrar(base.prisma, {
    userId: midePeroSocial.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });

  mideJalisco = await crearPersonaConCuenta(base.prisma, { givenName: 'Mide', familyName: 'Jalisco' });
  await nombrar(base.prisma, {
    userId: mideJalisco.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
    territorialUnitIds: [jalisco.id],
    includesDescendants: true,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of ['emergency_flag', 'case_event', 'case_assignment', 'case_participant', 'case_file', 'support_request']) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Abre un expediente de la materia y el territorio indicados. */
async function abrir(
  materia: SupportRequestType = 'INDIVIDUAL_LABOR_DISPUTE',
  territorio: string | null = null,
): Promise<string> {
  const enviado = await submitRequest(
    {
      requestType: materia,
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'Necesito ayuda con lo que me está pasando',
      narrative: RELATO,
      acceptedPrivacyNotice: true,
    },
    contextoDeEnvio(),
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });

  const canalizada = await confirmRouting(await contextoDe(base.prisma, mide), {
    requestId: solicitud.id,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'ROUTINE',
    territorialUnitId: territorio,
    note: 'Entra por la vía ordinaria de la asesoría laboral.',
  });
  if (!canalizada.ok) throw new Error(canalizada.error.message);

  const abierto = await openCase(await contextoDe(base.prisma, mide), {
    supportRequestId: solicitud.id,
    legalEntityId: fuerzaId,
    domain: 'UNION_DEFENSE',
    caseType: materia,
    priority: 'NORMAL',
    reason: 'Se abre el expediente para dar seguimiento a lo que la persona contó.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data.caseId;
}

describe('el umbral suprime la celda entera', () => {
  it('con menos expedientes que el umbral, la cifra no se publica', async () => {
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD - 1; i += 1) await abrir();

    const datos = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(datos.ok, datos.ok ? '' : datos.error.message).toBe(true);
    if (!datos.ok) return;

    const laboral = datos.data.porMateria.find((fila) => fila.materia === 'INDIVIDUAL_LABOR_DISPUTE');
    expect(laboral?.celda.publicable).toBe(false);
    // Y la pantalla puede decir cuántas se suprimieron: un hueco sin explicar
    // parece un error de cálculo, y quien lo lee pide «los datos completos».
    expect(datos.data.celdasSuprimidas).toBeGreaterThan(0);
  });

  it('al llegar al umbral, se publica', async () => {
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) await abrir();

    const datos = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(datos.ok).toBe(true);
    if (!datos.ok) return;

    const laboral = datos.data.porMateria.find((fila) => fila.materia === 'INDIVIDUAL_LABOR_DISPUTE');
    expect(laboral?.celda.publicable).toBe(true);
    if (laboral?.celda.publicable === true) expect(laboral.celda.valor).toBe(UMBRAL_DE_PRIVACIDAD);
  });

  it('cero sí se publica: «ninguno» no identifica a nadie', () => {
    const ninguno = aplicarUmbral(0);
    expect(ninguno.publicable).toBe(true);
    if (ninguno.publicable) expect(ninguno.valor).toBe(0);

    // Y uno no: ocultar el cero haría indistinguible «no hubo» de «hubo pocos».
    expect(aplicarUmbral(1).publicable).toBe(false);
  });

  it('la mediana también pasa por el umbral', async () => {
    // Dos expedientes valorados: la mediana sería uno de los dos.
    for (let i = 0; i < 2; i += 1) {
      const caseId = await abrir();
      await base.sql.query(`UPDATE "case_file" SET "firstResponseAt" = now() WHERE id = $1`, [caseId]);
    }

    const pocos = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(pocos.ok).toBe(true);
    if (pocos.ok) expect(pocos.data.medianaDePrimeraRespuestaEnHoras).toBeNull();

    // Con suficientes, sí sale.
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) {
      const caseId = await abrir();
      await base.sql.query(`UPDATE "case_file" SET "firstResponseAt" = now() WHERE id = $1`, [caseId]);
    }

    const suficientes = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(suficientes.ok).toBe(true);
    if (suficientes.ok) expect(suficientes.data.medianaDePrimeraRespuestaEnHoras).not.toBeNull();
  });
});

describe('de los indicadores no sale ningún identificador', () => {
  it('ni folios, ni identificadores públicos, ni nombres', async () => {
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) await abrir();

    const expedientes = await base.prisma.case.findMany({ select: { folio: true, publicId: true, id: true } });
    const datos = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(datos.ok).toBe(true);
    if (!datos.ok) return;

    const serializado = JSON.stringify(datos.data);
    for (const expediente of expedientes) {
      expect(serializado).not.toContain(expediente.folio);
      expect(serializado).not.toContain(expediente.publicId);
      expect(serializado).not.toContain(expediente.id);
    }
    expect(serializado).not.toContain('Quien Escribe');
  });

  it('un rango al revés se rechaza en vez de devolver cualquier cosa', async () => {
    const intento = await caseIndicators(await contextoDe(base.prisma, mide), {
      desde: '2030-01-01',
      hasta: '2020-01-01',
    });
    expect(intento.ok).toBe(false);
  });
});

describe('los indicadores no son el sistema visto desde arriba', () => {
  it('quien mide el lado social no cuenta expedientes sindicales', async () => {
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) await abrir();

    const social = await caseIndicators(await contextoDe(base.prisma, midePeroSocial), RANGO);
    expect(social.ok, social.ok ? '' : social.error.message).toBe(true);
    if (!social.ok) return;

    // Su compartimento es otro: no hay nada que contar, y eso no es un error.
    const total = social.data.porMateria.reduce(
      (suma, fila) => suma + (fila.celda.publicable ? fila.celda.valor : 0),
      0,
    );
    expect(total).toBe(0);
  });

  it('quien mide un territorio no cuenta los de otro', async () => {
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) await abrir('INDIVIDUAL_LABOR_DISPUTE', jalisco.id);
    for (let i = 0; i < UMBRAL_DE_PRIVACIDAD; i += 1) await abrir('INDIVIDUAL_LABOR_DISPUTE', nayarit.id);

    const acotado = await caseIndicators(await contextoDe(base.prisma, mideJalisco), RANGO);
    expect(acotado.ok, acotado.ok ? '' : acotado.error.message).toBe(true);
    if (!acotado.ok) return;

    const suyos = acotado.data.porMateria.find((fila) => fila.materia === 'INDIVIDUAL_LABOR_DISPUTE');
    expect(suyos?.celda.publicable).toBe(true);
    if (suyos?.celda.publicable === true) expect(suyos.celda.valor).toBe(UMBRAL_DE_PRIVACIDAD);

    // Sin acotación, los diez.
    const completo = await caseIndicators(await contextoDe(base.prisma, mide), RANGO);
    expect(completo.ok).toBe(true);
    if (!completo.ok) return;
    const todos = completo.data.porMateria.find((fila) => fila.materia === 'INDIVIDUAL_LABOR_DISPUTE');
    if (todos?.celda.publicable === true) expect(todos.celda.valor).toBe(UMBRAL_DE_PRIVACIDAD * 2);
  });

  it('quien no tiene la facultad no consulta indicadores', async () => {
    const sinFacultad = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultad' });

    const intento = await caseIndicators(await contextoDe(base.prisma, sinFacultad), RANGO);
    expect(intento.ok).toBe(false);
  });
});
