import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPrompt,
  disableSource,
  indexSourceNow,
  listSources,
  registerSource,
  retrieveForVersion,
  setVersionSources,
} from '@/modules/ai';
import { markStaleIfChanged } from '@/platform/ai';
import { setAiProviderForTests, EMBEDDING_DIM, type AiProviderPort } from '@/platform/ai/provider-port';
import { transaction } from '@/platform/db/unit-of-work';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Base documental con permisos (PRD §15.2, criterio 2 de la Fase 8).
 *
 * El criterio dice que las fuentes y los fragmentos respetan los permisos de
 * quien pregunta. Lo que estas pruebas comprueban es que un fragmento **no
 * alcance a quien no puede leer su origen**: se restringe una fuente a un
 * permiso, y quien no lo tiene no recupera sus fragmentos —ni siquiera para que
 * el modelo los vea y luego se descarten—.
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_KNOWLEDGE_CLAVE';
const PERMISO_RESTRINGIDO = 'membership.roster.read';

let base: TestDatabase;
let gestora: PersonaDePrueba; // COMMUNICATIONS: ai.knowledge.manage, ai.prompt.edit; SIN membership.roster.read
let secretaria: PersonaDePrueba; // EXECUTIVE_SECRETARY: CON membership.roster.read
let sinRoles: PersonaDePrueba;
let entidadId: string;

/** Vector determinista de la dimensión correcta, para que las pruebas sean estables. */
function vectorDePrueba(text: string): number[] {
  const h = createHash('sha256').update(text).digest();
  const v: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i += 1) v.push((h[i % h.length]! / 255) - 0.5);
  return v;
}

const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: () => Promise.resolve({ text: '{}', promptTokens: 1, completionTokens: 1 }),
  embed: (input) => Promise.resolve(input.texts.map((t) => vectorDePrueba(t))),
};

