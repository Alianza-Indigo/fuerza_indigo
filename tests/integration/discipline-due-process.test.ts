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
import { appointOffice, createUnionBody, defineOffice } from '@/modules/governance';
import { draftTemplate, publishTemplate } from '@/modules/documents';
import {
  assessEvidence,
  disciplinaryCaseList,
  evidenceList,
  fileAppeal,
  issueDisciplinaryDecision,
  notifyDisciplinaryCase,
  offerEvidence,
  openDisciplinaryCase,
  recordHearing,
  resolveAppeal,
} from '@/modules/discipline';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Debido proceso disciplinario (E2E-08, PRD §9.8, docs/TEST_PLAN.md §3).
 *
 * Los asertos del flujo, comprobados sobre el dominio y sobre la base:
 *
 *  1. Sin notificación y sin audiencia no hay resolución.
 *  2. La persona señalada llega a su expediente y ofrece pruebas en él.
 *  3. El recurso se registra y, al revocar, restituye los derechos en el mismo
 *     acto.
 *  4. El expediente permanece reservado para quien no está asignado a él.
 *
 * El cuarto no es un adorno: el catálogo declara los permisos disciplinarios con
 * `needsAssignment`, y la asignación es tener cargo vivo en el órgano que
 * instruye. Sin una prueba que entre por ahí, un módulo entero puede quedar
 * inalcanzable sin que nada lo diga —que es justo lo que pasó—.
 */

let base: TestDatabase;
let entidadId: string;
let unidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let instructora: ActorContext;
let vigilancia: ActorContext;
let ajena: ActorContext;
let organoInstructorId: string;
let senalada: PersonaDePrueba;
let senaladaActor: ActorContext;
let membresiaSenaladaId: string;
let vigilantePersonaId: string;

async function ponerReglasEnVigor(): Promise<void> {
  const autor = await actorDeMigracion(base.prisma);
  const version = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
  await base.prisma.normativeRuleSet.update({
    where: { id: version.id },
    data: {
      status: 'IN_FORCE',
      effectiveFrom: new Date('2026-01-01'),
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
      updatedByActorId: autor,
    },
  });
}

