import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  activateFromConfirmedPayment,
  endMembership,
  expireDueMemberships,
  membershipDetail,
  personMemberships,
  reinstateMembership,
  registerBeneficiary,
  resolveApplication,
  startReview,
  submitApplication,
  suspendMembership,
} from '@/modules/membership';
import { createPrice, createProduct } from '@/modules/billing';
import { grantConsent, publishConsentVersion } from '@/platform/consent';
import { dispatchOutbox, clearHandlersForTests } from '@/platform/jobs/queue';
import { registerDomainEventHandlers, resetRegistryForTests } from '@/platform/jobs/domain-event-registry';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId, newPublicId } from '@/platform/kernel/ids';

/**
 * Activación por cobro confirmado, vigencias, bajas y conversiones
 * (PRD §3.6, §8.1 pasos 12 y 13, §8.4; F4-AFI-008, F4-AFI-009).
 *
 * La promesa central: **una membresía nace de un hecho**. Ni el regreso del
 * navegador ni la buena voluntad de nadie la activan; la activa una resolución
 * cumplida y un cobro confirmado, y cuando no hay cuota, la resolución sola.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let especialidadId: string;
let precioId: string;

beforeAll(async () => {
  base = await createTestDatabase('membresias');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Membresías',
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

  // La semilla deja las calidades sin cuota a propósito: cuánto cuesta
  // afiliarse lo decide la organización, no una migración (ADR-0033). La
  // prueba hace de organización y le pone cuota a la calidad sindical, que es
  // lo que hace falta para probar la activación por cobro confirmado.
  const finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'Finanzas', familyName: 'De Prueba' });
  await nombrar(base.prisma, {
    userId: finanzas.userId,
    roleCode: 'FINANCE',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  const contexoFinanzas = await contextoDe(base.prisma, finanzas);

  const producto = await createProduct(contexoFinanzas, {
    code: 'CUOTA_INSCRIPCION_PRUEBA',
    name: 'Cuota de inscripción',
    description: 'La cuota que se paga una sola vez al afiliarse como agremiada.',
    legalEntityId: entidadId,
    kind: 'ENROLLMENT_FEE',
    billingMode: 'ONE_TIME',
  });
  if (!producto.ok) throw producto.error;

  const precio = await createPrice(contexoFinanzas, {
    productId: producto.data.productId,
    amountMinor: 50000,
    currency: 'MXN',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  });
  if (!precio.ok) throw precio.error;
  precioId = precio.data.priceId;

  await base.prisma.membershipType.update({
    where: { code: 'AGREMIADO' },
    data: { requiresPayment: true, catalogProductId: producto.data.productId, durationMonths: 12 },
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const MOTIVO = 'Se revisó el expediente completo y cumple los requisitos del estatuto vigente.';

let contador = 0;

/** Una persona solicitante con su contexto. */
async function solicitante(nombre: string) {
  contador += 1;
  const quien = await crearPersonaConCuenta(base.prisma, {
    givenName: `${nombre}${contador}`,
    familyName: 'De Membresía',
  });
  await nombrar(base.prisma, {
    userId: quien.userId,
    roleCode: 'APPLICANT',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  return { quien, suyo: await contextoDe(base.prisma, quien) };
}

/** Envía una solicitud de la calidad indicada y la deja resuelta. */
async function solicitudResuelta(codigo: 'AGREMIADO' | 'AFILIADO_HONORARIO', nombre = 'Solicita') {
  const { quien, suyo } = await solicitante(nombre);
  const tipo = await base.prisma.membershipType.findUniqueOrThrow({
    where: { code: codigo },
    select: { id: true, requiresPayment: true, catalogProductId: true },
  });

  const enviada =
    codigo === 'AGREMIADO'
      ? await submitApplication(suyo, {
          category: 'UNION_MEMBER',
          membershipTypeId: tipo.id,
          occupationSpecialtyId: especialidadId,
          workRelationKind: 'SUBORDINATE',
          neurodivergentContactStatement:
            'Trabajo en una escuela pública y acompaño a estudiantes autistas todos los días.',
          otherUnionMembership: 'NONE',
          acceptsStatutes: true,
        })
      : await submitApplication(suyo, {
          category: 'HONORARY_AFFILIATE',
          membershipTypeId: tipo.id,
          honoraryProfile: 'FAMILY_MEMBER',
          acceptsStatutes: true,
        });
  if (!enviada.ok) throw enviada.error;

  const tomada = await startReview(secretaria, { applicationId: enviada.data.applicationId });
  if (!tomada.ok) throw tomada.error;

  const resuelta = await resolveApplication(secretaria, {
    applicationId: enviada.data.applicationId,
    decision: 'APPROVED',
    rationale: MOTIVO,
  });
  if (!resuelta.ok) throw resuelta.error;

  return { quien, suyo, tipo, applicationId: enviada.data.applicationId, resuelta: resuelta.data };
}

/** Un cobro confirmado a nombre de la persona, atado a su solicitud. */
async function cobroConfirmado(personId: string, applicationId: string): Promise<string> {
  const cuenta = await base.prisma.billingAccount.create({
    data: { holderKind: 'PERSON', personId, legalEntityId: entidadId, billingEmail: 'prueba@ejemplo.invalid' },
    select: { id: true },
  });
  const actor = await base.prisma.actor.findFirstOrThrow({ select: { id: true } });

  const pago = await base.prisma.payment.create({
    data: {
      publicId: newPublicId(20),
      billingAccountId: cuenta.id,
      legalEntityId: entidadId,
      catalogPriceId: precioId,
      stripeAccountKey: 'FUERZA',
      amountMinor: 50000n,
      currency: 'MXN',
      status: 'SUCCEEDED',
      method: 'STRIPE_CHECKOUT',
      paidAt: new Date(),
      idempotencyKey: newPublicId(24),
      createdByActorId: actor.id,
    },
    select: { id: true },
  });

  await base.prisma.membershipApplication.update({
    where: { id: applicationId },
    data: { paymentId: pago.id },
  });

  return pago.id;
}

describe('activación', () => {
  it('sin cuota, la resolución activa la membresía en el acto', async () => {
    const { quien, tipo, applicationId, resuelta } = await solicitudResuelta('AFILIADO_HONORARIO', 'Honoraria');
    expect(tipo.requiresPayment).toBe(false);
    expect(resuelta.memberNumber).not.toBeNull();

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    expect(solicitud.status).toBe('ACTIVATED');

    const membresias = await base.prisma.membership.findMany({
      where: { personId: quien.personId },
      select: { status: true, memberNumber: true, category: true, applicationId: true },
    });
    expect(membresias).toHaveLength(1);
    expect(membresias[0]?.status).toBe('ACTIVE');
    expect(membresias[0]?.category).toBe('HONORARY_AFFILIATE');
    expect(membresias[0]?.applicationId).toBe(applicationId);
    // La serie distingue la calidad: una credencial honoraria no debe poder
    // confundirse con una sindical por su número.
    expect(membresias[0]?.memberNumber).toMatch(/-H\d{4}-\d{5}$/);
  });

  it('con cuota, aprobar no activa nada: la membresía espera al cobro', async () => {
    const { quien, tipo, applicationId, resuelta } = await solicitudResuelta('AGREMIADO', 'ConCuota');
    expect(tipo.requiresPayment).toBe(true);
    expect(resuelta.memberNumber).toBeNull();

    const solicitud = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    expect(solicitud.status).toBe('APPROVED');
    expect(await base.prisma.membership.count({ where: { personId: quien.personId } })).toBe(0);
  });

  it('el cobro confirmado la activa, y repetirlo no crea una segunda', async () => {
    const { quien, applicationId } = await solicitudResuelta('AGREMIADO', 'Paga');
    const paymentId = await cobroConfirmado(quien.personId, applicationId);

    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'domain-events',
      correlationId: newCorrelationId(),
    });

    const primera = await activateFromConfirmedPayment(sistema, paymentId);
    expect(primera.activated).toBe(true);

    // Un reenvío del webhook no reparte una segunda membresía ni un segundo número.
    const segunda = await activateFromConfirmedPayment(sistema, paymentId);
    expect(segunda.activated).toBe(false);

    const membresias = await base.prisma.membership.findMany({
      where: { personId: quien.personId },
      select: { status: true, memberNumber: true, expiresAt: true },
    });
    expect(membresias).toHaveLength(1);
    expect(membresias[0]?.status).toBe('ACTIVE');
    expect(membresias[0]?.memberNumber).toMatch(/-A\d{4}-\d{5}$/);
    // La vigencia sale de la duración de la calidad, no de una fecha inventada.
    expect(membresias[0]?.expiresAt).not.toBeNull();
  });

  it('un cobro que no está confirmado no activa nada', async () => {
    const { quien, applicationId } = await solicitudResuelta('AGREMIADO', 'NoPaga');
    const paymentId = await cobroConfirmado(quien.personId, applicationId);
    await base.prisma.payment.update({ where: { id: paymentId }, data: { status: 'REQUIRES_PAYMENT' } });

    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'domain-events',
      correlationId: newCorrelationId(),
    });
    const intento = await activateFromConfirmedPayment(sistema, paymentId);
    expect(intento.activated).toBe(false);
    expect(await base.prisma.membership.count({ where: { personId: quien.personId } })).toBe(0);
  });

  it('la activación llega por la bandeja de salida, no por una llamada suelta', async () => {
    const { quien, applicationId } = await solicitudResuelta('AGREMIADO', 'PorBandeja');
    const paymentId = await cobroConfirmado(quien.personId, applicationId);

    clearHandlersForTests();
    resetRegistryForTests();
    await registerDomainEventHandlers();

    const actor = await base.prisma.actor.findFirstOrThrow({ select: { id: true } });
    await base.prisma.outboxMessage.create({
      data: {
        eventName: 'billing.payment.succeeded',
        payload: { paymentId, origen: 'prueba' },
        legalEntityId: entidadId,
        correlationId: newCorrelationId(),
        createdByActorId: actor.id,
      },
    });

    const repartido = await dispatchOutbox();
    expect(repartido.failed).toBe(0);
    expect(repartido.delivered).toBeGreaterThanOrEqual(1);

    const membresias = await base.prisma.membership.count({ where: { personId: quien.personId } });
    expect(membresias).toBe(1);
  });
});

