import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appointOffice, createUnionBody, defineOffice } from '@/modules/governance';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoRaiz,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
} from './helpers/fixtures';
import { newPublicId } from '@/platform/kernel/ids';

let base: TestDatabase;
let entidadId: string;
let territorioId: string;

beforeAll(async () => {
  base = await createTestDatabase('gobierno_inicial');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  territorioId = (
    await base.prisma.territorialUnit.findFirstOrThrow({ where: { depth: 0 }, select: { id: true } })
  ).id;

  const actorId = await actorDeMigracion(base.prisma);
  const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
  await base.prisma.normativeRuleSet.update({
    where: { id: reglas.id },
    data: {
      status: 'IN_FORCE',
      effectiveFrom: new Date('2026-09-10'),
      rules: {
        executiveCommitteeTermMonths: 48,
        oversightCommissionSeats: 3,
        electoralCommissionSeats: 3,
        firstCallQuorum: 'HALF_PLUS_ONE',
        secondCallQuorum: 'THOSE_PRESENT',
        ordinaryMajority: 'SIMPLE',
        ordinaryAssemblyMinimumPerYear: 1,
        assemblyNoticeDaysOrdinary: 15,
        assemblyNoticeDaysExtraordinary: 8,
        extraordinaryAssemblyPetitionPercent: 33,
        reelectionAllowed: false,
        statuteAmendmentMajority: 'TWO_THIRDS',
        dissolutionMajority: 'THREE_FOURTHS',
        electionCallNoticeDays: 30,
        genderProportionalityMinPercent: 40,
        disciplinaryAnswerDays: 10,
        disciplinaryAppealDays: 15,
        bargainingConsultationMajority: 'SIMPLE',
      },
      updatedByActorId: actorId,
    },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

describe('integración inicial de los órganos nacionales', () => {
  it('la raíz registra el primer periodo con acceso e impide mezclar Ejecutivo y Vigilancia', async () => {
    const raiz = await contextoRaiz();
    const cen = await createUnionBody(raiz, {
      code: 'CEN_INICIAL',
      name: 'Comité Ejecutivo Nacional',
      kind: 'NATIONAL_EXECUTIVE_COMMITTEE',
      territorialUnitId: territorioId,
      legalEntityId: entidadId,
      installedOn: '2026-09-10',
    });
    if (!cen.ok) throw cen.error;
    const vigilancia = await createUnionBody(raiz, {
      code: 'VIGILANCIA_INICIAL',
      name: 'Comisión de Vigilancia y Fiscalización',
      kind: 'OVERSIGHT_COMMISSION',
      territorialUnitId: territorioId,
      legalEntityId: entidadId,
      installedOn: '2026-09-10',
    });
    if (!vigilancia.ok) throw vigilancia.error;

    const secretaria = await defineOffice(raiz, {
      code: 'SECRETARIA_GENERAL_INICIAL',
      name: 'Secretaría General',
      unionBodyId: cen.data.unionBodyId,
      kind: 'SECRETARY_GENERAL',
      termMonths: 48,
      reelectionAllowed: false,
      seats: 1,
      grantsRoleCode: 'EXECUTIVE_SECRETARY',
      permissionCodes: ['governance.body.read'],
    });
    if (!secretaria.ok) throw secretaria.error;
    const fiscalizacion = await defineOffice(raiz, {
      code: 'VOCALIA_VIGILANCIA_INICIAL',
      name: 'Integrante de la Comisión de Vigilancia',
      unionBodyId: vigilancia.data.unionBodyId,
      kind: 'OVERSIGHT_MEMBER',
      termMonths: 48,
      reelectionAllowed: false,
      seats: 3,
      grantsRoleCode: 'OVERSIGHT_COMMISSION',
      permissionCodes: ['governance.body.read'],
    });
    if (!fiscalizacion.ok) throw fiscalizacion.error;

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Fundadora', familyName: 'Inicial' });
    const membresia = await crearMembresia(base.prisma, {
      personId: persona.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: territorioId,
    });

    const nombramiento = await appointOffice(raiz, {
      officeDefinitionId: secretaria.data.officeDefinitionId,
      membershipId: membresia.id,
      territorialUnitId: null,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: '2026-09-10',
      reason: 'integración consignada en el acta constitutiva inicial',
    });
    expect(nombramiento.ok, nombramiento.ok ? '' : nombramiento.error.message).toBe(true);
    if (!nombramiento.ok) return;

    const periodo = await base.prisma.officeTerm.findUniqueOrThrow({
      where: { id: nombramiento.data.officeTermId },
      select: { roleAssignment: { select: { grantedById: true } } },
    });
    expect(periodo.roleAssignment?.grantedById).toBe(persona.userId);

    const incompatible = await appointOffice(raiz, {
      officeDefinitionId: fiscalizacion.data.officeDefinitionId,
      membershipId: membresia.id,
      territorialUnitId: null,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: '2026-09-10',
      reason: 'intento incompatible para comprobar la regla institucional',
    });
    expect(incompatible.ok).toBe(false);
    expect(!incompatible.ok && incompatible.error.code).toBe('CONFLICT');
  }, 90_000);

  it('instala una autoridad territorial y ata el nombramiento a su delegación', async () => {
    const raiz = await contextoRaiz();

    const fueraDeTerritorio = await createUnionBody(raiz, {
      code: 'AUTORIDAD_TERRITORIAL_INVALIDA',
      name: 'Autoridad territorial inválida',
      kind: 'SECTION_DELEGATION',
      territorialUnitId: territorioId,
      legalEntityId: entidadId,
      installedOn: '2026-09-13',
    });
    expect(fueraDeTerritorio.ok).toBe(false);
    expect(!fueraDeTerritorio.ok && fueraDeTerritorio.error.code).toBe('CONFLICT');

    const actorId = await actorDeMigracion(base.prisma);
    const delegacion = await base.prisma.territorialUnit.create({
      data: {
        publicId: newPublicId(),
        code: 'DELEGACION_CHIHUAHUA_INICIAL',
        name: 'Delegación Estatal de Chihuahua',
        type: 'DELEGATION',
        parentId: territorioId,
        path: '/mx/delegacion-chihuahua-inicial',
        depth: 1,
        countryCode: 'MX',
        stateCode: 'CHH',
        status: 'ACTIVE',
        createdOn: new Date('2026-09-13'),
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    const autoridad = await createUnionBody(raiz, {
      code: 'AUTORIDAD_DELEGACION_CHIHUAHUA',
      name: 'Autoridad de la Delegación Estatal de Chihuahua',
      kind: 'SECTION_DELEGATION',
      territorialUnitId: delegacion.id,
      legalEntityId: entidadId,
      installedOn: '2026-09-13',
    });
    expect(autoridad.ok, autoridad.ok ? '' : autoridad.error.message).toBe(true);
    if (!autoridad.ok) return;

    const cargoInvalido = await defineOffice(raiz, {
      code: 'CARGO_TERRITORIAL_INVALIDO',
      name: 'Cargo territorial inválido',
      unionBodyId: autoridad.data.unionBodyId,
      kind: 'SECRETARY_GENERAL',
      termMonths: 48,
      reelectionAllowed: false,
      seats: 1,
      grantsRoleCode: 'EXECUTIVE_SECRETARY',
      permissionCodes: ['territory.unit.read'],
    });
    expect(cargoInvalido.ok).toBe(false);
    expect(!cargoInvalido.ok && cargoInvalido.error.code).toBe('CONFLICT');

    const cargo = await defineOffice(raiz, {
      code: 'DELEGADO_CHIHUAHUA_INICIAL',
      name: 'Persona titular de la Delegación Estatal de Chihuahua',
      unionBodyId: autoridad.data.unionBodyId,
      kind: 'SECTION_DELEGATE',
      termMonths: 48,
      reelectionAllowed: false,
      seats: 1,
      grantsRoleCode: 'TERRITORIAL_DELEGATE',
      permissionCodes: ['territory.unit.read'],
    });
    expect(cargo.ok, cargo.ok ? '' : cargo.error.message).toBe(true);
    if (!cargo.ok) return;

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'Inicial' });
    const membresia = await crearMembresia(base.prisma, {
      personId: persona.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: delegacion.id,
    });

    const territorioAjeno = await appointOffice(raiz, {
      officeDefinitionId: cargo.data.officeDefinitionId,
      membershipId: membresia.id,
      territorialUnitId: territorioId,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: '2026-09-13',
      reason: 'intento de conceder un alcance territorial distinto',
    });
    expect(territorioAjeno.ok).toBe(false);
    expect(!territorioAjeno.ok && territorioAjeno.error.code).toBe('CONFLICT');

    const nombramiento = await appointOffice(raiz, {
      officeDefinitionId: cargo.data.officeDefinitionId,
      membershipId: membresia.id,
      territorialUnitId: null,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: '2026-09-13',
      reason: 'integración inicial de la delegación estatal',
    });
    expect(nombramiento.ok, nombramiento.ok ? '' : nombramiento.error.message).toBe(true);
    if (!nombramiento.ok) return;

    const periodo = await base.prisma.officeTerm.findUniqueOrThrow({
      where: { id: nombramiento.data.officeTermId },
      select: {
        territorialUnitId: true,
        roleAssignment: {
          select: { territorialScopes: { select: { territorialUnitId: true, includesDescendants: true } } },
        },
      },
    });
    expect(periodo.territorialUnitId).toBe(delegacion.id);
    expect(periodo.roleAssignment?.territorialScopes).toEqual([
      { territorialUnitId: delegacion.id, includesDescendants: true },
    ]);
  }, 90_000);
});
