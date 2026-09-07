import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  assistOnRequest,
  confirmRouting,
  PUBLIC_INTAKE_NOTICE_CODE,
  submitRequest,
  suggestClassification,
} from '@/modules/support';
import { reviewGeneration } from '@/modules/ai';
import { setAiProviderForTests, type AiProviderPort } from '@/platform/ai/provider-port';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Casos de uso asistidos y revisión humana (PRD §15.2, §15.4, §24 Fase 8, bloque F).
 *
 * Aquí no se prueba el modelo, que es un adaptador falso, sino que el sistema
 * cumple lo que la fase contrata alrededor de él: que un flujo asistido arma su
 * petición con el prompt vigente, que su salida se marca y **no surte efecto sin
 * revisión aceptada**, y que sin prompt publicado se degrada al camino humano.
 *
 * La garantía del bloque, la que hay que ver fallar: **una canalización sugerida
 * por IA no se confirma sin que una persona la haya aceptado**.
 */

const VARIABLE_CON_CLAVE = 'AI_PRUEBA_ASISTIDO_CLAVE';

let base: TestDatabase;
let fuerzaId: string;
let atiende: PersonaDePrueba;
let autora: PersonaDePrueba;
let revisora: PersonaDePrueba;

// El adaptador falso devuelve lo que cada prueba le ponga. Por omisión, una
// clasificación que `leerPropuesta` sabe leer.
let respuesta = JSON.stringify({
  entidad: 'FUERZA_INDIGO',
  dominio: 'UNION_DEFENSE',
  urgencia: 'PRIORITY',
  motivo: 'Lo que cuenta ocurre en el trabajo: lo lleva el sindicato.',
  alternativa: null,
  requiereProtocoloDeRiesgo: false,
});
let ultimoUserText = '';
const puertoFalso: AiProviderPort = {
  name: 'falso',
  generate: (input) => {
    ultimoUserText = input.userText;
    return Promise.resolve({ text: respuesta, promptTokens: 30, completionTokens: 12 });
  },
  embed: () => Promise.resolve([]),
};

/** Publica un prompt por su código, con autor y revisor distintos. */
async function publicarPrompt(code: string, purpose: string): Promise<void> {
  const actorId = (
    await base.prisma.actor.findFirstOrThrow({ where: { kind: 'MIGRATION' }, select: { id: true } })
  ).id;
  const p = await base.prisma.aiPrompt.create({
    data: { code, purpose, module: 'support', createdByActorId: actorId, updatedByActorId: actorId },
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
      // Esquema permisivo: cualquier objeto encaja. Lo que este módulo exige de
      // una clasificación lo comprueba `leerPropuesta`, no el esquema.
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
    { correlationId: `asistido-${envios}`, ipHash: `huella-asistido-${envios}` },
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const fila = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });
  return fila;
}

beforeAll(async () => {
  base = await createTestDatabase('support-assisted');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora', familyName: 'De Prompts' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'De Prompts' });
  await nombrar(base.prisma, {
    userId: atiende.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });

  await publicarPrompt('clasificacion-solicitud', 'Clasificar una solicitud.');
  await publicarPrompt('resumen-solicitud', 'Resumir una solicitud.');

  process.env[VARIABLE_CON_CLAVE] = 'clave-de-prueba';
  setAiProviderForTests(puertoFalso);
  await base.sql.query(
    `UPDATE "ai_provider_configuration" SET "isEnabled" = true, "apiKeyEnvVarName" = $1 WHERE "provider" = 'GEMINI'`,
    [VARIABLE_CON_CLAVE],
  );
}, 180_000);

afterAll(async () => {
  setAiProviderForTests(null);
  delete process.env[VARIABLE_CON_CLAVE];
  await base?.destroy();
});

