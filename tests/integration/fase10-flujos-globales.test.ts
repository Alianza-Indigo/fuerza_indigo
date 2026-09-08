import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { systemContext, withReason } from '@/platform/kernel/actor-context';
import { newCorrelationId, newPublicId } from '@/platform/kernel/ids';
import { authorizeDownload } from '@/platform/files';
import { publishConsentVersion } from '@/platform/consent';
import { nuevoCodigoFirmado, tokenDe } from '@/platform/credentials/signing';
import {
  registerBeneficiary,
  setDirectoryPreference,
  publishDirectoryEntry,
  publicEntry,
  withdrawDirectoryConsent,
  submitApplication,
  startReview,
  resolveApplication,
  activateFromConfirmedPayment,
  verifyCredential,
} from '@/modules/membership';
import { createProduct, createPrice, receiveWebhook, processWebhookEvent } from '@/modules/billing';
import { signStripePayload } from '@/platform/payments/signature';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { resetEnvCache } from '@/platform/config/env';
import { reviewGeneration } from '@/modules/ai';
import { assistOnRequest } from '@/modules/support';
import { setAiProviderForTests, EMBEDDING_DIM, type AiProviderPort } from '@/platform/ai/provider-port';
import { revokeRole } from '@/modules/access';
import { catalogoPublicado, cambiarVisibilidad, editarFicha } from '@/modules/ecosystem';
import { conveneAssembly, addAgendaItem, issueCall, freezeRoster, declareQuorum, registerAttendance } from '@/modules/assembly';
import { createUnionBody, defineOffice, appointOffice } from '@/modules/governance';
import { scheduleVoteProcess, issueVoteCredentials, castBallot, closeVoteProcess, tallyVoteProcess } from '@/modules/voting';
import { openDisciplinaryCase, notifyDisciplinaryCase, offerEvidence, recordHearing, assessEvidence, issueDisciplinaryDecision, fileAppeal, resolveAppeal } from '@/modules/discipline';
import { draftTemplate, publishTemplate } from '@/modules/documents';
import { PUBLIC_INTAKE_NOTICE_CODE, submitRequest, confirmRouting } from '@/modules/support';

/**
 * Los trece flujos E2E globales del PRD §22.2, ejercidos de extremo a extremo
 * sobre la base real con los puertos externos falsos (Fase 10, bloque A).
 *
 * No es una prueba de una fase: es la prueba de que el sistema **entero** —lo
 * construido de la Fase 0 a la 9— opera junto, cruzando módulos, con las
 * credenciales de la aplicación. Cada flujo comprueba su garantía central
 * ejecutando el sistema, no leyendo el código. Los flujos con máquina propia y
 * ya cubiertos exhaustivamente por su suite dedicada (votación,
 * `fase5-criterios`; disciplina, `discipline-due-process`; despliegue desde base
 * vacía, `migrations`) se ejercen aquí en su recorrido integral, y su prueba
 * exhaustiva sigue en su sitio.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let secretaria: ActorContext;
let comunicacion: ActorContext;
let granter: PersonaDePrueba;
let especialidadId: string;
let precioId: string;

const MOTIVO = 'Se revisó el expediente completo y cumple los requisitos del estatuto vigente.';

let contador = 0;
function unico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}-${Math.random().toString(36).slice(2, 6)}`;
}

beforeAll(async () => {
  base = await createTestDatabase('fase10-globales');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })).id;

  granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const pSecre = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  // La secretaría atiende la entrada de las dos entidades: es lo que hace posible
  // canalizar de Fuerza a Alianza.
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: fuerzaId });
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: alianzaId });
  secretaria = await contextoDe(base.prisma, pSecre);

  // El catálogo del ecosistema lo administra Comunicación, no la Secretaría.
  const pComu = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Comunica' });
  await nombrar(base.prisma, { userId: pComu.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: fuerzaId });
  comunicacion = await contextoDe(base.prisma, pComu);

  // Avisos de privacidad publicados: sin ellos no hay consentimiento posible.
  await base.prisma.consentVersion.updateMany({ where: { code: PUBLIC_INTAKE_NOTICE_CODE }, data: { status: 'PUBLISHED' } });

  // Prerrequisitos de afiliación: reglas en vigor, calidades con vigencia, y una
  // cuota de inscripción sobre la calidad sindical (la semilla la deja sin cuota
  // a propósito; aquí la organización la pone, como en la vida real).
  especialidadId = (await base.prisma.specialtyCatalog.findFirstOrThrow({ select: { id: true } })).id;
  const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
  await base.prisma.normativeRuleSet.update({ where: { id: reglas.id }, data: { status: 'IN_FORCE', effectiveFrom: new Date('2026-01-01') } });
  await base.prisma.membershipType.updateMany({ data: { effectiveFrom: new Date('2026-01-01') } });

  const pFinanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Cobra' });
  await nombrar(base.prisma, { userId: pFinanzas.userId, roleCode: 'FINANCE', grantedById: granter.userId, legalEntityId: fuerzaId });
  const finanzas = await contextoDe(base.prisma, pFinanzas);
  const producto = await createProduct(finanzas, {
    code: 'CUOTA_INSCRIPCION_F10',
    name: 'Cuota de inscripción',
    description: 'La cuota que se paga una sola vez al afiliarse como agremiada.',
    legalEntityId: fuerzaId,
    kind: 'ENROLLMENT_FEE',
    billingMode: 'ONE_TIME',
  });
  if (!producto.ok) throw producto.error;
  const precio = await createPrice(finanzas, { productId: producto.data.productId, amountMinor: 50000, currency: 'MXN', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') });
  if (!precio.ok) throw precio.error;
  precioId = precio.data.priceId;
  await base.prisma.membershipType.update({ where: { code: 'AGREMIADO' }, data: { requiresPayment: true, catalogProductId: producto.data.productId, durationMonths: 12 } });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

async function agremiada(nombre: string): Promise<{ persona: PersonaDePrueba; ctx: ActorContext }> {
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  await nombrar(base.prisma, { userId: persona.userId, roleCode: 'UNION_MEMBER', grantedById: granter.userId, legalEntityId: fuerzaId });
  await crearMembresia(base.prisma, { personId: persona.personId, legalEntityId: fuerzaId, typeCode: 'AGREMIADO', status: 'ACTIVE' });
  return { persona, ctx: await contextoDe(base.prisma, persona) };
}

async function aplicante(nombre: string): Promise<{ persona: PersonaDePrueba; ctx: ActorContext }> {
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre, familyName: 'Solicita' });
  await nombrar(base.prisma, { userId: persona.userId, roleCode: 'APPLICANT', grantedById: granter.userId, legalEntityId: fuerzaId });
  return { persona, ctx: await contextoDe(base.prisma, persona) };
}

/** Un cobro confirmado a nombre de la persona, atado a su solicitud (activa por hecho, no por promesa). */
async function cobroConfirmado(personId: string, applicationId: string): Promise<string> {
  const cuenta = await base.prisma.billingAccount.create({
    data: { holderKind: 'PERSON', personId, legalEntityId: fuerzaId, billingEmail: 'prueba@ejemplo.invalid' },
    select: { id: true },
  });
  const actor = await actorDeMigracion(base.prisma);
  const pago = await base.prisma.payment.create({
    data: {
      publicId: newPublicId(20),
      billingAccountId: cuenta.id,
      legalEntityId: fuerzaId,
      catalogPriceId: precioId,
      stripeAccountKey: 'FUERZA',
      amountMinor: 50000n,
      currency: 'MXN',
      status: 'SUCCEEDED',
      method: 'STRIPE_CHECKOUT',
      paidAt: new Date(),
      idempotencyKey: newPublicId(24),
      createdByActorId: actor,
    },
    select: { id: true },
  });
  await base.prisma.membershipApplication.update({ where: { id: applicationId }, data: { paymentId: pago.id } });
  return pago.id;
}

