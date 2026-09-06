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
import {
  addAgendaItem,
  computeQuorum,
  conveneAssembly,
  declareQuorum,
  freezeRoster,
  frozenRoster,
  issueCall,
  registerAttendance,
} from '@/modules/assembly';
import { huellaDePadron } from '@/modules/assembly/domain';
import { appointOffice, createUnionBody, defineOffice } from '@/modules/governance';
import { expireDueRoleAssignments } from '@/modules/access';
import {
  castBallot,
  closeVoteProcess,
  issueVoteCredentials,
  scheduleVoteProcess,
  tallyVoteProcess,
} from '@/modules/voting';
import { draftTemplate, publishTemplate } from '@/modules/documents';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { systemContext, withReason } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

/**
 * Los tres criterios de la Fase 5 que el PRD §24 exige demostrar
 * (F5-QA-001, F5-QA-002, F5-QA-003).
 *
 *  1. El quórum es reproducible desde el padrón congelado.
 *  2. El voto emitido no puede asociarse con su sentido desde la base operativa.
 *  3. Un cargo vencido pierde el acceso sin que nadie intervenga.
 *
 * No se comprueban leyendo el código: se comprueban ejecutándolo y mirando
 * después lo que quedó en la base, con las credenciales de la aplicación.
 */

let base: TestDatabase;
let entidadId: string;
let unidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
// La votación no la administra quien preside: escrutar y certificar es de la
// Comisión Electoral (semilla de roles). Juntarlo sería juez y parte.
let comision: ActorContext;
let organoId: string;

