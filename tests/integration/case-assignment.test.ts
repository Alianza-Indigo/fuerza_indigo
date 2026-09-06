import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest, territoriesForRouting } from '@/modules/support';
import { assignableUsers, assignCase, caseDetail, caseList, openCase, unassignCase } from '@/modules/cases';

/**
 * Asignación por territorio y competencia (PRD §10.3; alcance de la Fase 6).
 *
 * Cuatro promesas que se comprueban ejecutando:
 *
 *  · El territorio del expediente **se resuelve al canalizar**, mirando lo que
 *    la persona escribió, y el expediente lo hereda. No se teclea dos veces.
 *  · Llevar un expediente exige **competencia y territorio**: se rechaza a quien
 *    no tiene la materia y a quien la tiene fuera de su alcance.
 *  · El acceso se deniega para **territorios ajenos**, tanto en la lista como en
 *    el detalle, y las dos vías usan el mismo alcance.
 *  · Un expediente **nunca queda sin nadie a cargo**: relevar al último
 *    responsable se niega, y nombrar al siguiente releva al anterior.
 */

let base: TestDatabase;
let fuerzaId: string;
let coordina: PersonaDePrueba;
let delegadaJalisco: PersonaDePrueba;
let delegadaNayarit: PersonaDePrueba;
let personalSocial: PersonaDePrueba;
let socialDeFuerza: PersonaDePrueba;
let jalisco: { id: string; path: string; name: string };
let nayarit: { id: string; path: string; name: string };

