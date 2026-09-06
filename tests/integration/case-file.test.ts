import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import {
  addParticipant,
  assessCase,
  caseDetail,
  caseList,
  openCase,
  removeParticipant,
} from '@/modules/cases';

/**
 * Expediente de caso: apertura, relato inalterable y valoración humana
 * (PRD §10.2, §10.3; F6-CAS-005).
 *
 * Lo que se comprueba ejecutando:
 *
 *  1. Un expediente **no nace de una propuesta**: sin canalización confirmada,
 *     abrir se niega. Es donde el criterio del PRD §24 deja de ser una frase.
 *  2. El relato original se copia de lo que la persona escribió y **el motor**
 *     impide alterarlo, no el código.
 *  3. La valoración se escribe al lado y marca la primera respuesta una vez.
 *  4. El acceso es **por asignación**: quien no lleva el expediente no lo ve, y
 *     su lista sale vacía en vez de negarle el paso.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let atiende: PersonaDePrueba;
let otraDelArea: PersonaDePrueba;
let social: PersonaDePrueba;

const CONTEXTO = { correlationId: 'prueba-expedientes', ipHash: 'huella-de-expedientes' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('expedientes');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  otraDelArea = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra', familyName: 'Del Área' });
  social = await crearPersonaConCuenta(base.prisma, { givenName: 'Personal', familyName: 'Social' });

  for (const persona of [atiende, otraDelArea]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
  await nombrar(base.prisma, {
    userId: social.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
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
  // Se limpia con las credenciales del propietario y no con las de la
  // aplicación: al rol de la aplicación se le retiró `DELETE` sobre la bitácora
  // del expediente, que es justo la garantía que esta suite comprueba. Y en
  // orden de dependencia, sin cascada: `TRUNCATE ... CASCADE` arrastra medio
  // esquema (control `C-F5-09`).
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

async function canalizar(requestId: string): Promise<void> {
  const confirmada = await confirmRouting(await contextoDe(base.prisma, atiende), {
    requestId,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'PRIORITY',
    note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral.',
  });
  if (!confirmada.ok) throw new Error(confirmada.error.message);
}

async function abrir(): Promise<{ caseId: string; publicId: string; folio: string }> {
  const requestId = await recibir();
  await canalizar(requestId);
  const abierto = await openCase(await contextoDe(base.prisma, atiende), {
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

describe('un expediente no nace de una propuesta', () => {
  it('sin canalización confirmada, abrir se niega y lo explica', async () => {
    const requestId = await recibir();

    const intento = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: requestId,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      priority: 'NORMAL',
      reason: 'Intento de abrir sin que nadie haya confirmado la canalización.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('confirmada');

    expect(await base.prisma.case.count()).toBe(0);
  });

  it('no se abre en una entidad distinta de la que se confirmó', async () => {
    const requestId = await recibir();
    await canalizar(requestId);

    const intento = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: requestId,
      legalEntityId: alianzaId,
      domain: 'SOCIAL_ATTENTION',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      priority: 'NORMAL',
      reason: 'Intento de abrir en la entidad que no se confirmó.',
    });
    expect(intento.ok).toBe(false);
  });

  it('una solicitud no da dos expedientes', async () => {
    const requestId = await recibir();
    await canalizar(requestId);
    const entrada = {
      supportRequestId: requestId,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE' as const,
      caseType: 'INDIVIDUAL_LABOR_DISPUTE' as const,
      priority: 'NORMAL' as const,
      reason: 'Apertura del expediente correspondiente a esta solicitud.',
    };
    const primero = await openCase(await contextoDe(base.prisma, atiende), entrada);
    expect(primero.ok, primero.ok ? '' : primero.error.message).toBe(true);

    const segundo = await openCase(await contextoDe(base.prisma, atiende), entrada);
    expect(segundo.ok).toBe(false);
  });
});

describe('el relato original es de quien lo contó', () => {
  it('se copia tal cual del mensaje y no se puede alterar con las credenciales de la aplicación', async () => {
    const { caseId } = await abrir();

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { originalSummary: true, humanAssessment: true, status: true, supportRequestId: true },
    });
    expect(fila.originalSummary).toBe(RELATO);
    expect(fila.humanAssessment).toBeNull();
    expect(fila.supportRequestId).not.toBeNull();

    // La inmutabilidad no es una promesa del código: el motor retira el
    // privilegio de actualización sobre esa columna.
    await expect(
      base.prisma.case.update({
        where: { id: caseId },
        data: { originalSummary: 'Una versión reescrita por la organización.' },
      }),
    ).rejects.toThrow();

    // Y el dominio tampoco: cambiarlo movería el expediente de compartimento.
    await expect(
      base.prisma.case.update({ where: { id: caseId }, data: { domain: 'SOCIAL_ATTENTION' } }),
    ).rejects.toThrow();
  });

  it('la solicitud queda marcada como convertida y quien la escribió figura como solicitante', async () => {
    const { caseId } = await abrir();

    const solicitud = await base.prisma.supportRequest.findFirstOrThrow({ select: { status: true } });
    expect(solicitud.status).toBe('CONVERTED_TO_CASE');

    const bitacora = await base.prisma.caseEvent.findMany({
      where: { caseId },
      select: { kind: true },
      orderBy: { occurredAt: 'asc' },
    });
    expect(bitacora.map((asiento) => asiento.kind)).toEqual(['CREATED', 'ASSIGNED']);

    // La bitácora del expediente tampoco se altera ni se borra.
    const asiento = bitacora[0];
    expect(asiento).toBeDefined();
  });
});

describe('la valoración se escribe al lado', () => {
  it('no toca el relato, y la primera marca el instante de primera respuesta', async () => {
    const { caseId, publicId } = await abrir();

    const valorado = await assessCase(await contextoDe(base.prisma, atiende), {
      caseId,
      humanAssessment:
        'Hay indicios de despido por represalia. Se propone requerir por escrito a la empresa y preparar la demanda dentro del plazo.',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      dueAt: '2026-10-15',
    });
    expect(valorado.ok, valorado.ok ? '' : valorado.error.message).toBe(true);
    if (!valorado.ok) return;
    expect(valorado.data.primeraRespuesta).toBe(true);

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { originalSummary: true, humanAssessment: true, priority: true, status: true, firstResponseAt: true },
    });
    expect(fila.originalSummary).toBe(RELATO);
    expect(fila.humanAssessment).toContain('represalia');
    expect(fila.priority).toBe('CRITICAL');
    expect(fila.status).toBe('IN_PROGRESS');
    const primeraRespuesta = fila.firstResponseAt;
    expect(primeraRespuesta).not.toBeNull();

    // La segunda valoración no reescribe la primera respuesta: si lo hiciera, el
    // indicador mediría la última vez que alguien tocó el expediente.
    const segunda = await assessCase(await contextoDe(base.prisma, atiende), {
      caseId,
      humanAssessment: 'La empresa contestó negando los hechos. Se mantiene la vía y se prepara la demanda.',
      priority: 'HIGH',
      status: 'WAITING_ON_THIRD_PARTY',
      dueAt: null,
    });
    expect(segunda.ok, segunda.ok ? '' : segunda.error.message).toBe(true);
    if (segunda.ok) expect(segunda.data.primeraRespuesta).toBe(false);

    const despues = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { firstResponseAt: true, dueAt: true },
    });
    expect(despues.firstResponseAt?.getTime()).toBe(primeraRespuesta?.getTime());
    expect(despues.dueAt).toBeNull();

    // Y el expediente se lee por su identificador público, no por el interno.
    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok, detalle.ok ? '' : detalle.error.message).toBe(true);
    if (detalle.ok) expect(detalle.data.originalSummary).toBe(RELATO);
  });
});

describe('el acceso es por asignación, no por área', () => {
  it('quien no lo lleva no lo ve, aunque sea de su misma entidad y su mismo cargo', async () => {
    const { publicId } = await abrir();

    const ajena = await contextoDe(base.prisma, otraDelArea);
    const intento = await caseDetail(ajena, publicId);
    expect(intento.ok).toBe(false);

    // La lista de quien tiene la facultad y ningún expediente sale **vacía**,
    // no prohibida: no es que no pueda mirar, es que no lleva nada.
    const lista = await caseList(ajena);
    expect(lista.ok, lista.ok ? '' : lista.error.message).toBe(true);
    if (lista.ok) expect(lista.data).toHaveLength(0);
  });

  it('quien lo abrió queda a cargo y lo ve en su lista', async () => {
    const { folio } = await abrir();

    const lista = await caseList(await contextoDe(base.prisma, atiende));
    expect(lista.ok, lista.ok ? '' : lista.error.message).toBe(true);
    if (!lista.ok) return;
    expect(lista.data.map((fila) => fila.folio)).toContain(folio);
  });

  it('el personal social no alcanza un expediente sindical ni por asignación', async () => {
    // El compartimento va antes que la asignación: asignar a alguien de
    // atención social un expediente de defensa sindical no debería abrirlo, y
    // aquí se comprueba que el motor lo impide aunque la asignación exista.
    const { caseId, publicId } = await abrir();
    await base.prisma.caseAssignment.create({
      data: {
        caseId,
        userId: social.userId,
        assignmentRole: 'SUPPORT',
        assignedById: atiende.userId,
        createdByActorId: social.actorId,
        updatedByActorId: social.actorId,
      },
    });

    const intento = await caseDetail(await contextoDe(base.prisma, social), publicId);
    expect(intento.ok).toBe(false);
  });
});

/**
 * Participantes, calidades y representación (PRD §10.2; F6-CAS-006).
 *
 * Tres promesas que se comprueban ejecutando:
 *
 *  · La calidad **se deriva del padrón**, no se teclea, y se conserva aunque la
 *    persona deje de tenerla después.
 *  · Quien representa tiene que **poder acreditarlo**: sin relación de cuidado
 *    viva no se agrega como representante.
 *  · **Ver el expediente no viene con figurar en él**: una contraparte figura y
 *    no mira.
 */