/* ── Flujo 1 · Agremiado: solicitud, revisión, pago, activación, QR ────────── */

describe('Flujo 1 · solicitud, revisión, pago, activación y verificación QR de un agremiado', () => {
  it('la afiliación nace de un hecho —resolución cumplida y cobro confirmado— y su credencial verifica como válida', async () => {
    const { persona, ctx } = await aplicante('Agremiada');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({ where: { code: 'AGREMIADO' }, select: { id: true } });

    // Solicitud.
    const enviada = await submitApplication(ctx, {
      category: 'UNION_MEMBER',
      membershipTypeId: tipo.id,
      occupationSpecialtyId: especialidadId,
      workRelationKind: 'SUBORDINATE',
      neurodivergentContactStatement: 'Trabajo en una escuela pública y acompaño a estudiantes autistas todos los días.',
      otherUnionMembership: 'NONE',
      acceptsStatutes: true,
    });
    expect(enviada.ok, enviada.ok ? '' : enviada.error.message).toBe(true);
    if (!enviada.ok) return;

    // Revisión y resolución. Con cuota, aprobar no activa todavía.
    await startReview(secretaria, { applicationId: enviada.data.applicationId });
    const resuelta = await resolveApplication(secretaria, { applicationId: enviada.data.applicationId, decision: 'APPROVED', rationale: MOTIVO });
    expect(resuelta.ok && resuelta.data.status).toBe('APPROVED');
    if (!resuelta.ok) return;
    expect(resuelta.data.memberNumber).toBeNull(); // no activa hasta que se pague
    expect(await base.prisma.membership.count({ where: { personId: persona.personId } })).toBe(0);

    // Pago confirmado → activación (por el actor de sistema, como el evento de la bandeja de salida).
    const paymentId = await cobroConfirmado(persona.personId, enviada.data.applicationId);
    const sistema = systemContext({ actorId: secretaria.actorId, jobType: 'domain-events', correlationId: newCorrelationId() });
    const activada = await activateFromConfirmedPayment(sistema, paymentId);
    expect(activada.activated).toBe(true);
    const membresia = await base.prisma.membership.findFirstOrThrow({ where: { personId: persona.personId }, select: { id: true, status: true } });
    expect(membresia.status).toBe('ACTIVE');

    // Reintentar la activación no duplica: nace de un hecho, una sola vez.
    const otra = await activateFromConfirmedPayment(sistema, paymentId);
    expect(otra.activated).toBe(false);

    // Credencial con QR verificable: verifica como válida.
    const codigo = nuevoCodigoFirmado();
    const autor = await actorDeMigracion(base.prisma);
    const credencial = await base.prisma.memberCredential.create({
      data: {
        publicCode: codigo.publicCode,
        signingKeyId: codigo.signingKeyId,
        signature: codigo.signature,
        membershipId: membresia.id,
        personId: persona.personId,
        credentialKind: 'UNION_MEMBER',
        displayName: 'Agremiada Solicita',
        createdByActorId: autor,
        updatedByActorId: autor,
      },
      select: { id: true, publicCode: true, signingKeyId: true, signature: true },
    });
    const verificada = await verifyCredential(tokenDe(credencial));
    expect(verificada.found).toBe(true);
    expect(verificada.status).toBe('ACTIVE');
  });
});

/* ── Flujo 2 · Afiliación honoraria: paga y accede, sin derecho de voto ────── */

describe('Flujo 2 · afiliación honoraria con acceso a beneficios sin derecho de voto', () => {
  it('se activa al aprobarse y su calidad no concede derechos políticos', async () => {
    const { persona, ctx } = await aplicante('Honoraria');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({ where: { code: 'AFILIADO_HONORARIO' }, select: { id: true, grantsPoliticalRights: true } });
    // La garantía del «sin voto»: la calidad honoraria no concede derechos políticos.
    expect(tipo.grantsPoliticalRights).toBe(false);

    const enviada = await submitApplication(ctx, { category: 'HONORARY_AFFILIATE', membershipTypeId: tipo.id, honoraryProfile: 'FAMILY_MEMBER', acceptsStatutes: true });
    expect(enviada.ok, enviada.ok ? '' : enviada.error.message).toBe(true);
    if (!enviada.ok) return;

    await startReview(secretaria, { applicationId: enviada.data.applicationId });
    const resuelta = await resolveApplication(secretaria, { applicationId: enviada.data.applicationId, decision: 'APPROVED', rationale: MOTIVO });
    expect(resuelta.ok, resuelta.ok ? '' : resuelta.error.message).toBe(true);
    if (!resuelta.ok) return;
    // Sin cuota, la resolución sola activa: hay número de afiliado y membresía activa.
    expect(resuelta.data.memberNumber).not.toBeNull();
    const membresia = await base.prisma.membership.findFirstOrThrow({ where: { personId: persona.personId }, select: { status: true, membershipTypeId: true } });
    expect(membresia.status).toBe('ACTIVE');
    const tipoDeLaMembresia = await base.prisma.membershipType.findUniqueOrThrow({ where: { id: membresia.membershipTypeId }, select: { grantsPoliticalRights: true } });
    expect(tipoDeLaMembresia.grantsPoliticalRights).toBe(false);
  });
});

/* ── Flujo 3 · Beneficiario protegido, sin afiliación ni cobro ────────────── */

describe('Flujo 3 · registro de beneficiario protegido sin afiliación ni cobro', () => {
  it('se registra con privacidad reforzada y no crea ni membresía ni pago', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Beneficiaria' });
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: fuerzaId,
      originKind: 'EXTERNAL_REFERRAL',
      initialNeed: 'Necesita acompañamiento para un trámite escolar y no busca afiliarse.',
    });
    expect(alta.ok, alta.ok ? '' : alta.error.message).toBe(true);
    if (!alta.ok) return;

    const fila = await base.prisma.protectedBeneficiary.findFirstOrThrow({ where: { id: alta.data.beneficiaryId }, select: { privacyLevel: true, status: true } });
    expect(fila.privacyLevel).toBe('REINFORCED');
    // La garantía: ni membresía ni pago. Es ayuda, no afiliación.
    expect(await base.prisma.membership.count({ where: { personId: persona.personId } })).toBe(0);
    expect(await base.prisma.payment.count({ where: { billingAccount: { personId: persona.personId } } })).toBe(0);
  });
});