const CONTEXTO = { correlationId: 'prueba-asignacion', ipHash: 'huella-de-asignacion' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Trabajo en Guadalajara desde hace cuatro años y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('asignacion');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  const alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true, path: true, name: true },
  });
  jalisco = unidades[0]!;
  nayarit = unidades[1]!;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });

  // Coordina sin acotación territorial: reparte los expedientes de la entidad.
  coordina = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Coordina' });
  await nombrar(base.prisma, {
    userId: coordina.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  delegadaJalisco = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'De Jalisco' });
  await nombrar(base.prisma, {
    userId: delegadaJalisco.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
    territorialUnitIds: [jalisco.id],
    includesDescendants: true,
  });

  delegadaNayarit = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'De Nayarit' });
  await nombrar(base.prisma, {
    userId: delegadaNayarit.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
    territorialUnitIds: [nayarit.id],
    includesDescendants: true,
  });

  // Competencia social, en la otra entidad: nunca puede llevar defensa sindical.
  personalSocial = await crearPersonaConCuenta(base.prisma, { givenName: 'Personal', familyName: 'Social' });
  await nombrar(base.prisma, {
    userId: personalSocial.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });

  // Atención social **dentro del sindicato**, sin acotación territorial. Es
  // quien separa de verdad las dos comprobaciones: la entidad coincide y el
  // territorio le alcanza, así que lo único que puede excluirla del expediente
  // sindical es el compartimento.
  socialDeFuerza = await crearPersonaConCuenta(base.prisma, { givenName: 'Atención', familyName: 'Social De Fuerza' });
  await nombrar(base.prisma, {
    userId: socialDeFuerza.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
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
  for (const tabla of ['case_event', 'case_assignment', 'case_participant', 'case_file', 'support_request']) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Recibe un mensaje por la entrada pública y devuelve su identificador. */
async function recibir(): Promise<string> {
  const enviado = await submitRequest(
    {
      requestType: 'INDIVIDUAL_LABOR_DISPUTE',
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'Me despidieron tras pedir un ajuste',
      narrative: RELATO,
      territoryHint: 'Vivo por el centro de Guadalajara',
      acceptedPrivacyNotice: true,
    },
    CONTEXTO,
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const fila = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });
  return fila.id;
}

/** Canaliza resolviendo el territorio, como hace la pantalla de valoración. */
async function canalizar(requestId: string, territorialUnitId: string | null): Promise<void> {
  const confirmada = await confirmRouting(await contextoDe(base.prisma, coordina), {
    requestId,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'PRIORITY',
    territorialUnitId,
    note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral del territorio.',
  });
  if (!confirmada.ok) throw new Error(confirmada.error.message);
}

/** Abre un expediente ya canalizado en el territorio indicado. */
async function abrir(territorialUnitId: string | null): Promise<{ caseId: string; publicId: string; folio: string }> {
  const requestId = await recibir();
  await canalizar(requestId, territorialUnitId);
  const abierto = await openCase(await contextoDe(base.prisma, coordina), {
    supportRequestId: requestId,
    legalEntityId: fuerzaId,
    domain: 'UNION_DEFENSE',
    caseType: 'INDIVIDUAL_LABOR_DISPUTE',
    priority: 'HIGH',
    reason: 'Hay plazo para impugnar el despido y hace falta expediente.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data;
}

describe('el territorio se resuelve al canalizar y el expediente lo hereda', () => {
  it('lo que la persona escribió se convierte en unidad territorial al confirmar', async () => {
    const requestId = await recibir();
    await canalizar(requestId, jalisco.id);

    const solicitud = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { territorialUnitId: true, territoryHint: true },
    });
    // Lo que escribió no se borra: al lado queda lo que se determinó que era.
    expect(solicitud.territoryHint).toContain('Guadalajara');
    expect(solicitud.territorialUnitId).toBe(jalisco.id);
  });

  it('el expediente hereda el territorio sin que nadie lo vuelva a teclear', async () => {
    const { caseId } = await abrir(jalisco.id);

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { territorialUnitId: true },
    });
    expect(fila.territorialUnitId).toBe(jalisco.id);
  });

  it('abrir en un territorio distinto del canalizado se niega y lo explica', async () => {
    const requestId = await recibir();
    await canalizar(requestId, jalisco.id);

    const intento = await openCase(await contextoDe(base.prisma, coordina), {
      supportRequestId: requestId,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      territorialUnitId: nayarit.id,
      priority: 'NORMAL',
      reason: 'Intento de abrirlo en un territorio que no es el que se canalizó.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('territorio distinto');
  });

  it('el catálogo territorial que ofrece la pantalla exige la facultad de valorar', async () => {
    const propio = await territoriesForRouting(await contextoDe(base.prisma, coordina));
    expect(propio.ok, propio.ok ? '' : propio.error.message).toBe(true);
    if (propio.ok) expect(propio.data.length).toBeGreaterThan(0);

    // Quien no valora mensajes no obtiene de paso el padrón de delegaciones.
    // La delegación territorial lleva expedientes y no clasifica la entrada
    // pública: por ahí no llega al catálogo.
    const ajeno = await territoriesForRouting(await contextoDe(base.prisma, delegadaJalisco));
    expect(ajeno.ok).toBe(false);
  });
});

describe('llevar un expediente exige competencia y territorio', () => {
  it('la lista de candidaturas trae a quien alcanza el territorio y no a quien no', async () => {
    const { caseId } = await abrir(jalisco.id);

    const candidatas = await assignableUsers(await contextoDe(base.prisma, coordina), caseId);
    expect(candidatas.ok, candidatas.ok ? '' : candidatas.error.message).toBe(true);
    if (!candidatas.ok) return;

    const identificadores = candidatas.data.map((candidata) => candidata.userId);
    expect(identificadores).toContain(delegadaJalisco.userId);
    expect(identificadores).not.toContain(delegadaNayarit.userId);
    // Quien coordina no está acotada territorialmente: alcanza cualquiera.
    expect(identificadores).toContain(coordina.userId);
    // Y el personal social no aparece: el de la otra entidad porque es otra
    // entidad, y el de esta porque un expediente sindical no es suyo aunque
    // comparta entidad y territorio.
    expect(identificadores).not.toContain(personalSocial.userId);
    expect(identificadores).not.toContain(socialDeFuerza.userId);
  });

  it('la carga de cada quien se enseña, para que el reparto no caiga siempre en la misma', async () => {
    const primero = await abrir(jalisco.id);
    const segundo = await abrir(jalisco.id);

    for (const expediente of [primero, segundo]) {
      const hecho = await assignCase(await contextoDe(base.prisma, coordina), {
        caseId: expediente.caseId,
        userId: delegadaJalisco.userId,
        assignmentRole: 'SUPPORT',
        reason: 'Es la delegación que atiende ese territorio y conoce el asunto.',
      });
      expect(hecho.ok, hecho.ok ? '' : hecho.error.message).toBe(true);
    }

    const tercero = await abrir(jalisco.id);
    const candidatas = await assignableUsers(await contextoDe(base.prisma, coordina), tercero.caseId);
    expect(candidatas.ok).toBe(true);
    if (!candidatas.ok) return;

    const jaliscoFila = candidatas.data.find((fila) => fila.userId === delegadaJalisco.userId);
    expect(jaliscoFila?.cargaActual).toBe(2);
    // Y viene primero quien menos lleva, no quien se registró antes.
    expect(candidatas.data[0]?.cargaActual).toBeLessThanOrEqual(jaliscoFila?.cargaActual ?? 0);
  });

  it('asignar fuera del territorio se niega, aunque sobren facultades', async () => {
    const { caseId } = await abrir(jalisco.id);

    const intento = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaNayarit.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Intento de encomendarlo a una delegación de otro territorio.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('territorio');

    expect(
      await base.prisma.caseAssignment.count({ where: { caseId, userId: delegadaNayarit.userId } }),
    ).toBe(0);
  });

  it('asignar sin competencia en la materia se niega antes de crear la asignación', async () => {
    const { caseId } = await abrir(jalisco.id);

    // Misma entidad y territorio alcanzado: lo único que la deja fuera es que
    // un expediente de defensa sindical no es de atención social. Es la
    // separación que el PRD §10.3 exige entre los dos expedientes.
    const intento = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: socialDeFuerza.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Intento de encomendar un expediente sindical a personal de atención social.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('facultad');

    // Lo que importa es que **no queda** una asignación que el motor rechazaría
    // después: una carpeta con nombre encima y nada dentro.
    expect(await base.prisma.caseAssignment.count({ where: { caseId, userId: socialDeFuerza.userId } })).toBe(0);
  });

  it('y la de otra entidad tampoco entra, ni con la materia a favor', async () => {
    const { caseId } = await abrir(null);

    const intento = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: personalSocial.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Intento de encomendarlo a alguien nombrado en la otra persona moral.',
    });
    expect(intento.ok).toBe(false);
  });

  it('un expediente sin territorio lo puede llevar cualquiera con competencia', async () => {
    const { caseId } = await abrir(null);

    const hecho = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaNayarit.userId,
      assignmentRole: 'SUPPORT',
      reason: 'El asunto no ocurre en ningún territorio concreto y lo lleva quien tiene hueco.',
    });
    expect(hecho.ok, hecho.ok ? '' : hecho.error.message).toBe(true);
  });

  it('la misma persona no entra dos veces con papeles distintos', async () => {
    const { caseId } = await abrir(jalisco.id);

    const primera = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaJalisco.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Entra al equipo para trabajar el expediente junto a quien responde.',
    });
    expect(primera.ok, primera.ok ? '' : primera.error.message).toBe(true);

    const segunda = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaJalisco.userId,
      assignmentRole: 'SUPERVISOR',
      reason: 'Intento de darle además el papel de supervisión sin relevarla antes.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.message).toContain('ya figura en el equipo');
  });
});

