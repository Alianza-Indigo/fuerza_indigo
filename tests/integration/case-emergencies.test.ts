import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import {
  acknowledgeEmergency,
  advanceTask,
  assessCase,
  caseAlerts,
  caseDetail,
  closeEmergency,
  createTask,
  openCase,
  protocoloDeRiesgo,
  raiseEmergency,
} from '@/modules/cases';
import { RUTA_DEL_PROTOCOLO_DE_RIESGO } from '@/modules/cases/domain';
import { createPage, publishPage, reviewPage, submitForReview } from '@/modules/content';
import { healthReport } from '@/platform/health';

/**
 * Prioridades, alertas y protocolo de riesgo visible
 * (PRD §10.3, §24 Fase 6; F6-CAS-011).
 *
 * Cinco promesas que se comprueban ejecutando:
 *
 *  · **Sin protocolo publicado no se levanta la marca**, y la comprobación de
 *    salud lo señala antes de que haya una urgencia esperando.
 *  · El protocolo **se administra en el gestor de contenidos**, y la marca
 *    guarda cuál se enseñó: el texto se edita.
 *  · **Hacerse cargo y cerrar son dos actos**, y cerrar exige decir qué se hizo.
 *  · Las alertas **se derivan al leer**, y el orden lo decide el daño.
 *  · Ninguna alerta cruza el compartimento ni el territorio de quien pregunta.
 */

let base: TestDatabase;
let fuerzaId: string;
let atiende: PersonaDePrueba;
let redactora: PersonaDePrueba;
let revisora: PersonaDePrueba;
let ajena: PersonaDePrueba;
let paginaDelProtocolo: string;

const CONTEXTO = { correlationId: 'prueba-riesgo', ipHash: 'huella-de-riesgo' };

const RELATO =
  'Mi pareja me amenazó otra vez cuando le dije que iba a pedir ayuda en el trabajo. No sé a dónde ir esta noche y tengo una hija de seis años.';

const CUERPO_DEL_PROTOCOLO = [
  '## Si hay peligro ahora',
  '',
  'Llama al 911. Funciona en todo México, a cualquier hora y sin costo.',
  '',
  '## Rutas de la organización',
  '',
  'Guardia de acompañamiento: 33 0000 0000, de lunes a domingo.',
].join('\n');