describe('vigencia', () => {
  it('vencer no es dar de baja: queda vencida, con su propio motivo y sin decisión de nadie', async () => {
    const { quien, applicationId } = await solicitudResuelta('AGREMIADO', 'Vence');
    const paymentId = await cobroConfirmado(quien.personId, applicationId);
    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'membership-expiry',
      correlationId: newCorrelationId(),
    });
    const activada = await activateFromConfirmedPayment(sistema, paymentId);
    expect(activada.activated).toBe(true);

    // Se retrocede también el alta: la base exige que la vigencia termine
    // después de empezar, y que haya que respetarla aquí es la prueba de que la
    // garantía existe. Ninguna ruta del producto puede dejar una membresía
    // vencida el día que nace.
    await base.sql.query(
      `UPDATE membership
          SET "startedAt" = now() - interval '13 months',
              "expiresAt" = now() - interval '1 day'
        WHERE "personId" = $1`,
      [quien.personId],
    );

    const vencidas = await expireDueMemberships(sistema);
    expect(vencidas.ok, vencidas.ok ? '' : JSON.stringify(vencidas.error)).toBe(true);
    if (!vencidas.ok) return;
    expect(vencidas.data.expired).toBeGreaterThanOrEqual(1);

    const fila = await base.prisma.membership.findFirstOrThrow({
      where: { personId: quien.personId },
      select: { status: true, endedAt: true, endReason: true },
    });
    expect(fila.status).toBe('EXPIRED');
    // Termina, sí, pero con un motivo que dice que no lo decidió nadie. Sin
    // `EXPIRY` habría que anotarlo como inactividad o corrección
    // administrativa, y las dos afirman una decisión que no existió.
    expect(fila.endReason).toBe('EXPIRY');
    // Y la fecha de fin es la del vencimiento, no la del día en que el trabajo
    // nocturno se enteró.
    expect(fila.endedAt).not.toBeNull();

    // Y el asiento explica qué pasó, en lugar de dejar un cambio mudo.
    const eventos = await base.prisma.membershipStatusEvent.findMany({
      where: { membership: { personId: quien.personId }, toStatus: 'EXPIRED' },
      select: { reason: true, fromStatus: true },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.fromStatus).toBe('ACTIVE');
    expect(eventos[0]?.reason).toMatch(/renovar la devuelve/i);
  });

  it('una segunda pasada no vuelve a vencer lo ya vencido', async () => {
    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'membership-expiry',
      correlationId: newCorrelationId(),
    });
    const otra = await expireDueMemberships(sistema);
    expect(otra.ok).toBe(true);
    if (!otra.ok) return;
    expect(otra.data.expired).toBe(0);
  });
});