const MANANA = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

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
  base = await createTestDatabase('fase5');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  await ponerReglasEnVigor();

  const unidad = await base.prisma.territorialUnit.findFirstOrThrow({
    where: { depth: 0 },
    select: { id: true },
  });
  unidadId = unidad.id;

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De la Fase Cinco',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  const comisionPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Comisionada',
    familyName: 'Electoral',
  });
  await nombrar(base.prisma, {
    userId: comisionPersona.userId,
    roleCode: 'ELECTORAL_COMMISSION',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  comision = await contextoDe(base.prisma, comisionPersona);

  const organo = await createUnionBody(secretaria, {
    code: 'ASAMBLEA_GENERAL',
    name: 'Asamblea General',
    kind: 'GENERAL_ASSEMBLY',
    territorialUnitId: unidadId,
    legalEntityId: entidadId,
    installedOn: '2026-01-15',
  });
  if (!organo.ok) throw new Error(organo.error.message);
  organoId = organo.data.unionBodyId;

  // Plantilla de convocatoria, publicada: sin ella no se puede convocar.
  const plantilla = await draftTemplate(secretaria, {
    code: 'CONVOCATORIA',
    name: 'Convocatoria a asamblea',
    kind: 'CALL_NOTICE',
    legalEntityId: entidadId,
    bodyTemplate:
      '<p>{{entidad}} · {{organo}} · {{territorio}} convoca a asamblea {{tipoDeAsamblea}} en {{convocatoria}} ' +
      'convocatoria para el {{fechaDeSesion}}, modalidad {{modalidad}}, en {{lugar}}. Orden del día: {{ordenDelDia}}. ' +
      'Quórum: {{quorum}}. Anticipación: {{anticipacion}} días. Reglas {{versionNormativa}}.</p>',
    variables: [
      'entidad',
      'organo',
      'territorio',
      'tipoDeAsamblea',
      'convocatoria',
      'fechaDeSesion',
      'modalidad',
      'lugar',
      'ordenDelDia',
      'quorum',
      'anticipacion',
      'versionNormativa',
    ],
    numberingSeries: 'CONV',
  });
  if (!plantilla.ok) throw new Error(plantilla.error.message);
  const publicada = await publishTemplate(secretaria, { templateId: plantilla.data.templateId });
  if (!publicada.ok) throw new Error(publicada.error.message);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

describe('F5-QA-001 · el quórum es reproducible desde el padrón congelado', () => {
  it('el quórum se calcula sobre el padrón congelado y no sobre el de hoy', async () => {
    // Cinco agremiados al congelar.
    for (let i = 0; i < 5; i += 1) {
      const persona = await crearPersonaConCuenta(base.prisma, {
        givenName: `Agremiada${i}`,
        familyName: 'Del Quórum',
      });
      await crearMembresia(base.prisma, {
        personId: persona.personId,
        legalEntityId: entidadId,
        typeCode: 'AGREMIADO',
        territorialUnitId: unidadId,
      });
    }

    const asamblea = await conveneAssembly(secretaria, {
      unionBodyId: organoId,
      territorialUnitId: unidadId,
      type: 'ORDINARY',
      modality: 'IN_PERSON',
      venue: 'Local sindical',
      scheduledAt: MANANA.toISOString(),
      convenedByOfficeTermId: null,
      convenedByPetition: true,
    });
    expect(asamblea.ok, asamblea.ok ? '' : asamblea.error.message).toBe(true);
    if (!asamblea.ok) return;

    const punto = await addAgendaItem(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      title: 'Informe de la Secretaría General',
      description: 'Se rinde el informe anual conforme al estatuto.',
      kind: 'INFORMATIVE',
    });
    expect(punto.ok).toBe(true);

    const convocatoria = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'FIRST',
      publishedChannels: ['SITIO_WEB', 'ESTRADOS'],
      templateCode: 'CONVOCATORIA',
    });
    expect(convocatoria.ok, convocatoria.ok ? '' : convocatoria.error.message).toBe(true);

    const congelado = await freezeRoster(secretaria, { assemblyId: asamblea.data.assemblyId });
    expect(congelado.ok, congelado.ok ? '' : congelado.error.message).toBe(true);
    if (!congelado.ok) return;
    expect(congelado.data.entryCount).toBe(5);

    // Después de congelar entran dos personas más. El padrón de la sesión no
    // cambia: si cambiara, la base del quórum dependería de cuándo se pregunte.
    for (let i = 0; i < 2; i += 1) {
      const tardia = await crearPersonaConCuenta(base.prisma, {
        givenName: `Tardia${i}`,
        familyName: 'Del Quórum',
      });
      await crearMembresia(base.prisma, {
        personId: tardia.personId,
        legalEntityId: entidadId,
        typeCode: 'AGREMIADO',
        territorialUnitId: unidadId,
      });
    }

    const calculo = await computeQuorum(secretaria, asamblea.data.assemblyId);
    expect(calculo.ok).toBe(true);
    if (!calculo.ok || calculo.data === null) return;

    expect(calculo.data.rosterSize).toBe(5);
    expect(calculo.data.required).toBe(3);

    // Y la huella se recomputa desde las entradas guardadas, con la misma
    // función que puede ejecutar cualquiera que reciba el padrón.
    const vista = await frozenRoster(secretaria, asamblea.data.assemblyId);
    expect(vista.ok).toBe(true);
    if (!vista.ok || vista.data === null) return;
    expect(vista.data.intact).toBe(true);

    const entradas = await base.prisma.assemblyRosterEntry.findMany({
      where: { rosterId: vista.data.rosterId },
      select: {
        membershipId: true,
        memberNumber: true,
        territorialUnitId: true,
        hasVoice: true,
        hasVote: true,
      },
    });
    expect(huellaDePadron(entradas)).toBe(vista.data.hash);
  });

  it('el padrón congelado no se puede modificar con las credenciales de la aplicación', async () => {
    const snapshot = await base.prisma.assemblyRosterSnapshot.findFirstOrThrow({ select: { id: true } });

    // Se intenta a través del cliente que usa la aplicación: si esto tuviera
    // éxito, la inmutabilidad sería una promesa y no una garantía.
    await expect(
      base.prisma.assemblyRosterSnapshot.update({
        where: { id: snapshot.id },
        data: { entryCount: 999 },
      }),
    ).rejects.toThrow();

    const sigueIgual = await base.prisma.assemblyRosterSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      select: { entryCount: true },
    });
    expect(sigueIgual.entryCount).toBe(5);
  });
});