describe('el territorio ajeno no se alcanza ni por la lista ni por el detalle', () => {
  it('quien lleva un expediente fuera de su alcance no lo ve al abrirlo', async () => {
    const { caseId, publicId } = await abrir(nayarit.id);

    // La asignación se fuerza en la base, saltándose el caso de uso: es
    // exactamente lo que pasaría si el alcance del nombramiento se recortara
    // **después** de asignar, y es donde el motor tiene que sostener la
    // frontera por su cuenta.
    await base.prisma.caseAssignment.create({
      data: {
        caseId,
        userId: delegadaJalisco.userId,
        assignmentRole: 'SUPPORT',
        assignedById: coordina.userId,
        createdByActorId: coordina.actorId,
        updatedByActorId: coordina.actorId,
      },
    });

    const intento = await caseDetail(await contextoDe(base.prisma, delegadaJalisco), publicId);
    expect(intento.ok).toBe(false);
  });

  it('y tampoco sale en su lista: el filtro y la comprobación usan el mismo alcance', async () => {
    const propio = await abrir(jalisco.id);
    const ajeno = await abrir(nayarit.id);

    for (const expediente of [propio, ajeno]) {
      await base.prisma.caseAssignment.create({
        data: {
          caseId: expediente.caseId,
          userId: delegadaJalisco.userId,
          assignmentRole: 'SUPPORT',
          assignedById: coordina.userId,
          createdByActorId: coordina.actorId,
          updatedByActorId: coordina.actorId,
        },
      });
    }

    const lista = await caseList(await contextoDe(base.prisma, delegadaJalisco));
    expect(lista.ok, lista.ok ? '' : lista.error.message).toBe(true);
    if (!lista.ok) return;

    const folios = lista.data.map((fila) => fila.folio);
    expect(folios).toContain(propio.folio);
    expect(folios).not.toContain(ajeno.folio);
  });

  it('quien coordina sin acotación territorial alcanza los dos', async () => {
    const enJalisco = await abrir(jalisco.id);
    const enNayarit = await abrir(nayarit.id);

    const lista = await caseList(await contextoDe(base.prisma, coordina));
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;

    const folios = lista.data.map((fila) => fila.folio);
    expect(folios).toContain(enJalisco.folio);
    expect(folios).toContain(enNayarit.folio);
  });
});

