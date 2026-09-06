import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import { advanceTask, assignCase, assignTask, caseDetail, createTask, openCase } from '@/modules/cases';

/**
 * Tareas y plazos del expediente (PRD §10.2; F6-CAS-007).
 *
 * Cuatro promesas que se comprueban ejecutando:
 *
 *  · Una tarea es de **alguien que pueda hacerla**: encomendarla a quien no
 *    lleva el expediente se niega.
 *  · **Terminar deja constancia** de cuándo y por quién, y lo exige la base, no
 *    el código.
 *  · **Bloquear exige motivo**, y cancelar también: las dos dicen «esto no se
 *    hizo», y sin la razón no dicen nada.
 *  · **Fuera de plazo se compara al leer**, no se guarda: una marca guardada
 *    diría que hay tiempo cuando ya no lo hay.
 */

let base: TestDatabase;
let fuerzaId: string;
let atiende: PersonaDePrueba;
let apoya: PersonaDePrueba;
let ajena: PersonaDePrueba;

const CONTEXTO = { correlationId: 'prueba-tareas', ipHash: 'huella-de-tareas' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('tareas');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  apoya = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Apoya' });
  ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona', familyName: 'Ajena' });

  for (const persona of [atiende, apoya, ajena]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of ['case_event', 'case_task', 'case_assignment', 'case_participant', 'case_file', 'support_request']) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Abre un expediente con quien atiende a cargo. */
async function abrir(): Promise<{ caseId: string; publicId: string }> {
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
  return { caseId: abierto.data.caseId, publicId: abierto.data.publicId };
}

/** Fecha en formato de día, desplazada los días que se le indiquen. */
function dia(desplazamiento: number): string {
  const fecha = new Date(Date.now() + desplazamiento * 24 * 60 * 60 * 1000);
  return fecha.toISOString().slice(0, 10);
}

describe('una tarea es de alguien que pueda hacerla', () => {
  it('se abre con responsable del equipo y con plazo', async () => {
    const { caseId, publicId } = await abrir();

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Presentar la demanda por despido injustificado',
      description: 'Reunir la constancia de la solicitud de ajuste y el aviso de baja.',
      assigneeId: atiende.userId,
      dueAt: dia(10),
    });
    expect(creada.ok, creada.ok ? '' : creada.error.message).toBe(true);

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok).toBe(true);
    if (!detalle.ok) return;

    expect(detalle.data.tareas).toHaveLength(1);
    const tarea = detalle.data.tareas[0]!;
    expect(tarea.titulo).toContain('demanda');
    expect(tarea.responsable).toContain('Atiende');
    expect(tarea.estado).toBe('PENDING');
    expect(tarea.vencida).toBe(false);
  });

  it('encomendarla a quien no lleva el expediente se niega y dice qué hacer', async () => {
    const { caseId } = await abrir();

    const intento = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Revisar el contrato colectivo aplicable',
      assigneeId: ajena.userId,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no lleva este expediente');

    expect(await base.prisma.caseTask.count({ where: { caseId } })).toBe(0);
  });

  it('pasarla a alguien del equipo sí, y a alguien de fuera no', async () => {
    const { caseId } = await abrir();

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Reunir la evidencia del despido y ordenarla por fecha',
    });
    expect(creada.ok, creada.ok ? '' : creada.error.message).toBe(true);
    if (!creada.ok) return;

    const aFuera = await assignTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      assigneeId: ajena.userId,
    });
    expect(aFuera.ok).toBe(false);

    // Y en cuanto entra al equipo, la misma operación se admite.
    const entra = await assignCase(await contextoDe(base.prisma, atiende), {
      caseId,
      userId: apoya.userId,
      assignmentRole: 'SUPPORT',
      reason: 'Entra a apoyar en la preparación de la demanda.',
    });
    expect(entra.ok, entra.ok ? '' : entra.error.message).toBe(true);

    const aDentro = await assignTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      assigneeId: apoya.userId,
    });
    expect(aDentro.ok, aDentro.ok ? '' : aDentro.error.message).toBe(true);
  });

  it('quien no lleva el expediente no abre tareas en él', async () => {
    const { caseId } = await abrir();

    const intento = await createTask(await contextoDe(base.prisma, ajena), {
      caseId,
      title: 'Intento de abrir una tarea en un expediente que no lleva',
    });
    expect(intento.ok).toBe(false);
  });
});

