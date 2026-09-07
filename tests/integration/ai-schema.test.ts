import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Lo que el motor garantiza sobre la IA gobernada (PRD §15, Fase 8).
 *
 * Ningún caso de uso se prueba aquí. Se prueba que las promesas de esta fase
 * **no dependan de que el código las respete**: que la clave del proveedor no
 * quepa en la base, que quien revisa un prompt no sea quien lo escribió, que una
 * ejecución del modelo no se pueda editar después, y que una conversación no
 * cambie de persona ni de consentimiento.
 *
 * Importa más que en otras fases porque lo que aquí se guarda es la respuesta a
 * «¿por qué el sistema dijo eso sobre mí?». Si esa fila se puede reescribir, la
 * pregunta no tiene respuesta.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;
let autoraId: string;
let revisoraId: string;
let personaId: string;
let paginaId: string;

beforeAll(async () => {
  base = await createTestDatabase('ia');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);

  const autora = await crearPersonaConCuenta(base.prisma, { givenName: 'Autora' });
  const revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora' });
  autoraId = autora.userId;
  revisoraId = revisora.userId;
  personaId = autora.personId;

  // La base documental necesita algo real que indexar. Se crea una página del
  // gestor de contenidos y no un archivo porque una página es lo que el módulo
  // indexa primero: los estatutos y las guías de trámite viven ahí.
  const pagina = await base.prisma.contentPage.create({
    data: {
      slug: `estatutos-de-prueba-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'LEGAL',
      accessLevel: 'PUBLIC',
      legalEntityId: entidadId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    },
    select: { id: true },
  });
  paginaId = pagina.id;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const HUELLA = 'a'.repeat(64);

function codigo(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`;
}

async function prompt(overrides: Record<string, unknown> = {}) {
  return base.prisma.aiPrompt.create({
    data: {
      code: codigo('prompt'),
      purpose: 'Explicar un trámite en lenguaje claro.',
      module: 'support',
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, code: true, criticality: true, isActive: true },
  });
}

async function version(promptId: string, overrides: Record<string, unknown> = {}) {
  return base.prisma.aiPromptVersion.create({
    data: {
      promptId,
      version: Math.floor(Math.random() * 1_000_000),
      systemText: 'Responde con lenguaje claro y sin diagnosticar.',
      allowedVariables: ['tramite'],
      model: 'gemini-2.5-flash',
      parameters: { temperature: 0.2 },
      outputSchema: { type: 'object' },
      limits: { maxOutputTokens: 512 },
      authorId: autoraId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, status: true, publishedAt: true, reviewerId: true },
  });
}

async function generacion(promptVersionId: string, overrides: Record<string, unknown> = {}) {
  return base.prisma.aiGeneration.create({
    data: {
      promptVersionId,
      model: 'gemini-2.5-flash',
      purpose: 'PROCEDURE_EXPLANATION',
      inputDigest: HUELLA,
      redactionApplied: true,
      outputSummary: 'Explicación breve del trámite.',
      outputSchemaValid: true,
      promptTokens: 120,
      completionTokens: 80,
      costMinor: 3n,
      currency: 'MXN',
      latencyMs: 900,
      status: 'SUCCEEDED',
      createdByActorId: actorId,
      ...overrides,
    },
    select: { id: true, inputDigest: true, status: true },
  });
}

describe('la configuración del proveedor', () => {
  it('guarda el nombre de la variable de entorno y no la clave', async () => {
    const fila = await base.prisma.aiProviderConfiguration.findUniqueOrThrow({
      where: { provider: 'GEMINI' },
      select: { apiKeyEnvVarName: true, isEnabled: true, trainingOptOut: true, defaultModel: true },
    });
    expect(fila.apiKeyEnvVarName).toBe('GEMINI_API_KEY');
    expect(fila.trainingOptOut).toBe(true);
    // Nace apagada: una instalación nueva opera por el camino humano hasta que
    // alguien la enciende a sabiendas (PRD §24 Fase 8).
    expect(fila.isEnabled).toBe(false);
    expect(fila.defaultModel.length).toBeGreaterThan(0);
  });

  it('no deja cambiar desde la aplicación a qué variable apunta', async () => {
    await expect(
      base.prisma.aiProviderConfiguration.update({
        where: { provider: 'GEMINI' },
        data: { apiKeyEnvVarName: 'OTRA_VARIABLE' },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  /**
   * Esta va por la conexión de propietaria a propósito. El privilegio por
   * columna ya impide el cambio desde la aplicación, así que por el camino
   * normal esta restricción **nunca se ejercería**: la prueba pasaría siempre,
   * y pasaría aunque la restricción no existiera. Se comprobó rompiéndola: al
   * quitarla de la migración, la versión anterior de esta prueba seguía en
   * verde, porque lo que fallaba era el privilegio y no la restricción.
   *
   * La restricción existe para el otro camino: una migración futura, un guion
   * de operación, una corrección a mano en la consola. Es ahí donde alguien
   * pega una clave donde va un nombre.
   */
  it('rechaza una clave disfrazada de nombre de variable, incluso con privilegios de propietaria', async () => {
    await expect(
      base.sql.query(
        `UPDATE "ai_provider_configuration" SET "apiKeyEnvVarName" = $1 WHERE "provider" = 'GEMINI'`,
        ['AIzaSyD-clave-de-verdad-que-alguien-pegó-aquí'],
      ),
    ).rejects.toThrow(/ai_provider_solo_el_nombre_de_la_variable/);
  });

  it('no tiene ninguna columna donde quepa un secreto', async () => {
    const columnas = await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_provider_configuration'`,
    );
    const nombres = columnas.map((c) => c.column_name);
    for (const sospechosa of ['apiKey', 'secret', 'token', 'credential', 'password']) {
      expect(nombres.some((n) => n.toLowerCase() === sospechosa.toLowerCase())).toBe(false);
    }
  });

  it('rechaza un modelo por omisión que no esté entre los permitidos', async () => {
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE "ai_provider_configuration" SET "defaultModel" = 'un-modelo-que-nadie-autorizó' WHERE "provider" = 'GEMINI'`,
      ),
    ).rejects.toThrow(/ai_provider_modelo_por_omision_permitido/);
  });

  it('rechaza un límite en cero, que es apagar la IA sin decirlo', async () => {
    await expect(
      base.prisma.aiProviderConfiguration.update({
        where: { provider: 'GEMINI' },
        data: { maxRequestsPerUserPerDay: 0 },
      }),
    ).rejects.toThrow(/ai_provider_limites_positivos/);
  });
});

describe('la versión de un prompt', () => {
  it('acepta un borrador sin revisor ni fechas', async () => {
    const p = await prompt();
    const v = await version(p.id);
    expect(v.status).toBe('DRAFT');
    expect(v.publishedAt).toBeNull();
  });

  it('rechaza que quien revisa sea quien escribió', async () => {
    const p = await prompt();
    await expect(
      version(p.id, { reviewerId: autoraId, reviewedAt: new Date() }),
    ).rejects.toThrow(/ai_prompt_version_revisor_distinto_del_autor/);
  });

  it('admite revisión de otra persona', async () => {
    const p = await prompt();
    const v = await version(p.id, { reviewerId: revisoraId, reviewedAt: new Date() });
    expect(v.reviewerId).toBe(revisoraId);
  });

  it('rechaza un revisor sin fecha de revisión', async () => {
    const p = await prompt();
    await expect(version(p.id, { reviewerId: revisoraId })).rejects.toThrow(
      /ai_prompt_version_revision_completa/,
    );
  });

  it('rechaza «publicada» sin instante de publicación', async () => {
    const p = await prompt();
    await expect(version(p.id, { status: 'PUBLISHED' })).rejects.toThrow(
      /ai_prompt_version_fechas_coherentes_con_el_estado/,
    );
  });

  it('rechaza un borrador con fecha de publicación', async () => {
    const p = await prompt();
    await expect(version(p.id, { status: 'DRAFT', publishedAt: new Date() })).rejects.toThrow(
      /ai_prompt_version_fechas_coherentes_con_el_estado/,
    );
  });

  it('no deja reescribir el texto de una versión: corregir es una versión nueva', async () => {
    const p = await prompt();
    const v = await version(p.id);
    await expect(
      base.prisma.aiPromptVersion.update({
        where: { id: v.id },
        data: { systemText: 'Otra cosa que nadie revisó.' },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sí deja mover el estado, que es lo que cambia con la revisión', async () => {
    const p = await prompt();
    const v = await version(p.id);
    const movida = await base.prisma.aiPromptVersion.update({
      where: { id: v.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        reviewerId: revisoraId,
        reviewedAt: new Date(),
        updatedByActorId: actorId,
      },
      select: { status: true },
    });
    expect(movida.status).toBe('PUBLISHED');
  });
});

describe('la ejecución del modelo', () => {
  it('guarda la huella de lo enviado y no lo enviado', async () => {
    const p = await prompt();
    const v = await version(p.id);
    const g = await generacion(v.id);
    expect(g.inputDigest).toBe(HUELLA);

    const columnas = await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_generation'`,
    );
    const nombres = columnas.map((c) => c.column_name);
    expect(nombres).not.toContain('inputText');
    expect(nombres).not.toContain('outputText');
  });

  it('rechaza una huella que en realidad es contenido', async () => {
    const p = await prompt();
    const v = await version(p.id);
    await expect(
      generacion(v.id, { inputDigest: 'me despidieron por ser autista y no sé'.padEnd(64, ' ') }),
    ).rejects.toThrow(/ai_generation_huella_no_es_contenido/);
  });

  it('no se puede editar después', async () => {
    const p = await prompt();
    const v = await version(p.id);
    const g = await generacion(v.id);
    await expect(
      base.prisma.aiGeneration.update({ where: { id: g.id }, data: { outputSummary: 'otra cosa' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('no se puede borrar: el rastro de lo que dijo la máquina no se retira', async () => {
    const p = await prompt();
    const v = await version(p.id);
    const g = await generacion(v.id);
    await expect(base.prisma.aiGeneration.delete({ where: { id: g.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('rechaza contadores negativos', async () => {
    const p = await prompt();
    const v = await version(p.id);
    await expect(generacion(v.id, { costMinor: -1n })).rejects.toThrow(
      /ai_generation_contadores_no_negativos/,
    );
  });
});

describe('la revisión humana', () => {
  async function revision(overrides: Record<string, unknown> = {}) {
    const p = await prompt();
    const v = await version(p.id);
    const g = await generacion(v.id);
    return base.prisma.aiReview.create({
      data: {
        generationId: g.id,
        reviewerId: revisoraId,
        decision: 'ACCEPTED',
        createdByActorId: actorId,
        ...overrides,
      },
      select: { id: true, decision: true },
    });
  }

  it('acepta sin texto corregido', async () => {
    const r = await revision();
    expect(r.decision).toBe('ACCEPTED');
  });

  it('rechaza «editada» sin el texto corregido', async () => {
    await expect(revision({ decision: 'EDITED' })).rejects.toThrow(/ai_review_edicion_con_su_texto/);
  });

  it('rechaza una aceptación que trae texto corregido', async () => {
    await expect(revision({ decision: 'ACCEPTED', editedOutput: 'lo corregí' })).rejects.toThrow(
      /ai_review_edicion_con_su_texto/,
    );
  });

  it('rechaza un rechazo sin motivo', async () => {
    await expect(revision({ decision: 'REJECTED' })).rejects.toThrow(/ai_review_rechazo_con_motivo/);
  });

  it('admite un rechazo explicado', async () => {
    const r = await revision({ decision: 'REJECTED', comment: 'Sugiere un diagnóstico, que la IA no puede hacer.' });
    expect(r.decision).toBe('REJECTED');
  });

  it('no se puede reescribir: decir después «yo lo rechacé» es lo que esto impide', async () => {
    const r = await revision();
    await expect(
      base.prisma.aiReview.update({ where: { id: r.id }, data: { decision: 'REJECTED' } }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('la conversación', () => {
  async function conversacion(overrides: Record<string, unknown> = {}) {
    return base.prisma.aiConversation.create({
      data: {
        module: 'support',
        purpose: 'INITIAL_GUIDANCE',
        createdByActorId: actorId,
        updatedByActorId: actorId,
        ...overrides,
      },
      select: { id: true, personId: true, consentId: true },
    });
  }

  it('admite orientación anónima: sin persona y sin consentimiento', async () => {
    const c = await conversacion();
    expect(c.personId).toBeNull();
    expect(c.consentId).toBeNull();
  });

  it('rechaza identificar a una persona sin consentimiento', async () => {
    await expect(conversacion({ personId: personaId })).rejects.toThrow(
      /ai_conversation_persona_identificada_con_consentimiento/,
    );
  });

  it('no deja reatribuir una conversación anónima a una persona', async () => {
    const c = await conversacion();
    await expect(
      base.prisma.aiConversation.update({ where: { id: c.id }, data: { personId: personaId } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sí deja cerrarla y contar sus mensajes', async () => {
    const c = await conversacion();
    const cerrada = await base.prisma.aiConversation.update({
      where: { id: c.id },
      data: { endedAt: new Date(), messageCount: 3, updatedByActorId: actorId },
      select: { messageCount: true },
    });
    expect(cerrada.messageCount).toBe(3);
  });
});

describe('la base documental', () => {
  async function archivoDePrueba(): Promise<string> {
    const archivo = await base.prisma.fileObject.create({
      data: {
        publicId: newPublicId(22),
        legalEntityId: entidadId,
        classification: 'INTERNAL',
        contextKind: 'GOVERNANCE',
        originalFileName: 'guia.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096n,
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });
    return archivo.id;
  }

  async function fuente(overrides: Record<string, unknown> = {}) {
    return base.prisma.knowledgeSource.create({
      data: {
        code: codigo('fuente'),
        name: 'Estatutos',
        sourceKind: 'STATUTE',
        contentHash: HUELLA,
        legalEntityId: entidadId,
        contentPageId: paginaId,
        createdByActorId: actorId,
        updatedByActorId: actorId,
        ...overrides,
      },
      select: { id: true, status: true, requiredPermissionCode: true },
    });
  }

  it('exige un origen: una fuente sin nada que indexar no es una fuente', async () => {
    await expect(fuente({ contentPageId: null })).rejects.toThrow(/knowledge_source_un_solo_origen/);
  });

  it('exige uno solo: con archivo y página a la vez no se sabe qué se indexó', async () => {
    const archivo = await archivoDePrueba();
    await expect(fuente({ fileObjectId: archivo })).rejects.toThrow(
      /knowledge_source_un_solo_origen/,
    );
  });

  it('rechaza «indexada» sin instante de indexación', async () => {
    await expect(fuente({ status: 'INDEXED' })).rejects.toThrow(
      /knowledge_source_indexacion_coherente/,
    );
  });

  it('un fragmento no se edita: se reindexa', async () => {
    const f = await fuente();
    const fragmento = await base.prisma.knowledgeChunk.create({
      data: {
        knowledgeSourceId: f.id,
        ordinal: 0,
        text: 'Los estatutos dicen que la asamblea es soberana.',
        tokenCount: 12,
        createdByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.knowledgeChunk.update({
        where: { id: fragmento.id },
        data: { text: 'Los estatutos dicen otra cosa.' },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rechaza un fragmento vacío, que ocuparía un lugar en la búsqueda sin decir nada', async () => {
    const f = await fuente();
    await expect(
      base.prisma.knowledgeChunk.create({
        data: {
          knowledgeSourceId: f.id,
          ordinal: 1,
          text: '   ',
          tokenCount: 1,
          createdByActorId: actorId,
        },
      }),
    ).rejects.toThrow(/knowledge_chunk_con_contenido/);
  });

  it('guarda el vector y el texto buscable con sus índices', async () => {
    const columnas = await base.prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'knowledge_chunk'`,
    );
    const porNombre = new Map(columnas.map((c) => [c.column_name, c.data_type]));
    expect(porNombre.get('embedding')).toBe('USER-DEFINED');
    expect(porNombre.get('searchVector')).toBe('tsvector');

    const indices = await base.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'knowledge_chunk'`,
    );
    const definiciones = indices.map((i) => i.indexdef).join('\n');
    expect(definiciones).toMatch(/USING hnsw .*vector_cosine_ops/);
    expect(definiciones).toMatch(/USING gin \("searchVector"\)/);
  });
});

describe('quién gobierna la IA según la semilla', () => {
  async function rolesCon(codigoDelPermiso: string): Promise<string[]> {
    const roles = await base.prisma.role.findMany({
      where: { permissions: { some: { permission: { code: codigoDelPermiso } } } },
      select: { code: true },
    });
    return roles.map((r) => r.code).sort();
  }

  it('publicar un prompt es de la Secretaría, y redactarlo no', async () => {
    expect(await rolesCon('ai.prompt.publish')).toEqual(['EXECUTIVE_SECRETARY']);
    expect(await rolesCon('ai.prompt.edit')).toEqual(['COMMUNICATIONS']);
  });

  it('configurar el proveedor no lo tiene nadie más', async () => {
    expect(await rolesCon('ai.provider.configure')).toEqual(['EXECUTIVE_SECRETARY']);
  });

  it('vigilar el gasto no da acceso a lo que la gente escribió', async () => {
    expect(await rolesCon('ai.usage.read')).toContain('OVERSIGHT_COMMISSION');
    expect(await rolesCon('ai.generation.read')).not.toContain('OVERSIGHT_COMMISSION');
  });

  it('quien audita lee la instrucción y la salida, y no decide sobre ellas', async () => {
    expect(await rolesCon('ai.prompt.read')).toContain('AUDITOR');
    expect(await rolesCon('ai.generation.read')).toContain('AUDITOR');
    expect(await rolesCon('ai.generation.review')).not.toContain('AUDITOR');
  });

  it('los ocho permisos de IA existen en la base con su sensibilidad', async () => {
    const permisos = await base.prisma.permission.findMany({
      where: { module: 'ai' },
      select: { code: true, sensitivity: true, requiresReason: true },
      orderBy: { code: 'asc' },
    });
    expect(permisos.map((p) => p.code)).toEqual([
      'ai.generation.read',
      'ai.generation.review',
      'ai.knowledge.manage',
      'ai.prompt.edit',
      'ai.prompt.publish',
      'ai.prompt.read',
      'ai.provider.configure',
      'ai.usage.read',
    ]);
    const criticos = permisos.filter((p) => p.sensitivity === 'CRITICAL').map((p) => p.code);
    expect(criticos).toEqual(['ai.prompt.publish', 'ai.provider.configure']);
    for (const p of permisos) {
      expect(p.requiresReason).toBe(p.sensitivity === 'CRITICAL');
    }
  });
});