describe('el expediente nunca queda sin nadie a cargo', () => {
  it('relevar a la única persona responsable se niega y dice qué hacer', async () => {
    const { caseId } = await abrir(jalisco.id);

    const titular = await base.prisma.caseAssignment.findFirstOrThrow({
      where: { caseId, assignmentRole: 'OWNER', unassignedAt: null },
      select: { id: true },
    });

    const intento = await unassignCase(await contextoDe(base.prisma, coordina), {
      assignmentId: titular.id,
      reason: 'Intento de dejar el expediente sin nadie que responda de él.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('Nombra a quien lo lleve');
  });

  it('nombrar a quien sigue releva a quien respondía, en el mismo acto', async () => {
    const { caseId } = await abrir(jalisco.id);

    const relevo = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaJalisco.userId,
      assignmentRole: 'OWNER',
      reason: 'El asunto es de su territorio y pasa a responder ella del expediente.',
    });
    expect(relevo.ok, relevo.ok ? '' : relevo.error.message).toBe(true);
    if (!relevo.ok) return;
    expect(relevo.data.relevoDe).toBe(coordina.userId);

    // En ningún momento hubo dos responsables ni ninguno.
    const responsables = await base.prisma.caseAssignment.findMany({
      where: { caseId, assignmentRole: 'OWNER', unassignedAt: null },
      select: { userId: true },
    });
    expect(responsables).toHaveLength(1);
    expect(responsables[0]?.userId).toBe(delegadaJalisco.userId);

    // Y el relevo consta con su motivo, no como una fila que desapareció.
    const anterior = await base.prisma.caseAssignment.findFirstOrThrow({
      where: { caseId, userId: coordina.userId },
      select: { unassignedAt: true, unassignReason: true },
    });
    expect(anterior.unassignedAt).not.toBeNull();
    expect(anterior.unassignReason).toContain('Relevo');
  });

  it('relevar a quien apoya sí se puede, y deja de ver el expediente', async () => {
    const { caseId, publicId } = await abrir(jalisco.id);

    const apoyo = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: delegadaJalisco.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Entra a apoyar mientras se prepara la demanda.',
    });
    expect(apoyo.ok, apoyo.ok ? '' : apoyo.error.message).toBe(true);
    if (!apoyo.ok) return;

    const antes = await caseDetail(await contextoDe(base.prisma, delegadaJalisco), publicId);
    expect(antes.ok, antes.ok ? '' : antes.error.message).toBe(true);

    const relevada = await unassignCase(await contextoDe(base.prisma, coordina), {
      assignmentId: apoyo.data.assignmentId,
      reason: 'Terminó lo que tenía que hacer y el expediente sigue con quien responde.',
    });
    expect(relevada.ok, relevada.ok ? '' : relevada.error.message).toBe(true);

    const despues = await caseDetail(await contextoDe(base.prisma, delegadaJalisco), publicId);
    expect(despues.ok).toBe(false);
  });

  it('quien no tiene la facultad de asignar no reparte expedientes ajenos', async () => {
    const { caseId } = await abrir(jalisco.id);

    const intento = await assignCase(await contextoDe(base.prisma, delegadaJalisco), {
      caseId,
      userId: delegadaJalisco.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Intento de auto-asignarse un expediente sin la facultad de repartirlos.',
    });
    expect(intento.ok).toBe(false);
  });
});
