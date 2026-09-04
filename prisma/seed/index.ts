import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PERMISSIONS } from '../../src/platform/authz/permissions';
import { ROLE_SEEDS } from './data/roles';
import { pathFor, TERRITORY_SEEDS } from './data/territory';
import { newPublicId } from '../../src/platform/kernel/ids';

/**
 * Semilla idempotente y sin datos personales reales (PRD §24 Fase 1).
 *
 * Se puede ejecutar tantas veces como haga falta: cada bloque usa `upsert` sobre
 * una clave natural. No crea personas: el padrón es alcance de la Fase 4, y
 * sembrar personas ficticias en un ambiente compartido sería exactamente el
 * «dato simulado en producción» que el PRD §0.3 prohíbe.
 */

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (connectionString === undefined || connectionString === '') {
  throw new Error('Falta DIRECT_URL (o DATABASE_URL) para ejecutar la semilla.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedActors(): Promise<string> {
  const existing = await prisma.actor.findFirst({ where: { kind: 'MIGRATION' }, select: { id: true } });
  const migrationActor =
    existing ??
    (await prisma.actor.create({ data: { kind: 'MIGRATION', label: 'Semilla y migraciones' }, select: { id: true } }));

  const root = await prisma.actor.findFirst({ where: { kind: 'ROOT_SUPERADMIN' }, select: { id: true } });
  if (root === null) {
    await prisma.actor.create({ data: { kind: 'ROOT_SUPERADMIN', label: 'Superadmin raíz' } });
  }

  return migrationActor.id;
}

async function seedLegalEntities(actorId: string): Promise<void> {
  const entities = [
    {
      code: 'FUERZA_INDIGO' as const,
      legalName: 'Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo»',
      shortName: 'Fuerza Índigo',
      kind: 'UNION' as const,
      address: 'Por definir en el registro sindical',
      contactEmail: 'contacto@fuerzaindigo.lat',
      documentSeriesPrefix: 'FI',
    },
    {
      code: 'ALIANZA_INDIGO' as const,
      legalName: 'Alianza Índigo Neurodivergente A.C.',
      shortName: 'Alianza Índigo',
      kind: 'CIVIL_ASSOCIATION' as const,
      address: 'Por definir en el acta constitutiva',
      contactEmail: 'contacto@alianzaindigo.org',
      documentSeriesPrefix: 'AI',
    },
  ];

  for (const entity of entities) {
    await prisma.legalEntity.upsert({
      where: { code: entity.code },
      update: { legalName: entity.legalName, shortName: entity.shortName, updatedByActorId: actorId },
      create: { ...entity, createdByActorId: actorId, updatedByActorId: actorId },
    });
  }
}

async function seedTerritory(actorId: string): Promise<void> {
  for (const seed of TERRITORY_SEEDS) {
    const parent =
      seed.parentCode === null
        ? null
        : await prisma.territorialUnit.findUnique({ where: { code: seed.parentCode }, select: { id: true } });

    await prisma.territorialUnit.upsert({
      where: { code: seed.code },
      update: { name: seed.name },
      create: {
        publicId: newPublicId(),
        code: seed.code,
        name: seed.name,
        type: seed.type,
        parentId: parent?.id ?? null,
        path: pathFor(seed),
        depth: seed.parentCode === null ? 0 : 1,
        countryCode: 'MX',
        stateCode: seed.stateCode,
        status: 'ACTIVE',
        createdOn: new Date('2026-01-01'),
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
    });
  }
}

async function seedPermissionsAndRoles(): Promise<void> {
  for (const definition of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: definition.code },
      update: {
        module: definition.module,
        resource: definition.resource,
        action: definition.action,
        sensitivity: definition.sensitivity,
        requiresReason: definition.requiresReason,
        needsAssignment: definition.needsAssignment,
        compartment: definition.compartment,
        description: definition.description,
      },
      create: {
        code: definition.code,
        module: definition.module,
        resource: definition.resource,
        action: definition.action,
        sensitivity: definition.sensitivity,
        requiresReason: definition.requiresReason,
        needsAssignment: definition.needsAssignment,
        compartment: definition.compartment,
        description: definition.description,
      },
    });
  }

  for (const roleSeed of ROLE_SEEDS) {
    const role = await prisma.role.upsert({
      where: { code: roleSeed.code },
      update: {
        name: roleSeed.name,
        description: roleSeed.description,
        scopeKind: roleSeed.scopeKind,
        requiresOfficeTerm: roleSeed.requiresOfficeTerm,
      },
      create: {
        code: roleSeed.code,
        name: roleSeed.name,
        description: roleSeed.description,
        scopeKind: roleSeed.scopeKind,
        requiresOfficeTerm: roleSeed.requiresOfficeTerm,
      },
      select: { id: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...roleSeed.permissions] } },
      select: { id: true },
    });

    // La semilla es la fuente de verdad de la matriz: se sincroniza en ambos
    // sentidos para que quitar un permiso del catálogo también lo retire del rol.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: permissions.map((p) => p.id) } },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

