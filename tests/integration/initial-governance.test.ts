import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  attachSignedTerritorialAppointment,
  appointOffice,
  createTerritorialDeploymentByAppointment,
  createUnionBody,
  defineOffice,
} from '@/modules/governance';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
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

  it('constituye la red inicial por nombramiento y permite continuar a la Secretaría General', async () => {
    const raiz = await contextoRaiz();
    const estado = await base.prisma.territorialUnit.findFirstOrThrow({
      where: { type: 'STATE', stateCode: 'CHH' },
      select: { id: true },
    });

    const cen = await createUnionBody(raiz, {
      code: 'CEN_NOMBRAMIENTO_TERRITORIAL',
      name: 'Comité Ejecutivo para nombramientos territoriales',
      kind: 'NATIONAL_EXECUTIVE_COMMITTEE',
      territorialUnitId: territorioId,
      legalEntityId: entidadId,
      installedOn: '2026-10-02',
    });
    if (!cen.ok) throw cen.error;
    const secretaria = await defineOffice(raiz, {
      code: 'SECRETARIA_GENERAL_NOMBRAMIENTO_TERRITORIAL',
      name: 'Secretaría General para despliegue territorial',
      unionBodyId: cen.data.unionBodyId,
      kind: 'SECRETARY_GENERAL',
      termMonths: 48,
      reelectionAllowed: false,
      seats: 1,
      grantsRoleCode: 'EXECUTIVE_SECRETARY',
      permissionCodes: ['territory.unit.create'],
    });
    if (!secretaria.ok) throw secretaria.error;
    const titular = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Territorial' });
    const membresiaTitular = await crearMembresia(base.prisma, {
      personId: titular.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: territorioId,
    });
    const periodoTitular = await appointOffice(raiz, {
      officeDefinitionId: secretaria.data.officeDefinitionId,
      membershipId: membresiaTitular.id,
      territorialUnitId: null,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: '2026-10-02',
      reason: 'instalación de la Secretaría General para desplegar la red territorial',
    });
    if (!periodoTitular.ok) throw periodoTitular.error;

    const delegadaEstatal = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'Estatal' });
    const membresiaEstatal = await crearMembresia(base.prisma, {
      personId: delegadaEstatal.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: estado.id,
    });
    const estatal = await createTerritorialDeploymentByAppointment(raiz, {
      level: 'STATE',
      code: 'DEL_CHH_NOMBRADA',
      name: 'Delegación Estatal de Chihuahua por nombramiento',
      parentId: estado.id,
      legalEntityId: entidadId,
      appointedMembershipId: membresiaEstatal.id,
      appointedOn: '2026-10-02',
      termMonths: 48,
      reelectionAllowed: false,
      stateCode: 'CHH',
      municipalityCode: null,
      contactEmail: 'chihuahua@ejemplo.invalid',
      reason: 'nombramiento inicial emitido por el Superadmin para constituir la delegación estatal',
    });
    expect(estatal.ok, estatal.ok ? '' : estatal.error.message).toBe(true);
    if (!estatal.ok) return;

    const contextoSecretaria = await contextoDe(base.prisma, titular, {
      reason: 'nombramiento de la siguiente delegación territorial',
    });
    const delegadaMunicipal = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'Municipal' });
    const membresiaMunicipal = await crearMembresia(base.prisma, {
      personId: delegadaMunicipal.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: estatal.data.territorialUnitId,
    });
    const municipal = await createTerritorialDeploymentByAppointment(contextoSecretaria, {
      level: 'MUNICIPALITY',
      code: 'DEL_CHH_CAPITAL',
      name: 'Delegación Municipal de Chihuahua',
      parentId: estatal.data.territorialUnitId,
      legalEntityId: entidadId,
      appointedMembershipId: membresiaMunicipal.id,
      appointedOn: '2026-10-03',
      termMonths: 48,
      reelectionAllowed: false,
      stateCode: 'CHH',
      municipalityCode: 'CHH-019',
      contactEmail: 'capital@ejemplo.invalid',
      reason: 'nombramiento de la Secretaría General para constituir la delegación municipal',
    });
    expect(municipal.ok, municipal.ok ? '' : municipal.error.message).toBe(true);
    if (!municipal.ok) return;

    const municipioBajoMunicipio = await createTerritorialDeploymentByAppointment(contextoSecretaria, {
      level: 'MUNICIPALITY',
      code: 'DEL_CHH_MUNICIPIO_INVALIDO',
      name: 'Delegación municipal con dependencia inválida',
      parentId: municipal.data.territorialUnitId,
      legalEntityId: entidadId,
      appointedMembershipId: membresiaMunicipal.id,
      appointedOn: '2026-10-03',
      termMonths: 48,
      reelectionAllowed: false,
      stateCode: 'CHH',
      municipalityCode: 'CHH-020',
      contactEmail: null,
      reason: 'intento que comprueba que una delegación municipal solo depende de una estatal',
    });
    expect(municipioBajoMunicipio.ok).toBe(false);
    expect(!municipioBajoMunicipio.ok && municipioBajoMunicipio.error.code).toBe('CONFLICT');

    const appointmentId = (
      await base.prisma.territorialCreationAppointment.findUniqueOrThrow({
        where: { publicId: municipal.data.appointmentPublicId },
        select: { id: true },
      })
    ).id;
    const copiaFirmada = await attachSignedTerritorialAppointment(contextoSecretaria, {
      appointmentId,
      originalFileName: 'nombramiento-firmado.pdf',
      mimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\nacuerdo territorial firmado'),
    });
    expect(copiaFirmada.ok, copiaFirmada.ok ? '' : copiaFirmada.error.message).toBe(true);
    const copiaDuplicada = await attachSignedTerritorialAppointment(contextoSecretaria, {
      appointmentId,
      originalFileName: 'otra-copia.pdf',
      mimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\notra copia'),
    });
    expect(copiaDuplicada.ok).toBe(false);
    expect(!copiaDuplicada.ok && copiaDuplicada.error.code).toBe('CONFLICT');

    const instalada = await base.prisma.territorialUnit.findUniqueOrThrow({
      where: { id: municipal.data.territorialUnitId },
      select: {
        status: true,
        enablingResolutionId: true,
        creationAppointment: {
          select: {
            number: true,
            agreementText: true,
            signedFileId: true,
            appointedByOfficeTermId: true,
            delegateOfficeTerm: {
              select: {
                territorialUnitId: true,
                roleAssignment: { select: { territorialScopes: { select: { territorialUnitId: true } } } },
              },
            },
          },
        },
      },
    });
    expect(instalada.status).toBe('ACTIVE');
    expect(instalada.enablingResolutionId).toBeNull();
    expect(instalada.creationAppointment?.number).toMatch(/^NOM-TERR-2026-/);
    expect(instalada.creationAppointment?.agreementText).toContain('ACUERDO DE CREACIÓN Y NOMBRAMIENTO TERRITORIAL');
    expect(instalada.creationAppointment?.agreementText).toContain('Delegación Municipal de Chihuahua');
    expect(instalada.creationAppointment?.signedFileId).toBe(copiaFirmada.ok ? copiaFirmada.data.fileObjectId : null);
    expect(instalada.creationAppointment?.appointedByOfficeTermId).toBe(periodoTitular.data.officeTermId);
    expect(instalada.creationAppointment?.delegateOfficeTerm.territorialUnitId).toBe(municipal.data.territorialUnitId);
    expect(instalada.creationAppointment?.delegateOfficeTerm.roleAssignment?.territorialScopes).toEqual([
      { territorialUnitId: municipal.data.territorialUnitId },
    ]);
  }, 90_000);
});
