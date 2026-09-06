import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

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
 * Desarrollo y pruebas: el contenido vive en un directorio local.
 *
 * **Vivía en la memoria del proceso, y eso estaba mal.** Un servidor de
 * producción atiende con varios procesos de trabajo: lo que guardaba una
 * petición no lo encontraba la siguiente, porque caía en otro. El resultado no
 * era «los archivos se pierden al reiniciar», que es lo que se anunciaba, sino
 * algo peor y más difícil de creer: un archivo recién subido daba 404 al
 * pedirlo, unas veces sí y otras no. Lo destapó la ruta del logotipo del
 * catálogo en la Fase 7 (`D-F7-005`).
 *
 * Con el directorio, lo que guarda un proceso lo lee cualquiera. Sigue **sin
 * ser** el almacén productivo y se sigue anunciando como local: el directorio
 * de un contenedor desaparece con él, y quien despliegue sin token debe saber
 * que sus archivos duran lo que dure la máquina.
 *
 * La ruta lógica del objeto viene del servicio de archivos y es opaca —no
 * deriva del nombre original—, pero aquí se compone un camino de disco con
 * ella: se comprueba que no salga del directorio, porque una ruta con `..`
 * escribiría donde no debe y esta clase de defensa no cuesta nada.
 */
function createLocalDiskAdapter(): BlobStorePort {
  // Un directorio fijo, sin variable que lo configure: no es una decisión de
  // despliegue —quien despliegue de verdad pone el token del almacén— y una
  // variable más sería una que documentar, validar y explicar para nada.
  const raiz = join(tmpdir(), 'fuerza-indigo-archivos');

  const rutaDe = (pathname: string): string | null => {
    const completa = resolve(raiz, pathname);
    const dentro = resolve(raiz);
    return completa === dentro || completa.startsWith(`${dentro}${sep}`) ? completa : null;
  };

  return {
    name: 'memoria',
    capability: 'IN_MEMORY',
    capabilityDetail: `sin token de almacén: los archivos viven en ${raiz}, que dura lo que dure esta máquina`,
    put: async (pathname, content, contentType) => {
      const destino = rutaDe(pathname);
      if (destino === null) throw new Error(`Ruta de objeto fuera del almacén local: ${pathname}`);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, content);
      logger.info('Archivo guardado en el almacén local', {
        module: 'files',
        context: { pathname, bytes: content.byteLength, contentType },
      });
      return { pathname, url: `archivo://${pathname}` };
    },
    get: async (pathname) => {
      const origen = rutaDe(pathname);
      if (origen === null) return null;
      try {
        return new Uint8Array(await readFile(origen));
      } catch {
        return null;
      }
    },
    delete: async (pathname) => {
      const destino = rutaDe(pathname);
      if (destino === null) return;
      await rm(destino, { force: true });
    },
  };
}

const localAdapter = createLocalDiskAdapter();

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
  return esTokenReal(env().BLOB_READ_WRITE_TOKEN) ? vercelBlobAdapter : localAdapter;
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
