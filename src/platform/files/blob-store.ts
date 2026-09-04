import { del, get, put } from '@vercel/blob';

import { env } from '@/platform/config/env';
import { logger } from '@/platform/observability/logger';

/**
 * Puerto del almacén de objetos (defecto `D-F4-008`, ADR-0076).
 *
 * El correo tiene puerto con adaptadores (ADR-0016) y la pasarela también
 * (ADR-0014); el almacén de archivos no lo tenía y llamaba a Vercel Blob
 * directamente. El efecto: sin un token real, subir un archivo **se queda
 * colgado**, en una máquina de desarrollo y en la integración continua por
 * igual. Ni siquiera se notaba, porque las pruebas de la Fase 1 insertaban las
 * filas a mano para esquivarlo, y así una prueba que no puede fallar acompañaba
 * a un código que nadie había ejecutado.
 *
 * El adaptador se elige por la forma del token, y no por una variable nueva: un
 * `BLOB_READ_WRITE_TOKEN` vacío o de relleno significa exactamente «aquí no hay
 * almacén», y obligar a declararlo dos veces daría lugar a la combinación
 * incoherente de siempre —token real con adaptador de memoria—.
 */

export interface StoredObject {
  readonly pathname: string;
  readonly url: string;
}

export interface BlobStorePort {
  readonly name: 'vercel-blob' | 'memoria';
  /** Qué puede hacer de verdad. Lo lee la verificación de salud. */
  readonly capability: 'PERSISTS' | 'IN_MEMORY';
  readonly capabilityDetail: string;
  put(pathname: string, content: Uint8Array, contentType: string): Promise<StoredObject>;
  get(pathname: string): Promise<Uint8Array | null>;
  delete(pathname: string): Promise<void>;
}

const vercelBlobAdapter: BlobStorePort = {
  name: 'vercel-blob',
  capability: 'PERSISTS',
  capabilityDetail: 'almacén privado de Vercel Blob',
  put: async (pathname, content, contentType) => {
    const stored = await put(pathname, Buffer.from(content), {
      // Acceso PRIVADO. No es un detalle de configuración: es lo que impide que
      // la URL del almacén sirva por sí sola (PRD §17.4).
      access: 'private',
      addRandomSuffix: false,
      token: env().BLOB_READ_WRITE_TOKEN,
      contentType,
    });
    return { pathname: stored.pathname, url: stored.url };
  },
  get: async (pathname) => {
    const stored = await get(pathname, { access: 'private', token: env().BLOB_READ_WRITE_TOKEN });
    if (stored === null) return null;
    return new Uint8Array(await new Response(stored.stream).arrayBuffer());
  },
  delete: async (pathname) => {
    await del(pathname, { token: env().BLOB_READ_WRITE_TOKEN });
  },
};

/**
 * Desarrollo y pruebas: el contenido vive en el proceso y se pierde al
 * reiniciarlo.
 *
 * Se declara `IN_MEMORY` y el panel de salud lo dice con esas palabras. Un
 * almacén que pierde lo guardado al reiniciar no es un fallo mientras se
 * anuncie; lo que sería un fallo es que pareciera persistente.
 */
function createMemoryAdapter(): BlobStorePort {
  const objetos = new Map<string, { content: Uint8Array; contentType: string }>();
  return {
    name: 'memoria',
    capability: 'IN_MEMORY',
    capabilityDetail:
      'sin token de almacén: los archivos viven en la memoria del proceso y se pierden al reiniciar',
    put: (pathname, content, contentType) => {
      objetos.set(pathname, { content, contentType });
      logger.info('Archivo guardado en el almacén de memoria', {
        module: 'files',
        context: { pathname, bytes: content.byteLength },
      });
      return Promise.resolve({ pathname, url: `memoria://${pathname}` });
    },
    get: (pathname) => Promise.resolve(objetos.get(pathname)?.content ?? null),
    delete: (pathname) => {
      objetos.delete(pathname);
      return Promise.resolve();
    },
  };
}

const memoryAdapter = createMemoryAdapter();

/**
 * Un token de relleno no es un token.
 *
 * Los valores que la plantilla y la integración continua ponen para que el
 * arranque no se detenga empiezan por `vercel_blob_rw_` seguido de un texto que
 * dice a voces que no sirve. Tratarlos como reales dejaría la subida colgada
 * contra un servicio que no responde, que es peor que no tener almacén.
 */
function esTokenReal(token: string): boolean {
  if (!token.startsWith('vercel_blob_rw_')) return false;
  return !/placeholder|ejemplo|prueba|test|ci|local/i.test(token);
}

let override: BlobStorePort | null = null;

export function blobStore(): BlobStorePort {
  if (override !== null) return override;
  return esTokenReal(env().BLOB_READ_WRITE_TOKEN) ? vercelBlobAdapter : memoryAdapter;
}

/** Lo que el adaptador vigente puede hacer. Lo consulta la verificación de salud. */
export function blobStoreCapability(): {
  capability: BlobStorePort['capability'];
  detail: string;
  name: string;
} {
  const port = blobStore();
  return { capability: port.capability, detail: port.capabilityDetail, name: port.name };
}

/** Solo para pruebas: sustituye el adaptador. */
export function setBlobStoreForTests(port: BlobStorePort | null): void {
  override = port;
}