describe('F5-QA-002 · el voto no puede asociarse con su sentido desde la base', () => {
  it('la urna no guarda nada que permita emparejar boleta y persona', async () => {
    const asamblea = await conveneAssembly(secretaria, {
      unionBodyId: organoId,
      territorialUnitId: unidadId,
      type: 'EXTRAORDINARY',
      modality: 'IN_PERSON',
      venue: 'Local sindical',
      scheduledAt: MANANA.toISOString(),
      convenedByOfficeTermId: null,
      convenedByPetition: true,
    });
    if (!asamblea.ok) throw new Error(asamblea.error.message);

    const punto = await addAgendaItem(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      title: 'Aprobación del convenio',
      description: 'Se somete a votación la aprobación del convenio propuesto.',
      kind: 'DELIBERATIVE',
    });
    if (!punto.ok) throw new Error(punto.error.message);

    const convocatoria = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'FIRST',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    if (!convocatoria.ok) throw new Error(convocatoria.error.message);

    const congelado = await freezeRoster(secretaria, { assemblyId: asamblea.data.assemblyId });
    if (!congelado.ok) throw new Error(congelado.error.message);

    const votacion = await scheduleVoteProcess(comision, {
      context: 'ASSEMBLY_ITEM',
      assemblyId: asamblea.data.assemblyId,
      agendaItemId: punto.data.agendaItemId,
      electionId: null,
      bargainingFileId: null,
      title: 'Aprobación del convenio',
      method: 'SECRET',
      options: [
        { code: 'A_FAVOR', label: 'A favor' },
        { code: 'EN_CONTRA', label: 'En contra' },
        { code: 'ABSTENCION', label: 'Abstención' },
      ],
      rosterSnapshotId: congelado.data.rosterId,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (!votacion.ok) throw new Error(votacion.error.message);

    const credenciales = await issueVoteCredentials(comision, {
      voteProcessId: votacion.data.voteProcessId,
    });
    expect(credenciales.ok, credenciales.ok ? '' : credenciales.error.message).toBe(true);
    if (!credenciales.ok) return;
    expect(credenciales.data.issued.length).toBeGreaterThanOrEqual(3);

    // Tres personas depositan, con sentidos distintos. Con este volumen,
    // cualquier fuga residual sería trivial de explotar: ese es el punto de la
    // prueba adversaria del ADR-0012.
    const sentidos = ['A_FAVOR', 'EN_CONTRA', 'ABSTENCION'];
    const codigos: string[] = [];
    for (const [indice, credencial] of credenciales.data.issued.slice(0, 3).entries()) {
      const depositada = await castBallot({
        voteProcessId: votacion.data.voteProcessId,
        credential: credencial.credential,
        optionCode: sentidos[indice] ?? 'A_FAVOR',
      });
      expect(depositada.ok, depositada.ok ? '' : depositada.error.message).toBe(true);
      if (depositada.ok) codigos.push(depositada.data.verificationCode);
    }

    // 1. La misma credencial no deposita dos veces.
    const repetida = await castBallot({
      voteProcessId: votacion.data.voteProcessId,
      credential: credenciales.data.issued[0]!.credential,
      optionCode: 'A_FAVOR',
    });
    expect(repetida.ok).toBe(false);

    // 2. La urna, leída en crudo, no tiene ninguna columna que apunte a nadie
    //    ni al momento del depósito.
    const columnas = await base.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ballot'`,
    );
    const nombres = columnas.rows.map((fila) => fila.column_name);
    expect(nombres.sort()).toEqual(
      ['id', 'nullifiedReason', 'selection', 'verificationCode', 'voteProcessId'].sort(),
    );

    const gastadas = await base.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'spent_vote_credential'`,
    );
    expect(gastadas.rows.map((fila) => fila.column_name).sort()).toEqual(
      ['credentialHash', 'id', 'voteProcessId'].sort(),
    );

    // 3. El identificador de la boleta es UUIDv4: no codifica el instante.
    const boletas = await base.sql.query<{ id: string }>(
      `SELECT id::text FROM ballot WHERE "voteProcessId" = $1`,
      [votacion.data.voteProcessId],
    );
    expect(boletas.rows).toHaveLength(3);
    for (const fila of boletas.rows) {
      expect(fila.id[14]).toBe('4');
    }

    // 4. Nada en la fila identificada guarda la hora de emisión: solo la fecha.
    const elegibles = await base.sql.query<{ credentialIssuedOn: string | null }>(
      `SELECT "credentialIssuedOn"::text FROM vote_eligibility WHERE "voteProcessId" = $1 AND "credentialIssued"`,
      [votacion.data.voteProcessId],
    );
    for (const fila of elegibles.rows) {
      expect(fila.credentialIssuedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // 5. El escrutinio publica los códigos sin su sentido.
    const cerrada = await closeVoteProcess(comision, { voteProcessId: votacion.data.voteProcessId });
    expect(cerrada.ok).toBe(true);
    const escrutinio = await tallyVoteProcess(comision, { voteProcessId: votacion.data.voteProcessId });
    expect(escrutinio.ok, escrutinio.ok ? '' : escrutinio.error.message).toBe(true);
    if (!escrutinio.ok) return;

    for (const codigo of codigos) {
      expect(escrutinio.data.verificationCodes).toContain(codigo);
    }
    // La lista es solo de códigos: no viene acompañada del sentido de ninguno.
    expect(JSON.stringify(escrutinio.data.verificationCodes)).not.toContain('A_FAVOR');

    // 6. Y la abstención se cuenta sin atribuirse.
    expect(escrutinio.data.credentialsIssued).toBeGreaterThan(escrutinio.data.credentialsSpent);
    expect(escrutinio.data.abstained).toBe(
      escrutinio.data.credentialsIssued - escrutinio.data.credentialsSpent,
    );
  });

  it('la boleta no se puede alterar ni borrar con las credenciales de la aplicación', async () => {
    const boleta = await base.prisma.ballot.findFirstOrThrow({ select: { id: true } });

    await expect(
      base.prisma.ballot.update({ where: { id: boleta.id }, data: { selection: { option: 'EN_CONTRA' } } }),
    ).rejects.toThrow();
    await expect(base.prisma.ballot.delete({ where: { id: boleta.id } })).rejects.toThrow();
  });
});

describe('F5-QA-003 · un cargo vencido pierde el acceso sin que nadie intervenga', () => {
  it('el trabajo programado retira el acceso del periodo vencido', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Delegada',
      familyName: 'Que Vence',
    });
    const membresia = await crearMembresia(base.prisma, {
      personId: persona.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
      territorialUnitId: unidadId,
    });

    const cargo = await defineOffice(secretaria, {
      code: 'DELEGACION_DE_PRUEBA',
      name: 'Delegación de prueba',
      unionBodyId: organoId,
      kind: 'SECTION_DELEGATE',
      // Un mes: se nombra en el pasado para que el periodo ya esté vencido.
      termMonths: 1,
      reelectionAllowed: false,
      seats: 1,
      grantsRoleCode: 'TERRITORIAL_DELEGATE',
      permissionCodes: ['territory.unit.read'],
    });
    expect(cargo.ok, cargo.ok ? '' : cargo.error.message).toBe(true);
    if (!cargo.ok) return;

    const hace90Dias = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const designacion = await appointOffice(secretaria, {
      officeDefinitionId: cargo.data.officeDefinitionId,
      membershipId: membresia.id,
      territorialUnitId: unidadId,
      designationMethod: 'ASSEMBLY_APPOINTMENT',
      electionId: null,
      substitutedTermId: null,
      startsOn: hace90Dias.toISOString().slice(0, 10),
      reason: 'Designación de prueba para comprobar el vencimiento del acceso.',
    });
    expect(designacion.ok, designacion.ok ? '' : designacion.error.message).toBe(true);
    if (!designacion.ok) return;

    // El acceso nació atado al periodo.
    const periodo = await base.prisma.officeTerm.findUniqueOrThrow({
      where: { id: designacion.data.officeTermId },
      select: { roleAssignmentId: true, endsOn: true },
    });
    expect(periodo.roleAssignmentId).not.toBeNull();
    expect(periodo.endsOn.getTime()).toBeLessThan(Date.now());

    const antes = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: periodo.roleAssignmentId! },
      select: { revokedAt: true },
    });
    expect(antes.revokedAt).toBeNull();

    // Nadie interviene: lo hace el trabajo programado, con su actor de sistema.
    const trabajo = systemContext({
      actorId: await actorDeMigracion(base.prisma),
      jobType: 'role-expiry',
      correlationId: newCorrelationId(),
    });
    const resultado = await expireDueRoleAssignments(trabajo);
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data.offices).toBeGreaterThanOrEqual(1);

    const despues = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: periodo.roleAssignmentId! },
      select: { revokedAt: true, revokeReason: true },
    });
    expect(despues.revokedAt).not.toBeNull();
    expect(despues.revokeReason).toContain('cargo');

    // Y el contexto que el sistema construye para esa persona ya no lleva el
    // permiso del cargo: eso es «perder el acceso», no una bandera.
    const contexto = await contextoDe(base.prisma, persona);
    const permisos = new Set(contexto.roles.flatMap((rol) => [...rol.permissions]));
    expect([...permisos]).not.toContain('territory.unit.read');
  });
});

describe('afiliados honorarios y beneficiarios no votan', () => {
  it('una afiliación honoraria no entra en el padrón de la asamblea', async () => {
    const honoraria = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Honoraria',
      familyName: 'Sin Voto',
    });
    const membresia = await crearMembresia(base.prisma, {
      personId: honoraria.personId,
      legalEntityId: entidadId,
      typeCode: 'AFILIADO_HONORARIO',
      territorialUnitId: unidadId,
    });

    const asamblea = await conveneAssembly(secretaria, {
      unionBodyId: organoId,
      territorialUnitId: unidadId,
      type: 'ORDINARY',
      modality: 'REMOTE',
      venue: null,
      scheduledAt: MANANA.toISOString(),
      convenedByOfficeTermId: null,
      convenedByPetition: true,
    });
    if (!asamblea.ok) throw new Error(asamblea.error.message);
    const punto = await addAgendaItem(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      title: 'Punto único',
      description: 'Punto informativo para la prueba del padrón.',
      kind: 'INFORMATIVE',
    });
    if (!punto.ok) throw new Error(punto.error.message);
    const convocatoria = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'FIRST',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    if (!convocatoria.ok) throw new Error(convocatoria.error.message);

    const congelado = await freezeRoster(secretaria, { assemblyId: asamblea.data.assemblyId });
    if (!congelado.ok) throw new Error(congelado.error.message);

    const entrada = await base.prisma.assemblyRosterEntry.findUnique({
      where: { rosterId_membershipId: { rosterId: congelado.data.rosterId, membershipId: membresia.id } },
      select: { membershipId: true },
    });
    // Ni siquiera aparece sin voto: no se lista a quien no participa.
    expect(entrada).toBeNull();

    // Y registrar su asistencia se rechaza, no se ignora en silencio.
    const asistencia = await registerAttendance(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      method: 'MANUAL',
      membershipId: membresia.id,
      credentialToken: null,
    });
    expect(asistencia.ok).toBe(false);
    if (!asistencia.ok) expect(asistencia.error.message).toContain('padrón congelado');
  });
});

describe('primera y segunda convocatoria se distinguen', () => {
  it('la segunda no se emite sin la primera, y su regla de quórum es otra', async () => {
    const asamblea = await conveneAssembly(secretaria, {
      unionBodyId: organoId,
      territorialUnitId: unidadId,
      type: 'ORDINARY',
      modality: 'IN_PERSON',
      venue: 'Local sindical',
      scheduledAt: MANANA.toISOString(),
      convenedByOfficeTermId: null,
      convenedByPetition: true,
    });
    if (!asamblea.ok) throw new Error(asamblea.error.message);
    const punto = await addAgendaItem(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      title: 'Punto de la segunda convocatoria',
      description: 'Punto informativo para la prueba de convocatorias.',
      kind: 'INFORMATIVE',
    });
    if (!punto.ok) throw new Error(punto.error.message);

    const segundaSinPrimera = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'SECOND',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    expect(segundaSinPrimera.ok).toBe(false);

    const primera = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'FIRST',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    expect(primera.ok).toBe(true);

    const segunda = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'SECOND',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    expect(segunda.ok, segunda.ok ? '' : segunda.error.message).toBe(true);

    const convocatorias = await base.prisma.assemblyCall.findMany({
      where: { assemblyId: asamblea.data.assemblyId },
      select: { ordinal: true, quorumRule: true },
    });
    const porOrdinal = new Map(convocatorias.map((call) => [call.ordinal, call.quorumRule]));
    expect(porOrdinal.get('FIRST')).toBe('HALF_PLUS_ONE');
    expect(porOrdinal.get('SECOND')).toBe('THOSE_PRESENT');
  });
});

describe('una convocatoria fuera de plazo no se emite', () => {
  it('se rechaza cuando no alcanza la anticipación estatutaria', async () => {
    const enTresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const asamblea = await conveneAssembly(secretaria, {
      unionBodyId: organoId,
      territorialUnitId: unidadId,
      type: 'ORDINARY',
      modality: 'IN_PERSON',
      venue: 'Local sindical',
      scheduledAt: enTresDias.toISOString(),
      convenedByOfficeTermId: null,
      convenedByPetition: true,
    });
    if (!asamblea.ok) throw new Error(asamblea.error.message);
    const punto = await addAgendaItem(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      title: 'Punto apresurado',
      description: 'Punto informativo para la prueba de anticipación.',
      kind: 'INFORMATIVE',
    });
    if (!punto.ok) throw new Error(punto.error.message);

    const convocatoria = await issueCall(secretaria, {
      assemblyId: asamblea.data.assemblyId,
      ordinal: 'FIRST',
      publishedChannels: ['SITIO_WEB'],
      templateCode: 'CONVOCATORIA',
    });
    expect(convocatoria.ok).toBe(false);
    if (!convocatoria.ok) {
      // El estatuto exige quince días para una ordinaria y faltan tres.
      expect(convocatoria.error.message).toContain('15');
      expect(convocatoria.error.message).toContain('impugnable');
    }
  });
});

describe('el quórum se declara y queda con su cálculo', () => {
  it('sin alcanzar el mínimo no se declara, y con él queda la base y los presentes', async () => {
    const asamblea = await base.prisma.assembly.findFirstOrThrow({
      where: { quorumDeclaredAt: null, rosterSnapshot: { isNot: null }, status: 'CALLED' },
      select: { id: true, rosterSnapshot: { select: { id: true, entryCount: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // El motor exige motivo para un acto crítico, igual que la acción de
    // servidor que lo llama desde la pantalla.
    const preside = withReason(secretaria, 'instalación de la sesión con la primera convocatoria');
    const sinPresentes = await declareQuorum(preside, { assemblyId: asamblea.id, ordinal: 'FIRST' });
    expect(sinPresentes.ok).toBe(false);

    const entradas = await base.prisma.assemblyRosterEntry.findMany({
      where: { rosterId: asamblea.rosterSnapshot!.id },
      select: { membershipId: true },
    });
    const necesarios = Math.floor(entradas.length / 2) + 1;
    for (const entrada of entradas.slice(0, necesarios)) {
      const registrada = await registerAttendance(secretaria, {
        assemblyId: asamblea.id,
        method: 'MANUAL',
        membershipId: entrada.membershipId,
        credentialToken: null,
      });
      expect(registrada.ok, registrada.ok ? '' : registrada.error.message).toBe(true);
    }

    const declarado = await declareQuorum(preside, { assemblyId: asamblea.id, ordinal: 'FIRST' });
    expect(declarado.ok, declarado.ok ? '' : declarado.error.message).toBe(true);
    if (!declarado.ok) return;

    const guardado = await base.prisma.assembly.findUniqueOrThrow({
      where: { id: asamblea.id },
      select: { status: true, quorumBase: true, quorumPresent: true, quorumDeclaredById: true },
    });
    expect(guardado.status).toBe('IN_SESSION');
    expect(guardado.quorumBase).toBe(entradas.length);
    expect(guardado.quorumPresent).toBe(necesarios);
    // Quien declara responde: su nombre queda.
    expect(guardado.quorumDeclaredById).toBe(secretariaPersona.userId);
  });
});