beforeEach(async () => {
  // El orden importa: la solicitud apunta a la generación, y la revisión también.
  for (const tabla of ['support_request', 'ai_review', 'ai_generation']) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
  respuesta = JSON.stringify({
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'PRIORITY',
    motivo: 'Lo que cuenta ocurre en el trabajo: lo lleva el sindicato.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  });
  ultimoUserText = '';
  // Por si una prueba la apagó.
  await base.sql.query(`UPDATE "ai_provider_configuration" SET "isEnabled" = true WHERE "provider" = 'GEMINI'`);
});

describe('la clasificación sugerida se guarda como propuesta y no ejecuta nada', () => {
  it('escribe la propuesta y apunta a su generación, sin cambiar el estado', async () => {
    const solicitud = await crearSolicitud();
    const actor = await contextoDe(base.prisma, atiende);

    const res = await suggestClassification(actor, { requestId: solicitud.id });
    expect(res.ok, res.ok ? '' : res.error.message).toBe(true);
    if (!res.ok || res.data.status !== 'SUGGESTED') throw new Error('no sugirió');

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: solicitud.id },
      select: { status: true, suggestedByAiGenerationId: true, confirmedRoutingLegalEntityId: true, suggestedRouting: true },
    });
    // La propuesta quedó, apuntada a su generación, y no ejecutó nada.
    expect(fila.suggestedByAiGenerationId).toBe(res.data.generationId);
    expect(fila.status).toBe('RECEIVED');
    expect(fila.confirmedRoutingLegalEntityId).toBeNull();
    expect((fila.suggestedRouting as { entidad: string }).entidad).toBe('FUERZA_INDIGO');

    // Y quedó asiento de que se clasificó, sin el relato.
    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.AI_CLASSIFICATION_SUGGESTED, objectId: solicitud.id },
      select: { metadata: true },
    });
    expect(JSON.stringify(asiento.metadata)).not.toContain('despidieron');
  });
});

describe('la puerta: una canalización sugerida por IA no se confirma sin revisión aceptada', () => {
  it('confirmar la misma canalización sin revisarla se niega; tras aceptarla, se confirma', async () => {
    const solicitud = await crearSolicitud();
    const actor = await contextoDe(base.prisma, atiende);

    const sugerida = await suggestClassification(actor, { requestId: solicitud.id });
    if (!sugerida.ok || sugerida.data.status !== 'SUGGESTED') throw new Error('no sugirió');

    // Sin revisión, confirmar **esa misma** canalización se niega.
    const sinRevisar = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: null,
      note: 'Confirmo lo que sugirió la IA sin haberla revisado.',
    });
    expect(sinRevisar.ok).toBe(false);

    // Nada se movió: sigue sin confirmar.
    const enMedio = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: solicitud.id },
      select: { status: true, confirmedById: true },
    });
    expect(enMedio.status).toBe('RECEIVED');
    expect(enMedio.confirmedById).toBeNull();

    // Se acepta la salida en la revisión humana.
    const revisada = await reviewGeneration(await contextoDe(base.prisma, atiende), {
      generationId: sugerida.data.generationId,
      decision: 'ACCEPTED',
    });
    expect(revisada.ok, revisada.ok ? '' : revisada.error.message).toBe(true);

    // Ahora sí se confirma.
    const confirmada = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: null,
      note: 'Revisada y aceptada: confirmo la canalización al sindicato.',
    });
    expect(confirmada.ok, confirmada.ok ? '' : confirmada.error.message).toBe(true);

    const despues = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: solicitud.id },
      select: { status: true, confirmedById: true },
    });
    expect(despues.status).toBe('TRIAGE');
    expect(despues.confirmedById).toBe(atiende.userId);
  });

  it('apartarse de la sugerencia no se bloquea: ahí no surte efecto', async () => {
    const solicitud = await crearSolicitud();
    const actor = await contextoDe(base.prisma, atiende);

    const sugerida = await suggestClassification(actor, { requestId: solicitud.id });
    if (!sugerida.ok || sugerida.data.status !== 'SUGGESTED') throw new Error('no sugirió');

    // La IA propuso FUERZA_INDIGO; quien confirma se aparta y canaliza a la otra
    // entidad, sin revisar la sugerencia. No se bloquea: la sugerencia no es lo
    // que surte efecto.
    const confirmada = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'ALIANZA_INDIGO',
      urgency: 'ROUTINE',
      territorialUnitId: null,
      note: 'No coincido con la IA: esto lo acompaña la asociación civil.',
    });
    expect(confirmada.ok, confirmada.ok ? '' : confirmada.error.message).toBe(true);
  });
});