beforeAll(async () => {
  base = await createTestDatabase('riesgo');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  redactora = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Redacta' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Revisa' });
  ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Personal', familyName: 'Social' });

  for (const persona of [atiende, redactora, revisora]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
  // Compartimento social: nunca ve las alertas de un expediente sindical.
  const alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;
  await nombrar(base.prisma, {
    userId: ajena.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
    'emergency_flag',
    'case_event',
    'case_task',
    'case_assignment',
    'case_participant',
    'case_file',
    'support_request',
  ]) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Publica el protocolo de riesgo en el gestor de contenidos. */
async function publicarProtocolo(cuerpo = CUERPO_DEL_PROTOCOLO): Promise<string> {
  const autora = await contextoDe(base.prisma, redactora);
  const creada = await createPage(autora, {
    slug: RUTA_DEL_PROTOCOLO_DE_RIESGO,
    kind: 'PROTOCOL',
    title: 'Qué hacer ante un riesgo inmediato',
    summary: 'A dónde acudir si hay peligro ahora mismo, y qué hace la organización.',
    bodyMarkdown: cuerpo,
    legalEntityId: fuerzaId,
    accessLevel: 'PUBLIC',
  });
  if (!creada.ok) throw creada.error;

  // Quien redacta no aprueba lo suyo: el CMS exige que revise otra persona.
  const quienRevisa = await contextoDe(base.prisma, revisora);
  await submitForReview(autora, creada.data.pageId);
  await reviewPage(quienRevisa, { pageId: creada.data.pageId, decision: 'APROBAR' });
  const publicada = await publishPage(quienRevisa, { pageId: creada.data.pageId });
  if (!publicada.ok) throw publicada.error;
  return creada.data.pageId;
}

/** Retira el protocolo publicado, para probar su ausencia. */
async function retirarProtocolo(): Promise<void> {
  // Primero se sueltan los punteros de la página a sus versiones: borrar las
  // versiones con la página todavía apuntándolas rompe la clave ajena, que es
  // exactamente lo que esa clave existe para impedir.
  await base.sql.query(`UPDATE "content_page" SET "currentVersionId" = NULL, "draftVersionId" = NULL`);
  await base.sql.query(`DELETE FROM "content_version"`);
  await base.sql.query(`DELETE FROM "content_page"`);
}

async function abrir(prioridad: 'CRITICAL' | 'NORMAL' = 'CRITICAL'): Promise<{ caseId: string; publicId: string }> {
  const enviado = await submitRequest(
    {
      requestType: 'VIOLENCE_OR_URGENCY',
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'Necesito ayuda esta noche',
      narrative: RELATO,
      acceptedPrivacyNotice: true,
    },
    CONTEXTO,
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });

  const canalizada = await confirmRouting(await contextoDe(base.prisma, atiende), {
    requestId: solicitud.id,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'URGENT',
    note: 'Hay riesgo declarado: entra por la vía urgente y se le llama hoy.',
  });
  if (!canalizada.ok) throw new Error(canalizada.error.message);

  const abierto = await openCase(await contextoDe(base.prisma, atiende), {
    supportRequestId: solicitud.id,
    legalEntityId: fuerzaId,
    domain: 'UNION_DEFENSE',
    caseType: 'VIOLENCE_OR_URGENCY',
    priority: prioridad,
    reason: 'Hay una amenaza declarada y hace falta expediente para acompañar.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data;
}

describe('sin protocolo publicado no hay marca de riesgo', () => {
  it('levantarla se niega y dice exactamente qué falta', async () => {
    await retirarProtocolo();
    const { caseId } = await abrir();

    const intento = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'VIOLENCE',
      note: 'Dice que su pareja la amenazó de nuevo y no tiene a dónde ir esta noche.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain(RUTA_DEL_PROTOCOLO_DE_RIESGO);

    expect(await base.prisma.emergencyFlag.count()).toBe(0);
  });

  it('y la comprobación de salud lo señala antes de que haya una urgencia esperando', async () => {
    await retirarProtocolo();

    const sinProtocolo = await healthReport();
    const marca = sinProtocolo.checks.find((check) => check.name === 'protocolo_de_riesgo');
    // Degradado y no fallido: el sistema funciona, lo que falta es contenido
    // por redactar. Lo tajante es la negativa a levantar la marca.
    expect(marca?.status).toBe('degraded');
    expect(marca?.detail).toContain(RUTA_DEL_PROTOCOLO_DE_RIESGO);

    await publicarProtocolo();
    const conProtocolo = await healthReport();
    expect(conProtocolo.checks.find((check) => check.name === 'protocolo_de_riesgo')?.status).toBe('ok');
  });
});

describe('el protocolo se administra en el gestor y la marca guarda cuál se enseñó', () => {
  beforeEach(async () => {
    await retirarProtocolo();
    paginaDelProtocolo = await publicarProtocolo();
  });

  it('el texto sale del gestor de contenidos, no del código', async () => {
    const protocolo = await protocoloDeRiesgo();
    expect(protocolo).not.toBeNull();
    expect(protocolo?.cuerpo).toContain('Guardia de acompañamiento');
    expect(protocolo?.id).toBe(paginaDelProtocolo);
  });

  it('la marca guarda qué protocolo se mostró, y lo devuelve para enseñarlo', async () => {
    const { caseId } = await abrir();

    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'VIOLENCE',
      note: 'Dice que su pareja la amenazó de nuevo y no tiene a dónde ir esta noche.',
    });
    expect(marcada.ok, marcada.ok ? '' : marcada.error.message).toBe(true);
    if (!marcada.ok) return;

    expect(marcada.data.protocolo.cuerpo).toContain('911');

    const fila = await base.prisma.emergencyFlag.findUniqueOrThrow({
      where: { id: marcada.data.flagId },
      select: { protocolShownId: true, raisedBy: true, acknowledgedAt: true },
    });
    // El protocolo se edita: hay que poder saber qué decía ese día.
    expect(fila.protocolShownId).toBe(paginaDelProtocolo);
    expect(fila.raisedBy).toBe('STAFF');
    expect(fila.acknowledgedAt).toBeNull();
  });

  it('hacerse cargo y cerrar son dos actos, y cerrar exige decir qué se hizo', async () => {
    const { caseId } = await abrir();
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'VIOLENCE',
      note: 'Amenaza declarada. Hay una menor de edad en casa.',
    });
    expect(marcada.ok).toBe(true);
    if (!marcada.ok) return;
    const flagId = marcada.data.flagId;

    // Cerrar sin que nadie la haya recogido no cierra nada.
    const prematuro = await closeEmergency(await contextoDe(base.prisma, atiende), {
      flagId,
      resolution: 'Se cierra sin que nadie se haya hecho cargo, que es lo que no debe poder hacerse.',
    });
    expect(prematuro.ok).toBe(false);
    if (!prematuro.ok) expect(prematuro.error.message).toContain('dos actos');

    const recogida = await acknowledgeEmergency(await contextoDe(base.prisma, atiende), {
      flagId,
      note: 'La llamo ahora y busco sitio en la red de refugios para esta noche.',
    });
    expect(recogida.ok, recogida.ok ? '' : recogida.error.message).toBe(true);

    // Y una vez recogida, no la recoge otra persona encima.
    const segunda = await acknowledgeEmergency(await contextoDe(base.prisma, atiende), {
      flagId,
      note: 'Intento de recogerla otra vez cuando alguien ya se hizo cargo.',
    });
    expect(segunda.ok).toBe(false);

    const cerrada = await closeEmergency(await contextoDe(base.prisma, atiende), {
      flagId,
      resolution: 'Se le acompañó al refugio de la red y se avisó a la delegación de su territorio.',
    });
    expect(cerrada.ok, cerrada.ok ? '' : cerrada.error.message).toBe(true);

    const fila = await base.prisma.emergencyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { acknowledgedById: true, acknowledgedAt: true, resolution: true, closedAt: true },
    });
    expect(fila.acknowledgedById).toBe(atiende.userId);
    expect(fila.acknowledgedAt).not.toBeNull();
    expect(fila.resolution).toContain('refugio');
    expect(fila.closedAt).not.toBeNull();
  });

  it('quien es parte del expediente ve que se tomó en serio y qué se hizo', async () => {
    const { caseId, publicId } = await abrir();
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'CHILD_PROTECTION',
      note: 'Hay una menor de edad en la casa donde ocurre la violencia.',
    });
    expect(marcada.ok).toBe(true);

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok, detalle.ok ? '' : detalle.error.message).toBe(true);
    if (!detalle.ok) return;

    expect(detalle.data.riesgos).toHaveLength(1);
    expect(detalle.data.riesgos[0]?.clase).toBe('CHILD_PROTECTION');
    expect(detalle.data.riesgos[0]?.cerradaEl).toBeNull();
  });
});