describe('suspensión y baja', () => {
  async function membresiaActiva(nombre: string) {
    const { quien, applicationId } = await solicitudResuelta('AGREMIADO', nombre);
    const paymentId = await cobroConfirmado(quien.personId, applicationId);
    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'domain-events',
      correlationId: newCorrelationId(),
    });
    const activada = await activateFromConfirmedPayment(sistema, paymentId);
    if (!activada.activated || activada.membershipId === undefined) throw new Error('no se activó');
    return { quien, membershipId: activada.membershipId };
  }

  it('suspender no pone fecha de fin, y levantarla la devuelve a activa', async () => {
    const { membershipId } = await membresiaActiva('Suspende');

    const suspendida = await suspendMembership(secretaria, {
      membershipId,
      reason: 'Cuotas atrasadas de más de seis meses, notificadas por escrito en dos ocasiones.',
    });
    expect(suspendida.ok, suspendida.ok ? '' : JSON.stringify(suspendida.error)).toBe(true);

    const enPausa = await base.prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { status: true, endedAt: true },
    });
    expect(enPausa.status).toBe('SUSPENDED');
    expect(enPausa.endedAt).toBeNull();

    const levantada = await reinstateMembership(secretaria, {
      membershipId,
      reason: 'La persona se puso al corriente y presentó el comprobante.',
    });
    expect(levantada.ok, levantada.ok ? '' : JSON.stringify(levantada.error)).toBe(true);

    const despues = await base.prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { status: true },
    });
    expect(despues.status).toBe('ACTIVE');
  });

  it('sin motivo escrito no se suspende', async () => {
    const { membershipId } = await membresiaActiva('SinMotivo');
    const intento = await suspendMembership(secretaria, { membershipId, reason: 'porque sí' });
    expect(intento.ok).toBe(false);
  });

  it('una baja voluntaria y una expulsión no terminan en el mismo estado', async () => {
    const irse = await membresiaActiva('SeVa');
    const expulsada = await membresiaActiva('Expulsada');

    const voluntaria = await endMembership(secretaria, {
      membershipId: irse.membershipId,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió por escrito dejar de ser agremiada.',
    });
    expect(voluntaria.ok, voluntaria.ok ? '' : JSON.stringify(voluntaria.error)).toBe(true);
    if (!voluntaria.ok) return;
    expect(voluntaria.data.status).toBe('VOLUNTARY_WITHDRAWAL');

    const expulsion = await endMembership(secretaria, {
      membershipId: expulsada.membershipId,
      endReason: 'EXPULSION',
      reason: 'Resolución firme del procedimiento disciplinario número catorce.',
    });
    expect(expulsion.ok).toBe(true);
    if (!expulsion.ok) return;
    expect(expulsion.data.status).toBe('STATUS_LOSS');
  });

  it('lo terminado no revive', async () => {
    const { membershipId } = await membresiaActiva('Terminada');
    const primera = await endMembership(secretaria, {
      membershipId,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió por escrito dejar de ser agremiada.',
    });
    if (!primera.ok) throw primera.error;

    const segunda = await suspendMembership(secretaria, {
      membershipId,
      reason: 'Intento de suspender una membresía que ya terminó.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('la persona ve su propia membresía y su historial', async () => {
    const { quien, membershipId } = await membresiaActiva('Mira');
    const suspendida = await suspendMembership(secretaria, {
      membershipId,
      reason: 'Suspensión de prueba para comprobar que la persona ve su historial completo.',
    });
    if (!suspendida.ok) throw suspendida.error;

    const suyo = await contextoDe(base.prisma, quien);
    const mias = await personMemberships(suyo, quien.personId);
    expect(mias.ok, mias.ok ? '' : JSON.stringify(mias.error)).toBe(true);
    if (!mias.ok) return;
    expect(mias.data).toHaveLength(1);
    expect(mias.data[0]?.status).toBe('SUSPENDED');
    expect(mias.data[0]?.events.length).toBeGreaterThanOrEqual(2);
  });

  it('quien no tiene la facultad no lee la membresía de otra persona', async () => {
    const { membershipId } = await membresiaActiva('Ajena');
    const { suyo } = await solicitante('Curiosa');
    const intento = await membershipDetail(suyo, membershipId);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('conversión sin duplicar a la persona (PRD §8.4)', () => {
  it('una beneficiaria protegida se afilia conservando registro, atención y consentimientos', async () => {
    const { quien, suyo } = await solicitante('Convierte');

    // 1. Recibe atención como beneficiaria protegida.
    const atencion = await registerBeneficiary(secretaria, {
      personId: quien.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Pidió acompañamiento para un trámite y así llegó a la organización.',
    });
    if (!atencion.ok) throw atencion.error;

    // 2. Otorga un consentimiento antes de afiliarse.
    const version = await base.prisma.consentVersion.findFirstOrThrow({
      where: { code: 'PRIVACY_NOTICE_PUBLIC_INTAKE' },
      select: { id: true },
    });
    const publicada = await publishConsentVersion(secretaria, {
      consentVersionId: version.id,
      effectiveFrom: '2026-01-01',
    });
    if (!publicada.ok && publicada.error.code !== 'CONFLICT') throw publicada.error;

    const otorgado = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'MEMBERSHIP',
      consentVersionId: version.id,
      medium: 'SCREEN',
    });
    if (!otorgado.ok) throw otorgado.error;

    // 3. Se afilia como honoraria: una calidad nueva, la misma persona.
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { id: true },
    });
    const enviada = await submitApplication(suyo, {
      category: 'HONORARY_AFFILIATE',
      membershipTypeId: tipo.id,
      honoraryProfile: 'NEURODIVERGENT_PERSON',
      acceptsStatutes: true,
    });
    if (!enviada.ok) throw enviada.error;
    const tomada = await startReview(secretaria, { applicationId: enviada.data.applicationId });
    if (!tomada.ok) throw tomada.error;
    const resuelta = await resolveApplication(secretaria, {
      applicationId: enviada.data.applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    if (!resuelta.ok) throw resuelta.error;

    // La persona es una sola.
    const personas = await base.prisma.person.count({ where: { id: quien.personId } });
    expect(personas).toBe(1);

    // La atención sigue abierta: afiliarse no cierra el acompañamiento.
    const atencionDespues = await base.prisma.protectedBeneficiary.findFirstOrThrow({
      where: { personId: quien.personId },
      select: { status: true },
    });
    expect(atencionDespues.status).toBe('REGISTERED');

    // El consentimiento sigue vivo, con su versión original.
    const consentimiento = await base.prisma.consent.findFirstOrThrow({
      where: { personId: quien.personId, purpose: 'MEMBERSHIP' },
      select: { revokedAt: true, consentVersionId: true },
    });
    expect(consentimiento.revokedAt).toBeNull();
    expect(consentimiento.consentVersionId).toBe(version.id);

    // Y ahora es afiliada honoraria.
    const membresias = await base.prisma.membership.findMany({
      where: { personId: quien.personId },
      select: { category: true, status: true },
    });
    expect(membresias).toHaveLength(1);
    expect(membresias[0]?.category).toBe('HONORARY_AFFILIATE');
    expect(membresias[0]?.status).toBe('ACTIVE');
  });

  it('convertir de honoraria a agremiada tiene motivo propio, y no se anota como baja', async () => {
    const { quien, applicationId } = await solicitudResuelta('AFILIADO_HONORARIO', 'Asciende');
    const honoraria = await base.prisma.membership.findFirstOrThrow({
      where: { personId: quien.personId, applicationId },
      select: { id: true },
    });

    const convertida = await endMembership(secretaria, {
      membershipId: honoraria.id,
      endReason: 'CONVERSION',
      reason: 'Pasó a la calidad de agremiada tras el trámite separado que exige el estatuto.',
    });
    expect(convertida.ok, convertida.ok ? '' : JSON.stringify(convertida.error)).toBe(true);

    const fila = await base.prisma.membership.findUniqueOrThrow({
      where: { id: honoraria.id },
      select: { endReason: true, endedAt: true },
    });
    expect(fila.endReason).toBe('CONVERSION');
    expect(fila.endedAt).not.toBeNull();
  });
});
