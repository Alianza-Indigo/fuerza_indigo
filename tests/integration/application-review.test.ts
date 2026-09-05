import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  answerClarification,
  applicationDetail,
  closeClarification,
  recordRecommendation,
  remindOverdueClarifications,
  requestClarification,
  resolveApplication,
  startReview,
  submitApplication,
} from '@/modules/membership';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

/**
 * Revisión humana, aclaración con plazo y resolución fundada (PRD §8.1 pasos 9
 * a 11; F4-AFI-006).
 *
 * Las promesas que se prueban aquí, en el orden en que le importan a quien
 * solicita: que revisar no toque lo que envió, que un plazo no le quite
 * derechos, y que le digan por qué se resolvió como se resolvió.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let especialidadId: string;

beforeAll(async () => {
  base = await createTestDatabase('revision');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'Que Revisa',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  especialidadId = (await base.prisma.specialtyCatalog.findFirstOrThrow({ select: { id: true } })).id;

  const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
  await base.prisma.normativeRuleSet.update({
    where: { id: reglas.id },
    data: { status: 'IN_FORCE', effectiveFrom: new Date('2026-01-01') },
  });
  await base.prisma.membershipType.updateMany({ data: { effectiveFrom: new Date('2026-01-01') } });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const MOTIVO =
  'Se revisó el expediente completo y la actividad declarada corresponde con la evidencia adjunta.';

/** Fecha de calendario a N días de hoy. */
function enDias(dias: number): string {
  const cuando = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return cuando.toISOString().slice(0, 10);
}

/**
 * Vence el plazo de una aclaración, para probar qué pasa cuando pasa.
 *
 * Hace falta pelear con **tres** garantías, y que haya que pelear con las tres
 * es la prueba de que funcionan: los privilegios por columna impiden que la
 * aplicación toque `dueAt`; el disparador impide reescribirlo incluso desde la
 * conexión de propietaria; y la restricción `dueAt > requestedAt` obliga a
 * mover también la fecha de la petición. Ninguna ruta del producto puede hacer
 * esto: por eso el envejecimiento del plazo solo existe aquí.
 */
async function vencerElPlazo(clarificationId: string, dias: number): Promise<void> {
  await base.sql.query(`ALTER TABLE application_clarification DISABLE TRIGGER application_clarification_inmutable`);
  try {
    await base.sql.query(
      `UPDATE application_clarification
          SET "requestedAt" = now() - (($2::int + 7) || ' days')::interval,
              "dueAt" = now() - ($2 || ' days')::interval
        WHERE id = $1`,
      [clarificationId, String(dias)],
    );
  } finally {
    await base.sql.query(`ALTER TABLE application_clarification ENABLE TRIGGER application_clarification_inmutable`);
  }
}

let contador = 0;

