import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import {
  activateFromConfirmedPayment,
  registerCareRelationship,
  honoraryRoster,
  personCredentials,
  personMemberships,
  registerBeneficiary,
  resolveApplication,
  startReview,
  submitApplication,
  unionRoster,
  verifyCredential,
} from '@/modules/membership';
import { createPrice, createProduct } from '@/modules/billing';
import { tokenDe } from '@/platform/credentials/signing';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId, newPublicId } from '@/platform/kernel/ids';

/**
 * Los criterios específicos de la Fase 4 (PRD §24), probados de frente
 * (F4-QA-001, F4-QA-002, F4-QA-003).
 *
 * Cada suite de bloque prueba una pieza. Esta prueba los **criterios de
 * aceptación de la fase entera**, que es otra cosa: recorren varias piezas y
 * fallan justo donde dos módulos correctos por separado no encajan.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let especialidadId: string;
let precioId: string;

beforeAll(async () => {
  base = await createTestDatabase('criterios');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Criterios',
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

  // La calidad sindical con cuota: hace falta para recorrer el ciclo completo
  // con un cobro de por medio.
  const finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'Finanzas', familyName: 'Criterios' });
  await nombrar(base.prisma, {
    userId: finanzas.userId,
    roleCode: 'FINANCE',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  const contextoFinanzas = await contextoDe(base.prisma, finanzas);

  const producto = await createProduct(contextoFinanzas, {
    code: 'CUOTA_CRITERIOS',
    name: 'Cuota de inscripción',
    description: 'La cuota que se paga una sola vez al afiliarse como agremiada.',
    legalEntityId: entidadId,
    kind: 'ENROLLMENT_FEE',
    billingMode: 'ONE_TIME',
  });
  if (!producto.ok) throw producto.error;

  const precio = await createPrice(contextoFinanzas, {
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

async function solicitante(nombre: string) {
  contador += 1;
  const quien = await crearPersonaConCuenta(base.prisma, {
    givenName: `${nombre}${contador}`,
    familyName: 'De Criterios',
  });
  await nombrar(base.prisma, {
    userId: quien.userId,
    roleCode: 'APPLICANT',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  return { quien, suyo: await contextoDe(base.prisma, quien) };
}

/* -------------------------------------------------------------------------- */
/* F4-QA-001                                                                  */
/* -------------------------------------------------------------------------- */

describe('una misma persona acumula relaciones sin duplicarse (F4-QA-001)', () => {
  it('beneficiaria, honoraria, cuidadora y titular de credencial: una sola fila de persona', async () => {
    const { quien, suyo } = await solicitante('Acumula');

    // 1. Llega pidiendo ayuda, sin afiliación ni pago de por medio.
    const atencion = await registerBeneficiary(secretaria, {
      personId: quien.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Pidió acompañamiento para un trámite y así llegó a la organización.',
    });
    expect(atencion.ok, atencion.ok ? '' : JSON.stringify(atencion.error)).toBe(true);

    // 2. Después se afilia como honoraria.
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { id: true },
    });
    const enviada = await submitApplication(suyo, {
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

    // 3. Y además cuida de otra persona.
    const cuidada = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Hija',
      familyName: 'De Criterios',
    });
    await base.prisma.person.update({
      where: { id: cuidada.personId },
      data: { birthDate: new Date('2015-05-05') },
    });
    const relacion = await registerCareRelationship(secretaria, {
      fromPersonId: quien.personId,
      toPersonId: cuidada.personId,
      kind: 'PARENT_OR_GUARDIAN',
      scope: ['MEMBERSHIP'],
    });
    expect(relacion.ok, relacion.ok ? '' : JSON.stringify(relacion.error)).toBe(true);

    // La persona sigue siendo **una**: cuatro relaciones, un registro maestro.
    const personas = await base.prisma.person.count({ where: { id: quien.personId } });
    expect(personas).toBe(1);
    const fusionada = await base.prisma.person.findUniqueOrThrow({
      where: { id: quien.personId },
      select: { mergedIntoPersonId: true },
    });
    expect(fusionada.mergedIntoPersonId).toBeNull();

    // Y cada relación existe por su lado, sobre la misma persona.
    expect(await base.prisma.protectedBeneficiary.count({ where: { personId: quien.personId } })).toBe(1);
    expect(await base.prisma.membership.count({ where: { personId: quien.personId } })).toBe(1);
    expect(await base.prisma.careRelationship.count({ where: { fromPersonId: quien.personId } })).toBe(1);
    expect(await base.prisma.memberCredential.count({ where: { personId: quien.personId } })).toBe(1);
  });

  it('la atención protegida no se cierra al afiliarse: son cosas distintas', async () => {
    const { quien, suyo } = await solicitante('Sigue');
    const atencion = await registerBeneficiary(secretaria, {
      personId: quien.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Vive una situación laboral difícil y pidió acompañamiento.',
    });
    if (!atencion.ok) throw atencion.error;

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

    const despues = await base.prisma.protectedBeneficiary.findFirstOrThrow({
      where: { personId: quien.personId },
      select: { status: true },
    });
    expect(despues.status).toBe('REGISTERED');
  });

  it('un beneficiario recibe atención sin afiliación ni pago (PRD §24)', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Solo',
      familyName: 'Atendida',
    });
    const atencion = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'EXTERNAL_REFERRAL',
      initialNeed: 'Llegó canalizada por una organización aliada y necesita orientación laboral.',
    });
    expect(atencion.ok, atencion.ok ? '' : JSON.stringify(atencion.error)).toBe(true);

    // Ni membresía, ni solicitud, ni un solo cobro.
    expect(await base.prisma.membership.count({ where: { personId: persona.personId } })).toBe(0);
    expect(await base.prisma.membershipApplication.count({ where: { personId: persona.personId } })).toBe(0);
    expect(await base.prisma.payment.count({ where: { billingAccount: { personId: persona.personId } } })).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* F4-QA-002                                                                  */