async function seedNormativeRules(actorId: string): Promise<void> {
  const existing = await prisma.normativeRuleSet.findUnique({ where: { version: '2026.1' } });
  if (existing !== null) return;

  /**
   * Conjunto de reglas estatutarias, en **borrador**.
   *
   * Aquí solo van los valores que el PRD enuncia de forma expresa. Los que el
   * PRD remite a los estatutos —«anticipación mínima de convocatoria conforme a
   * los estatutos vigentes», «el porcentaje estatutario de agremiados»,
   * «posibilidad de reelección conforme a los estatutos vigentes»— **no se
   * inventan**: quedan enumerados abajo como pendientes.
   *
   * La versión anterior de esta semilla traía quince días de convocatoria
   * ordinaria, ocho de extraordinaria, un treinta y tres por ciento de firmas y
   * la reelección permitida, todos atribuidos en un comentario al «PRD §9.3 y
   * §9.4», que no los contiene. Un número inventado en un sistema sindical no es
   * un dato de relleno: es la regla con la que se convoca una asamblea y con la
   * que se impugna. Y el estado era `IN_FORCE` con fecha de vigencia inventada,
   * que afirma un hecho jurídico que nadie ha aportado.
   *
   * Esta versión entra en vigor cuando alguien con facultades cargue los
   * estatutos, complete los pendientes y la publique. Hasta entonces es un
   * borrador, y así consta.
   */
  await prisma.normativeRuleSet.create({
    data: {
      version: '2026.1',
      // Sin fecha: la de entrada en vigor consta en el acta constitutiva.
      effectiveFrom: null,
      status: 'DRAFT',
      rules: {
        // --- Enunciados de forma expresa en el PRD §9.3 y §9.4 -------------
        executiveCommitteeTermMonths: 48, // «periodo de cuatro años»
        oversightCommissionSeats: 3, // «integrada por tres agremiados»
        electoralCommissionSeats: 3, // «integrada por tres agremiados»
        firstCallQuorum: 'HALF_PLUS_ONE', // «la mitad más uno del padrón aplicable»
        secondCallQuorum: 'THOSE_PRESENT', // «los agremiados presentes»
        ordinaryMajority: 'SIMPLE', // «mayoría simple como regla general»
        ordinaryAssemblyMinimumPerYear: 1, // «al menos una vez al año»

        /**
         * Valores que los estatutos deben aportar antes de poner en vigor esta
         * versión. Se enumeran en vez de omitirse en silencio: quien lea las
         * reglas encuentra la ausencia declarada y su motivo, y no un hueco.
         */
        _pendientesDeEstatutos: [
          'assemblyNoticeDaysOrdinary: anticipación mínima de convocatoria ordinaria (PRD §9.4 remite a los estatutos)',
          'assemblyNoticeDaysExtraordinary: anticipación mínima de convocatoria extraordinaria (ídem)',
          'extraordinaryAssemblyPetitionPercent: porcentaje de agremiados que puede solicitarla (PRD §9.4: «el porcentaje estatutario»)',
          'reelectionAllowed: si se admite la reelección (PRD §9.3: «conforme a los estatutos vigentes»)',
          'statuteAmendmentMajority: fracción exacta de la mayoría calificada para reformar los estatutos',
          'dissolutionMajority: fracción exacta de la mayoría calificada para la disolución',
        ],
      },
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
  });
}

async function seedRetentionPolicies(): Promise<void> {
  const policies = [
    {
      code: 'DOCUMENTAL_SINDICAL',
      name: 'Documentación sindical',
      appliesToClassification: ['INTERNAL', 'RESTRICTED'] as const,
      appliesToContextKind: ['GOVERNANCE', 'APPLICATION'] as const,
      retentionMonths: 120,
      basis: 'Obligación de conservación documental sindical y rendición de cuentas (PRD §9.7, §11.5).',
      actionOnExpiry: 'ARCHIVE_COLD' as const,
    },
    {
      code: 'DATOS_PERSONALES_SENSIBLES',
      name: 'Datos personales sensibles',
      appliesToClassification: ['SENSITIVE_PERSONAL'] as const,
      appliesToContextKind: ['CASE', 'APPLICATION'] as const,
      retentionMonths: 60,
      basis: 'Conservación mínima para acreditar la atención prestada y atender reclamaciones.',
      actionOnExpiry: 'ANONYMIZE' as const,
    },
    {
      code: 'SISTEMA_TECNICO',
      name: 'Archivos técnicos del sistema',
      appliesToClassification: ['INTERNAL'] as const,
      appliesToContextKind: ['SYSTEM'] as const,
      retentionMonths: 24,
      basis: 'Diagnóstico y trazabilidad técnica; no contiene datos personales.',
      actionOnExpiry: 'DELETE' as const,
    },
  ];

  for (const policy of policies) {
    await prisma.retentionPolicy.upsert({
      where: { code: policy.code },
      update: { name: policy.name, retentionMonths: policy.retentionMonths },
      create: {
        code: policy.code,
        name: policy.name,
        appliesToClassification: [...policy.appliesToClassification],
        appliesToContextKind: [...policy.appliesToContextKind],
        retentionMonths: policy.retentionMonths,
        basis: policy.basis,
        actionOnExpiry: policy.actionOnExpiry,
        effectiveFrom: new Date('2026-01-01'),
      },
    });
  }
}

async function seedSpecialties(): Promise<void> {
  const specialties = [
    { code: 'DOCENCIA', name: 'Docencia', kind: 'PROFESSION' as const },
    { code: 'PSICOLOGIA', name: 'Psicología', kind: 'PROFESSION' as const },
    { code: 'TRABAJO_SOCIAL', name: 'Trabajo social', kind: 'PROFESSION' as const },
    { code: 'ENFERMERIA', name: 'Enfermería', kind: 'PROFESSION' as const },
    { code: 'DERECHO', name: 'Derecho', kind: 'PROFESSION' as const },
    { code: 'CUIDADOS', name: 'Cuidados y asistencia personal', kind: 'TRADE' as const },
    { code: 'NEUROLOGIA', name: 'Neurología', kind: 'CLINICAL_DISCIPLINE' as const },
    { code: 'PSIQUIATRIA', name: 'Psiquiatría', kind: 'CLINICAL_DISCIPLINE' as const },
    { code: 'TERAPIA_LENGUAJE', name: 'Terapia de lenguaje', kind: 'CLINICAL_DISCIPLINE' as const },
    { code: 'TERAPIA_OCUPACIONAL', name: 'Terapia ocupacional', kind: 'CLINICAL_DISCIPLINE' as const },
  ];

  for (const specialty of specialties) {
    await prisma.specialtyCatalog.upsert({
      where: { code: specialty.code },
      update: { name: specialty.name },
      create: specialty,
    });
  }
}

async function seedNotificationTemplates(): Promise<void> {
  const templates = [
    {
      code: 'USER_INVITATION',
      version: 1,
      channel: 'EMAIL' as const,
      category: 'SECURITY' as const,
      subject: 'Activa tu cuenta en Fuerza Índigo',
      bodyTemplate: [
        'Hola {{givenName}}:',
        '',
        'Te invitamos a activar tu cuenta en la plataforma de Fuerza Índigo.',
        'Abre este enlace para elegir tu contraseña:',
        '',
        '{{activationUrl}}',
        '',
        'El enlace caduca en {{expiresInHours}} horas y solo puede usarse una vez.',
        'Si no esperabas esta invitación, puedes ignorar este mensaje.',
      ].join('\n'),
      variables: ['givenName', 'activationUrl', 'expiresInHours'],
    },
    {
      code: 'PASSWORD_RESET',
      version: 1,
      channel: 'EMAIL' as const,
      category: 'SECURITY' as const,
      subject: 'Restablece tu contraseña',
      bodyTemplate: [
        'Hola:',
        '',
        'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
        'Si fuiste tú, abre este enlace:',
        '',
        '{{resetUrl}}',
        '',
        'El enlace caduca en {{expiresInHours}} horas y solo puede usarse una vez.',
        'Si no fuiste tú, no tienes que hacer nada: tu contraseña sigue siendo la misma.',
      ].join('\n'),
      variables: ['resetUrl', 'expiresInHours'],
    },
    {
      code: 'PASSWORD_CHANGED',
      version: 1,
      channel: 'EMAIL' as const,
      category: 'SECURITY' as const,
      subject: 'Tu contraseña cambió',
      bodyTemplate: [
        'Hola:',
        '',
        'La contraseña de tu cuenta se cambió el {{changedAt}}.',
        'Por seguridad cerramos todas tus sesiones abiertas.',
        '',
        'Si no fuiste tú, escríbenos de inmediato a {{supportEmail}}.',
      ].join('\n'),
      variables: ['changedAt', 'supportEmail'],
    },
  ];

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        code_version_channel_locale: {
          code: template.code,
          version: template.version,
          channel: template.channel,
          locale: 'es-MX',
        },
      },
      update: { bodyTemplate: template.bodyTemplate, subject: template.subject, status: 'PUBLISHED' },
      create: {
        code: template.code,
        version: template.version,
        channel: template.channel,
        category: template.category,
        locale: 'es-MX',
        subject: template.subject,
        bodyTemplate: template.bodyTemplate,
        variables: template.variables,
        status: 'PUBLISHED',
      },
    });
  }
}

async function main(): Promise<void> {
  const actorId = await seedActors();
  await seedLegalEntities(actorId);
  await seedTerritory(actorId);
  await seedPermissionsAndRoles();
  await seedNormativeRules(actorId);
  await seedRetentionPolicies();
  await seedSpecialties();
  await seedNotificationTemplates();

  const counts = {
    entidadesJuridicas: await prisma.legalEntity.count(),
    unidadesTerritoriales: await prisma.territorialUnit.count(),
    permisos: await prisma.permission.count(),
    roles: await prisma.role.count(),
    politicasDeRetencion: await prisma.retentionPolicy.count(),
    especialidades: await prisma.specialtyCatalog.count(),
    plantillasDeMensaje: await prisma.notificationTemplate.count(),
    reglasNormativas: await prisma.normativeRuleSet.count(),
  };
  console.log('Semilla aplicada:', JSON.stringify(counts, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('La semilla falló:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
