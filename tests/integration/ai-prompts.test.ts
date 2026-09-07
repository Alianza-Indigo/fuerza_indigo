import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrompt,
  labRun,
  listPrompts,
  publishVersion,
  readPrompt,
  retirePrompt,
  revertToVersion,
  saveDraftVersion,
} from '@/modules/ai';
import { setAiProviderForTests, type AiProviderPort } from '@/platform/ai/provider-port';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Administración de prompts (PRD §15.3, criterio 1 de la Fase 8).
 *
 * El criterio dice que ningún prompt crítico vive solamente en código. Lo que
 * estas pruebas comprueban es que las cuatro promesas del §15.3 sean reales y no
 * etiquetas: que corregir una versión cree otra en vez de pisarla, que quien
 * redacta no pueda publicar, que revertir no borre el historial, y que el
 * laboratorio ejecute un borrador con las mismas defensas que la producción.
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_PROMPTS_CLAVE';

let base: TestDatabase;
let redactora: PersonaDePrueba; // COMMUNICATIONS: ai.prompt.edit
let secretaria: PersonaDePrueba; // EXECUTIVE_SECRETARY: ai.prompt.publish
let ambos: PersonaDePrueba; // las dos facultades, para probar la autopublicación
let ajena: PersonaDePrueba; // sin facultades
let entidadId: string;

let llamadas = 0;
let comportamiento: 'ok' | 'error' = 'ok';
const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: () => {
    llamadas += 1;
    if (comportamiento === 'error') throw new Error('el proveedor falló');
    return Promise.resolve({ text: JSON.stringify({ ok: true }), promptTokens: 50, completionTokens: 20 });
  },
};

const CONTENIDO = {
  systemText: 'Explica el trámite en lenguaje claro y sin diagnosticar. Responde en JSON.',
  allowedVariables: ['tramite'],
  model: 'gemini-2.5-flash',
  parameters: { temperature: 0.2 },
  outputSchema: { type: 'object', required: ['ok'] },
  limits: { maxOutputTokens: 256 },
};

beforeAll(async () => {
  base = await createTestDatabase('ai-prompts');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  redactora = await crearPersonaConCuenta(base.prisma, { givenName: 'Redactora', familyName: 'De Prompts' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Ejecutiva' });
  ambos = await crearPersonaConCuenta(base.prisma, { givenName: 'Ambas', familyName: 'Facultades' });
  ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });

  for (const userId of [redactora.userId, ambos.userId]) {
    await nombrar(base.prisma, { userId, roleCode: 'COMMUNICATIONS', grantedById: quienNombra.userId, legalEntityId: entidadId });
  }
  for (const userId of [secretaria.userId, ambos.userId]) {
    await nombrar(base.prisma, { userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: quienNombra.userId, legalEntityId: entidadId });
  }

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba';
  setAiProviderForTests(puertoFalso);
}, 180_000);

afterAll(async () => {
  setAiProviderForTests(null);
  delete process.env[VARIABLE_CON_CLAVE];
  await base.destroy();
});

beforeEach(() => {
  llamadas = 0;
  comportamiento = 'ok';
});

let contador = 0;
function codigo(): string {
  contador += 1;
  return `support.triage.${contador}.${Math.random().toString(36).slice(2, 6)}`;
}

async function proveedorEncendido(enabled: boolean): Promise<void> {
  await base.sql.query(`UPDATE "ai_provider_configuration" SET "isEnabled" = $1, "apiKeyEnvVarName" = $2 WHERE "provider" = 'GEMINI'`, [
    enabled,
    VARIABLE_CON_CLAVE,
  ]);
}

async function nuevoPrompt(actorPersona: PersonaDePrueba = redactora) {
  const actor = await contextoDe(base.prisma, actorPersona);
  const res = await createPrompt(actor, { code: codigo(), purpose: 'Explicar un trámite en lenguaje claro.', module: 'support', ...CONTENIDO });
  if (!res.ok) throw res.error;
  return res.data;
}

describe('crear un prompt', () => {
  it('crea el prompt y su primera versión en borrador', async () => {
    const { promptId, versionId } = await nuevoPrompt();
    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { version: true, status: true } });
    expect(version.version).toBe(1);
    expect(version.status).toBe('DRAFT');
    const prompt = await base.prisma.aiPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { currentVersionId: true } });
    expect(prompt.currentVersionId).toBeNull(); // nada publicado todavía
  });

  it('rechaza un modelo que no está entre los permitidos', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const res = await createPrompt(actor, { code: codigo(), purpose: 'Probar un modelo ajeno.', module: 'support', ...CONTENIDO, model: 'un-modelo-que-nadie-autorizó' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('RULE_VIOLATION');
  });

  it('quien no tiene la facultad de redactar no crea un prompt', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    const res = await createPrompt(actor, { code: codigo(), purpose: 'Intento sin facultad.', module: 'support', ...CONTENIDO });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });
});