describe('terminar deja constancia y bloquear exige motivo', () => {
  it('terminar escribe cuándo y por quién', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Solicitar la constancia de baja a la empresa',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const terminada = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'DONE',
    });
    expect(terminada.ok, terminada.ok ? '' : terminada.error.message).toBe(true);

    const fila = await base.prisma.caseTask.findUniqueOrThrow({
      where: { id: creada.data.taskId },
      select: { status: true, completedAt: true, completedById: true },
    });
    expect(fila.status).toBe('DONE');
    expect(fila.completedAt).not.toBeNull();
    expect(fila.completedById).toBe(atiende.userId);
  });

  it('la base no admite una tarea terminada sin constancia, aunque el código lo intente', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Tarea que se intentará terminar por la vía de atrás',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    // Se escribe directamente, saltándose el caso de uso: la garantía tiene que
    // estar en el motor, no en la capa que se puede olvidar de comprobarla.
    await expect(
      base.prisma.caseTask.update({
        where: { id: creada.data.taskId },
        data: { status: 'DONE' },
      }),
    ).rejects.toThrow(/tarea_terminada_con_constancia/);
  });

  it('bloquear sin decir qué la detiene se niega', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Pedir el expediente a la junta de conciliación',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const sinMotivo = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'BLOCKED',
      note: null,
    });
    expect(sinMotivo.ok).toBe(false);

    const conMotivo = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'BLOCKED',
      note: 'La junta no entrega el expediente hasta que resuelva el amparo.',
    });
    expect(conMotivo.ok, conMotivo.ok ? '' : conMotivo.error.message).toBe(true);

    const fila = await base.prisma.caseTask.findUniqueOrThrow({
      where: { id: creada.data.taskId },
      select: { status: true, blockerNote: true },
    });
    expect(fila.status).toBe('BLOCKED');
    expect(fila.blockerNote).toContain('amparo');
  });

  it('cancelar también exige la razón: dejar de hacer algo es una decisión', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Preparar la conciliación previa ante la autoridad',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const sinRazon = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'CANCELLED',
      note: null,
    });
    expect(sinRazon.ok).toBe(false);
  });

  it('una tarea cerrada ya no se mueve', async () => {
    const { caseId } = await abrir();
    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Notificar a la persona que ya se presentó la demanda',
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const terminada = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'DONE',
    });
    expect(terminada.ok).toBe(true);

    const reapertura = await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'IN_PROGRESS',
    });
    expect(reapertura.ok).toBe(false);
    if (!reapertura.ok) expect(reapertura.error.message).toContain('abre otra');

    // Y la constancia sigue intacta: reabrir la habría borrado.
    const fila = await base.prisma.caseTask.findUniqueOrThrow({
      where: { id: creada.data.taskId },
      select: { completedAt: true, completedById: true },
    });
    expect(fila.completedAt).not.toBeNull();
    expect(fila.completedById).toBe(atiende.userId);
  });
});

describe('el plazo se compara al leer', () => {
  it('una tarea con el plazo pasado se lee vencida sin que nada la haya marcado', async () => {
    const { caseId, publicId } = await abrir();

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Contestar el requerimiento de la autoridad laboral',
      dueAt: dia(-3),
    });
    expect(creada.ok, creada.ok ? '' : creada.error.message).toBe(true);

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok).toBe(true);
    if (!detalle.ok) return;
    expect(detalle.data.tareas[0]?.vencida).toBe(true);

    // Nada se guardó: no hay columna que decir que está vencida.
    const fila = await base.prisma.caseTask.findFirstOrThrow({
      where: { caseId },
      select: { status: true },
    });
    expect(fila.status).toBe('PENDING');
  });

  it('el plazo vence al final del día señalado, no al empezarlo', async () => {
    const { caseId } = await abrir();

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Entregar el escrito el mismo día del vencimiento',
      dueAt: dia(0),
    });
    expect(creada.ok, creada.ok ? '' : creada.error.message).toBe(true);

    const fila = await base.prisma.caseTask.findFirstOrThrow({
      where: { caseId },
      select: { dueAt: true },
    });
    // Quien tiene hasta hoy tiene hoy: el plazo no venció al dar la medianoche.
    expect(fila.dueAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('una tarea terminada fuera de plazo deja de contar como vencida', async () => {
    const { caseId, publicId } = await abrir();

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Reunir los recibos de nómina de los últimos doce meses',
      dueAt: dia(-5),
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    await advanceTask(await contextoDe(base.prisma, atiende), {
      taskId: creada.data.taskId,
      status: 'DONE',
    });

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok).toBe(true);
    if (!detalle.ok) return;
    // Se entregó tarde, y eso consta en la fecha; pero ya no está esperando a
    // nadie, que es lo que la alerta de plazo tiene que señalar.
    expect(detalle.data.tareas[0]?.vencida).toBe(false);
  });
});