beforeAll(async () => {
  base = await createTestDatabase('ai-knowledge');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  gestora = await crearPersonaConCuenta(base.prisma, { givenName: 'Gestora', familyName: 'Documental' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Ejecutiva' });
  sinRoles = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Roles' });

  await nombrar(base.prisma, { userId: gestora.userId, roleCode: 'COMMUNICATIONS', grantedById: quienNombra.userId, legalEntityId: entidadId });
  await nombrar(base.prisma, { userId: secretaria.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: quienNombra.userId, legalEntityId: entidadId });

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba';
  setAiProviderForTests(puertoFalso);
  await base.sql.query(`UPDATE "ai_provider_configuration" SET "isEnabled" = true, "apiKeyEnvVarName" = $1 WHERE "provider" = 'GEMINI'`, [VARIABLE_CON_CLAVE]);
}, 180_000);

afterAll(async () => {
  setAiProviderForTests(null);
  delete process.env[VARIABLE_CON_CLAVE];
  await base.destroy();
});

let contador = 0;
function unico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Crea una página del gestor con contenido y la deja como borrador vivo. */
async function paginaConTexto(cuerpo: string): Promise<string> {
  const actorId = gestora.actorId;
  const page = await base.prisma.contentPage.create({
    data: {
      slug: unico('fuente'),
      kind: 'LEGAL',
      accessLevel: 'PUBLIC',
      legalEntityId: entidadId,
      status: 'DRAFT',
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
    select: { id: true },
  });
  const version = await base.prisma.contentVersion.create({
    data: { pageId: page.id, version: 1, title: 'Estatutos', summary: 'Resumen de estatutos.', bodyMarkdown: cuerpo, authorId: gestora.userId },
    select: { id: true },
  });
  await base.prisma.contentPage.update({ where: { id: page.id }, data: { draftVersionId: version.id } });
  return page.id;
}

const CUERPO_PUBLICO = '## Asamblea\n\nLa asamblea es soberana.\n\n## Cuotas\n\nLas cuotas se fijan cada año.';
const CUERPO_RESERVADO = '## Padrón\n\nEl padrón lista a las personas agremiadas.\n\n## Bajas\n\nUna baja se registra con su motivo.';

async function fuenteIndexada(cuerpo: string, permiso: string | undefined): Promise<string> {
  const actor = await contextoDe(base.prisma, gestora);
  const paginaId = await paginaConTexto(cuerpo);
  const reg = await registerSource(actor, {
    code: unico('src'),
    name: 'Estatutos',
    sourceKind: 'STATUTE',
    contentPageId: paginaId,
    ...(permiso === undefined ? {} : { requiredPermissionCode: permiso }),
  });
  if (!reg.ok) throw reg.error;
  const idx = await indexSourceNow(actor, reg.data.sourceId);
  if (!idx.ok) throw idx.error;
  if (idx.data.status !== 'INDEXED') throw new Error(`no se indexó: ${idx.data.status}`);
  return reg.data.sourceId;
}

async function versionDePrompt(fuentes: string[]): Promise<string> {
  const actor = await contextoDe(base.prisma, gestora);
  const p = await createPrompt(actor, {
    code: unico('prompt'),
    purpose: 'Explicar los estatutos.',
    module: 'support',
    systemText: 'Explica con lenguaje claro citando los estatutos.',
    model: 'gemini-2.5-flash',
    parameters: {},
    outputSchema: {},
    limits: {},
  });
  if (!p.ok) throw p.error;
  const set = await setVersionSources(actor, { promptVersionId: p.data.versionId, sourceIds: fuentes });
  if (!set.ok) throw set.error;
  return p.data.versionId;
}

describe('registrar e indexar una fuente', () => {
  it('indexa el contenido en fragmentos y copia el permiso a cada uno', async () => {
    const sourceId = await fuenteIndexada(CUERPO_RESERVADO, PERMISO_RESTRINGIDO);
    const fuente = await base.prisma.knowledgeSource.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true, chunkCount: true, indexedAt: true } });
    expect(fuente.status).toBe('INDEXED');
    expect(fuente.chunkCount).toBeGreaterThan(0);
    expect(fuente.indexedAt).not.toBeNull();

    const fragmentos = await base.prisma.knowledgeChunk.findMany({ where: { knowledgeSourceId: sourceId }, select: { requiredPermissionCode: true } });
    expect(fragmentos.length).toBeGreaterThan(0);
    for (const f of fragmentos) expect(f.requiredPermissionCode).toBe(PERMISO_RESTRINGIDO);
  });

  it('quien no administra la base documental no registra una fuente', async () => {
    const actor = await contextoDe(base.prisma, sinRoles);
    const paginaId = await paginaConTexto(CUERPO_PUBLICO);
    const res = await registerSource(actor, { code: unico('src'), name: 'Estatutos', sourceKind: 'STATUTE', contentPageId: paginaId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });
});

describe('la recuperación respeta los permisos', () => {
  it('un fragmento restringido no alcanza a quien no tiene el permiso, y sí a quien lo tiene', async () => {
    const publica = await fuenteIndexada(CUERPO_PUBLICO, undefined);
    const reservada = await fuenteIndexada(CUERPO_RESERVADO, PERMISO_RESTRINGIDO);
    const versionId = await versionDePrompt([publica, reservada]);

    // La gestora (COMMUNICATIONS) NO tiene membership.roster.read.
    const gestoraActor = await contextoDe(base.prisma, gestora);
    const rGestora = await retrieveForVersion(gestoraActor, { promptVersionId: versionId, queryText: 'padrón y bajas', limit: 50 });
    expect(rGestora.ok).toBe(true);
    if (!rGestora.ok) return;
    const fuentesGestora = new Set(rGestora.data.chunks.map((c) => c.knowledgeSourceId));
    expect(fuentesGestora.has(publica)).toBe(true);
    expect(fuentesGestora.has(reservada)).toBe(false); // el fragmento restringido NO llega

    // La secretaria (EXECUTIVE_SECRETARY) SÍ lo tiene.
    const secretariaActor = await contextoDe(base.prisma, secretaria);
    const rSecretaria = await retrieveForVersion(secretariaActor, { promptVersionId: versionId, queryText: 'padrón y bajas', limit: 50 });
    expect(rSecretaria.ok).toBe(true);
    if (!rSecretaria.ok) return;
    const fuentesSecretaria = new Set(rSecretaria.data.chunks.map((c) => c.knowledgeSourceId));
    expect(fuentesSecretaria.has(publica)).toBe(true);
    expect(fuentesSecretaria.has(reservada)).toBe(true); // a quien puede leerlo, sí
  });

  it('una versión solo recupera de las fuentes que tiene autorizadas', async () => {
    const publica = await fuenteIndexada(CUERPO_PUBLICO, undefined);
    const otra = await fuenteIndexada(CUERPO_RESERVADO, undefined); // pública también
    const versionId = await versionDePrompt([publica]); // solo autoriza la primera

    const actor = await contextoDe(base.prisma, secretaria);
    const r = await retrieveForVersion(actor, { promptVersionId: versionId, queryText: 'asamblea', limit: 50 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fuentes = new Set(r.data.chunks.map((c) => c.knowledgeSourceId));
    expect(fuentes.has(publica)).toBe(true);
    expect(fuentes.has(otra)).toBe(false); // no autorizada: no se consulta
  });

  it('una versión sin fuentes autorizadas no recupera nada, sin llamar', async () => {
    const versionId = await versionDePrompt([]);
    const actor = await contextoDe(base.prisma, secretaria);
    const r = await retrieveForVersion(actor, { promptVersionId: versionId, queryText: 'lo que sea', limit: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.chunks.length).toBe(0);
  });
});

describe('una fuente desfasada y una deshabilitada', () => {
  it('marca STALE cuando el contenido cambió desde que se indexó', async () => {
    const sourceId = await fuenteIndexada(CUERPO_PUBLICO, undefined);
    const cambiada = await transaction((tx) => markStaleIfChanged(tx, sourceId, `${CUERPO_PUBLICO}\n\n## Nuevo\n\nUn párrafo nuevo.`, gestora.actorId));
    expect(cambiada).toBe(true);
    const fuente = await base.prisma.knowledgeSource.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } });
    expect(fuente.status).toBe('STALE');
  });

  it('deshabilitar una fuente borra sus fragmentos y deja de recuperarse', async () => {
    const sourceId = await fuenteIndexada(CUERPO_PUBLICO, undefined);
    const versionId = await versionDePrompt([sourceId]);
    const actor = await contextoDe(base.prisma, gestora);

    const res = await disableSource(actor, sourceId);
    expect(res.ok).toBe(true);
    const fragmentos = await base.prisma.knowledgeChunk.count({ where: { knowledgeSourceId: sourceId } });
    expect(fragmentos).toBe(0);

    const r = await retrieveForVersion(actor, { promptVersionId: versionId, queryText: 'asamblea', limit: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.chunks.length).toBe(0);
  });
});

describe('el listado de fuentes', () => {
  it('lo ve quien administra la base documental, y no quien no', async () => {
    await fuenteIndexada(CUERPO_PUBLICO, undefined);
    const gestoraActor = await contextoDe(base.prisma, gestora);
    const lista = await listSources(gestoraActor);
    expect(lista.ok).toBe(true);
    if (lista.ok) expect(lista.data.length).toBeGreaterThan(0);

    const sinActor = await contextoDe(base.prisma, sinRoles);
    const negada = await listSources(sinActor);
    expect(negada.ok).toBe(false);
    if (!negada.ok) expect(negada.error.code).toBe('FORBIDDEN');
  });
});