/** Una solicitud enviada, con su persona solicitante y su contexto. */
async function solicitudEnviada() {
  contador += 1;
  const quien = await crearPersonaConCuenta(base.prisma, {
    givenName: `Solicita${contador}`,
    familyName: 'En Revisión',
  });
  await nombrar(base.prisma, {
    userId: quien.userId,
    roleCode: 'APPLICANT',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  const suyo = await contextoDe(base.prisma, quien);

  const tipoId = (
    await base.prisma.membershipType.findUniqueOrThrow({ where: { code: 'AGREMIADO' }, select: { id: true } })
  ).id;

  const enviada = await submitApplication(suyo, {
    category: 'UNION_MEMBER',
    membershipTypeId: tipoId,
    occupationSpecialtyId: especialidadId,
    workRelationKind: 'SUBORDINATE',
    neurodivergentContactStatement:
      'Trabajo en una escuela pública y acompaño a estudiantes autistas todos los días.',
    otherUnionMembership: 'NONE',
    acceptsStatutes: true,
  });
  if (!enviada.ok) throw enviada.error;

  return { quien, suyo, applicationId: enviada.data.applicationId, folio: enviada.data.folio };
}

describe('tomar la solicitud para revisarla', () => {
  it('la deja en revisión y con nombre y apellido de quien la tomó', async () => {
    const { applicationId } = await solicitudEnviada();

    const tomada = await startReview(secretaria, { applicationId });
    expect(tomada.ok, tomada.ok ? '' : JSON.stringify(tomada.error)).toBe(true);

    const fila = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, reviews: { select: { action: true, reviewerId: true } } },
    });
    expect(fila.status).toBe('UNDER_REVIEW');
    expect(fila.reviews).toHaveLength(1);
    expect(fila.reviews[0]?.action).toBe('ASSIGNED');
    expect(fila.reviews[0]?.reviewerId).toBe(secretariaPersona.userId);
  });

  it('revisar no toca lo que la persona envió', async () => {
    const { applicationId } = await solicitudEnviada();
    const antes = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { originalSummary: true },
    });

    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Necesitamos ver tu constancia de situación fiscal para confirmar la actividad que declaraste.',
      dueOn: enDias(7),
    });
    if (!pedida.ok) throw pedida.error;

    const despues = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { originalSummary: true },
    });
    expect(JSON.stringify(despues.originalSummary)).toBe(JSON.stringify(antes.originalSummary));
  });

  it('quien no tiene la facultad de revisar no toma nada', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const intento = await startReview(suyo, { applicationId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('aclaración con plazo', () => {
  it('se pide con plazo, deja constancia del aviso y cambia el estado', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;

    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Nos falta el comprobante de tu actividad laboral. Sube una constancia reciente, por favor.',
      dueOn: enDias(10),
    });
    expect(pedida.ok, pedida.ok ? '' : JSON.stringify(pedida.error)).toBe(true);
    if (!pedida.ok) return;

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, clarificationDueAt: true },
    });
    expect(solicitud.status).toBe('CLARIFICATION_REQUIRED');
    expect(solicitud.clarificationDueAt).not.toBeNull();

    const aclaracion = await base.prisma.applicationClarification.findUniqueOrThrow({
      where: { id: pedida.data.clarificationId },
      select: { notifiedAt: true, dueAt: true },
    });
    // «Mensajería trazable»: se avisó, y consta cuándo.
    expect(aclaracion.notifiedAt).not.toBeNull();

    const encolado = await base.prisma.backgroundJob.findFirst({
      where: { jobType: 'application-notice', businessKey: { contains: pedida.data.clarificationId } },
      select: { payload: true },
    });
    expect(encolado).not.toBeNull();
    expect(JSON.stringify(encolado?.payload)).toContain('APPLICATION_CLARIFICATION_REQUESTED');
  });

  it('un plazo que ya pasó no es un plazo', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;

    const intento = await requestClarification(secretaria, {
      applicationId,
      request: 'Necesitamos que nos mandes la constancia que falta para poder seguir con tu solicitud.',
      dueOn: enDias(-3),
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/después de hoy/i);
  });

  it('no se piden dos aclaraciones a la vez', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;

    const primera = await requestClarification(secretaria, {
      applicationId,
      request: 'Nos falta la constancia de tu actividad laboral para poder continuar con la revisión.',
      dueOn: enDias(7),
    });
    if (!primera.ok) throw primera.error;

    const segunda = await requestClarification(secretaria, {
      applicationId,
      request: 'Y también necesitaríamos una identificación oficial vigente por las dos caras.',
      dueOn: enDias(7),
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('la contesta la persona solicitante, y nadie más', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Cuéntanos con más detalle cómo se relaciona tu actividad con personas neurodivergentes.',
      dueOn: enDias(7),
    });
    if (!pedida.ok) throw pedida.error;

    // Ni siquiera quien revisa puede contestar por ella.
    const porOtra = await answerClarification(secretaria, {
      clarificationId: pedida.data.clarificationId,
      answer: 'Contesto yo en su nombre, que para eso reviso.',
    });
    expect(porOtra.ok).toBe(false);
    if (!porOtra.ok) expect(porOtra.error.code).toBe('FORBIDDEN');

    const contestada = await answerClarification(suyo, {
      clarificationId: pedida.data.clarificationId,
      answer: 'Doy clase a tres grupos donde hay estudiantes autistas y coordino sus adecuaciones.',
    });
    expect(contestada.ok, contestada.ok ? '' : JSON.stringify(contestada.error)).toBe(true);
    if (!contestada.ok) return;
    expect(contestada.data.late).toBe(false);

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, clarificationDueAt: true },
    });
    expect(solicitud.status).toBe('UNDER_REVIEW');
    expect(solicitud.clarificationDueAt).toBeNull();
  });

  it('la respuesta no se reescribe', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Necesitamos una aclaración sobre la relación entre tu trabajo y la neurodivergencia.',
      dueOn: enDias(7),
    });
    if (!pedida.ok) throw pedida.error;

    const contestada = await answerClarification(suyo, {
      clarificationId: pedida.data.clarificationId,
      answer: 'Esta es mi respuesta original y es sobre la que se va a resolver mi solicitud.',
    });
    if (!contestada.ok) throw contestada.error;

    // Lo impide la base, no la disciplina de quien programa.
    await expect(
      base.prisma.applicationClarification.update({
        where: { id: pedida.data.clarificationId },
        data: { answer: 'Otra cosa distinta que yo no dije.' },
      }),
    ).rejects.toThrow(/no se puede modificar/i);
  });

  it('contestar fuera de plazo se recibe igual, y consta que fue tarde', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Nos falta un documento tuyo para poder terminar la revisión de tu solicitud.',
      dueOn: enDias(2),
    });
    if (!pedida.ok) throw pedida.error;

    await vencerElPlazo(pedida.data.clarificationId, 2);

    const contestada = await answerClarification(suyo, {
      clarificationId: pedida.data.clarificationId,
      answer: 'Llego tarde porque estuve enferma, pero aquí está lo que me pidieron.',
    });
    expect(contestada.ok, contestada.ok ? '' : JSON.stringify(contestada.error)).toBe(true);
    if (!contestada.ok) return;
    expect(contestada.data.late).toBe(true);

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    // Y sobre todo: sigue viva. Nada la rechazó por el calendario.
    expect(solicitud.status).toBe('UNDER_REVIEW');
  });

  it('cerrarla sin respuesta exige motivo y devuelve la solicitud a revisión', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Necesitamos el comprobante que falta para poder continuar con tu solicitud.',
      dueOn: enDias(3),
    });
    if (!pedida.ok) throw pedida.error;

    const sinMotivo = await closeClarification(secretaria, {
      clarificationId: pedida.data.clarificationId,
      closeReason: 'porque sí',
    });
    expect(sinMotivo.ok).toBe(false);

    const cerrada = await closeClarification(secretaria, {
      clarificationId: pedida.data.clarificationId,
      closeReason: 'La persona avisó por teléfono que no puede conseguir el documento y pidió seguir sin él.',
    });
    expect(cerrada.ok, cerrada.ok ? '' : JSON.stringify(cerrada.error)).toBe(true);

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    expect(solicitud.status).toBe('UNDER_REVIEW');
  });
});

