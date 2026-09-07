import { createHash } from 'node:crypto';
import { db } from '@/platform/db/client';
import type { Tx } from '@/platform/db/unit-of-work';
import { resolveAiApiKey } from '@/platform/config/ai-key';
import { logger } from '@/platform/observability/logger';
import { aiProvider, EMBEDDING_DIM, EMBEDDING_MODEL } from './provider-port';

/**
 * Base documental: fragmentar, indexar y recuperar (PRD §15.2, §24 Fase 8; ADR-0143, ADR-0144).
 *
 * La garantía que gobierna este archivo es la recuperación: **un fragmento nunca
 * alcanza a quien no puede leer su origen**. El permiso exigido se copia de la
 * fuente a cada fragmento (lo hace la indexación) para poder filtrar en la misma
 * consulta del vecino más próximo. Recuperar primero y filtrar después dejaría
 * que el modelo ya hubiera visto lo que la persona no puede leer, y eso no se
 * arregla borrándolo del resultado (ADR-0144).
 *
 * El vector y el índice léxico los añade la migración; Prisma no los expresa. Por
 * eso los fragmentos se insertan y se recuperan con SQL, no con el cliente.
 */

const TIMEOUT_MS = 20_000;
/** Tamaño objetivo de un fragmento, en caracteres. Un fragmento es un pedazo
 * recuperable: ni tan grande que traiga de todo, ni tan chico que pierda el hilo. */
const CHUNK_CHARS = 1_200;

export interface Chunk {
  readonly ordinal: number;
  readonly text: string;
  readonly tokenCount: number;
  readonly sectionPath: string | null;
}

/** Cuatro caracteres por token, la regla de dedo del proveedor. */
function estimarTokens(texto: string): number {
  return Math.max(1, Math.ceil(texto.length / 4));
}

/**
 * Parte un texto en fragmentos por bloques (separados por líneas en blanco),
 * agrupándolos hasta el tamaño objetivo y recordando el último encabezado como
 * ruta de sección. No parte a mitad de un bloque: un fragmento cortado por la
 * mitad recupera media idea.
 */
export function chunkMarkdown(texto: string): Chunk[] {
  const bloques = texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const fragmentos: Chunk[] = [];
  let acumulado = '';
  let seccion: string | null = null;
  let ordinal = 0;

  const cerrar = () => {
    const limpio = acumulado.trim();
    if (limpio.length > 0) {
      fragmentos.push({ ordinal, text: limpio, tokenCount: estimarTokens(limpio), sectionPath: seccion });
      ordinal += 1;
    }
    acumulado = '';
  };

  for (const bloque of bloques) {
    const encabezado = /^#{1,6}\s+(.*)$/.exec(bloque);
    if (encabezado !== null) {
      cerrar();
      seccion = encabezado[1]?.trim().slice(0, 300) ?? null;
      continue;
    }
    if (acumulado.length > 0 && acumulado.length + bloque.length + 2 > CHUNK_CHARS) cerrar();
    acumulado = acumulado.length === 0 ? bloque : `${acumulado}\n\n${bloque}`;
  }
  cerrar();

  return fragmentos;
}

/* -------------------------------------------------------------------------- */
/* Proveedor: config y clave, o degradación                                   */
/* -------------------------------------------------------------------------- */

async function claveDelProveedor(): Promise<string | null> {
  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { isEnabled: true, apiKeyEnvVarName: true },
  });
  if (config === null || !config.isEnabled) return null;
  const clave = resolveAiApiKey(config.apiKeyEnvVarName);
  return clave === '' ? null : clave;
}

/** Da formato de literal de `vector` a un arreglo de números: '[0.1,0.2,...]'. */
function comoVector(valores: number[]): string {
  return `[${valores.join(',')}]`;
}

/* -------------------------------------------------------------------------- */
/* Indexación                                                                 */
/* -------------------------------------------------------------------------- */

export type IndexOutcome =
  | { readonly status: 'INDEXED'; readonly chunkCount: number; readonly contentHash: string }
  | { readonly status: 'DEGRADED'; readonly reason: 'PROVIDER_DISABLED' | 'NO_API_KEY' };

/**
 * Indexa una fuente: fragmenta su texto, lo vectoriza y reemplaza sus fragmentos.
 *
 * Reindexar **borra y vuelve a insertar**: un fragmento no se edita, porque
 * reescribir su texto dejaría el vector apuntando a algo que ya no dice eso. El
 * permiso exigido se copia a cada fragmento aquí, que es lo que permite filtrar
 * al recuperar sin unir tablas.
 */
