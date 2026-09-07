import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, crearPersonaConCuenta } from './helpers/fixtures';
import { runGeneration } from '@/platform/ai';
import { setAiProviderForTests, AiProviderTimeoutError, type AiProviderPort } from '@/platform/ai/provider-port';

/**
 * El servicio central de la IA: límites, degradación y bitácora (PRD §15, §24
 * Fase 8; ADR-0137, ADR-0139).
 *
 * Ninguna de estas garantías se prueba simulando una caída del proveedor —eso
 * mide el entorno, no la regla (ADR-0130)—. Se prueban **contando llamadas** a un
 * puerto falso: con la IA apagada, sin clave o por encima de un límite, el
 * proveedor no se llama ni una vez, y el flujo cae al camino humano. Lo que sí se
 * llama deja una fila inmutable con la huella de lo enviado y nunca su texto.
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_CLAVE';
const VARIABLE_SIN_CLAVE = 'AI_PRUEBA_SIN_CLAVE';

const SYSTEM_TEXT = 'Responde en JSON claro y sin diagnosticar.';

let base: TestDatabase;
let actorId: string;
let usuarioId: string;
let autoraId: string;
let revisoraId: string;

let llamadas = 0;
type Comportamiento = 'ok' | 'error' | 'timeout' | 'json-malformado' | 'forma-invalida';
let comportamiento: Comportamiento = 'ok';

const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: () => {
    llamadas += 1;
    if (comportamiento === 'error') throw new Error('el proveedor falló');
    if (comportamiento === 'timeout') throw new AiProviderTimeoutError(20_000);
    if (comportamiento === 'json-malformado') {
      return Promise.resolve({ text: 'esto no es json', promptTokens: 10, completionTokens: 5 });
    }
    if (comportamiento === 'forma-invalida') {
      return Promise.resolve({ text: JSON.stringify({ falta: 'la clave ok' }), promptTokens: 10, completionTokens: 5 });
    }
    return Promise.resolve({ text: JSON.stringify({ ok: true, respuesta: 'hola' }), promptTokens: 120, completionTokens: 80 });
  },
  embed: () => Promise.resolve([]),
};

beforeAll(async () => {
  base = await createTestDatabase('ai-provider');
  await base.seed();
  actorId = await actorDeMigracion(base.prisma);
  const usuario = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona' });
  const autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora' });
  const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora' });
  usuarioId = usuario.userId;
  autoraId = autora.userId;
  revisoraId = revisora.userId;

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba-que-no-sirve-para-nada';
  delete process.env[VARIABLE_SIN_CLAVE];
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

/** Deja la fila del proveedor en un estado concreto, con la conexión de propietaria. */
async function configurar(opts: {
  enabled: boolean;
  keyVar: string;
  maxTokens?: number;
  maxPerDay?: number;
  maxCost?: bigint;
}): Promise<void> {
  await base.sql.query(
    `UPDATE "ai_provider_configuration"
        SET "isEnabled" = $1, "apiKeyEnvVarName" = $2, "maxTokensPerRequest" = $3,
            "maxRequestsPerUserPerDay" = $4, "maxMonthlyCostMinor" = $5
      WHERE "provider" = 'GEMINI'`,
    [opts.enabled, opts.keyVar, opts.maxTokens ?? 8192, opts.maxPerDay ?? 1000, (opts.maxCost ?? 10_000_000_000n).toString()],
  );
}