describe('los flujos informativos producen una salida marcada y revisable', () => {
  it('un resumen deja una generación exitosa que se puede corregir', async () => {
    const solicitud = await crearSolicitud();
    respuesta = JSON.stringify({ resumen: 'La persona pide apoyo por un despido tras pedir un ajuste.' });
    const actor = await contextoDe(base.prisma, atiende);

    const res = await assistOnRequest(actor, { requestId: solicitud.id, useCase: 'SUMMARY', userText: '' });
    expect(res.ok, res.ok ? '' : res.error.message).toBe(true);
    if (!res.ok || res.data.result.status !== 'SUCCEEDED') throw new Error('no tuvo éxito');
    const generationId = res.data.result.generationId;

    // Corregir es sustituir el texto: es lo que «permite corregirla» significa.
    const corregida = await reviewGeneration(await contextoDe(base.prisma, atiende), {
      generationId,
      decision: 'EDITED',
      editedOutput: 'Resumen corregido por la persona que revisa.',
    });
    expect(corregida.ok, corregida.ok ? '' : corregida.error.message).toBe(true);

    const fila = await base.prisma.aiReview.findUniqueOrThrow({
      where: { generationId },
      select: { decision: true, editedOutput: true, reviewerId: true },
    });
    expect(fila.decision).toBe('EDITED');
    expect(fila.editedOutput).toBe('Resumen corregido por la persona que revisa.');
    expect(fila.reviewerId).toBe(atiende.userId);
  });
});

describe('la revisión es terminal y solo cae sobre una salida producida', () => {
  it('una generación se revisa una sola vez', async () => {
    const solicitud = await crearSolicitud();
    const actor = await contextoDe(base.prisma, atiende);
    const sugerida = await suggestClassification(actor, { requestId: solicitud.id });
    if (!sugerida.ok || sugerida.data.status !== 'SUGGESTED') throw new Error('no sugirió');

    const primera = await reviewGeneration(await contextoDe(base.prisma, atiende), {
      generationId: sugerida.data.generationId,
      decision: 'ACCEPTED',
    });
    expect(primera.ok).toBe(true);

    const segunda = await reviewGeneration(await contextoDe(base.prisma, atiende), {
      generationId: sugerida.data.generationId,
      decision: 'REJECTED',
      comment: 'Quiero cambiar de opinión después de haberla aceptado.',
    });
    expect(segunda.ok).toBe(false);
  });
});

describe('sin prompt publicado, el flujo asistido degrada al camino humano', () => {
  it('un caso de uso sin prompt publicado no llama y devuelve degradación', async () => {
    const solicitud = await crearSolicitud();
    const actor = await contextoDe(base.prisma, atiende);

    // 'redaccion-comunicacion' no se publicó en esta suite.
    const res = await assistOnRequest(actor, {
      requestId: solicitud.id,
      useCase: 'DRAFTING_ASSISTANCE',
      userText: 'Redáctame una respuesta.',
    });
    expect(res.ok, res.ok ? '' : res.error.message).toBe(true);
    if (!res.ok) throw new Error('inesperado');
    expect(res.data.result.status).toBe('DEGRADED');
    if (res.data.result.status === 'DEGRADED') {
      expect(res.data.result.reason).toBe('NO_PUBLISHED_PROMPT');
    }
    // No dejó fila: no hubo ejecución.
    expect(await base.prisma.aiGeneration.count()).toBe(0);
  });
});

describe('la minimización alcanza a los flujos asistidos', () => {
  it('el proveedor no recibe el correo en claro de una redacción asistida', async () => {
    const solicitud = await crearSolicitud();
    respuesta = JSON.stringify({ resumen: 'ok' });
    const actor = await contextoDe(base.prisma, atiende);

    await assistOnRequest(actor, {
      requestId: solicitud.id,
      useCase: 'SUMMARY',
      userText: 'Escríbele a laura@ejemplo.org',
    });
    // El relato lleva el asunto; da igual: lo que llegó al proveedor no trae el
    // correo en claro, porque el servicio redacta (bloque E) también aquí.
    expect(ultimoUserText).not.toContain('laura@ejemplo.org');
  });
});
