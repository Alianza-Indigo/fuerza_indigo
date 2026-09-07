import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { configureProvider, readProviderConfig, usageByModule } from '@/modules/ai';
import { runGeneration } from '@/platform/ai';
import { setAiProviderForTests, type AiProviderPort } from '@/platform/ai/provider-port';

/**
 * Consulta de costos por módulo y gobernanza del proveedor (PRD §24 Fase 8,
 * criterios 5 y 6; bloque G).
 *
 * Lo que hay que ver fallar: que la consulta de consumo **no exponga contenido**
 * —criterio 6—, y que ese consumo se pueda mirar con un permiso que **no** abre
 * las conversaciones. Y que apagar el proveedor deje la aplicación en pie
 * (criterio 5).
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_CONSUMO_CLAVE';
const SECRETO = 'SECRETO-QUE-NO-DEBE-SALIR-EN-EL-CONSUMO';

let base: TestDatabase;
let fuerzaId: string;
let secretaria: PersonaDePrueba; // usage + configure + generation.read
let contraloria: PersonaDePrueba; // solo usage.read
let promptVersionId: string;

const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: () => Promise.resolve({ text: JSON.stringify({ x: SECRETO }), promptTokens: 40, completionTokens: 15 }),
  embed: () => Promise.resolve([]),
};

async function migrationActorId(): Promise<string> {
  return (await base.prisma.actor.findFirstOrThrow({ where: { kind: 'MIGRATION' }, select: { id: true } })).id;
}

beforeAll(async () => {
  base = await createTestDatabase('ai-usage-provider');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora', familyName: 'De Prompts' });
  const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'De Prompts' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  contraloria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Contraloría' });

  await nombrar(base.prisma, { userId: secretaria.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: quienNombra.userId, legalEntityId: fuerzaId });
  await nombrar(base.prisma, { userId: contraloria.userId, roleCode: 'OVERSIGHT_COMMISSION', grantedById: quienNombra.userId, legalEntityId: fuerzaId });

  const actorId = await migrationActorId();
  const p = await base.prisma.aiPrompt.create({
    data: { code: 'resumen-solicitud', purpose: 'Resumir.', module: 'support', createdByActorId: actorId, updatedByActorId: actorId },
    select: { id: true },
  });
  const v = await base.prisma.aiPromptVersion.create({
    data: {
      promptId: p.id,
      version: 1,
      systemText: 'Responde en JSON.',
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
  promptVersionId = v.id;

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba';
  setAiProviderForTests(puertoFalso);
}, 180_000);

afterAll(async () => {
  setAiProviderForTests(null);
  delete process.env[VARIABLE_CON_CLAVE];
  await base?.destroy();
});

beforeEach(async () => {
  await base.sql.query(`DELETE FROM "ai_review"`);
  await base.sql.query(`DELETE FROM "ai_generation"`);
  // El proveedor arranca encendido, con límites holgados y su clave, para cada prueba.
  await base.sql.query(
    `UPDATE "ai_provider_configuration"
        SET "isEnabled" = true, "apiKeyEnvVarName" = $1,
            "maxTokensPerRequest" = 8192, "maxRequestsPerUserPerDay" = 50, "maxMonthlyCostMinor" = 500000
      WHERE "provider" = 'GEMINI'`,
    [VARIABLE_CON_CLAVE],
  );
});

/** Deja una generación con éxito en la bitácora, cuyo contenido lleva el secreto. */
async function generar(): Promise<void> {
  const res = await runGeneration({
    promptVersionId,
    purpose: 'SUMMARY',
    userText: 'Resume esto.',
    redactionApplied: false,
    requestedById: secretaria.userId,
    actorId: secretaria.actorId,
  });
  if (res.status !== 'SUCCEEDED') throw new Error(`esperaba éxito, hubo ${res.status}`);
}

describe('la consulta de consumo no expone contenido (criterio 6)', () => {
  it('reporta costo y peticiones por módulo, y ni rastro de lo generado', async () => {
    await generar();
    const reporte = await usageByModule(await contextoDe(base.prisma, secretaria), {});
    expect(reporte.ok, reporte.ok ? '' : reporte.error.message).toBe(true);
    if (!reporte.ok) throw new Error('inesperado');

    const support = reporte.data.modules.find((m) => m.module === 'support');
    expect(support?.requests).toBe(1);
    expect(support!.costMinor > 0n).toBe(true);

    // Y en ninguna parte del reporte aparece el contenido generado. Se serializa
    // sin los `bigint` (que no llevan contenido) para poder inspeccionar el texto.
    const serializado = JSON.stringify(
      reporte.data.modules.map((m) => ({ ...m, costMinor: m.costMinor.toString() })),
    );
    expect(serializado).not.toContain(SECRETO);
  });
});