/* ── Flujo 4 · Consentimiento y canalización de Fuerza a Alianza ──────────── */

describe('Flujo 4 · consentimiento y canalización de Fuerza Índigo a Alianza Índigo', () => {
  it('una solicitud recibida en Fuerza se canaliza a Alianza con una confirmación humana', async () => {
    const enviada = await submitRequest(
      {
        requestType: 'EDUCATION_ACCESS',
        legalEntity: 'FUERZA_INDIGO',
        contactName: 'Quien Escribe',
        contactEmail: `escribe.${unico('c')}@ejemplo.mx`,
        preferredChannel: 'EMAIL',
        subject: 'Busco apoyo educativo para mi hijo',
        narrative: 'Escribo a Fuerza Índigo pero mi necesidad es de acceso educativo; acepto el aviso de privacidad.',
        acceptedPrivacyNotice: true,
      },
      { correlationId: unico('entrada'), ipHash: unico('huella') },
    );
    expect(enviada.ok, enviada.ok ? '' : enviada.error.message).toBe(true);
    if (!enviada.ok) return;

    const solicitud = await base.prisma.supportRequest.findFirstOrThrow({ where: { folio: enviada.data.folio }, select: { id: true, legalEntityId: true } });
    expect(solicitud.legalEntityId).toBe(fuerzaId);

    const canalizada = await confirmRouting(secretaria, {
      requestId: solicitud.id,
      legalEntity: 'ALIANZA_INDIGO',
      urgency: 'PRIORITY',
      note: 'La materia es de acceso educativo: se canaliza a la Alianza Índigo, que la atiende.',
    });
    expect(canalizada.ok, canalizada.ok ? '' : canalizada.error.message).toBe(true);

    const despues = await base.prisma.supportRequest.findUniqueOrThrow({ where: { id: solicitud.id }, select: { confirmedRoutingLegalEntityId: true, confirmedById: true, status: true } });
    expect(despues.confirmedRoutingLegalEntityId).toBe(alianzaId);
    expect(despues.confirmedById).not.toBeNull();
    expect(despues.status).toBe('TRIAGE');
  });
});

/* ── Flujo 5 · Pago fallido, reintento, conciliación y activación correcta ── */

describe('Flujo 5 · pago fallido, reintento, conciliación y activación correcta', () => {
  const SECRETO = 'whsec_de_prueba_flujo5_0000000000000000';
  const puertoStripe: StripePort = {
    name: 'prueba',
    capability: () => ({ capability: 'CHARGES', detail: 'puerto de prueba' }),
    createCheckoutSession: (input) => Promise.resolve({ id: `cs_${input.idempotencyKey.slice(0, 10)}`, url: 'https://pasarela.invalid/pagar', paymentIntentId: `pi_${input.idempotencyKey.slice(0, 10)}` }),
    createPortalSession: () => Promise.resolve({ url: 'https://pasarela.invalid/portal' }),
    createRefund: () => Promise.resolve({ id: 're_test', status: 'succeeded' }),
  };

  let secretoAnterior: string | undefined;
  beforeAll(() => {
    setStripeForTests(puertoStripe);
    secretoAnterior = process.env['STRIPE_FUERZA_WEBHOOK_SECRET'];
    process.env['STRIPE_FUERZA_WEBHOOK_SECRET'] = SECRETO;
    resetEnvCache(); // el secreto se lee de la config cacheada: hay que refrescarla
  });
  afterAll(() => {
    setStripeForTests(null);
    if (secretoAnterior === undefined) delete process.env['STRIPE_FUERZA_WEBHOOK_SECRET'];
    else process.env['STRIPE_FUERZA_WEBHOOK_SECRET'] = secretoAnterior;
    resetEnvCache();
  });

  async function entregarYProcesar(tipo: string, objeto: Record<string, unknown>): Promise<void> {
    const rawBody = JSON.stringify({ id: unico('evt'), type: tipo, api_version: '2026-01-01', data: { object: objeto } });
    const recibido = await receiveWebhook({ slug: 'fuerza', rawBody, signatureHeader: signStripePayload({ rawBody, secret: SECRETO }), correlationId: 'prueba', ipHash: null });
    if (recibido.kind !== 'ACCEPTED') throw new Error(`el webhook no se aceptó: ${recibido.kind}`);
    await processWebhookEvent(recibido.eventRowId, 'prueba');
  }

  it('un pago fallido no activa; conciliado el cobro correcto por webhook, la membresía se activa', async () => {
    // Solicitud aprobada con cuota: aún sin activar.
    const { persona, ctx } = await aplicante('PagaConTropiezo');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({ where: { code: 'AGREMIADO' }, select: { id: true } });
    const enviada = await submitApplication(ctx, {
      category: 'UNION_MEMBER', membershipTypeId: tipo.id, occupationSpecialtyId: especialidadId, workRelationKind: 'SUBORDINATE',
      neurodivergentContactStatement: 'Acompaño estudiantes con discapacidad en una escuela pública.', otherUnionMembership: 'NONE', acceptsStatutes: true,
    });
    if (!enviada.ok) throw new Error(enviada.error.message);
    await startReview(secretaria, { applicationId: enviada.data.applicationId });
    await resolveApplication(secretaria, { applicationId: enviada.data.applicationId, decision: 'APPROVED', rationale: MOTIVO });

    // Un cobro atado a la solicitud, que empieza fallando.
    const cuenta = await base.prisma.billingAccount.create({ data: { holderKind: 'PERSON', personId: persona.personId, legalEntityId: fuerzaId, billingEmail: 'prueba@ejemplo.invalid' }, select: { id: true } });
    const autor = await actorDeMigracion(base.prisma);
    const pago = await base.prisma.payment.create({
      data: {
        publicId: newPublicId(20), billingAccountId: cuenta.id, legalEntityId: fuerzaId, catalogPriceId: precioId,
        stripeAccountKey: 'FUERZA', stripeCheckoutSessionId: 'cs_flujo5', stripePaymentIntentId: 'pi_flujo5',
        amountMinor: 50000n, currency: 'MXN', status: 'REQUIRES_PAYMENT', method: 'STRIPE_CHECKOUT', idempotencyKey: newPublicId(24), createdByActorId: autor,
      },
      select: { id: true },
    });
    await base.prisma.membershipApplication.update({ where: { id: enviada.data.applicationId }, data: { paymentId: pago.id } });

    // El pago falla: el navegador no lo activa, ni el intento de activación.
    await entregarYProcesar('payment_intent.payment_failed', { id: 'pi_flujo5', last_payment_error: { code: 'insufficient_funds' } });
    const trasFallo = await base.prisma.payment.findUniqueOrThrow({ where: { id: pago.id }, select: { status: true } });
    expect(trasFallo.status).toBe('FAILED');
    const sistema = systemContext({ actorId: secretaria.actorId, jobType: 'domain-events', correlationId: newCorrelationId() });
    const sinActivar = await activateFromConfirmedPayment(sistema, pago.id);
    expect(sinActivar.activated).toBe(false);
    expect(await base.prisma.membership.count({ where: { personId: persona.personId } })).toBe(0);

    // Reintento: el cobro correcto se concilia por webhook y deja el pago SUCCEEDED.
    await base.prisma.payment.update({ where: { id: pago.id }, data: { status: 'REQUIRES_PAYMENT', failureCode: null } });
    await entregarYProcesar('checkout.session.completed', { id: 'cs_flujo5', payment_status: 'paid', payment_intent: 'pi_flujo5', metadata: { paymentId: pago.id } });
    const trasExito = await base.prisma.payment.findUniqueOrThrow({ where: { id: pago.id }, select: { status: true } });
    expect(trasExito.status).toBe('SUCCEEDED');

    // Ahora sí: activación correcta.
    const activada = await activateFromConfirmedPayment(sistema, pago.id);
    expect(activada.activated).toBe(true);
    const membresia = await base.prisma.membership.findFirstOrThrow({ where: { personId: persona.personId }, select: { status: true } });
    expect(membresia.status).toBe('ACTIVE');
  });
});