export async function indexSource(input: {
  readonly sourceId: string;
  readonly text: string;
  readonly requiredPermissionCode: string | null;
  readonly actorId: string;
}): Promise<IndexOutcome> {
  const clave = await claveDelProveedor();
  if (clave === null) {
    // Sin proveedor no se puede vectorizar. La fuente se queda como está; la
    // búsqueda semántica cae al camino léxico o al humano.
    return { status: 'DEGRADED', reason: 'PROVIDER_DISABLED' };
  }

  const fragmentos = chunkMarkdown(input.text);
  const contentHash = createHash('sha256').update(input.text).digest('hex');

  const vectores =
    fragmentos.length === 0
      ? []
      : await aiProvider().embed({ apiKey: clave, model: EMBEDDING_MODEL, texts: fragmentos.map((f) => f.text), timeoutMs: TIMEOUT_MS });

  if (vectores.length !== fragmentos.length || vectores.some((v) => v.length !== EMBEDDING_DIM)) {
    throw new Error(
      `El proveedor devolvió ${vectores.length} vectores de dimensión inesperada para ${fragmentos.length} fragmentos (se esperan ${EMBEDDING_DIM}).`,
    );
  }

  await db().$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM knowledge_chunk WHERE "knowledgeSourceId" = ${input.sourceId}::uuid`;

    for (let i = 0; i < fragmentos.length; i += 1) {
      const f = fragmentos[i]!;
      const vec = comoVector(vectores[i]!);
      await tx.$executeRaw`
        INSERT INTO knowledge_chunk
          (id, "knowledgeSourceId", ordinal, text, "tokenCount", "sectionPath", "requiredPermissionCode", embedding, "createdByActorId")
        VALUES
          (gen_random_uuid(), ${input.sourceId}::uuid, ${f.ordinal}, ${f.text}, ${f.tokenCount},
           ${f.sectionPath}, ${input.requiredPermissionCode}, ${vec}::vector, ${input.actorId}::uuid)
      `;
    }

    await tx.knowledgeSource.update({
      where: { id: input.sourceId },
      data: {
        status: 'INDEXED',
        indexedAt: new Date(),
        chunkCount: fragmentos.length,
        contentHash,
        updatedByActorId: input.actorId,
      },
    });
  });

  logger.info('Fuente documental indexada', {
    module: 'ai',
    context: { sourceId: input.sourceId, chunkCount: fragmentos.length },
  });

  return { status: 'INDEXED', chunkCount: fragmentos.length, contentHash };
}

/* -------------------------------------------------------------------------- */
/* Recuperación con permisos                                                  */
/* -------------------------------------------------------------------------- */

export interface RetrievedChunk {
  readonly id: string;
  readonly text: string;
  readonly knowledgeSourceId: string;
  readonly sourceCode: string;
  readonly similarity: number;
}

export type RetrieveOutcome =
  | { readonly status: 'OK'; readonly chunks: RetrievedChunk[] }
  | { readonly status: 'DEGRADED'; readonly reason: 'PROVIDER_DISABLED' | 'NO_API_KEY' };

/**
 * Recupera los fragmentos más próximos a una consulta, **filtrando por permiso
 * en la misma consulta**.
 *
 * Dos filtros van juntos y no se pueden separar sin abrir un hueco:
 *
 *  · `requiredPermissionCode` del fragmento tiene que ser nulo (público) o estar
 *    entre los permisos de quien pregunta. Es la garantía de la fase.
 *  · La fuente tiene que estar entre las que la versión del prompt autoriza a
 *    consultar. Un prompt no lee cualquier cosa: lee lo que se le autorizó.
 */
export async function retrieveChunks(input: {
  readonly queryText: string;
  readonly permissionCodes: readonly string[];
  readonly authorizedSourceIds: readonly string[];
  readonly limit: number;
}): Promise<RetrieveOutcome> {
  if (input.authorizedSourceIds.length === 0) return { status: 'OK', chunks: [] };

  const clave = await claveDelProveedor();
  if (clave === null) return { status: 'DEGRADED', reason: 'PROVIDER_DISABLED' };

  const vectores = await aiProvider().embed({ apiKey: clave, model: EMBEDDING_MODEL, texts: [input.queryText], timeoutMs: TIMEOUT_MS });
  const consulta = vectores[0];
  if (consulta === undefined || consulta.length !== EMBEDDING_DIM) {
    throw new Error('El proveedor no devolvió un vector de consulta válido.');
  }

  const vec = comoVector(consulta);
  const perms = [...input.permissionCodes];
  const fuentes = [...input.authorizedSourceIds];

  const filas = await db().$queryRaw<
    { id: string; text: string; knowledgeSourceId: string; source_code: string; similarity: number }[]
  >`
    SELECT kc.id, kc.text, kc."knowledgeSourceId", ks.code AS source_code,
           1 - (kc.embedding <=> ${vec}::vector) AS similarity
      FROM knowledge_chunk kc
      JOIN knowledge_source ks ON ks.id = kc."knowledgeSourceId"
     WHERE kc.embedding IS NOT NULL
       AND ks.status = 'INDEXED'
       AND kc."knowledgeSourceId" = ANY(${fuentes}::uuid[])
       AND (kc."requiredPermissionCode" IS NULL OR kc."requiredPermissionCode" = ANY(${perms}::text[]))
     ORDER BY kc.embedding <=> ${vec}::vector
     LIMIT ${input.limit}
  `;

  return {
    status: 'OK',
    chunks: filas.map((f) => ({
      id: f.id,
      text: f.text,
      knowledgeSourceId: f.knowledgeSourceId,
      sourceCode: f.source_code,
      similarity: Number(f.similarity),
    })),
  };
}

/** Marca una fuente como desfasada si su contenido cambió desde que se indexó. */
export async function markStaleIfChanged(tx: Tx, sourceId: string, currentText: string, actorId: string): Promise<boolean> {
  const source = await tx.knowledgeSource.findUnique({ where: { id: sourceId }, select: { contentHash: true, status: true } });
  if (source === null) return false;
  const hash = createHash('sha256').update(currentText).digest('hex');
  if (hash === source.contentHash || source.status !== 'INDEXED') return false;
  await tx.knowledgeSource.update({ where: { id: sourceId }, data: { status: 'STALE', updatedByActorId: actorId } });
  return true;
}