/* -------------------------------------------------------------------------- */

describe('un afiliado honorario nunca obtiene voto por error (F4-QA-002)', () => {
  it('la base no admite una calidad honoraria con derechos políticos', async () => {
    // No es una validación de formulario que alguien pueda saltarse: es que la
    // fila no cabe en la tabla.
    await expect(
      base.sql.query(
        `UPDATE membership_type SET "grantsPoliticalRights" = true WHERE code = 'AFILIADO_HONORARIO'`,
      ),
    ).rejects.toThrow(/honoraria_sin_derechos_politicos/);
  });

  it('tampoco computando para el quórum ni apareciendo ante la autoridad', async () => {
    await expect(
      base.sql.query(`UPDATE membership_type SET "countsForQuorum" = true WHERE code = 'AFILIADO_HONORARIO'`),
    ).rejects.toThrow(/honoraria_sin_derechos_politicos/);

    await expect(
      base.sql.query(
        `UPDATE membership_type SET "appearsInAuthorityRoster" = true WHERE code = 'AFILIADO_HONORARIO'`,
      ),
    ).rejects.toThrow(/honoraria_sin_derechos_politicos/);
  });

  it('ni creando una calidad honoraria nueva que se los conceda', async () => {
    await expect(
      base.sql.query(
        `INSERT INTO membership_type
           (id, code, name, category, "legalEntityId", "grantsPoliticalRights", "countsForQuorum",
            "appearsInAuthorityRoster", "requiresPayment", "isActive", "effectiveFrom",
            "benefitsSummary", "updatedAt")
         SELECT gen_random_uuid(), 'HONORARIA_CON_VOTO', 'Honoraria con voto', 'HONORARY_AFFILIATE',
                id, true, false, false, false, true, now(), 'Prueba', now()
           FROM legal_entity LIMIT 1`,
      ),
    ).rejects.toThrow(/honoraria_sin_derechos_politicos/);
  });

  it('la afiliada honoraria no aparece en el padrón sindical, y sí en el suyo', async () => {
    const { quien, suyo } = await solicitante('Honoraria');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { id: true },
    });
    const enviada = await submitApplication(suyo, {
      category: 'HONORARY_AFFILIATE',
      membershipTypeId: tipo.id,
      honoraryProfile: 'CAREGIVER',
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

    const sindical = await unionRoster(secretaria, {});
    expect(sindical.ok, sindical.ok ? '' : JSON.stringify(sindical.error)).toBe(true);
    if (!sindical.ok) return;
    expect(sindical.data.some((fila) => fila.personId === quien.personId)).toBe(false);

    const honorario = await honoraryRoster(secretaria, {});
    expect(honorario.ok).toBe(true);
    if (!honorario.ok) return;
    expect(honorario.data.some((fila) => fila.personId === quien.personId)).toBe(true);
  });

  it('y su rol no trae ninguna facultad electoral', async () => {
    const rol = await base.prisma.role.findUniqueOrThrow({
      where: { code: 'HONORARY_AFFILIATE' },
      select: { permissions: { select: { permission: { select: { code: true } } } } },
    });
    const codigos = rol.permissions.map((uno) => uno.permission.code);
    for (const codigo of codigos) {
      expect(codigo, `${codigo} no debería estar en una afiliación honoraria`).not.toMatch(
        /^(voting|election|assembly)\./,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* F4-QA-003                                                                  */
/* -------------------------------------------------------------------------- */

describe('el ciclo completo: solicitud, pago, activación y verificación (F4-QA-003)', () => {
  it('recorre las cuatro etapas y termina con un QR que dice «vigente»', async () => {
    const { quien, suyo } = await solicitante('Ciclo');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AGREMIADO' },
      select: { id: true, requiresPayment: true },
    });
    expect(tipo.requiresPayment).toBe(true);

    // 1. Solicitud.
    const enviada = await submitApplication(suyo, {
      category: 'UNION_MEMBER',
      membershipTypeId: tipo.id,
      occupationSpecialtyId: especialidadId,
      workRelationKind: 'SUBORDINATE',
      neurodivergentContactStatement:
        'Trabajo en una escuela pública y acompaño a estudiantes autistas todos los días.',
      otherUnionMembership: 'NONE',
      acceptsStatutes: true,
    });
    expect(enviada.ok, enviada.ok ? '' : JSON.stringify(enviada.error)).toBe(true);
    if (!enviada.ok) return;

    // 2. Revisión humana y resolución fundada. Con cuota, resolver **no** activa.
    const tomada = await startReview(secretaria, { applicationId: enviada.data.applicationId });
    if (!tomada.ok) throw tomada.error;
    const resuelta = await resolveApplication(secretaria, {
      applicationId: enviada.data.applicationId,
      decision: 'APPROVED',
      rationale: MOTIVO,
    });
    if (!resuelta.ok) throw resuelta.error;
    expect(resuelta.data.memberNumber).toBeNull();
    expect(await base.prisma.membership.count({ where: { personId: quien.personId } })).toBe(0);

    // 3. Cobro confirmado. Lo confirma el webhook, nunca el regreso del navegador.
    const cuenta = await base.prisma.billingAccount.create({
      data: {
        holderKind: 'PERSON',
        personId: quien.personId,
        legalEntityId: entidadId,
        billingEmail: 'ciclo@ejemplo.invalid',
      },
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
      where: { id: enviada.data.applicationId },
      data: { paymentId: pago.id },
    });

    const sistema = systemContext({
      actorId: secretaria.actorId,
      jobType: 'domain-events',
      correlationId: newCorrelationId(),
    });
    const activada = await activateFromConfirmedPayment(sistema, pago.id);
    expect(activada.activated).toBe(true);

    // 4. La membresía existe, con su número y su vigencia.
    const mias = await personMemberships(suyo, quien.personId);
    expect(mias.ok, mias.ok ? '' : JSON.stringify(mias.error)).toBe(true);
    if (!mias.ok) return;
    expect(mias.data).toHaveLength(1);
    expect(mias.data[0]?.status).toBe('ACTIVE');
    expect(mias.data[0]?.memberNumber).toMatch(/-A\d{4}-\d{5}$/);

    // 5. Y la credencial nació con ella: sin pedirla, sin un paso aparte.
    const credenciales = await personCredentials(suyo, quien.personId);
    expect(credenciales.ok).toBe(true);
    if (!credenciales.ok) return;
    expect(credenciales.data).toHaveLength(1);

    // 6. Cualquiera la verifica sin sesión, y dice lo que tiene que decir.
    const fila = await base.prisma.memberCredential.findFirstOrThrow({
      where: { personId: quien.personId },
      select: { publicCode: true, signingKeyId: true, signature: true },
    });
    const verificada = await verifyCredential(tokenDe(fila));
    expect(verificada.found).toBe(true);
    expect(verificada.status).toBe('ACTIVE');
    expect(verificada.kind).toBe('UNION_MEMBER');
    // Y no filtra el número de miembro por el camino.
    expect(JSON.stringify(verificada)).not.toContain(mias.data[0]!.memberNumber);
  });

  it('todas las transiciones del ciclo quedaron auditadas (PRD §24)', async () => {
    const { quien, suyo } = await solicitante('Auditada');
    const tipo = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { id: true },
    });
    const enviada = await submitApplication(suyo, {
      category: 'HONORARY_AFFILIATE',
      membershipTypeId: tipo.id,
      honoraryProfile: 'CAREGIVER',
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

    const acciones = await base.prisma.auditEvent.findMany({
      where: { onBehalfOfPersonId: quien.personId },
      select: { action: true },
    });
    const vistas = new Set(acciones.map((uno) => uno.action));

    // El recorrido entero deja rastro: enviar, tomar, resolver, activar y
    // emitir la credencial. Un estado que cambia sin asiento es un estado que
    // nadie puede explicar después.
    for (const esperada of [
      'membership.application.submitted',
      'membership.application.assigned',
      'membership.application.approved',
      'membership.record.activated',
      'credentialing.credential.issued',
    ]) {
      expect(vistas.has(esperada), `falta el asiento ${esperada}`).toBe(true);
    }

    // Y el cambio de estado de la membresía tiene su propio asiento inmutable.
    const eventos = await base.prisma.membershipStatusEvent.count({
      where: { membership: { personId: quien.personId } },
    });
    expect(eventos).toBeGreaterThanOrEqual(1);
  });
});