describe('un plazo vencido no rechaza a nadie (ADR-0080)', () => {
  it('el trabajo nocturno recuerda, y no resuelve nada', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Nos falta ver una constancia reciente de tu actividad para terminar la revisión.',
      dueOn: enDias(1),
    });
    if (!pedida.ok) throw pedida.error;

    await vencerElPlazo(pedida.data.clarificationId, 1);

    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'clarification-due',
      correlationId: newCorrelationId(),
    });
    const recordado = await remindOverdueClarifications(sistema);
    expect(recordado.ok, recordado.ok ? '' : JSON.stringify(recordado.error)).toBe(true);
    if (!recordado.ok) return;
    expect(recordado.data.reminded).toBeGreaterThanOrEqual(1);

    // Lo único que cambió es que se avisó. La solicitud sigue donde estaba.
    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, resolutionAt: true },
    });
    expect(solicitud.status).toBe('CLARIFICATION_REQUIRED');
    expect(solicitud.resolutionAt).toBeNull();

    const aclaracion = await base.prisma.applicationClarification.findUniqueOrThrow({
      where: { id: pedida.data.clarificationId },
      select: { remindedAt: true, closedAt: true, answeredAt: true },
    });
    expect(aclaracion.remindedAt).not.toBeNull();
    expect(aclaracion.closedAt).toBeNull();
    expect(aclaracion.answeredAt).toBeNull();
  });

  it('el recordatorio se manda una sola vez', async () => {
    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'clarification-due',
      correlationId: newCorrelationId(),
    });
    const segunda = await remindOverdueClarifications(sistema);
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.data.reminded).toBe(0);
  });
});

