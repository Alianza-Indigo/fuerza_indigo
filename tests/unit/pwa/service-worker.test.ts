import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Reglas de la caché del trabajador de servicio (F2-PWA-002, criterio 5 de la
 * fase: «la PWA no almacena expedientes sensibles»).
 *
 * El archivo se ejecuta en el navegador, fuera de React y fuera del empaquetado
 * de la aplicación, así que no hay forma de importarlo y llamarlo desde aquí.
 * Lo que sí se puede hacer —y es lo que importa— es **evaluar sus funciones de
 * decisión** en este proceso, con cabeceras y rutas construidas a mano, y
 * comprobar que responden lo que la política promete.
 *
 * Se evalúa el archivo real y no una copia: una copia se separa del original y
 * la prueba pasaría verificando algo que ya no se despliega.
 */

const FUENTE = readFileSync('public/sw.js', 'utf8');

/** Extrae una función del archivo y la devuelve ejecutable en este proceso. */
function funcionDelTrabajador<T>(nombre: string): T {
  const inicio = FUENTE.indexOf(`function ${nombre}(`);
  if (inicio === -1) throw new Error(`public/sw.js ya no define ${nombre}().`);

  // Se toma desde la declaración hasta la llave de cierre a nivel cero.
  let profundidad = 0;
  let fin = inicio;
  let dentro = false;
  for (let i = inicio; i < FUENTE.length; i += 1) {
    const caracter = FUENTE[i];
    if (caracter === '{') {
      profundidad += 1;
      dentro = true;
    } else if (caracter === '}') {
      profundidad -= 1;
      if (dentro && profundidad === 0) {
        fin = i + 1;
        break;
      }
    }
  }

  const cuerpo = FUENTE.slice(inicio, fin);
  const zonas = /const ZONAS_CON_SESION = \[[\s\S]*?\];/.exec(FUENTE)?.[0] ?? '';

  // Se compila el archivo **real** del repositorio, no una copia: una copia se
  // separa del original y esta prueba pasaría verificando algo que ya no se
  // despliega. La entrada no viene de fuera —es un archivo versionado— y el
  // módulo `node:vm` deja claro que se está evaluando código a propósito.
  const contexto = createContext({ Headers });
  return runInContext(`${zonas}\n${cuerpo}\n${nombre};`, contexto) as T;
}

const esZonaConSesion = funcionDelTrabajador<(pathname: string) => boolean>('esZonaConSesion');
const sePuedeGuardar = funcionDelTrabajador<(respuesta: unknown) => boolean>('sePuedeGuardar');

function respuesta(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    type: 'basic',
    headers: new Headers(),
    ...overrides,
  };
}

describe('zonas que nunca se guardan', () => {
  it.each([
    '/gestion',
    '/gestion/mensajes',
    '/gestion/mensajes/01a06c22-3f89-753e-ba58-d54925d8b406',
    '/superadmin',
    '/superadmin/auditoria',
    '/mi/seguridad',
    '/acceso',
    '/activar/un-token',
    '/recuperar',
    '/recuperar/otro-token',
    '/api/v1/files/01a06c22-3f89-753e-ba58-d54925d8b406',
  ])('%s no se guarda', (ruta) => {
    expect(esZonaConSesion(ruta)).toBe(true);
  });

  it.each(['/', '/noticias', '/solicitar-apoyo', '/legales/privacidad', '/accesibilidad', '/sin-conexion'])(
    '%s sí puede guardarse',
    (ruta) => {
      expect(esZonaConSesion(ruta)).toBe(false);
    },
  );

  it('una ruta que empiece igual que una pública pero cuelgue de gestión no se guarda', () => {
    expect(esZonaConSesion('/gestion/contenidos/nuevo')).toBe(true);
  });
});

describe('respuestas que nunca se guardan', () => {
  it('guarda una respuesta pública, correcta y del propio origen', () => {
    expect(sePuedeGuardar(respuesta())).toBe(true);
  });

  it('no guarda una respuesta que trae cookie: es de alguien', () => {
    const headers = new Headers();
    headers.set('set-cookie', 'fi_session=lo-que-sea; HttpOnly');
    expect(sePuedeGuardar(respuesta({ headers }))).toBe(false);
  });

  it('no guarda una respuesta marcada como privada', () => {
    const headers = new Headers();
    headers.set('cache-control', 'private, max-age=0');
    expect(sePuedeGuardar(respuesta({ headers }))).toBe(false);
  });

  it('no guarda una respuesta marcada como no almacenable', () => {
    const headers = new Headers();
    headers.set('cache-control', 'no-store');
    expect(sePuedeGuardar(respuesta({ headers }))).toBe(false);
  });

  it('respeta la directiva aunque venga en mayúsculas o mezclada con otras', () => {
    const headers = new Headers();
    headers.set('cache-control', 'Max-Age=60, PRIVATE');
    expect(sePuedeGuardar(respuesta({ headers }))).toBe(false);
  });

  it('no guarda un error ni una respuesta opaca de otro origen', () => {
    expect(sePuedeGuardar(respuesta({ ok: false }))).toBe(false);
    expect(sePuedeGuardar(respuesta({ type: 'opaque' }))).toBe(false);
    expect(sePuedeGuardar(undefined)).toBe(false);
  });
});

describe('el archivo mantiene sus decisiones estructurales', () => {
  it('solo atiende peticiones GET', () => {
    expect(FUENTE).toContain("peticion.method !== 'GET'");
  });

  it('solo atiende el propio origen', () => {
    expect(FUENTE).toContain('url.origin !== self.location.origin');
  });

  it('guarda una pantalla de sin conexión al instalarse', () => {
    expect(FUENTE).toContain("RUTA_SIN_CONEXION = '/sin-conexion'");
  });

  it('las páginas van primero a la red, para no servir una convocatoria vieja', () => {
    const cuerpo = /async function pagina\(peticion\) \{[\s\S]*?\n\}/.exec(FUENTE)?.[0] ?? '';
    expect(cuerpo.indexOf('await fetch(peticion)')).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('await fetch(peticion)')).toBeLessThan(cuerpo.indexOf('caches.match(peticion)'));
  });
});