describe('corregir una versión crea otra, no la pisa', () => {
  it('guardar un borrador nuevo deja intacta la versión anterior', async () => {
    const { promptId, versionId } = await nuevoPrompt();
    const actor = await contextoDe(base.prisma, redactora);

    const res = await saveDraftVersion(actor, { promptId, ...CONTENIDO, systemText: 'Un texto corregido, distinto del primero.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.version).toBe(2);

    // La versión 1 sigue con su texto original: no se reescribió.
    const v1 = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { systemText: true } });
    expect(v1.systemText).toBe(CONTENIDO.systemText);
    const total = await base.prisma.aiPromptVersion.count({ where: { promptId } });
    expect(total).toBe(2);
  });
});

describe('quien redacta no publica', () => {
  it('la Secretaría publica una versión que redactó otra persona', async () => {
    const { promptId, versionId } = await nuevoPrompt(redactora);
    const secretariaActor = await contextoDe(base.prisma, secretaria);

    const res = await publishVersion(secretariaActor, { versionId, reason: 'Revisado y aprobado para producción.' });
    expect(res.ok).toBe(true);

    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({
      where: { id: versionId },
      select: { status: true, reviewerId: true, publishedAt: true },
    });
    expect(version.status).toBe('PUBLISHED');
    expect(version.reviewerId).toBe(secretaria.userId);
    expect(version.publishedAt).not.toBeNull();

    const prompt = await base.prisma.aiPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { currentVersionId: true } });
    expect(prompt.currentVersionId).toBe(versionId);
  });

  it('quien redactó una versión no la publica, aunque tenga la facultad', async () => {
    // `ambos` tiene las dos facultades: sin la regla, se firmaría a sí misma.
    const { versionId } = await nuevoPrompt(ambos);
    const actor = await contextoDe(base.prisma, ambos);
    const res = await publishVersion(actor, { versionId, reason: 'Intento de autopublicación.' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('RULE_VIOLATION');
  });

  it('quien solo redacta no puede publicar', async () => {
    const { versionId } = await nuevoPrompt(redactora);
    const actor = await contextoDe(base.prisma, redactora);
    const res = await publishVersion(actor, { versionId, reason: 'Intento sin facultad de publicar.' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });

  it('publicar una segunda versión retira la primera', async () => {
    const { promptId, versionId: v1 } = await nuevoPrompt(redactora);
    const secretariaActor = await contextoDe(base.prisma, secretaria);
    await publishVersion(secretariaActor, { versionId: v1, reason: 'Primera publicación.' });

    const redactoraActor = await contextoDe(base.prisma, redactora);
    const segunda = await saveDraftVersion(redactoraActor, { promptId, ...CONTENIDO, systemText: 'Segunda versión mejorada.' });
    if (!segunda.ok) throw segunda.error;
    await publishVersion(secretariaActor, { versionId: segunda.data.versionId, reason: 'Segunda publicación.' });

    const primera = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: v1 }, select: { status: true, retiredAt: true } });
    expect(primera.status).toBe('RETIRED');
    expect(primera.retiredAt).not.toBeNull();
    const prompt = await base.prisma.aiPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { currentVersionId: true } });
    expect(prompt.currentVersionId).toBe(segunda.data.versionId);
  });
});

describe('retirar un prompt lo deja sin versión vigente', () => {
  it('retirar deja el prompt sin nada que ejecutar', async () => {
    const { promptId, versionId } = await nuevoPrompt(redactora);
    const secretariaActor = await contextoDe(base.prisma, secretaria);
    await publishVersion(secretariaActor, { versionId, reason: 'Publicación para luego retirar.' });

    const res = await retirePrompt(secretariaActor, { promptId, reason: 'Se deja de usar este prompt.' });
    expect(res.ok).toBe(true);

    const prompt = await base.prisma.aiPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { currentVersionId: true } });
    expect(prompt.currentVersionId).toBeNull();
    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
    expect(version.status).toBe('RETIRED');
  });

  it('quien solo redacta no puede retirar', async () => {
    const { promptId, versionId } = await nuevoPrompt(redactora);
    const secretariaActor = await contextoDe(base.prisma, secretaria);
    await publishVersion(secretariaActor, { versionId, reason: 'Publicación.' });

    const redactoraActor = await contextoDe(base.prisma, redactora);
    const res = await retirePrompt(redactoraActor, { promptId, reason: 'Intento sin facultad.' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });
});