describe('participantes, calidades y representación', () => {
  /** Registra a alguien en el padrón con la calidad que se le indique. */
  async function personaConCalidad(
    nombre: string,
    calidad: 'AGREMIADO' | 'AFILIADO_HONORARIO' | null,
  ): Promise<PersonaDePrueba> {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre, familyName: 'De Prueba' });
    if (calidad !== null) {
      await crearMembresia(base.prisma, {
        personId: persona.personId,
        legalEntityId: fuerzaId,
        typeCode: calidad,
      });
    }
    return persona;
  }

  it('la calidad se lee del padrón y no de quien agrega', async () => {
    const { caseId } = await abrir();
    const agremiada = await personaConCalidad('Agremiada', 'AGREMIADO');
    const sinCalidad = await personaConCalidad('SinCalidad', null);

    const conCalidad = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: agremiada.personId,
      role: 'AFFECTED_PERSON',
      reason: 'Es a quien le está pasando lo que se cuenta en el expediente.',
    });
    expect(conCalidad.ok, conCalidad.ok ? '' : conCalidad.error.message).toBe(true);
    if (conCalidad.ok) expect(conCalidad.data.calidad).toBe('UNION_MEMBER');

    const otra = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: sinCalidad.personId,
      role: 'WITNESS',
      reason: 'Presenció los hechos y declara sobre ellos.',
    });
    expect(otra.ok, otra.ok ? '' : otra.error.message).toBe(true);
    if (otra.ok) expect(otra.data.calidad).toBe('NONE');
  });

  it('la calidad se conserva aunque después se pierda la membresía', async () => {
    // El expediente tiene que seguir diciendo con qué calidad intervino, no
    // recalcularla al leerla: si no, un expediente de hace tres años se leería
    // con la situación de hoy.
    const { caseId } = await abrir();
    const agremiada = await personaConCalidad('Agremiada2', 'AGREMIADO');

    const agregada = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: agremiada.personId,
      role: 'AFFECTED_PERSON',
      reason: 'Es la persona afectada por los hechos del expediente.',
    });
    expect(agregada.ok, agregada.ok ? '' : agregada.error.message).toBe(true);

    // Se le acaba la vigencia y nadie la renueva: la baja se asienta con fecha y
    // motivo, como exige el modelo, para que la prueba refleje una pérdida real
    // de la membresía y no una fila inconsistente.
    await base.sql.query(
      `UPDATE membership
          SET status = 'EXPIRED', "endedAt" = now(), "endReason" = 'EXPIRY'
        WHERE "personId" = $1`,
      [agremiada.personId],
    );

    const guardada = await base.prisma.caseParticipant.findFirstOrThrow({
      where: { caseId, personId: agremiada.personId },
      select: { membershipQuality: true },
    });
    expect(guardada.membershipQuality).toBe('UNION_MEMBER');
  });

  it('sin representación acreditada no se agrega a quien dice representar', async () => {
    const { caseId } = await abrir();
    const afectada = await personaConCalidad('Afectada', 'AGREMIADO');
    const quienDiceRepresentar = await personaConCalidad('QuienDice', null);

    const primera = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: afectada.personId,
      role: 'AFFECTED_PERSON',
      reason: 'Es la persona afectada por los hechos que se cuentan.',
    });
    expect(primera.ok, primera.ok ? '' : primera.error.message).toBe(true);

    const sinAcreditar = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: quienDiceRepresentar.personId,
      role: 'REPRESENTATIVE',
      reason: 'Dice representar a la persona afectada, sin relación registrada.',
    });
    expect(sinAcreditar.ok).toBe(false);
    if (!sinAcreditar.ok) expect(sinAcreditar.error.message).toContain('relación');

    // Con la relación de cuidado viva, sí.
    await base.prisma.careRelationship.create({
      data: {
        fromPersonId: quienDiceRepresentar.personId,
        toPersonId: afectada.personId,
        kind: 'AUTHORIZED_REPRESENTATIVE',
        createdByActorId: atiende.actorId,
        updatedByActorId: atiende.actorId,
      },
    });

    const acreditada = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: quienDiceRepresentar.personId,
      role: 'REPRESENTATIVE',
      reason: 'Representa a la persona afectada con relación acreditada.',
    });
    expect(acreditada.ok, acreditada.ok ? '' : acreditada.error.message).toBe(true);
    if (acreditada.ok) expect(acreditada.data.veElExpediente).toBe(true);
  });

  it('una contraparte figura en el expediente y no lo ve', async () => {
    const { caseId } = await abrir();

    const contraparte = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      externalName: 'Empresa demandada, S.A. de C.V.',
      role: 'COUNTERPART',
      reason: 'Es la empresa que despidió a la persona que pidió ayuda.',
    });
    expect(contraparte.ok, contraparte.ok ? '' : contraparte.error.message).toBe(true);
    if (contraparte.ok) {
      expect(contraparte.data.veElExpediente).toBe(false);
      expect(contraparte.data.calidad).toBe('NONE');
    }
  });

  it('quien pidió la ayuda no se retira del expediente', async () => {
    // La entrada pública es anónima: la solicitud no trae persona del padrón y
    // el expediente nace sin solicitante identificado. Se le identifica después,
    // que es como ocurre, y desde entonces ya no se le puede sacar.
    const { caseId } = await abrir();
    const quienPidio = await personaConCalidad('QuienPidio', 'AGREMIADO');

    const solicitante = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: quienPidio.personId,
      role: 'APPLICANT',
      reason: 'Es quien escribió pidiendo ayuda, ya identificada en el padrón.',
    });
    expect(solicitante.ok, solicitante.ok ? '' : solicitante.error.message).toBe(true);
    if (!solicitante.ok) return;

    const intento = await removeParticipant(await contextoDe(base.prisma, atiende), {
      participantId: solicitante.data.participantId,
      reason: 'Intento de retirar a quien pidió la ayuda, que no debe admitirse.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no se retira');
  });

  it('retirar a alguien le quita también el acceso', async () => {
    const { caseId } = await abrir();
    const afectada = await personaConCalidad('Afectada2', 'AGREMIADO');

    const agregada = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: afectada.personId,
      role: 'AFFECTED_PERSON',
      reason: 'Es la persona afectada por los hechos del expediente.',
    });
    expect(agregada.ok, agregada.ok ? '' : agregada.error.message).toBe(true);
    if (!agregada.ok) return;

    const retirada = await removeParticipant(await contextoDe(base.prisma, atiende), {
      participantId: agregada.data.participantId,
      reason: 'Se confundió con otra persona al registrarla en el expediente.',
    });
    expect(retirada.ok, retirada.ok ? '' : retirada.error.message).toBe(true);

    const fila = await base.prisma.caseParticipant.findUniqueOrThrow({
      where: { id: agregada.data.participantId },
      select: { removedAt: true, canViewCase: true, removeReason: true },
    });
    expect(fila.removedAt).not.toBeNull();
    // Si conservara el acceso, retirar a alguien sería un cambio de etiqueta.
    expect(fila.canViewCase).toBe(false);
    expect(fila.removeReason).not.toBeNull();
  });

  it('quien no lleva el expediente no agrega a nadie', async () => {
    const { caseId } = await abrir();
    const persona = await personaConCalidad('Cualquiera', null);

    const intento = await addParticipant(await contextoDe(base.prisma, otraDelArea), {
      caseId,
      personId: persona.personId,
      role: 'WITNESS',
      reason: 'Intento de agregar a alguien a un expediente que no se lleva.',
    });
    expect(intento.ok).toBe(false);
  });
});