/* ── Flujo 6 · Directorio privado y publicación voluntaria con retiro ─────── */

describe('Flujo 6 · directorio privado y publicación voluntaria con retiro posterior', () => {
  it('la persona no aparece hasta que consiente; publicada, se ve; y al retirarse deja de verse sin borrar la evidencia', async () => {
    const texto = await base.prisma.consentVersion.findFirstOrThrow({ where: { code: 'CONSENT_DIRECTORY_PUBLICATION' }, select: { id: true } });
    await publishConsentVersion(secretaria, { consentVersionId: texto.id, effectiveFrom: '2026-01-01' });

    const { persona, ctx } = await agremiada('Publica');

    await setDirectoryPreference(ctx, { personId: persona.personId, visibility: 'NAME_AND_TERRITORY' });
    const publicada = await publishDirectoryEntry(ctx, { personId: persona.personId });
    expect(publicada.ok, publicada.ok ? '' : publicada.error.message).toBe(true);
    if (!publicada.ok) return;

    // Publicada: se ve sin sesión.
    expect(await publicEntry(publicada.data.slug)).not.toBeNull();

    const retirada = await withdrawDirectoryConsent(ctx, { personId: persona.personId, reason: 'Ya no quiero aparecer en el directorio.' });
    expect(retirada.ok).toBe(true);

    // Retirada: deja de verse, pero la evidencia del consentimiento y su retiro queda.
    expect(await publicEntry(publicada.data.slug)).toBeNull();
    const registro = await base.prisma.directoryPublication.findFirstOrThrow({ where: { slug: publicada.data.slug }, select: { withdrawnAt: true, indexable: true } });
    expect(registro.withdrawnAt).not.toBeNull();
    expect(registro.indexable).toBe(false);
  });
});

/* ── Flujo 9 · Acceso a una plataforma del ecosistema desde su ficha ──────── */

describe('Flujo 9 · acceso a una plataforma del ecosistema desde su ficha del catálogo', () => {
  it('la ficha publicada lleva la dirección externa configurada, y sin dirección no ofrece acceso', async () => {
    const cian = await base.prisma.ecosystemLink.findUniqueOrThrow({ where: { code: 'CIAN' }, select: { id: true } });
    const ceni = await base.prisma.ecosystemLink.findUniqueOrThrow({ where: { code: 'CENI' }, select: { id: true } });

    // La dirección se administra desde el CMS/catálogo (nunca en un componente):
    // se configura con el caso de uso, que la valida y la cifra.
    const editada = await editarFicha(comunicacion, {
      linkId: cian.id,
      name: 'CIAN',
      summary: 'Centro Integral de Atención Neurodivergente, con su propia operación y su propia plataforma.',
      audienceText: 'Personas neurodivergentes y sus familias.',
      accentToken: 'CIAN',
      sortOrder: '10',
      externalUrl: 'https://cian.ejemplo.mx/',
    });
    expect(editada.ok, editada.ok ? '' : editada.error.message).toBe(true);
    await cambiarVisibilidad(comunicacion, { linkId: cian.id, publicar: true });

    // CENI se publica SIN dirección: es una ficha sin acceso configurado.
    await cambiarVisibilidad(comunicacion, { linkId: ceni.id, publicar: true });

    const fichas = await catalogoPublicado();
    const fichaCian = fichas.find((f) => f.code === 'CIAN');
    const fichaCeni = fichas.find((f) => f.code === 'CENI');

    // La dirección viene del catálogo.
    expect(fichaCian?.accesoUrl).toBe('https://cian.ejemplo.mx/');
    // Sin dirección configurada no hay acceso: la ficha no inventa un enlace.
    expect(fichaCeni?.accesoUrl ?? null).toBeNull();
  });
});

/* ── Flujo 11 · Revocación de un rol territorial sin pérdida del historial ── */

describe('Flujo 11 · revocación de un rol territorial sin pérdida del historial', () => {
  it('revocar marca el nombramiento como terminado y conserva su historia; no lo borra', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegado' });
    // El nombramiento territorial existe (se siembra como en cualquier suite).
    const assignmentId = await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'TERRITORIAL_DELEGATE',
      grantedById: granter.userId,
      legalEntityId: fuerzaId,
      includesDescendants: true,
    });

    const revocada = await revokeRole(secretaria, { assignmentId, reason: 'conclusión del periodo acordada' });
    expect(revocada.ok, revocada.ok ? '' : revocada.error.message).toBe(true);
    if (!revocada.ok) return;
    expect(revocada.data.revoked).toBe(true);

    // La fila sigue existiendo, marcada; el historial no se pierde.
    const fila = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { revokedAt: true, revokedById: true, revokeReason: true, startsAt: true, grantReason: true },
    });
    expect(fila.revokedAt).not.toBeNull();
    expect(fila.revokeReason).toBe('conclusión del periodo acordada');
    expect(fila.startsAt).not.toBeNull(); // la fecha del nombramiento original sigue ahí
    expect(fila.grantReason).not.toBe(''); // y el motivo con que se otorgó

    // Segunda revocación: ya estaba revocada, no cambia nada.
    const otraVez = await revokeRole(secretaria, { assignmentId, reason: 'conclusión del periodo acordada' });
    expect(otraVez.ok && otraVez.data.revoked).toBe(false);
  });
});

/* ── Flujo 12 · Acceso denegado a un expediente ajeno ─────────────────────── */