beforeAll(async () => {
  base = await createTestDatabase('disciplina');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  await ponerReglasEnVigor();

  unidadId = (await base.prisma.territorialUnit.findFirstOrThrow({ where: { depth: 0 }, select: { id: true } })).id;

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'Que Abre',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  // Quien instruye y quien revisa el recurso son órganos distintos, y así lo
  // reparte el catálogo de roles: la cartera ejecutiva instruye y resuelve; la
  // Comisión de Vigilancia revisa el recurso y no dicta sanciones. Instruir y
  // revisar en la misma mano no es revisar.
  const organo = await createUnionBody(secretaria, {
    code: 'COMITE_EJECUTIVO_NACIONAL',
    name: 'Comité Ejecutivo Nacional',
    kind: 'NATIONAL_EXECUTIVE_COMMITTEE',
    territorialUnitId: unidadId,
    legalEntityId: entidadId,
    installedOn: '2026-01-15',
  });
  if (!organo.ok) throw new Error(organo.error.message);
  organoInstructorId = organo.data.unionBodyId;

  const cargo = await defineOffice(secretaria, {
    code: 'SECRETARIA_DE_CONFLICTOS',
    name: 'Secretaría de Conflictos Laborales',
    unionBodyId: organoInstructorId,
    kind: 'SECRETARY_LABOR_DISPUTES',
    termMonths: 48,
    reelectionAllowed: false,
    seats: 3,
    grantsRoleCode: 'EXECUTIVE_SECRETARY',
    // La resolución se dicta y se emite: el documento es el acto, no su copia.
    permissionCodes: [
      'discipline.case.read',
      'discipline.evidence.manage',
      'discipline.decision.issue',
      'documents.document.issue',
      // Emitir un documento es guardarlo: sin poder archivar, la resolución no
      // llega a existir.
      'files.file.upload',
    ],
  });
  if (!cargo.ok) throw new Error(cargo.error.message);

  const vigilante = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Titular',
    familyName: 'De Conflictos',
  });
  const membresiaVigilante = await crearMembresia(base.prisma, {
    personId: vigilante.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    territorialUnitId: unidadId,
  });
  const designacion = await appointOffice(secretaria, {
    officeDefinitionId: cargo.data.officeDefinitionId,
    membershipId: membresiaVigilante.id,
    territorialUnitId: unidadId,
    designationMethod: 'ASSEMBLY_APPOINTMENT',
    electionId: null,
    substitutedTermId: null,
    startsOn: '2026-02-01',
    reason: 'Designación de la comisión que instruye los procedimientos disciplinarios.',
  });
  if (!designacion.ok) throw new Error(designacion.error.message);
  vigilantePersonaId = vigilante.personId;
  instructora = await contextoDe(base.prisma, vigilante);

  // Vigilancia no instruye ni sanciona: revisa. Resuelve el recurso.
  const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Integrante', familyName: 'De Vigilancia' });
  await crearMembresia(base.prisma, {
    personId: revisora.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    territorialUnitId: unidadId,
  });
  await nombrar(base.prisma, {
    userId: revisora.userId,
    roleCode: 'OVERSIGHT_COMMISSION',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  vigilancia = await contextoDe(base.prisma, revisora);

  // Persona señalada, con su membresía activa.
  senalada = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona', familyName: 'Señalada' });
  const membresia = await crearMembresia(base.prisma, {
    personId: senalada.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    territorialUnitId: unidadId,
  });
  membresiaSenaladaId = membresia.id;
  await nombrar(base.prisma, {
    userId: senalada.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  senaladaActor = await contextoDe(base.prisma, senalada);

  // Persona agremiada cualquiera: no instruye nada y no es la señalada.
  const tercera = await crearPersonaConCuenta(base.prisma, { givenName: 'Tercera', familyName: 'Sin Vela' });
  await crearMembresia(base.prisma, {
    personId: tercera.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    territorialUnitId: unidadId,
  });
  await nombrar(base.prisma, {
    userId: tercera.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  ajena = await contextoDe(base.prisma, tercera);

  const plantilla = await draftTemplate(secretaria, {
    code: 'RESOLUCION_DISCIPLINARIA',
    name: 'Resolución disciplinaria',
    kind: 'DISCIPLINARY_DECISION',
    legalEntityId: entidadId,
    bodyTemplate:
      '<p>{{entidad}} · expediente {{folio}} contra {{persona}}. Instruye {{organoInstructor}} y resuelve ' +
      '{{organoResolutor}}. Hechos: {{hechos}}. Pruebas: {{pruebas}}. Resultado: {{resultado}}. ' +
      'Fundamento: {{fundamento}}. Sanción del {{sancionDesde}} al {{sancionHasta}}. Recurso: ' +
      '{{plazoDeRecurso}} días. Reglas {{versionNormativa}}.</p>',
    variables: [
      'entidad',
      'folio',
      'persona',
      'organoInstructor',
      'organoResolutor',
      'hechos',
      'pruebas',
      'resultado',
      'fundamento',
      'sancionDesde',
      'sancionHasta',
      'plazoDeRecurso',
      'versionNormativa',
    ],
    numberingSeries: 'RESD',
  });
  if (!plantilla.ok) throw new Error(plantilla.error.message);
  const publicada = await publishTemplate(secretaria, { templateId: plantilla.data.templateId });
  if (!publicada.ok) throw new Error(publicada.error.message);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

const HECHOS =
  'Se le imputa haber dispuesto de fondos de la sección sin acuerdo de asamblea, en dos ocasiones durante 2026.';

async function abrirExpediente(): Promise<{ caseId: string; folio: string }> {
  const abierto = await openDisciplinaryCase(secretaria, {
    membershipId: membresiaSenaladaId,
    instructingBodyId: organoInstructorId,
    allegedFacts: HECHOS,
    conflictOfInterestChecks: [
      {
        personId: vigilantePersonaId,
        role: 'Secretaría de Conflictos Laborales',
        hasConflict: false,
        statement: 'Declara no tener interés en el asunto ni relación con la persona señalada.',
      },
    ],
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data;
}

describe('sin notificación y sin audiencia no hay resolución', () => {
  it('resolver antes de notificar se rechaza, y se explica por qué', async () => {
    const expediente = await abrirExpediente();

    const prematura = await issueDisciplinaryDecision(instructora, {
      caseId: expediente.caseId,
      decidedByBodyId: organoInstructorId,
      outcome: 'WARNING',
      rationale:
        'Se tiene por acreditada la disposición de fondos sin acuerdo, conforme a los documentos que obran en el expediente y a lo asentado en la audiencia celebrada ante esta comisión.',
      sanctionStartsOn: null,
      sanctionEndsOn: null,
      templateCode: 'RESOLUCION_DISCIPLINARIA',
    });
    expect(prematura.ok).toBe(false);
    if (!prematura.ok) expect(prematura.error.message).toContain('notificado');

    // Notificada, pero todavía sin audiencia ni renuncia.
    const notificada = await notifyDisciplinaryCase(instructora, {
      caseId: expediente.caseId,
      hearingAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Se notifica personalmente y se le da acceso a su expediente.',
    });
    expect(notificada.ok, notificada.ok ? '' : notificada.error.message).toBe(true);

    const sinAudiencia = await issueDisciplinaryDecision(instructora, {
      caseId: expediente.caseId,
      decidedByBodyId: organoInstructorId,
      outcome: 'WARNING',
      rationale:
        'Se tiene por acreditada la disposición de fondos sin acuerdo, conforme a los documentos que obran en el expediente y a lo asentado durante la instrucción de este procedimiento.',
      sanctionStartsOn: null,
      sanctionEndsOn: null,
      templateCode: 'RESOLUCION_DISCIPLINARIA',
    });
    expect(sinAudiencia.ok).toBe(false);
    if (!sinAudiencia.ok) expect(sinAudiencia.error.message).toContain('audiencia');

    // Y la base sostiene lo mismo: no hay resolución escrita.
    const resoluciones = await base.prisma.disciplinaryDecision.count({
      where: { caseId: expediente.caseId },
    });
    expect(resoluciones).toBe(0);
  });

  it('la citación respeta el plazo de contestación del estatuto', async () => {
    const expediente = await abrirExpediente();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const apresurada = await notifyDisciplinaryCase(instructora, {
      caseId: expediente.caseId,
      hearingAt: manana.toISOString(),
      note: 'Se notifica y se cita para mañana mismo.',
    });
    expect(apresurada.ok).toBe(false);
    // Diez días de contestación fija el estatuto de esta prueba.
    if (!apresurada.ok) expect(apresurada.error.message).toContain('10');
  });
});

describe('el expediente está reservado a quien lo instruye', () => {
  it('quien no tiene cargo en el órgano instructor no lo lee ni lo mueve', async () => {
    const expediente = await abrirExpediente();

    // Quien tiene la facultad pero ningún expediente a cargo recibe la lista
    // **vacía**, no una negativa: no es que no pueda mirar, es que no instruye
    // nada. Es el caso de quien abre el procedimiento y no lo instruye.
    const deQuienAbre = await disciplinaryCaseList(secretaria);
    expect(deQuienAbre.ok, deQuienAbre.ok ? '' : deQuienAbre.error.message).toBe(true);
    if (deQuienAbre.ok) expect(deQuienAbre.data).toHaveLength(0);

    // Quien ni siquiera tiene la facultad recibe una negativa.
    const lista = await disciplinaryCaseList(ajena);
    expect(lista.ok).toBe(false);

    const pruebas = await evidenceList(ajena, expediente.caseId);
    expect(pruebas.ok).toBe(false);

    const notificar = await notifyDisciplinaryCase(ajena, {
      caseId: expediente.caseId,
      hearingAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Intento de notificar un expediente ajeno.',
    });
    expect(notificar.ok).toBe(false);

    const prueba = await offerEvidence(ajena, {
      caseId: expediente.caseId,
      offeredBy: 'INSTRUCTING_BODY',
      kind: 'DOCUMENT',
      description: 'Documento ofrecido por quien no instruye este expediente.',
    });
    expect(prueba.ok).toBe(false);
  });

  it('quien instruye sí lo ve, y solo los suyos', async () => {
    const expediente = await abrirExpediente();

    const lista = await disciplinaryCaseList(instructora);
    expect(lista.ok, lista.ok ? '' : lista.error.message).toBe(true);
    if (!lista.ok) return;
    expect(lista.data.length).toBeGreaterThan(0);
    expect(lista.data.map((fila) => fila.id)).toContain(expediente.caseId);

    // Todos los que ve los instruye su órgano: ninguno de otro.
    const ajenos = await base.prisma.disciplinaryCase.count({
      where: { id: { in: lista.data.map((fila) => fila.id) }, instructingBodyId: { not: organoInstructorId } },
    });
    expect(ajenos).toBe(0);
  });
});

describe('la persona señalada participa en su propio expediente', () => {
  it('ofrece pruebas en el suyo y no en el de otra persona', async () => {
    const expediente = await abrirExpediente();
    const notificada = await notifyDisciplinaryCase(instructora, {
      caseId: expediente.caseId,
      hearingAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Se notifica personalmente y se le da acceso a su expediente.',
    });
    expect(notificada.ok, notificada.ok ? '' : notificada.error.message).toBe(true);

    const propia = await offerEvidence(senaladaActor, {
      caseId: expediente.caseId,
      offeredBy: 'MEMBER',
      kind: 'DOCUMENT',
      description: 'Comprobantes de los gastos que se le imputan, con su acuerdo de respaldo.',
    });
    expect(propia.ok, propia.ok ? '' : propia.error.message).toBe(true);

    const ajenoAbierto = await abrirExpediente();
    const enElAjeno = await offerEvidence(senaladaActor, {
      caseId: ajenoAbierto.caseId,
      offeredBy: 'INSTRUCTING_BODY',
      kind: 'DOCUMENT',
      description: 'Prueba ofrecida como si instruyera un expediente que no instruye.',
    });
    expect(enElAjeno.ok).toBe(false);

    // El acceso al expediente propio quedó asentado con fecha.
    const guardado = await base.prisma.disciplinaryCase.findUniqueOrThrow({
      where: { id: expediente.caseId },
      select: { memberAccessGrantedAt: true },
    });
    expect(guardado.memberAccessGrantedAt).not.toBeNull();
  });
});

describe('resolución, recurso y restitución', () => {
  it('la suspensión se ejecuta sobre la membresía y el recurso que la revoca restituye en el mismo acto', async () => {
    const expediente = await abrirExpediente();

    const notificada = await notifyDisciplinaryCase(instructora, {
      caseId: expediente.caseId,
      hearingAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Se notifica personalmente y se le da acceso a su expediente.',
    });
    expect(notificada.ok, notificada.ok ? '' : notificada.error.message).toBe(true);

    const prueba = await offerEvidence(instructora, {
      caseId: expediente.caseId,
      offeredBy: 'INSTRUCTING_BODY',
      kind: 'RECORD',
      description: 'Estados de cuenta de la sección correspondientes al periodo imputado.',
    });
    expect(prueba.ok, prueba.ok ? '' : prueba.error.message).toBe(true);
    if (!prueba.ok) return;

    const audiencia = await recordHearing(instructora, {
      caseId: expediente.caseId,
      outcome: 'HELD',
      note: 'Se celebró la audiencia con la persona señalada presente; expuso sus razones y ofreció pruebas.',
    });
    expect(audiencia.ok, audiencia.ok ? '' : audiencia.error.message).toBe(true);

    // Con una prueba sin valorar no se resuelve.
    const conPruebaPendiente = await issueDisciplinaryDecision(instructora, {
      caseId: expediente.caseId,
      decidedByBodyId: organoInstructorId,
      outcome: 'SUSPENSION_OF_RIGHTS',
      rationale:
        'Se tiene por acreditada la disposición de fondos sin acuerdo de asamblea, conforme a los estados de cuenta que obran en el expediente y a lo declarado en la audiencia celebrada ante esta comisión.',
      sanctionStartsOn: '2026-10-01',
      sanctionEndsOn: '2026-12-31',
      templateCode: 'RESOLUCION_DISCIPLINARIA',
    });
    expect(conPruebaPendiente.ok).toBe(false);
    if (!conPruebaPendiente.ok) expect(conPruebaPendiente.error.message).toContain('sin valorar');

    const valorada = await assessEvidence(instructora, {
      evidenceId: prueba.data.evidenceId,
      admitted: true,
      admissionRationale: 'Se admite: proviene de la propia contabilidad de la sección y guarda relación con los hechos.',
    });
    expect(valorada.ok, valorada.ok ? '' : valorada.error.message).toBe(true);

    const resolucion = await issueDisciplinaryDecision(instructora, {
      caseId: expediente.caseId,
      decidedByBodyId: organoInstructorId,
      outcome: 'SUSPENSION_OF_RIGHTS',
      rationale:
        'Se tiene por acreditada la disposición de fondos sin acuerdo de asamblea, conforme a los estados de cuenta que obran en el expediente y a lo declarado en la audiencia celebrada ante esta comisión.',
      sanctionStartsOn: '2026-10-01',
      sanctionEndsOn: '2026-12-31',
      templateCode: 'RESOLUCION_DISCIPLINARIA',
    });
    expect(resolucion.ok, resolucion.ok ? '' : resolucion.error.message).toBe(true);
    if (!resolucion.ok) return;

    // La sanción vive en la membresía, que es lo que lee el padrón al votar.
    const sancionada = await base.prisma.membership.findUniqueOrThrow({
      where: { id: membresiaSenaladaId },
      select: { status: true, politicalRightsSuspendedUntil: true },
    });
    expect(sancionada.politicalRightsSuspendedUntil).not.toBeNull();

    // El recurso lo interpone quien fue sancionada, no cualquiera.
    const deOtra = await fileAppeal(ajena, {
      decisionId: resolucion.data.decisionId,
      grounds: 'Recurso interpuesto por quien no es la persona sancionada, para comprobar que no se admite.',
    });
    expect(deOtra.ok).toBe(false);

    const recurso = await fileAppeal(senaladaActor, {
      decisionId: resolucion.data.decisionId,
      grounds:
        'Se recurre la resolución porque los gastos imputados constan en el acta de la asamblea de la sección, que no se valoró.',
    });
    expect(recurso.ok, recurso.ok ? '' : recurso.error.message).toBe(true);
    if (!recurso.ok) return;

    const revocado = await resolveAppeal(vigilancia, {
      appealId: recurso.data.appealId,
      status: 'RESOLVED_REVOKED',
      resolutionText:
        'Se revoca la resolución recurrida: el acuerdo de asamblea que respalda los gastos consta en el acta de la sección.',
      resolvedByAssemblyId: null,
    });
    expect(revocado.ok, revocado.ok ? '' : revocado.error.message).toBe(true);
    if (!revocado.ok) return;
    expect(revocado.data.rightsRestored).toBe(true);

    // Restituida en el mismo acto: sin trámite aparte y sin fecha de suspensión.
    const restituida = await base.prisma.membership.findUniqueOrThrow({
      where: { id: membresiaSenaladaId },
      select: { status: true, politicalRightsSuspendedUntil: true },
    });
    expect(restituida.politicalRightsSuspendedUntil).toBeNull();
    expect(restituida.status).toBe('ACTIVE');
  });
});