describe('resolución fundada', () => {
  it('no se resuelve sin ninguna revisión humana previa', async () => {
    const { applicationId } = await solicitudEnviada();
    const intento = await resolveApplication(secretaria, {
      applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });

  it('no se resuelve con una aclaración abierta', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Nos falta una constancia para poder cerrar la revisión de tu solicitud de afiliación.',
      dueOn: enDias(5),
    });
    if (!pedida.ok) throw pedida.error;

    const intento = await resolveApplication(secretaria, {
      applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('CONFLICT');
  });

  it('sin fundamento escrito no se resuelve', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;

    const intento = await resolveApplication(secretaria, {
      applicationId,
      decision: 'REJECTED',
      rationale: 'no',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/fundamento/i);
  });

  it('aprobar deja la resolución con su motivo, su fecha y su firma', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const recomendada = await recordRecommendation(secretaria, {
      applicationId,
      recommendation: 'RECOMMENDED_APPROVAL',
      rationale: 'La evidencia adjunta corresponde con lo declarado y no hay pertenencia a otro sindicato.',
    });
    expect(recomendada.ok, recomendada.ok ? '' : JSON.stringify(recomendada.error)).toBe(true);

    const resuelta = await resolveApplication(secretaria, {
      applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    expect(resuelta.ok, resuelta.ok ? '' : JSON.stringify(resuelta.error)).toBe(true);
    if (!resuelta.ok) return;
    expect(resuelta.data.status).toBe('APPROVED');

    const fila = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, resolutionAt: true, resolutionReason: true, resolvedById: true },
    });
    expect(fila.status).toBe('APPROVED');
    expect(fila.resolutionAt).not.toBeNull();
    expect(fila.resolutionReason).toBe(MOTIVO);
    expect(fila.resolvedById).toBe(secretariaPersona.userId);

    // Y a la persona se le avisa con el fundamento entero.
    const aviso = await base.prisma.backgroundJob.findFirst({
      where: { jobType: 'application-notice', businessKey: `RESOLUTION:${applicationId}` },
      select: { payload: true },
    });
    expect(JSON.stringify(aviso?.payload)).toContain('APPLICATION_APPROVED');
    expect(JSON.stringify(aviso?.payload)).toContain('corresponde con la evidencia');
  });

  it('rechazar manda el motivo entero a la persona', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;

    const motivo =
      'La actividad declarada no guarda relación con personas neurodivergentes, que es el requisito del estatuto.';
    const resuelta = await resolveApplication(secretaria, {
      applicationId,
      decision: 'REJECTED',
      rationale: motivo,
    });
    expect(resuelta.ok, resuelta.ok ? '' : JSON.stringify(resuelta.error)).toBe(true);

    const aviso = await base.prisma.backgroundJob.findFirst({
      where: { jobType: 'application-notice', businessKey: `RESOLUTION:${applicationId}` },
      select: { payload: true },
    });
    expect(JSON.stringify(aviso?.payload)).toContain('APPLICATION_REJECTED');
    expect(JSON.stringify(aviso?.payload)).toContain('no guarda relación');
  });

  it('una solicitud resuelta no se vuelve a resolver', async () => {
    const { applicationId } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const primera = await resolveApplication(secretaria, {
      applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    if (!primera.ok) throw primera.error;

    const segunda = await resolveApplication(secretaria, {
      applicationId,
      decision: 'REJECTED',
      rationale: 'Cambié de opinión después de firmarla, que para eso mando.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('el expediente cuenta la historia entera', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const pedida = await requestClarification(secretaria, {
      applicationId,
      request: 'Cuéntanos con más detalle en qué consiste tu trabajo con personas neurodivergentes.',
      dueOn: enDias(6),
    });
    if (!pedida.ok) throw pedida.error;
    const contestada = await answerClarification(suyo, {
      clarificationId: pedida.data.clarificationId,
      answer: 'Coordino las adecuaciones curriculares de cinco estudiantes autistas en mi escuela.',
    });
    if (!contestada.ok) throw contestada.error;
    const resuelta = await resolveApplication(secretaria, {
      applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    if (!resuelta.ok) throw resuelta.error;

    const detalle = await applicationDetail(secretaria, { applicationId });
    expect(detalle.ok).toBe(true);
    if (!detalle.ok) return;
    expect(detalle.data.clarifications).toHaveLength(1);
    expect(detalle.data.clarifications[0]?.state).toBe('ANSWERED');
    expect(detalle.data.clarifications[0]?.answer).toContain('adecuaciones curriculares');
    expect(detalle.data.reviews.map((una) => una.action)).toEqual([
      'ASSIGNED',
      'INFORMATION_REQUESTED',
      'APPROVED',
    ]);
    expect(detalle.data.resolutionReason).toBe(MOTIVO);
  });

  it('la persona ve su propia resolución con el motivo', async () => {
    const { applicationId, suyo } = await solicitudEnviada();
    const tomada = await startReview(secretaria, { applicationId });
    if (!tomada.ok) throw tomada.error;
    const motivo = 'No se acreditó el vínculo con la neurodivergencia que pide el estatuto en su artículo 12.';
    const resuelta = await resolveApplication(secretaria, {
      applicationId,
      decision: 'REJECTED',
      rationale: motivo,
    });
    if (!resuelta.ok) throw resuelta.error;

    const comoLoVe = await applicationDetail(suyo, { applicationId });
    expect(comoLoVe.ok).toBe(true);
    if (!comoLoVe.ok) return;
    expect(comoLoVe.data.status).toBe('REJECTED');
    expect(comoLoVe.data.resolutionReason).toBe(motivo);
  });
});