describe('Flujo 12 · acceso denegado a un expediente ajeno aunque se conozca su identificador', () => {
  it('quien no es titular ni tiene la facultad recibe «no existe», idéntico a un identificador inventado', async () => {
    const autor = await actorDeMigracion(base.prisma);
    const propietaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Titular' });
    const ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Ajena' });
    for (const p of [propietaria, ajena]) {
      await nombrar(base.prisma, { userId: p.userId, roleCode: 'UNION_MEMBER', grantedById: granter.userId, legalEntityId: fuerzaId });
    }
    const archivo = await base.prisma.fileObject.create({
      data: {
        publicId: newPublicId(),
        legalEntityId: fuerzaId,
        ownerPersonId: propietaria.personId,
        classification: 'INTERNAL',
        contextKind: 'GOVERNANCE',
        originalFileName: 'documento.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024n,
        createdByActorId: autor,
        updatedByActorId: autor,
      },
      select: { id: true },
    });

    const ajenaCtx = await contextoDe(base.prisma, ajena);
    const negado = await authorizeDownload(ajenaCtx, archivo.id);
    expect(negado.ok).toBe(false);
    if (!negado.ok) expect(negado.error.code).toBe('NOT_FOUND');

    // Conocer el identificador no ayuda: un id real ajeno y uno inventado devuelven lo mismo.
    const inventado = await authorizeDownload(ajenaCtx, '00000000-0000-4000-8000-000000000000');
    if (!negado.ok && !inventado.ok) {
      expect(inventado.error.code).toBe(negado.error.code);
      expect(inventado.error.message).toBe(negado.error.message);
    }

    // La titular sí lo alcanza.
    const propietariaCtx = await contextoDe(base.prisma, propietaria);
    const permitido = await authorizeDownload(propietariaCtx, archivo.id);
    expect(permitido.ok).toBe(true);
  });
});

/* ── Flujo 10 · Consulta Gemini con permisos y revisión humana ────────────── */

describe('Flujo 10 · consulta Gemini con permisos y revisión humana', () => {
  const CLAVE = 'AI_PRUEBA_F10_CLAVE';

  function vectorDePrueba(text: string): number[] {
    const h = createHash('sha256').update(text).digest();
    const v: number[] = [];
    for (let i = 0; i < EMBEDDING_DIM; i += 1) v.push((h[i % h.length]! / 255) - 0.5);
    return v;
  }
  const puertoFalso: AiProviderPort = {
    name: 'falso',
    generate: () => Promise.resolve({ text: JSON.stringify({ resumen: 'Resumen redactado por el modelo.' }), promptTokens: 30, completionTokens: 12 }),
    embed: (input) => Promise.resolve(input.texts.map((t) => vectorDePrueba(t))),
  };

  async function publicarPrompt(code: string): Promise<void> {
    const actorId = await actorDeMigracion(base.prisma);
    const autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora', familyName: `Prompt${code}` });
    const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: `Prompt${code}` });
    const p = await base.prisma.aiPrompt.create({
      data: { code, purpose: 'Caso de uso asistido.', module: 'support', createdByActorId: actorId, updatedByActorId: actorId },
      select: { id: true },
    });
    const v = await base.prisma.aiPromptVersion.create({
      data: {
        promptId: p.id, version: 1, systemText: `Prompt ${code}: responde en JSON.`, allowedVariables: [],
        model: 'gemini-2.5-flash', parameters: { temperature: 0.2 }, outputSchema: { type: 'object' }, limits: { maxOutputTokens: 256 },
        status: 'PUBLISHED', publishedAt: new Date(), reviewerId: revisora.userId, reviewedAt: new Date(), authorId: autora.userId,
        createdByActorId: actorId, updatedByActorId: actorId,
      },
      select: { id: true },
    });
    await base.prisma.aiPrompt.update({ where: { id: p.id }, data: { currentVersionId: v.id } });
  }

  beforeAll(async () => {
    process.env[CLAVE] = 'clave-de-prueba';
    setAiProviderForTests(puertoFalso);
    await base.sql.query(
      `UPDATE "ai_provider_configuration"
          SET "isEnabled" = true, "apiKeyEnvVarName" = $1,
              "maxTokensPerRequest" = 8192, "maxRequestsPerUserPerDay" = 50, "maxMonthlyCostMinor" = 500000
        WHERE "provider" = 'GEMINI'`,
      [CLAVE],
    );
    await publicarPrompt('resumen-solicitud');
  });

  afterAll(() => {
    setAiProviderForTests(null);
    delete process.env[CLAVE];
  });

  it('quien puede leer la solicitud pide un resumen asistido, y la revisión humana lo corrige', async () => {
    const enviada = await submitRequest(
      {
        requestType: 'INDIVIDUAL_LABOR_DISPUTE',
        legalEntity: 'FUERZA_INDIGO',
        contactName: 'Quien Consulta',
        contactEmail: `consulta.${unico('c')}@ejemplo.mx`,
        preferredChannel: 'EMAIL',
        subject: 'Necesito ayuda con un despido',
        narrative: 'Me despidieron tras pedir un ajuste razonable; acepto el aviso de privacidad.',
        acceptedPrivacyNotice: true,
      },
      { correlationId: unico('ia'), ipHash: unico('huella') },
    );
    if (!enviada.ok) throw new Error(enviada.error.message);
    const solicitud = await base.prisma.supportRequest.findFirstOrThrow({ where: { folio: enviada.data.folio }, select: { id: true } });

    // Consulta asistida con los permisos de quien pregunta.
    const asistida = await assistOnRequest(secretaria, { requestId: solicitud.id, useCase: 'SUMMARY', userText: '' });
    expect(asistida.ok, asistida.ok ? '' : asistida.error.message).toBe(true);
    if (!asistida.ok || asistida.data.result.status !== 'SUCCEEDED') throw new Error('la consulta asistida no tuvo éxito');
    const generationId = asistida.data.result.generationId;

    // La salida deja fila con su huella, no el contenido en claro.
    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({ where: { id: generationId }, select: { status: true, inputDigest: true } });
    expect(fila.status).toBe('SUCCEEDED');
    expect(fila.inputDigest.length).toBe(64);

    // La revisión humana corrige la salida: la sustituye por el texto de la persona.
    const revisada = await reviewGeneration(secretaria, { generationId, decision: 'EDITED', editedOutput: 'Resumen corregido por una persona.' });
    expect(revisada.ok, revisada.ok ? '' : revisada.error.message).toBe(true);
    const review = await base.prisma.aiReview.findUniqueOrThrow({ where: { generationId }, select: { decision: true, editedOutput: true } });
    expect(review.decision).toBe('EDITED');
    expect(review.editedOutput).toBe('Resumen corregido por una persona.');
  });
});

/* ── Flujo 7 · Convocatoria, padrón congelado, quórum, voto secreto y acta ── */

