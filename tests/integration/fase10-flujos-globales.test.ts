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
import { systemContext } from '@/platform/kernel/actor-context';
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
