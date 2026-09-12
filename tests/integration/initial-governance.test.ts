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
});