function codigo(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Una versión de prompt **publicada**, que es lo único que se puede ejecutar. */
async function versionPublicada(): Promise<{ id: string; model: string }> {
  const p = await base.prisma.aiPrompt.create({
    data: {
      code: codigo('prompt'),
      purpose: 'Explicar un trámite en JSON.',
      module: 'support',
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
    select: { id: true },
  });
  const v = await base.prisma.aiPromptVersion.create({
    data: {
      promptId: p.id,
      version: 1,
      systemText: SYSTEM_TEXT,
      allowedVariables: [],
      model: 'gemini-2.5-flash',
      parameters: { temperature: 0.2 },
      outputSchema: { type: 'object', required: ['ok'] },
      limits: { maxOutputTokens: 256 },
      status: 'PUBLISHED',
      publishedAt: new Date(),
      reviewerId: revisoraId,
      reviewedAt: new Date(),
      authorId: autoraId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
    select: { id: true, model: true },
  });
  return v;
}

async function generacionSuelta(overrides: Record<string, unknown>): Promise<void> {
  const v = await versionPublicada();
  await base.prisma.aiGeneration.create({
    data: {
      promptVersionId: v.id,
      model: 'gemini-2.5-flash',
      purpose: 'PROCEDURE_EXPLANATION',
      inputDigest: 'a'.repeat(64),
      redactionApplied: true,
      outputSummary: 'x',
      outputSchemaValid: true,
      promptTokens: 1,
      completionTokens: 1,
      costMinor: 1n,
      currency: 'MXN',
      latencyMs: 1,
      status: 'SUCCEEDED',
      createdByActorId: actorId,
      ...overrides,
    },
  });
}

async function cuentaDeFilas(): Promise<number> {
  return base.prisma.aiGeneration.count();
}

const entrada = (promptVersionId: string) =>
  ({
    promptVersionId,
    purpose: 'PROCEDURE_EXPLANATION' as const,
    userText: 'Me dijeron que puedo pedir una constancia; ¿cómo la tramito?',
    redactionApplied: true,
    requestedById: usuarioId,
    actorId,
  });

describe('degradación: la aplicación sigue operando sin la IA', () => {
  it('con la IA apagada, no llama al proveedor y cae al camino humano', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: false, keyVar: VARIABLE_CON_CLAVE });
    const antes = await cuentaDeFilas();

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('DEGRADED');
    expect(res).toMatchObject({ reason: 'PROVIDER_DISABLED' });
    expect(llamadas).toBe(0);
    expect(await cuentaDeFilas()).toBe(antes); // ninguna fila: no hubo ejecución
  });

  it('encendida pero sin clave, tampoco llama y cae al camino humano', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_SIN_CLAVE });
    const antes = await cuentaDeFilas();

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('DEGRADED');
    expect(res).toMatchObject({ reason: 'NO_API_KEY' });
    expect(llamadas).toBe(0);
    expect(await cuentaDeFilas()).toBe(antes);
  });
});

describe('los tres límites niegan de verdad, antes de llamar', () => {
  it('tokens por petición: una petición que no cabe se rechaza sin llamar', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE, maxTokens: 1 });
    const antes = await cuentaDeFilas();

    const res = await runGeneration(entrada(v.id));

    expect(res).toMatchObject({ status: 'LIMIT_EXCEEDED', reason: 'TOKENS_PER_REQUEST' });
    expect(llamadas).toBe(0);
    expect(await cuentaDeFilas()).toBe(antes);
  });

  it('peticiones por persona y día: alcanzado el tope, no llama', async () => {
    const nuevo = await crearPersonaConCuenta(base.prisma, { givenName: 'Contada' });
    // Tres ejecuciones previas de esta persona, hoy.
    for (let i = 0; i < 3; i += 1) await generacionSuelta({ requestedById: nuevo.userId });
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE, maxPerDay: 3 });
    const v = await versionPublicada();
    const antes = await cuentaDeFilas();

    const res = await runGeneration({ ...entrada(v.id), requestedById: nuevo.userId });

    expect(res).toMatchObject({ status: 'LIMIT_EXCEEDED', reason: 'REQUESTS_PER_DAY' });
    expect(llamadas).toBe(0);
    expect(await cuentaDeFilas()).toBe(antes);
  });

  it('costo mensual máximo: alcanzado el techo, no llama', async () => {
    await generacionSuelta({ costMinor: 10_000_000n });
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE, maxCost: 10_000_000n });
    const v = await versionPublicada();
    const antes = await cuentaDeFilas();

    const res = await runGeneration(entrada(v.id));

    expect(res).toMatchObject({ status: 'LIMIT_EXCEEDED', reason: 'MONTHLY_COST' });
    expect(llamadas).toBe(0);
    expect(await cuentaDeFilas()).toBe(antes);
  });
});