describe('las alertas se derivan al leer y el orden lo decide el daño', () => {
  beforeEach(async () => {
    await retirarProtocolo();
    await publicarProtocolo();
  });

  it('el riesgo sin recoger va antes que cualquier plazo', async () => {
    const conPlazo = await abrir('NORMAL');
    const conRiesgo = await abrir('NORMAL');

    // Un expediente con el plazo pasado.
    const valorado = await assessCase(await contextoDe(base.prisma, atiende), {
      caseId: conPlazo.caseId,
      humanAssessment: 'Se le contestó y se fijó plazo para presentar la demanda, que ya pasó.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    expect(valorado.ok, valorado.ok ? '' : valorado.error.message).toBe(true);

    // Y otro con una marca de riesgo que nadie ha recogido.
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId: conRiesgo.caseId,
      riskKind: 'VIOLENCE',
      note: 'Amenaza declarada esta mañana, sin sitio a dónde ir esta noche.',
    });
    expect(marcada.ok).toBe(true);

    const alertas = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(alertas.ok, alertas.ok ? '' : alertas.error.message).toBe(true);
    if (!alertas.ok) return;

    expect(alertas.data[0]?.clase).toBe('RIESGO_SIN_RECOGER');
    expect(alertas.data[0]?.caseId).toBe(conRiesgo.caseId);
    expect(alertas.data.map((alerta) => alerta.clase)).toContain('PLAZO_VENCIDO');
  });

  it('recoger la marca la saca de la lista sin que nada la haya borrado', async () => {
    const { caseId } = await abrir();
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'SELF_HARM',
      note: 'Dijo por teléfono que no aguanta más y no quiere seguir.',
    });
    expect(marcada.ok).toBe(true);
    if (!marcada.ok) return;

    const antes = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(antes.ok).toBe(true);
    if (antes.ok) expect(antes.data.some((alerta) => alerta.clase === 'RIESGO_SIN_RECOGER')).toBe(true);

    await acknowledgeEmergency(await contextoDe(base.prisma, atiende), {
      flagId: marcada.data.flagId,
      note: 'La llamo ahora mismo y valoro con ella qué necesita hoy.',
    });

    const despues = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(despues.ok).toBe(true);
    if (despues.ok) expect(despues.data.some((alerta) => alerta.clase === 'RIESGO_SIN_RECOGER')).toBe(false);

    // La marca sigue ahí: dejó de estar pendiente, no dejó de existir.
    expect(await base.prisma.emergencyFlag.count({ where: { caseId } })).toBe(1);
  });

  it('un expediente crítico sin valorar aparece por sí solo, sin que nada lo marque', async () => {
    const { caseId } = await abrir('CRITICAL');

    // Se envejece la apertura: un expediente crítico se contesta en horas.
    await base.sql.query(`UPDATE "case_file" SET "openedAt" = now() - interval '2 days' WHERE id = $1`, [caseId]);

    const alertas = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(alertas.ok).toBe(true);
    if (!alertas.ok) return;
    expect(alertas.data.some((alerta) => alerta.clase === 'SIN_PRIMERA_RESPUESTA')).toBe(true);

    // Y en cuanto se valora, desaparece: nada la borró, dejó de ser cierta.
    const valorado = await assessCase(await contextoDe(base.prisma, atiende), {
      caseId,
      humanAssessment: 'Se le llamó, se valoró el riesgo y se acordó el acompañamiento de esta semana.',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      dueAt: null,
    });
    expect(valorado.ok, valorado.ok ? '' : valorado.error.message).toBe(true);

    const despues = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(despues.ok).toBe(true);
    if (despues.ok) expect(despues.data.some((alerta) => alerta.clase === 'SIN_PRIMERA_RESPUESTA')).toBe(false);
  });

  it('las tareas fuera de plazo se agrupan por expediente, no una por tarea', async () => {
    const { caseId } = await abrir('NORMAL');
    await assessCase(await contextoDe(base.prisma, atiende), {
      caseId,
      humanAssessment: 'Se le contestó el mismo día y se repartieron las gestiones.',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      dueAt: null,
    });

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const titulo of ['Pedir el reporte a la delegación', 'Confirmar el refugio para esta noche']) {
      const creada = await createTask(await contextoDe(base.prisma, atiende), {
        caseId,
        title: titulo,
        dueAt: ayer,
      });
      expect(creada.ok, creada.ok ? '' : creada.error.message).toBe(true);
    }

    const alertas = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(alertas.ok).toBe(true);
    if (!alertas.ok) return;

    const deTareas = alertas.data.filter((alerta) => alerta.clase === 'TAREA_VENCIDA');
    expect(deTareas).toHaveLength(1);
    expect(deTareas[0]?.detalle).toContain('2 tareas');
  });

  it('terminar la tarea la saca de la lista', async () => {
    const { caseId } = await abrir('NORMAL');
    await assessCase(await contextoDe(base.prisma, atiende), {
      caseId,
      humanAssessment: 'Se le contestó el mismo día y se repartieron las gestiones.',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      dueAt: null,
    });

    const creada = await createTask(await contextoDe(base.prisma, atiende), {
      caseId,
      title: 'Confirmar el refugio para esta noche',
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    await advanceTask(await contextoDe(base.prisma, atiende), { taskId: creada.data.taskId, status: 'DONE' });

    const alertas = await caseAlerts(await contextoDe(base.prisma, atiende));
    expect(alertas.ok).toBe(true);
    if (alertas.ok) expect(alertas.data.some((alerta) => alerta.clase === 'TAREA_VENCIDA')).toBe(false);
  });

  it('ninguna alerta cruza el compartimento de quien pregunta', async () => {
    const { caseId } = await abrir();
    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      caseId,
      riskKind: 'VIOLENCE',
      note: 'Amenaza declarada esta mañana, sin sitio a dónde ir esta noche.',
    });
    expect(marcada.ok).toBe(true);

    // El personal de atención social no lleva expedientes sindicales: su lista
    // sale vacía, no prohibida.
    const ajenas = await caseAlerts(await contextoDe(base.prisma, ajena));
    expect(ajenas.ok, ajenas.ok ? '' : ajenas.error.message).toBe(true);
    if (ajenas.ok) expect(ajenas.data).toHaveLength(0);
  });
});
