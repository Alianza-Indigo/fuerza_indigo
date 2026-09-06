import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import {
  acceptReferral,
  acknowledgeEmergency,
  addParticipant,
  advanceTask,
  caseDetail,
  closeCase,
  closeEmergency,
  createTask,
  openCase,
  proposeReferral,
  raiseEmergency,
  reopenCase,
  requestReferralConsent,
  sendReferral,
} from '@/modules/cases';
import { RUTA_DEL_PROTOCOLO_DE_RIESGO } from '@/modules/cases/domain';
import { createPage, publishPage, reviewPage, submitForReview } from '@/modules/content';

/**
 * Cierre con resultado y reapertura controlada (PRD §10.2; F6-CAS-012).
 *
 * Cinco promesas que se comprueban ejecutando:
 *
 *  · Cerrar exige **decir cómo acabó** y por qué, y la base lo sostiene.
 *  · Un cierre **no contradice lo que consta**: ni con tareas abiertas, ni con
 *    un riesgo sin cerrar, ni por canalización que nadie aceptó.
 *  · Reabrir **cuenta las veces** y guarda con qué resultado se había cerrado.
 *  · Lo que se cerró por no ser competencia **no se reabre**.
 *  · Un expediente cerrado **no admite trabajo nuevo**.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let atiende: PersonaDePrueba;
let revisora: PersonaDePrueba;
let recibeEnAlianza: PersonaDePrueba;
let laPersona: PersonaDePrueba;
let versionDeConsentimiento: string;

const CONTEXTO = { correlationId: 'prueba-cierre', ipHash: 'huella-de-cierre' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('cierre');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Revisa' });
  recibeEnAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Recibe' });
  laPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Pidió Ayuda' });

  for (const persona of [atiende, revisora]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
  await nombrar(base.prisma, {
    userId: recibeEnAlianza.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
  await nombrar(base.prisma, {
    userId: laPersona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
  versionDeConsentimiento = (
    await base.prisma.consentVersion.findFirstOrThrow({ where: { status: 'PUBLISHED' }, select: { id: true } })
  ).id;

  // El protocolo de riesgo, para poder levantar marcas en las pruebas.
  const autora = await contextoDe(base.prisma, atiende);
  const quienRevisa = await contextoDe(base.prisma, revisora);
  const creada = await createPage(autora, {
    slug: RUTA_DEL_PROTOCOLO_DE_RIESGO,
    kind: 'PROTOCOL',
    title: 'Qué hacer ante un riesgo inmediato',
    summary: 'A dónde acudir si hay peligro ahora mismo, y qué hace la organización.',
    bodyMarkdown: 'Llama al 911. Guardia de acompañamiento: 33 0000 0000.',
    legalEntityId: fuerzaId,
    accessLevel: 'PUBLIC',
  });
  if (!creada.ok) throw creada.error;
  await submitForReview(autora, creada.data.pageId);
  await reviewPage(quienRevisa, { pageId: creada.data.pageId, decision: 'APROBAR' });
  await publishPage(quienRevisa, { pageId: creada.data.pageId });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
    'referral_shared_file',
    'referral',
    'emergency_flag',
    'case_event',
    'case_task',
    'case_assignment',
    'case_participant',
    'case_file',
    'support_request',
  ]) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
  await base.sql.query(`DELETE FROM "consent"`);
});

async function abrir(): Promise<{ caseId: string; publicId: string; folio: string }> {
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
  const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });

  const canalizada = await confirmRouting(await contextoDe(base.prisma, atiende), {
    requestId: solicitud.id,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'PRIORITY',
    note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral.',
  });
  if (!canalizada.ok) throw new Error(canalizada.error.message);

  const abierto = await openCase(await contextoDe(base.prisma, atiende), {
    supportRequestId: solicitud.id,
    legalEntityId: fuerzaId,
    domain: 'UNION_DEFENSE',
    caseType: 'INDIVIDUAL_LABOR_DISPUTE',
    priority: 'HIGH',
    reason: 'Hay plazo para impugnar el despido y hace falta expediente.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data;
}

describe('cerrar es decir cómo acabó', () => {
  it('el resultado y el motivo quedan escritos, y el estado los acompaña', async () => {
    const { caseId, publicId } = await abrir();

    const cerrado = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'RESOLVED',
      reason: 'La empresa reinstaló a la persona y pagó los salarios caídos tras la conciliación.',
    });
    expect(cerrado.ok, cerrado.ok ? '' : cerrado.error.message).toBe(true);

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { status: true, closedAt: true, closeOutcome: true, closeReason: true },
    });
    expect(fila.status).toBe('CLOSED');
    expect(fila.closedAt).not.toBeNull();
    expect(fila.closeOutcome).toBe('RESOLVED');
    expect(fila.closeReason).toContain('reinstaló');

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok).toBe(true);
    if (detalle.ok) expect(detalle.data.closeOutcome).toBe('RESOLVED');
  });

  it('la base no admite un cierre sin resultado ni motivo, aunque el código lo intente', async () => {
    const { caseId } = await abrir();

    await expect(
      base.prisma.case.update({
        where: { id: caseId },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
    ).rejects.toThrow(/case_cierre_explicado/);
  });

  it('el estado y el cierre no se pueden contradecir en la base', async () => {
    const { caseId } = await abrir();

    await expect(
      base.prisma.case.update({
        where: { id: caseId },
        data: {
          closedAt: new Date(),
          closeOutcome: 'RESOLVED',
          closeReason: 'Se cierra la fecha sin poner el estado, que la base no debería admitir.',
        },
      }),
    ).rejects.toThrow(/case_estado_coherente_con_cierre/);
  });

  it('un expediente cerrado no admite trabajo nuevo', async () => {
    const { caseId } = await abrir();
    await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'RESOLVED',
      reason: 'La empresa reinstaló a la persona y pagó los salarios caídos tras la conciliación.',
    });

    const tarea = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Intento de abrir una tarea en un expediente cerrado',
    });
    expect(tarea.ok).toBe(false);

    const participante = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: laPersona.personId,
      role: 'AFFECTED_PERSON',
      reason: 'Intento de agregar a alguien a un expediente ya cerrado.',
    });
    expect(participante.ok).toBe(false);
  });
});

describe('un cierre no contradice lo que consta', () => {
  it('con tareas sin terminar no se cierra, y dice cuántas', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Presentar la demanda por despido injustificado',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const intento = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'RESOLVED',
      reason: 'Intento de cerrar dejando trabajo pendiente, que es lo que no debe poder hacerse.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('1 tarea');

    // Cancelarla con su motivo también libera el cierre: lo que no vale es
    // dejarla colgando.
    await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'CANCELLED',
      note: 'La persona decidió no demandar y se cierra el asunto por su voluntad.',
    });

    const cerrado = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'WITHDRAWN_BY_PERSON',
      reason: 'La persona decidió no continuar con la demanda después de valorar los tiempos.',
    });
    expect(cerrado.ok, cerrado.ok ? '' : cerrado.error.message).toBe(true);
  });

  it('con una marca de riesgo sin cerrar tampoco', async () => {
    const { caseId } = await abrir();
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'VIOLENCE',
      note: 'Dice que la amenazaron a la salida del trabajo tras poner la queja.',
    });
    expect(marcada.ok, marcada.ok ? '' : marcada.error.message).toBe(true);
    if (!marcada.ok) return;

    const intento = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'RESOLVED',
      reason: 'Intento de cerrar con un riesgo vivo que nadie ha resuelto todavía.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('marca de riesgo sin cerrar');

    await acknowledgeEmergency(await contextoDe(base.prisma, atiende), {
      flagId: marcada.data.flagId,
      note: 'La llamo hoy y valoramos si hace falta denuncia.',
    });
    await closeEmergency(await contextoDe(base.prisma, atiende), {
      flagId: marcada.data.flagId,
      resolution: 'Se acompañó a poner la denuncia y la empresa retiró al supervisor del turno.',
    });

    const cerrado = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'RESOLVED',
      reason: 'La empresa reinstaló a la persona y se resolvió también la situación de acoso.',
    });
    expect(cerrado.ok, cerrado.ok ? '' : cerrado.error.message).toBe(true);
  });

  it('no se cierra como canalizado lo que nadie aceptó', async () => {
    const { caseId } = await abrir();
    const participa = await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId,
      personId: laPersona.personId,
      role: 'APPLICANT',
      reason: 'Es quien escribió pidiendo ayuda, ya identificada en el padrón.',
    });
    expect(participa.ok, participa.ok ? '' : participa.error.message).toBe(true);

    // Sin ninguna canalización: cerrar como canalizado diría que alguien se
    // hizo cargo cuando nadie lo hizo.
    const sinCanalizar = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'REFERRED',
      reason: 'Intento de cerrar como canalizado un expediente que no se canalizó a ningún sitio.',
    });
    expect(sinCanalizar.ok).toBe(false);
    if (!sinCanalizar.ok) expect(sinCanalizar.error.message).toContain('aceptó');

    // Con una enviada pero sin aceptar, tampoco.
    const propuesta = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'El acompañamiento de la familia le toca a la asociación civil.',
      explanationShownToPerson:
        'Vamos a pasarle tu caso al área de acompañamiento social, con lo que nos contaste y cómo localizarte.',
      sharedFields: ['folio', 'resumen'],
      sharedFileIds: [],
    });
    expect(propuesta.ok, propuesta.ok ? '' : propuesta.error.message).toBe(true);
    if (!propuesta.ok) return;

    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId: propuesta.data.referralId });
    const consentimiento = await base.prisma.consent.create({
      data: {
        personId: laPersona.personId,
        consentVersionId: versionDeConsentimiento,
        purpose: 'INTER_ENTITY_REFERRAL',
        scope: { referralId: propuesta.data.referralId, fields: ['folio', 'resumen'], files: [] },
        grantedById: laPersona.personId,
        evidence: { medio: 'SCREEN' },
      },
      select: { id: true },
    });
    await sendReferral(await contextoDe(base.prisma, atiende), {
      referralId: propuesta.data.referralId,
      consentId: consentimiento.id,
    });

    const enviadaSinAceptar = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'REFERRED',
      reason: 'Intento de cerrar como canalizado cuando el área receptora todavía no la ha aceptado.',
    });
    expect(enviadaSinAceptar.ok).toBe(false);

    // Y en cuanto la aceptan, sí.
    await acceptReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId: propuesta.data.referralId,
      note: 'El acompañamiento de la familia es de esta área y hay capacidad para tomarlo.',
    });

    const cerrado = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome: 'REFERRED',
      reason: 'El acompañamiento lo lleva ya la asociación civil, que aceptó la canalización.',
    });
    expect(cerrado.ok, cerrado.ok ? '' : cerrado.error.message).toBe(true);
  });
});

describe('reabrir es un acto acotado', () => {
  /** Cierra un expediente con el resultado indicado. */
  async function cerrar(caseId: string, outcome: 'RESOLVED' | 'NOT_COMPETENT'): Promise<void> {
    const cerrado = await closeCase(await contextoDe(base.prisma, atiende), {
      caseId,
      outcome,
      reason:
        outcome === 'RESOLVED'
          ? 'La empresa reinstaló a la persona y pagó los salarios caídos tras la conciliación.'
          : 'El asunto es un conflicto vecinal que no toca a ninguna de las dos entidades.',
    });
    if (!cerrado.ok) throw new Error(cerrado.error.message);
  }

  it('la cuenta sube y consta con qué resultado se había cerrado', async () => {
    const { caseId, publicId } = await abrir();
    await cerrar(caseId, 'RESOLVED');

    const reabierto = await reopenCase(await contextoDe(base.prisma, atiende), {
      caseId,
      reason: 'La empresa volvió a despedirla dos semanas después, por lo mismo.',
    });
    expect(reabierto.ok, reabierto.ok ? '' : reabierto.error.message).toBe(true);
    if (reabierto.ok) expect(reabierto.data.veces).toBe(1);

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { status: true, closedAt: true, closeOutcome: true, reopenCount: true },
    });
    expect(fila.status).toBe('IN_PROGRESS');
    expect(fila.closedAt).toBeNull();
    expect(fila.closeOutcome).toBeNull();
    expect(fila.reopenCount).toBe(1);

    // Que se había cerrado, y con qué resultado, no se pierde: está en la
    // bitácora del expediente.
    const evento = await base.prisma.caseEvent.findFirstOrThrow({
      where: { caseId, kind: 'REOPENED' },
      select: { payload: true },
    });
    const payload = evento.payload as { resultadoAnterior: string; vecesReabierto: number };
    expect(payload.resultadoAnterior).toBe('RESOLVED');
    expect(payload.vecesReabierto).toBe(1);

    // Y se puede volver a cerrar y volver a reabrir: la cuenta sigue subiendo.
    await cerrar(caseId, 'RESOLVED');
    const segunda = await reopenCase(await contextoDe(base.prisma, atiende), {
      caseId,
      reason: 'Volvió a ocurrir lo mismo con la misma empresa por tercera vez.',
    });
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.data.veces).toBe(2);

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok).toBe(true);
    if (detalle.ok) expect(detalle.data.reopenCount).toBe(2);
  });

  it('lo que se cerró por no ser competencia no se reabre, y dice qué hacer', async () => {
    const { caseId } = await abrir();
    await cerrar(caseId, 'NOT_COMPETENT');

    const intento = await reopenCase(await contextoDe(base.prisma, atiende), {
      caseId,
      reason: 'Intento de reabrir un asunto que no es competencia de la organización.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no lo vuelve competencia suya');

    const fila = await base.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { status: true, reopenCount: true },
    });
    expect(fila.status).toBe('CLOSED');
    expect(fila.reopenCount).toBe(0);
  });

  it('un expediente abierto no se reabre', async () => {
    const { caseId } = await abrir();

    const intento = await reopenCase(await contextoDe(base.prisma, atiende), {
      caseId,
      reason: 'Intento de reabrir un expediente que nunca se cerró.',
    });
    expect(intento.ok).toBe(false);
  });

  it('quien no tiene la facultad de reabrir no reabre nada', async () => {
    const { caseId } = await abrir();
    await cerrar(caseId, 'RESOLVED');

    // La delegación territorial lleva expedientes y cierra, pero reabrir es de
    // quien responde por el área: `cases.case.reopen` no está en su rol.
    const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra', familyName: 'Nombra' });
    const delegada = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'Territorial' });
    await nombrar(base.prisma, {
      userId: delegada.userId,
      roleCode: 'TERRITORIAL_DELEGATE',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });

    const intento = await reopenCase(await contextoDe(base.prisma, delegada), {
      caseId,
      reason: 'Intento de reabrir sin tener la facultad de reabrir expedientes.',
    });
    expect(intento.ok).toBe(false);
  });
});
