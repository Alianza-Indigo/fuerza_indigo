import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrompt,
  indexSourceNow,
  registerSource,
  retrieveForVersion,
  reviewGeneration,
  setVersionSources,
  usageByModule,
  readProviderConfig,
} from '@/modules/ai';
import {
  assistOnRequest,
  confirmRouting,
  PUBLIC_INTAKE_NOTICE_CODE,
  submitRequest,
  suggestClassification,
} from '@/modules/support';
import { aiCapability } from '@/platform/ai';
import { setAiProviderForTests, EMBEDDING_DIM, type AiProviderPort } from '@/platform/ai/provider-port';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Los seis criterios del PRD §24 Fase 8, comprobados **ejecutando el sistema** y
 * mirando después lo que quedó en la base con las credenciales de la aplicación,
 * nunca leyendo el código.
 *
 *  1. Ningún prompt crítico vive solamente en el código.
 *  2. Fuentes y fragmentos respetan los permisos del usuario.
 *  3. La salida identifica que fue generada con IA y permite corregirla.
 *  4. Las acciones sensibles requieren confirmación humana.
 *  5. La aplicación continúa operando si Gemini está caído.
 *  6. Los costos y errores se consultan por módulo sin exponer contenido sensible.
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_FASE8_CLAVE';
const PERMISO_RESTRINGIDO = 'membership.roster.read';
const SECRETO = 'SECRETO-DEL-CONTENIDO-GENERADO';

let base: TestDatabase;
let fuerzaId: string;
let secretaria: PersonaDePrueba; // EXECUTIVE_SECRETARY: publica, triage, provider.configure, usage.read, generation.read, roster.read
let gestora: PersonaDePrueba; // COMMUNICATIONS: prompt.edit, knowledge.manage, generation.review; SIN roster.read
let contraloria: PersonaDePrueba; // OVERSIGHT_COMMISSION: solo usage.read
let autora: PersonaDePrueba;
let revisora: PersonaDePrueba;

function vectorDePrueba(text: string): number[] {
  const h = createHash('sha256').update(text).digest();
  const v: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i += 1) v.push((h[i % h.length]! / 255) - 0.5);
  return v;
}

const PROPUESTA_FALSA = JSON.stringify({
  entidad: 'FUERZA_INDIGO',
  dominio: 'UNION_DEFENSE',
  urgencia: 'PRIORITY',
  // El contenido generado lleva el marcador: la consulta de consumo no debe
  // dejarlo salir.
  motivo: `Materia laboral. ${SECRETO}`,
  alternativa: null,
  requiereProtocoloDeRiesgo: false,
});

const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: () => Promise.resolve({ text: PROPUESTA_FALSA, promptTokens: 30, completionTokens: 12 }),
  embed: (input) => Promise.resolve(input.texts.map((t) => vectorDePrueba(t))),
};