describe('revertir no borra el historial', () => {
  it('revertir crea una versión nueva con el contenido antiguo, y la original sigue', async () => {
    const { promptId, versionId: v1 } = await nuevoPrompt(redactora);
    const redactoraActor = await contextoDe(base.prisma, redactora);
    await saveDraftVersion(redactoraActor, { promptId, ...CONTENIDO, systemText: 'Una versión 2 que no gustó.' });

    const res = await revertToVersion(redactoraActor, { promptId, versionId: v1, reason: 'La versión 1 funcionaba mejor.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.version).toBe(3);

    const creada = await base.prisma.aiPromptVersion.findUniqueOrThrow({
      where: { id: res.data.versionId },
      select: { systemText: true, status: true, revertedFromVersionId: true },
    });
    expect(creada.systemText).toBe(CONTENIDO.systemText); // el contenido de la v1
    expect(creada.status).toBe('DRAFT'); // no se publica sola
    expect(creada.revertedFromVersionId).toBe(v1);

    // La versión 1 sigue existiendo, sin tocar.
    const v1sigue = await base.prisma.aiPromptVersion.findUnique({ where: { id: v1 }, select: { id: true } });
    expect(v1sigue).not.toBeNull();
  });
});

describe('el laboratorio prueba un borrador con las defensas de producción', () => {
  it('ejecuta un borrador y lo deja en prueba', async () => {
    await proveedorEncendido(true);
    const { versionId } = await nuevoPrompt(redactora);
    const actor = await contextoDe(base.prisma, redactora);

    const res = await labRun(actor, { promptVersionId: versionId, purpose: 'PROCEDURE_EXPLANATION', userText: '¿Cómo tramito una constancia?' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.result.status).toBe('SUCCEEDED');
    expect(llamadas).toBe(1);

    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
    expect(version.status).toBe('TESTING'); // pasó a prueba

    // Y dejó su fila en la bitácora, como cualquier ejecución.
    if (res.data.result.status === 'SUCCEEDED') {
      const fila = await base.prisma.aiGeneration.findUnique({ where: { id: res.data.result.generationId }, select: { promptVersionId: true } });
      expect(fila?.promptVersionId).toBe(versionId);
    }
  });

  it('con la IA apagada, el laboratorio degrada y no mueve la versión', async () => {
    await proveedorEncendido(false);
    const { versionId } = await nuevoPrompt(redactora);
    const actor = await contextoDe(base.prisma, redactora);

    const res = await labRun(actor, { promptVersionId: versionId, purpose: 'PROCEDURE_EXPLANATION', userText: 'Probar con la IA apagada.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.result.status).toBe('DEGRADED');
    expect(llamadas).toBe(0);

    const version = await base.prisma.aiPromptVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
    expect(version.status).toBe('DRAFT'); // no se probó nada: sigue en borrador
    await proveedorEncendido(true);
  });

  it('quien no redacta no usa el laboratorio', async () => {
    await proveedorEncendido(true);
    const { versionId } = await nuevoPrompt(redactora);
    const actor = await contextoDe(base.prisma, ajena);
    const res = await labRun(actor, { promptVersionId: versionId, purpose: 'PROCEDURE_EXPLANATION', userText: 'Intento sin facultad.' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
    expect(llamadas).toBe(0);
  });
});

describe('consultar los prompts es su propia facultad', () => {
  it('lista y lee con ai.prompt.read', async () => {
    const { promptId } = await nuevoPrompt(redactora);
    const actor = await contextoDe(base.prisma, redactora);

    const lista = await listPrompts(actor);
    expect(lista.ok).toBe(true);
    if (lista.ok) expect(lista.data.some((p) => p.id === promptId)).toBe(true);

    const detalle = await readPrompt(actor, promptId);
    expect(detalle.ok).toBe(true);
    if (detalle.ok) expect(detalle.data.versions.length).toBeGreaterThan(0);
  });

  it('quien no tiene lectura no ve la lista', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    const lista = await listPrompts(actor);
    expect(lista.ok).toBe(false);
    if (!lista.ok) expect(lista.error.code).toBe('FORBIDDEN');
  });
});