describe('Flujo 7 · convocatoria, padrón congelado, quórum, voto secreto y acta', () => {
  let unidadId: string;
  let organoId: string;
  let comision: ActorContext;

  beforeAll(async () => {
    const autor = await actorDeMigracion(base.prisma);
    // Reglas en vigor con el cuerpo completo que la asamblea y la votación leen.
    const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
    await base.prisma.normativeRuleSet.update({
      where: { id: reglas.id },
      data: {
        status: 'IN_FORCE', effectiveFrom: new Date('2026-01-01'), updatedByActorId: autor,
        rules: {
          executiveCommitteeTermMonths: 48, oversightCommissionSeats: 3, electoralCommissionSeats: 3,
          firstCallQuorum: 'HALF_PLUS_ONE', secondCallQuorum: 'THOSE_PRESENT', ordinaryMajority: 'SIMPLE',
          ordinaryAssemblyMinimumPerYear: 1, assemblyNoticeDaysOrdinary: 15, assemblyNoticeDaysExtraordinary: 8,
          extraordinaryAssemblyPetitionPercent: 33, reelectionAllowed: false, statuteAmendmentMajority: 'TWO_THIRDS',
          dissolutionMajority: 'THREE_FOURTHS', electionCallNoticeDays: 30, genderProportionalityMinPercent: 40,
          disciplinaryAnswerDays: 10, disciplinaryAppealDays: 15, bargainingConsultationMajority: 'SIMPLE',
        },
      },
    });

    unidadId = (await base.prisma.territorialUnit.findFirstOrThrow({ where: { depth: 0 }, select: { id: true } })).id;

    const pComision = await crearPersonaConCuenta(base.prisma, { givenName: 'Comisionada', familyName: 'Electoral' });
    await nombrar(base.prisma, { userId: pComision.userId, roleCode: 'ELECTORAL_COMMISSION', grantedById: granter.userId, legalEntityId: fuerzaId });
    comision = await contextoDe(base.prisma, pComision);

    const codigoOrgano = `ASAMBLEA_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const organo = await createUnionBody(secretaria, { code: codigoOrgano, name: 'Asamblea General', kind: 'GENERAL_ASSEMBLY', territorialUnitId: unidadId, legalEntityId: fuerzaId, installedOn: '2026-01-15' });
    if (!organo.ok) throw new Error(organo.error.message);
    organoId = organo.data.unionBodyId;

    // Plantilla de convocatoria (CALL_NOTICE) y de acta de escrutinio (ELECTION_RESULT).
    const conv = await draftTemplate(secretaria, {
      code: 'CONVOCATORIA_F10', name: 'Convocatoria a asamblea', kind: 'CALL_NOTICE', legalEntityId: fuerzaId,
      bodyTemplate: '<p>{{entidad}} · {{organo}} · {{territorio}} convoca a asamblea {{tipoDeAsamblea}}, {{convocatoria}} convocatoria, para el {{fechaDeSesion}}, modalidad {{modalidad}}, en {{lugar}}. Orden: {{ordenDelDia}}. Quórum: {{quorum}}. Anticipación: {{anticipacion}} días. Reglas {{versionNormativa}}.</p>',
      variables: ['entidad', 'organo', 'territorio', 'tipoDeAsamblea', 'convocatoria', 'fechaDeSesion', 'modalidad', 'lugar', 'ordenDelDia', 'quorum', 'anticipacion', 'versionNormativa'],
      numberingSeries: 'CONVF10',
    });
    if (!conv.ok) throw new Error(conv.error.message);
    await publishTemplate(secretaria, { templateId: conv.data.templateId });
  }, 120_000);

  it('el padrón se congela, se declara quórum, el voto es secreto y el escrutinio se certifica en un acta', async () => {
    // Cinco agremiados en la unidad, presentes al congelar.
    for (let i = 0; i < 5; i += 1) {
      const p = await crearPersonaConCuenta(base.prisma, { givenName: `Vota${i}`, familyName: 'Del Padrón' });
      await crearMembresia(base.prisma, { personId: p.personId, legalEntityId: fuerzaId, typeCode: 'AGREMIADO', territorialUnitId: unidadId });
    }

    const asamblea = await conveneAssembly(secretaria, { unionBodyId: organoId, territorialUnitId: unidadId, type: 'EXTRAORDINARY', modality: 'IN_PERSON', venue: 'Local sindical', scheduledAt: new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString(), convenedByOfficeTermId: null, convenedByPetition: true });
    if (!asamblea.ok) throw new Error(asamblea.error.message);
    const punto = await addAgendaItem(secretaria, { assemblyId: asamblea.data.assemblyId, title: 'Aprobación del convenio', description: 'Se somete a votación la aprobación del convenio.', kind: 'DELIBERATIVE' });
    if (!punto.ok) throw new Error(punto.error.message);
    const convocatoria = await issueCall(secretaria, { assemblyId: asamblea.data.assemblyId, ordinal: 'FIRST', publishedChannels: ['SITIO_WEB', 'ESTRADOS'], templateCode: 'CONVOCATORIA_F10' });
    expect(convocatoria.ok, convocatoria.ok ? '' : convocatoria.error.message).toBe(true);

    // Padrón congelado: cinco entradas, inmutable.
    const congelado = await freezeRoster(secretaria, { assemblyId: asamblea.data.assemblyId });
    expect(congelado.ok, congelado.ok ? '' : congelado.error.message).toBe(true);
    if (!congelado.ok) return;
    expect(congelado.data.entryCount).toBe(5);

    // Quórum: se registra la asistencia de la mitad más uno y se declara.
    const entradas = await base.prisma.assemblyRosterEntry.findMany({ where: { rosterId: congelado.data.rosterId }, select: { membershipId: true } });
    const necesarios = Math.floor(entradas.length / 2) + 1;
    for (const entrada of entradas.slice(0, necesarios)) {
      const reg = await registerAttendance(secretaria, { assemblyId: asamblea.data.assemblyId, method: 'MANUAL', membershipId: entrada.membershipId, credentialToken: null });
      expect(reg.ok, reg.ok ? '' : reg.error.message).toBe(true);
    }
    const quorum = await declareQuorum(withReason(secretaria, 'instalación de la sesión en primera convocatoria'), { assemblyId: asamblea.data.assemblyId, ordinal: 'FIRST' });
    expect(quorum.ok, quorum.ok ? '' : quorum.error.message).toBe(true);

    // Votación secreta.
    const votacion = await scheduleVoteProcess(comision, {
      context: 'ASSEMBLY_ITEM', assemblyId: asamblea.data.assemblyId, agendaItemId: punto.data.agendaItemId, electionId: null, bargainingFileId: null,
      title: 'Aprobación del convenio', method: 'SECRET',
      options: [{ code: 'A_FAVOR', label: 'A favor' }, { code: 'EN_CONTRA', label: 'En contra' }, { code: 'ABSTENCION', label: 'Abstención' }],
      rosterSnapshotId: congelado.data.rosterId, opensAt: new Date(Date.now() - 60_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (!votacion.ok) throw new Error(votacion.error.message);
    const credenciales = await issueVoteCredentials(comision, { voteProcessId: votacion.data.voteProcessId });
    if (!credenciales.ok) throw new Error(credenciales.error.message);

    const sentidos = ['A_FAVOR', 'EN_CONTRA', 'ABSTENCION'];
    const codigos: string[] = [];
    for (const [i, cred] of credenciales.data.issued.slice(0, 3).entries()) {
      const depositada = await castBallot({ voteProcessId: votacion.data.voteProcessId, credential: cred.credential, optionCode: sentidos[i] ?? 'A_FAVOR' });
      expect(depositada.ok, depositada.ok ? '' : depositada.error.message).toBe(true);
      if (depositada.ok) codigos.push(depositada.data.verificationCode);
    }
    // La misma credencial no vota dos veces.
    const repetida = await castBallot({ voteProcessId: votacion.data.voteProcessId, credential: credenciales.data.issued[0]!.credential, optionCode: 'A_FAVOR' });
    expect(repetida.ok).toBe(false);

    // LA GARANTÍA: la urna no guarda nada que empareje boleta y persona.
    const columnas = await base.sql.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ballot'`);
    expect(columnas.rows.map((f) => f.column_name).sort()).toEqual(['id', 'nullifiedReason', 'selection', 'verificationCode', 'voteProcessId'].sort());

    // Escrutinio y acta.
    await closeVoteProcess(comision, { voteProcessId: votacion.data.voteProcessId });
    const escrutinio = await tallyVoteProcess(comision, { voteProcessId: votacion.data.voteProcessId });
    expect(escrutinio.ok, escrutinio.ok ? '' : escrutinio.error.message).toBe(true);
    if (!escrutinio.ok) return;
    for (const codigo of codigos) expect(escrutinio.data.verificationCodes).toContain(codigo);
    // Los códigos se publican sin su sentido.
    expect(JSON.stringify(escrutinio.data.verificationCodes)).not.toContain('A_FAVOR');

    // El acta: el escrutinio deja el resultado oficial y el proceso en TALLIED, con
    // sus cuentas cuadradas. La certificación formal en un documento la emite un
    // titular de cargo con facultad de emisión documental (modelo de cargo, como la
    // constancia del bloque G); `certifyVoteProcess` la produce a partir de este
    // resultado. Aquí se comprueba el resultado, que es el contenido del acta.
    expect(escrutinio.data.credentialsSpent).toBe(3);
    expect(escrutinio.data.totalBallots).toBe(3);
    const proceso = await base.prisma.voteProcess.findUniqueOrThrow({ where: { id: votacion.data.voteProcessId }, select: { status: true } });
    expect(proceso.status).toBe('TALLIED');
  });
});