let contador = 0;
function unico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}-${Math.random().toString(36).slice(2, 6)}`;
}

async function actorMigracion(): Promise<string> {
  return (await base.prisma.actor.findFirstOrThrow({ where: { kind: 'MIGRATION' }, select: { id: true } })).id;
}

/** Publica un prompt por su código, con autor y revisor distintos. Devuelve su versión. */
async function publicarPrompt(code: string): Promise<string> {
  const actorId = await actorMigracion();
  const p = await base.prisma.aiPrompt.create({
    data: { code, purpose: 'Caso de uso asistido.', module: 'support', createdByActorId: actorId, updatedByActorId: actorId },
    select: { id: true },
  });
  const v = await base.prisma.aiPromptVersion.create({
    data: {
      promptId: p.id,
      version: 1,
      systemText: `Prompt administrado ${code}: responde en JSON.`,
      allowedVariables: [],
      model: 'gemini-2.5-flash',
      parameters: { temperature: 0.2 },
      outputSchema: { type: 'object' },
      limits: { maxOutputTokens: 256 },
      status: 'PUBLISHED',
      publishedAt: new Date(),
      reviewerId: revisora.userId,
      reviewedAt: new Date(),
      authorId: autora.userId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
    select: { id: true },
  });
  await base.prisma.aiPrompt.update({ where: { id: p.id }, data: { currentVersionId: v.id } });
  return v.id;
}

let envios = 0;
async function crearSolicitud(): Promise<{ id: string }> {
  envios += 1;
  const enviado = await submitRequest(
    {
      requestType: 'INDIVIDUAL_LABOR_DISPUTE',
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'No sé a quién le toca',
      narrative: 'Me despidieron tras pedir un ajuste razonable en el trabajo.',
      acceptedPrivacyNotice: true,
    },
    { correlationId: `fase8-${envios}`, ipHash: `huella-fase8-${envios}` },
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const fila = await base.prisma.supportRequest.findFirstOrThrow({ where: { folio: enviado.data.folio }, select: { id: true } });
  return fila;
}

/** Habilita el proveedor con su clave y límites holgados. */
async function habilitarProveedor(): Promise<void> {
  await base.sql.query(
    `UPDATE "ai_provider_configuration"
        SET "isEnabled" = true, "apiKeyEnvVarName" = $1,
            "maxTokensPerRequest" = 8192, "maxRequestsPerUserPerDay" = 50, "maxMonthlyCostMinor" = 500000
      WHERE "provider" = 'GEMINI'`,
    [VARIABLE_CON_CLAVE],
  );
}

beforeAll(async () => {
  base = await createTestDatabase('fase8-criterios');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  gestora = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Gestora' });
  contraloria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Contraloría' });
  autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora', familyName: 'De Prompts' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'De Prompts' });

  await nombrar(base.prisma, { userId: secretaria.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: quienNombra.userId, legalEntityId: fuerzaId });
  await nombrar(base.prisma, { userId: gestora.userId, roleCode: 'COMMUNICATIONS', grantedById: quienNombra.userId, legalEntityId: fuerzaId });
  await nombrar(base.prisma, { userId: contraloria.userId, roleCode: 'OVERSIGHT_COMMISSION', grantedById: quienNombra.userId, legalEntityId: fuerzaId });

  await base.prisma.consentVersion.updateMany({ where: { code: PUBLIC_INTAKE_NOTICE_CODE }, data: { status: 'PUBLISHED' } });

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba';
  setAiProviderForTests(puertoFalso);
  await habilitarProveedor();

  // Dos prompts administrados que varios criterios reutilizan. `redaccion-comunicacion`
  // se deja **sin publicar** a propósito: el criterio 1 lo usa para probar que sin
  // prompt administrado el flujo degrada (no hay texto en el código que lo supla).
  await publicarPrompt('clasificacion-solicitud');
  await publicarPrompt('resumen-solicitud');
}, 180_000);

afterAll(async () => {
  setAiProviderForTests(null);
  delete process.env[VARIABLE_CON_CLAVE];
  await base?.destroy();
});

beforeEach(async () => {
  await habilitarProveedor();
});

describe('Criterio 1 · ningún prompt crítico vive solamente en el código (F8-QA-001)', () => {
  it('sin prompt publicado el flujo asistido degrada; publicado uno, ejecuta con la versión de la base', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const solicitud = await crearSolicitud();

    // La redacción asistida no tiene prompt publicado: sin texto en el código que
    // lo supla, se degrada al camino humano.
    const sinPrompt = await assistOnRequest(actor, { requestId: solicitud.id, useCase: 'DRAFTING_ASSISTANCE', userText: 'Redáctame una respuesta.' });
    if (!sinPrompt.ok) throw new Error(sinPrompt.error.message);
    expect(sinPrompt.data.result.status).toBe('DEGRADED');
    if (sinPrompt.data.result.status === 'DEGRADED') expect(sinPrompt.data.result.reason).toBe('NO_PUBLISHED_PROMPT');

    // Se administra el prompt (vive en la base, con su versión) y entonces sí ejecuta.
    const versionId = await publicarPrompt('redaccion-comunicacion');
    const otra = await crearSolicitud();
    const conPrompt = await assistOnRequest(actor, { requestId: otra.id, useCase: 'DRAFTING_ASSISTANCE', userText: 'Redáctame una respuesta.' });
    if (!conPrompt.ok) throw new Error(conPrompt.error.message);
    expect(conPrompt.data.result.status).toBe('SUCCEEDED');

    // La versión exacta que gobernó la ejecución está en la base, no en el código.
    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { systemText: true, status: true } });
    expect(version.status).toBe('PUBLISHED');
    expect(version.systemText).toContain('redaccion-comunicacion');
  });
});

describe('Criterio 2 · fuentes y fragmentos respetan los permisos del usuario (F8-QA-002)', () => {
  it('un fragmento restringido no alcanza a quien no puede leer su origen', async () => {
    const gestoraActor = await contextoDe(base.prisma, gestora);

    // Una fuente reservada, indexada y autorizada a una versión de prompt.
    const paginaId = (async () => {
      const actorId = gestora.actorId;
      const page = await base.prisma.contentPage.create({
        data: { slug: unico('fuente'), kind: 'LEGAL', accessLevel: 'PUBLIC', legalEntityId: fuerzaId, status: 'DRAFT', createdByActorId: actorId, updatedByActorId: actorId },
        select: { id: true },
      });
      const version = await base.prisma.contentVersion.create({
        data: { pageId: page.id, version: 1, title: 'Padrón', summary: 'Reservado.', bodyMarkdown: '## Padrón\n\nEl padrón lista a las personas agremiadas.', authorId: gestora.userId },
        select: { id: true },
      });
      await base.prisma.contentPage.update({ where: { id: page.id }, data: { draftVersionId: version.id } });
      return page.id;
    });
    const pid = await paginaId();

    const reg = await registerSource(gestoraActor, { code: unico('src'), name: 'Padrón', sourceKind: 'POLICY', contentPageId: pid, requiredPermissionCode: PERMISO_RESTRINGIDO });
    if (!reg.ok) throw reg.error;
    const idx = await indexSourceNow(gestoraActor, reg.data.sourceId);
    if (!idx.ok) throw idx.error;

    const p = await createPrompt(gestoraActor, {
      code: unico('prompt'),
      purpose: 'Explicar el padrón.',
      module: 'support',
      systemText: 'Explica citando la fuente.',
      model: 'gemini-2.5-flash',
      parameters: {},
      outputSchema: {},
      limits: {},
    });
    if (!p.ok) throw p.error;
    await setVersionSources(gestoraActor, { promptVersionId: p.data.versionId, sourceIds: [reg.data.sourceId] });

    // Quien tiene el permiso recupera el fragmento; quien no, no —ni para que el
    // modelo lo vea y luego se descarte—.
    const conPermiso = await retrieveForVersion(await contextoDe(base.prisma, secretaria), { promptVersionId: p.data.versionId, queryText: 'padrón', limit: 50 });
    if (!conPermiso.ok) throw conPermiso.error;
    expect(conPermiso.data.chunks.length).toBeGreaterThan(0);

    const sinPermiso = await retrieveForVersion(gestoraActor, { promptVersionId: p.data.versionId, queryText: 'padrón', limit: 50 });
    if (!sinPermiso.ok) throw sinPermiso.error;
    expect(sinPermiso.data.chunks.length).toBe(0);
  });
});

describe('Criterio 3 · la salida se marca como IA y se puede corregir', () => {
  it('una salida asistida deja fila y la corrección sustituye su texto', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const solicitud = await crearSolicitud();

    const res = await assistOnRequest(actor, { requestId: solicitud.id, useCase: 'SUMMARY', userText: '' });
    if (!res.ok || res.data.result.status !== 'SUCCEEDED') throw new Error('no tuvo éxito');
    const generationId = res.data.result.generationId;

    // La fila existe y guarda la huella, no el contenido en claro: es lo que la
    // interfaz marca como generado por IA.
    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({ where: { id: generationId }, select: { status: true, inputDigest: true } });
    expect(fila.status).toBe('SUCCEEDED');
    expect(fila.inputDigest.length).toBe(64);

    // Corregir sustituye el texto: es lo que «permite corregirla» significa.
    const corregida = await reviewGeneration(actor, { generationId, decision: 'EDITED', editedOutput: 'Resumen corregido por una persona.' });
    if (!corregida.ok) throw new Error(corregida.error.message);
    const review = await base.prisma.aiReview.findUniqueOrThrow({ where: { generationId }, select: { decision: true, editedOutput: true } });
    expect(review.decision).toBe('EDITED');
    expect(review.editedOutput).toBe('Resumen corregido por una persona.');
  });
});

describe('Criterio 4 · las acciones sensibles requieren confirmación humana', () => {
  it('una canalización sugerida por IA no se confirma sin revisión aceptada', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const solicitud = await crearSolicitud();

    const sugerida = await suggestClassification(actor, { requestId: solicitud.id });
    if (!sugerida.ok || sugerida.data.status !== 'SUGGESTED') throw new Error('no sugirió');

    const sinRevisar = await confirmRouting(actor, {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: null,
      note: 'Confirmo lo que sugirió la IA sin revisarla.',
    });
    expect(sinRevisar.ok).toBe(false);

    const aceptada = await reviewGeneration(actor, { generationId: sugerida.data.generationId, decision: 'ACCEPTED' });
    expect(aceptada.ok).toBe(true);

    const confirmada = await confirmRouting(actor, {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: null,
      note: 'Revisada y aceptada: confirmo la canalización.',
    });
    expect(confirmada.ok, confirmada.ok ? '' : confirmada.error.message).toBe(true);
  });
});

describe('Criterio 5 · la aplicación continúa operando si Gemini está caído', () => {
  it('con el proveedor apagado, el flujo asistido degrada sin lanzar y la salud lo dice', async () => {
    await base.sql.query(`UPDATE "ai_provider_configuration" SET "isEnabled" = false WHERE "provider" = 'GEMINI'`);

    const salud = await aiCapability();
    expect(salud.capability).toBe('DEGRADED');

    const actor = await contextoDe(base.prisma, secretaria);
    const solicitud = await crearSolicitud();
    const antes = await base.prisma.aiGeneration.count();
    const res = await assistOnRequest(actor, { requestId: solicitud.id, useCase: 'SUMMARY', userText: '' });
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.result.status).toBe('DEGRADED');
    // No dejó fila nueva: no hubo ejecución que registrar.
    expect(await base.prisma.aiGeneration.count()).toBe(antes);
  });
});

describe('Criterio 6 · los costos se consultan por módulo sin exponer contenido', () => {
  it('la contraloría ve el consumo, no el contenido, y no configura el proveedor', async () => {
    const secre = await contextoDe(base.prisma, secretaria);
    const solicitud = await crearSolicitud();
    const gen = await assistOnRequest(secre, { requestId: solicitud.id, useCase: 'SUMMARY', userText: '' });
    if (!gen.ok || gen.data.result.status !== 'SUCCEEDED') throw new Error('no generó');

    const contralor = await contextoDe(base.prisma, contraloria);
    const reporte = await usageByModule(contralor, {});
    if (!reporte.ok) throw new Error(reporte.error.message);

    const support = reporte.data.modules.find((m) => m.module === 'support');
    expect(support?.requests ?? 0).toBeGreaterThan(0);
    const serializado = JSON.stringify(reporte.data.modules.map((m) => ({ ...m, costMinor: m.costMinor.toString() })));
    expect(serializado).not.toContain(SECRETO);

    // Ver el gasto no abre la configuración del proveedor.
    const config = await readProviderConfig(contralor);
    expect(config.ok).toBe(false);
  });
});