describe('la ejecución con éxito deja huella y no texto', () => {
  it('llama una vez y guarda una fila con la huella de lo enviado', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });
    const datos = entrada(v.id);

    const res = await runGeneration(datos);

    expect(res.status).toBe('SUCCEEDED');
    expect(llamadas).toBe(1);
    if (res.status !== 'SUCCEEDED') return;

    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({
      where: { id: res.generationId },
      select: {
        inputDigest: true,
        outputSummary: true,
        outputSchemaValid: true,
        status: true,
        promptTokens: true,
        completionTokens: true,
        costMinor: true,
        latencyMs: true,
        currency: true,
        model: true,
      },
    });

    const esperada = createHash('sha256')
      .update(`${v.model}\n\n${SYSTEM_TEXT}\n\n${datos.userText}`)
      .digest('hex');
    expect(fila.inputDigest).toBe(esperada);
    // La huella no es el texto: es su resumen irreversible.
    expect(fila.inputDigest).not.toContain('constancia');
    expect(fila.status).toBe('SUCCEEDED');
    expect(fila.outputSchemaValid).toBe(true);
    expect(fila.promptTokens).toBe(120);
    expect(fila.completionTokens).toBe(80);
    expect(fila.costMinor).toBeGreaterThan(0n);
    expect(fila.currency).toBe('MXN');
    expect(fila.outputSummary).toContain('respuesta');
  });
});

describe('cuando el proveedor no completa, hay fila y camino humano', () => {
  it('un error del proveedor deja fila PROVIDER_ERROR, sin costo ni texto', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });
    comportamiento = 'error';

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('PROVIDER_ERROR');
    expect(llamadas).toBe(1);
    if (res.status !== 'PROVIDER_ERROR') return;
    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({
      where: { id: res.generationId },
      select: { status: true, costMinor: true, outputSummary: true, outputSchemaValid: true },
    });
    expect(fila.status).toBe('PROVIDER_ERROR');
    expect(fila.costMinor).toBe(0n);
    expect(fila.outputSummary).toBe('');
    expect(fila.outputSchemaValid).toBe(false);
  });

  it('un tiempo de espera agotado deja fila TIMEOUT', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });
    comportamiento = 'timeout';

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('TIMEOUT');
    if (res.status !== 'TIMEOUT') return;
    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({
      where: { id: res.generationId },
      select: { status: true },
    });
    expect(fila.status).toBe('TIMEOUT');
  });
});

describe('una salida que no encaja se rechaza en vez de enseñarse', () => {
  it('forma inválida: fila SCHEMA_REJECTED y nada que enseñar', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });
    comportamiento = 'forma-invalida';

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('SCHEMA_REJECTED');
    expect(llamadas).toBe(1);
    if (res.status !== 'SCHEMA_REJECTED') return;
    const fila = await base.prisma.aiGeneration.findUniqueOrThrow({
      where: { id: res.generationId },
      select: { status: true, outputSchemaValid: true, outputSummary: true },
    });
    expect(fila.status).toBe('SCHEMA_REJECTED');
    expect(fila.outputSchemaValid).toBe(false);
    expect(fila.outputSummary).toBe('');
  });

  it('json malformado también se rechaza', async () => {
    const v = await versionPublicada();
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });
    comportamiento = 'json-malformado';

    const res = await runGeneration(entrada(v.id));

    expect(res.status).toBe('SCHEMA_REJECTED');
  });
});

describe('una versión sin publicar no se ejecuta', () => {
  it('detiene en voz alta: es un defecto de quien llama, no una circunstancia', async () => {
    const p = await base.prisma.aiPrompt.create({
      data: { code: codigo('prompt'), purpose: 'x', module: 'support', createdByActorId: actorId, updatedByActorId: actorId },
      select: { id: true },
    });
    const borrador = await base.prisma.aiPromptVersion.create({
      data: {
        promptId: p.id,
        version: 1,
        systemText: SYSTEM_TEXT,
        allowedVariables: [],
        model: 'gemini-2.5-flash',
        parameters: {},
        outputSchema: { type: 'object' },
        limits: {},
        status: 'DRAFT',
        authorId: autoraId,
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });
    await configurar({ enabled: true, keyVar: VARIABLE_CON_CLAVE });

    await expect(runGeneration(entrada(borrador.id))).rejects.toThrow(/no está publicada/);
    expect(llamadas).toBe(0);
  });
});
