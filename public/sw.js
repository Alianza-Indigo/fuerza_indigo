/**
 * Trabajador de servicio de Fuerza Índigo (F2-PWA-002, PRD §17.6).
 *
 * La regla que gobierna este archivo es una sola: **nunca guarda nada que
 * pertenezca a alguien**. Un expediente, un padrón, una solicitud de apoyo o
 * cualquier respuesta servida a una sesión iniciada quedarían en el disco del
 * dispositivo, sobreviviendo al cierre de sesión y al préstamo del teléfono. Un
 * sindicato que guarda en la caché del navegador el relato de un conflicto
 * laboral no protege a nadie.
 *
 * De ahí que la decisión de guardar no se tome por lista de rutas sino por tres
 * comprobaciones acumulativas, cualquiera de las cuales basta para no guardar:
 *
 *  1. El método no es GET, o el origen no es el propio.
 *  2. La ruta pertenece a una zona con sesión, o es de la interfaz de programación.
 *  3. La respuesta dice que es privada, o trae una cookie, o no es correcta.
 *
 * Qué queda guardado hoy, en la práctica: **los estáticos compilados y la
 * pantalla de sin conexión, y nada más**. Ninguna página del sitio, ni siquiera
 * la portada. No es un descuido: el servidor las marca `private, no-store`
 * porque se pintan por persona —el tema, el tamaño del texto y la densidad
 * salen de una cookie y viajan en el `<html>`—, y este archivo respeta esa
 * instrucción sin discutirla. En un teléfono prestado, servir la portada
 * guardada mostraría las preferencias de quien lo usó antes.
 *
 * La única página que se guarda es `/sin-conexion`, y se guarda **al
 * instalarse**, no al navegar. Es la excepción deliberada y la razón es
 * evidente: una pantalla de sin conexión que hubiera que descargar cuando ya no
 * hay conexión no existiría nunca.
 *
 * La rama que guarda páginas navegadas se conserva porque es correcta y
 * entrará en funcionamiento sola el día que alguna ruta pública deje de
 * depender de la cookie de preferencias. Hoy no guarda nada porque no puede.
 *
 * No hay biblioteca detrás. Un trabajador de servicio generado por una
 * herramienta guarda por omisión todo lo que pasa, y las excepciones se
 * configuran después: exactamente la postura contraria a la de este proyecto,
 * donde lo que amplía el alcance se declara y nunca se hereda.
 */

const VERSION = 'v1';
const CACHE_ESTATICA = `fuerza-estatica-${VERSION}`;
const CACHE_PAGINAS = `fuerza-paginas-${VERSION}`;
const RUTA_SIN_CONEXION = '/sin-conexion';

/** Zonas que nunca se guardan, ni aunque la respuesta parezca pública. */
const ZONAS_CON_SESION = [
  '/api/',
  '/gestion',
  '/superadmin',
  '/mi/',
  '/acceso',
  '/activar',
  '/recuperar',
];

function esZonaConSesion(pathname) {
  return ZONAS_CON_SESION.some((zona) => pathname === zona || pathname.startsWith(zona));
}

/**
 * ¿Se puede guardar esta respuesta?
 *
 * `Set-Cookie` es la señal más fiable de que la respuesta es de alguien: la
 * emite el servidor cuando abre o renueva una sesión. `Cache-Control` con
 * `private` o `no-store` es la declaración explícita del servidor de que no
 * quiere que se guarde, y aquí se respeta sin discutir.
 */
function sePuedeGuardar(respuesta) {
  if (!respuesta || !respuesta.ok || respuesta.type !== 'basic') return false;

  const control = (respuesta.headers.get('cache-control') || '').toLowerCase();
  if (control.includes('no-store') || control.includes('private')) return false;
  if (respuesta.headers.has('set-cookie')) return false;

  return true;
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((cache) => cache.addAll([RUTA_SIN_CONEXION]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('fuerza-') && !nombre.endsWith(VERSION))
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Estáticos compilados: primero la caché.
 *
 * Llevan huella en el nombre, de modo que un archivo nunca cambia de contenido
 * sin cambiar de dirección: guardarlos para siempre es correcto y es lo que
 * hace que la aplicación abra rápido en una red lenta (PRD §5.4).
 */
async function estatico(peticion) {
  const guardado = await caches.match(peticion);
  if (guardado) return guardado;

  const respuesta = await fetch(peticion);
  if (sePuedeGuardar(respuesta)) {
    const cache = await caches.open(CACHE_ESTATICA);
    cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

/**
 * Páginas públicas: primero la red.
 *
 * Un comunicado corregido tiene que verse corregido. La caché es la red de
 * seguridad para cuando no hay conexión, no la fuente de la verdad: servir una
 * versión vieja de una convocatoria sería peor que no servir ninguna.
 */
async function pagina(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (sePuedeGuardar(respuesta)) {
      const cache = await caches.open(CACHE_PAGINAS);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    const guardado = await caches.match(peticion);
    if (guardado) return guardado;

    const sinConexion = await caches.match(RUTA_SIN_CONEXION);
    if (sinConexion) return sinConexion;

    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (esZonaConSesion(url.pathname)) return;

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(estatico(peticion));
    return;
  }

  if (peticion.mode === 'navigate') {
    evento.respondWith(pagina(peticion));
  }
});