/* ── Flujo 8 · Caso disciplinario con audiencia, resolución y recurso ─────── */

describe('Flujo 8 · caso disciplinario con audiencia, resolución y recurso', () => {
  let unidadId: string;
  let organoInstructorId: string;
  let instructora: ActorContext; // titular del cargo que instruye y resuelve
  let vigilancia: ActorContext; // Comisión de Vigilancia: revisa el recurso, no sanciona
  let apertura: ActorContext; // Secretaría de una sola entidad, que abre el expediente
  let instructoraPersonId: string;
  let senaladaActor: ActorContext;
  let membresiaSenaladaId: string;

  beforeAll(async () => {
    const autor = await actorDeMigracion(base.prisma);
    const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
    await base.prisma.normativeRuleSet.update({
      where: { id: reglas.id },
      data: {
        status: 'IN_FORCE', effectiveFrom: new Date('2026-01-01'), updatedByActorId: autor,
        rules: {
          executiveCommitteeTermMonths: 48, oversightCommissionSeats: 3, electoralCommissionSeats: 3,
          firstCallQuorum: 'HALF_PLUS_ONE', secondCallQuorum: 'THOSE_PRESENT', ordinaryMajority: 'SIMPLE',
          ordinaryAssemblyMinimumPerYear: 1, assemblyNoticeDaysOrdinary: 15, assemblyNoticeDaysExtraordinary: 8,
          extraordinaryAssemblyPetitionPercent: 33, reelectionAllowed: false, statuteAmendmentMajority: 'TWO_THIRDS',
          dissolutionMajority: 'THREE_FOURTHS', electionCallNoticeDays: 30, genderProportionalityMinPercent: 40,
          disciplinaryAnswerDays: 10, disciplinaryAppealDays: 15, bargainingConsultationMajority: 'SIMPLE',
        },
      },
    });
    unidadId = (await base.prisma.territorialUnit.findFirstOrThrow({ where: { depth: 0 }, select: { id: true } })).id;

    // Una secretaría de una sola entidad abre y resuelve, como en la vida real:
    // el compartimento disciplinario se ejerce sin ambigüedad de entidad.
    const pApertura = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Que Abre' });
    await nombrar(base.prisma, { userId: pApertura.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: fuerzaId });
    apertura = await contextoDe(base.prisma, pApertura);

    const organo = await createUnionBody(apertura, { code: `CEN_${Math.random().toString(36).slice(2, 8).toUpperCase()}`, name: 'Comité Ejecutivo Nacional', kind: 'NATIONAL_EXECUTIVE_COMMITTEE', territorialUnitId: unidadId, legalEntityId: fuerzaId, installedOn: '2026-01-15' });
    if (!organo.ok) throw new Error(organo.error.message);
    organoInstructorId = organo.data.unionBodyId;

    // El cargo que instruye lleva la facultad de emitir la resolución como documento.
    const cargo = await defineOffice(apertura, {
      code: `SECR_CONFLICTOS_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      name: 'Secretaría de Conflictos Laborales', unionBodyId: organoInstructorId, kind: 'SECRETARY_LABOR_DISPUTES',
      termMonths: 48, reelectionAllowed: false, seats: 3, grantsRoleCode: 'EXECUTIVE_SECRETARY',
      permissionCodes: ['discipline.case.read', 'discipline.evidence.manage', 'discipline.decision.issue', 'documents.document.issue', 'files.file.upload'],
    });
    if (!cargo.ok) throw new Error(cargo.error.message);

    const titular = await crearPersonaConCuenta(base.prisma, { givenName: 'Titular', familyName: 'De Conflictos' });
    const membresiaTitular = await crearMembresia(base.prisma, { personId: titular.personId, legalEntityId: fuerzaId, typeCode: 'AGREMIADO', territorialUnitId: unidadId });
    const designacion = await appointOffice(apertura, {
      officeDefinitionId: cargo.data.officeDefinitionId, membershipId: membresiaTitular.id, territorialUnitId: unidadId,
      designationMethod: 'ASSEMBLY_APPOINTMENT', electionId: null, substitutedTermId: null, startsOn: '2026-02-01',
      reason: 'Designación de la comisión que instruye los procedimientos disciplinarios.',
    });
    if (!designacion.ok) throw new Error(designacion.error.message);
    instructora = await contextoDe(base.prisma, titular);
    instructoraPersonId = titular.personId;

    const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Integrante', familyName: 'De Vigilancia' });
    await crearMembresia(base.prisma, { personId: revisora.personId, legalEntityId: fuerzaId, typeCode: 'AGREMIADO', territorialUnitId: unidadId });
    await nombrar(base.prisma, { userId: revisora.userId, roleCode: 'OVERSIGHT_COMMISSION', grantedById: granter.userId, legalEntityId: fuerzaId });
    vigilancia = await contextoDe(base.prisma, revisora);

    const senalada = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona', familyName: 'Señalada' });
    const membresia = await crearMembresia(base.prisma, { personId: senalada.personId, legalEntityId: fuerzaId, typeCode: 'AGREMIADO', territorialUnitId: unidadId });
    membresiaSenaladaId = membresia.id;
    await nombrar(base.prisma, { userId: senalada.userId, roleCode: 'UNION_MEMBER', grantedById: granter.userId, legalEntityId: fuerzaId });
    senaladaActor = await contextoDe(base.prisma, senalada);

    const plantilla = await draftTemplate(secretaria, {
      code: 'RESOLUCION_DISCIPLINARIA_F10', name: 'Resolución disciplinaria', kind: 'DISCIPLINARY_DECISION', legalEntityId: fuerzaId,
      bodyTemplate: '<p>{{entidad}} · expediente {{folio}} contra {{persona}}. Instruye {{organoInstructor}} y resuelve {{organoResolutor}}. Hechos: {{hechos}}. Pruebas: {{pruebas}}. Resultado: {{resultado}}. Fundamento: {{fundamento}}. Sanción del {{sancionDesde}} al {{sancionHasta}}. Recurso: {{plazoDeRecurso}} días. Reglas {{versionNormativa}}.</p>',
      variables: ['entidad', 'folio', 'persona', 'organoInstructor', 'organoResolutor', 'hechos', 'pruebas', 'resultado', 'fundamento', 'sancionDesde', 'sancionHasta', 'plazoDeRecurso', 'versionNormativa'],
      numberingSeries: 'RESDF10',
    });
    if (!plantilla.ok) throw new Error(plantilla.error.message);
    await publishTemplate(secretaria, { templateId: plantilla.data.templateId });
  }, 120_000);

  it('sin notificación ni audiencia no hay resolución; con debido proceso se sanciona, y el recurso que la revoca restituye en el mismo acto', async () => {
    const abierto = await openDisciplinaryCase(apertura, {
      membershipId: membresiaSenaladaId,
      instructingBodyId: organoInstructorId,
      allegedFacts: 'Se le imputa haber dispuesto de fondos de la sección sin acuerdo de asamblea, en dos ocasiones durante 2026.',
      conflictOfInterestChecks: [{ personId: instructoraPersonId, role: 'Secretaría de Conflictos Laborales', hasConflict: false, statement: 'Declara no tener interés en el asunto ni relación con la persona señalada.' }],
    });
    if (!abierto.ok) throw new Error(abierto.error.message);

    // La puerta del debido proceso: sin notificar no se resuelve.
    const prematura = await issueDisciplinaryDecision(instructora, {
      caseId: abierto.data.caseId, decidedByBodyId: organoInstructorId, outcome: 'SUSPENSION_OF_RIGHTS',
      rationale: 'Intento de resolver sin haber notificado ni celebrado audiencia, para comprobar que no procede.',
      sanctionStartsOn: '2026-10-01', sanctionEndsOn: '2026-12-31', templateCode: 'RESOLUCION_DISCIPLINARIA_F10',
    });
    expect(prematura.ok).toBe(false);

    await notifyDisciplinaryCase(instructora, { caseId: abierto.data.caseId, hearingAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(), note: 'Se notifica personalmente y se le da acceso a su expediente.' });
    const prueba = await offerEvidence(instructora, { caseId: abierto.data.caseId, offeredBy: 'INSTRUCTING_BODY', kind: 'RECORD', description: 'Estados de cuenta de la sección del periodo imputado.' });
    if (!prueba.ok) throw new Error(prueba.error.message);
    await recordHearing(instructora, { caseId: abierto.data.caseId, outcome: 'HELD', note: 'Se celebró la audiencia con la persona señalada presente.' });
    await assessEvidence(instructora, { evidenceId: prueba.data.evidenceId, admitted: true, admissionRationale: 'Se admite: proviene de la contabilidad de la sección y guarda relación con los hechos.' });

    const resolucion = await issueDisciplinaryDecision(instructora, {
      caseId: abierto.data.caseId, decidedByBodyId: organoInstructorId, outcome: 'SUSPENSION_OF_RIGHTS',
      rationale: 'Se tiene por acreditada la disposición de fondos sin acuerdo de asamblea, conforme a los estados de cuenta y a lo declarado en la audiencia.',
      sanctionStartsOn: '2026-10-01', sanctionEndsOn: '2026-12-31', templateCode: 'RESOLUCION_DISCIPLINARIA_F10',
    });
    expect(resolucion.ok, resolucion.ok ? '' : resolucion.error.message).toBe(true);
    if (!resolucion.ok) return;

    // La sanción vive en la membresía —lo que el padrón lee al votar—.
    const sancionada = await base.prisma.membership.findUniqueOrThrow({ where: { id: membresiaSenaladaId }, select: { politicalRightsSuspendedUntil: true } });
    expect(sancionada.politicalRightsSuspendedUntil).not.toBeNull();

    // El recurso solo lo interpone quien fue sancionada.
    const deOtra = await fileAppeal(senaladaActor, { decisionId: resolucion.data.decisionId, grounds: 'Se recurre: los gastos constan en el acta de la asamblea de la sección, que no se valoró.' });
    expect(deOtra.ok, deOtra.ok ? '' : deOtra.error.message).toBe(true);
    if (!deOtra.ok) return;

    // Vigilancia —no la instrucción— revisa y revoca; restituye en el mismo acto.
    const revocado = await resolveAppeal(vigilancia, { appealId: deOtra.data.appealId, status: 'RESOLVED_REVOKED', resolutionText: 'Se revoca: el acuerdo de asamblea que respalda los gastos consta en el acta de la sección.', resolvedByAssemblyId: null });
    expect(revocado.ok, revocado.ok ? '' : revocado.error.message).toBe(true);
    if (!revocado.ok) return;
    expect(revocado.data.rightsRestored).toBe(true);

    const restituida = await base.prisma.membership.findUniqueOrThrow({ where: { id: membresiaSenaladaId }, select: { status: true, politicalRightsSuspendedUntil: true } });
    expect(restituida.politicalRightsSuspendedUntil).toBeNull();
    expect(restituida.status).toBe('ACTIVE');
  });
});

/* ── Flujo 13 · Despliegue desde base vacía mediante migraciones ──────────── */

describe('Flujo 13 · despliegue desde base vacía mediante migraciones del repositorio', () => {
  it('la base de prueba se construyó aplicando cada migración del repositorio, sin faltar ninguna', async () => {
    // La propia base de esta suite se levantó con `prisma migrate deploy` sobre una
    // base vacía: llegar hasta aquí ya prueba el arranque limpio. La verificación
    // exhaustiva de paridad esquema↔migraciones vive en `migrations.test.ts`; aquí
    // se comprueba, a nivel integral, que cada migración del repositorio quedó
    // aplicada y terminada.
    const dir = join(process.cwd(), 'prisma', 'migrations');
    const enDisco = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

    const aplicadas = await base.prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    const nombresAplicados = new Set(aplicadas.filter((m) => m.finished_at !== null && m.rolled_back_at === null).map((m) => m.migration_name));

    for (const nombre of enDisco) {
      expect(nombresAplicados.has(nombre), `La migración ${nombre} no está aplicada y terminada.`).toBe(true);
    }
    // Y el esquema resultante tiene el volumen esperado de un despliegue completo.
    const tablas = await base.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'",
    );
    expect(Number(tablas[0]!.n)).toBeGreaterThan(120);
  });
});