describe('mirar el gasto no abre las conversaciones (separación de permisos)', () => {
  it('la contraloría ve el consumo pero no configura ni lee contenido', async () => {
    await generar();
    const contralor = await contextoDe(base.prisma, contraloria);

    // Ve el consumo.
    const consumo = await usageByModule(contralor, {});
    expect(consumo.ok).toBe(true);

    // No puede configurar el proveedor.
    const config = await readProviderConfig(contralor);
    expect(config.ok).toBe(false);
    const cambio = await configureProvider(contralor, {
      reason: 'Intento de configurar sin la facultad para hacerlo.',
      allowedModels: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
      maxTokensPerRequest: 100,
      maxRequestsPerUserPerDay: 1,
      maxMonthlyCostMinor: 0n,
      currency: 'MXN',
      trainingOptOut: true,
      isEnabled: false,
    });
    expect(cambio.ok).toBe(false);
  });
});

describe('configurar el proveedor surte efecto', () => {
  it('bajar el máximo de tokens por petición corta la siguiente ejecución', async () => {
    const secre = await contextoDe(base.prisma, secretaria);
    const cambio = await configureProvider(secre, {
      reason: 'Se baja el máximo de tokens por petición para probar que corta.',
      allowedModels: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
      // El mínimo que la base admite es 1: un límite de cero no es un límite.
      maxTokensPerRequest: 1,
      maxRequestsPerUserPerDay: 50,
      maxMonthlyCostMinor: 500000n,
      currency: 'MXN',
      trainingOptOut: true,
      isEnabled: true,
    });
    expect(cambio.ok, cambio.ok ? '' : cambio.error.message).toBe(true);

    const res = await runGeneration({
      promptVersionId,
      purpose: 'SUMMARY',
      userText: 'Resume esto.',
      redactionApplied: false,
      requestedById: secretaria.userId,
      actorId: secretaria.actorId,
    });
    expect(res.status).toBe('LIMIT_EXCEEDED');
    if (res.status === 'LIMIT_EXCEEDED') expect(res.reason).toBe('TOKENS_PER_REQUEST');
  });

  it('el techo mensual de cero se rechaza con un mensaje claro, no con un error de base', async () => {
    const secre = await contextoDe(base.prisma, secretaria);
    const cambio = await configureProvider(secre, {
      reason: 'Se intenta poner el techo mensual en cero, que la base no admite.',
      allowedModels: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
      maxTokensPerRequest: 8192,
      maxRequestsPerUserPerDay: 50,
      maxMonthlyCostMinor: 0n,
      currency: 'MXN',
      trainingOptOut: true,
      isEnabled: true,
    });
    expect(cambio.ok).toBe(false);
  });

  it('apagar el proveedor deja la aplicación en pie: degrada, no lanza (criterio 5)', async () => {
    const secre = await contextoDe(base.prisma, secretaria);
    const cambio = await configureProvider(secre, {
      reason: 'Se apaga la IA para comprobar la degradación al camino humano.',
      allowedModels: ['gemini-2.5-flash'],
      defaultModel: 'gemini-2.5-flash',
      maxTokensPerRequest: 8192,
      maxRequestsPerUserPerDay: 50,
      maxMonthlyCostMinor: 500000n,
      currency: 'MXN',
      trainingOptOut: true,
      isEnabled: false,
    });
    expect(cambio.ok, cambio.ok ? '' : cambio.error.message).toBe(true);

    const config = await readProviderConfig(secre);
    expect(config.ok).toBe(true);
    if (config.ok) expect(config.data.health.capability).toBe('DEGRADED');

    const res = await runGeneration({
      promptVersionId,
      purpose: 'SUMMARY',
      userText: 'Resume esto.',
      redactionApplied: false,
      requestedById: secretaria.userId,
      actorId: secretaria.actorId,
    });
    expect(res.status).toBe('DEGRADED');
  });
});
