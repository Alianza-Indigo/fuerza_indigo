/**
 * Qué direcciones puede ocupar el gestor de contenidos y cuáles no.
 *
 * El sitio público resuelve las páginas del gestor por una ruta atrapatodo. Otra
 * ruta que case con la misma dirección **gana siempre**, sin error y sin aviso:
 * la página se publica, el gestor la da por publicada, y quien abre la dirección
 * ve otra cosa. Nadie se entera hasta que alguien pregunta por qué su página no
 * aparece.
 *
 * Pero no toda ruta del código roba una dirección: **algunas existen para
 * servir contenido del gestor**, con otra presentación. `legales/:param` busca
 * la página cuyo slug es `legales/<documento>` y la publica con su selector por
 * entidad; reservarla prohibiría justo lo que esa ruta existe para enseñar.
 *
 * De ahí las dos listas. La diferencia no se puede deducir del disco —las dos
 * son directorios con su `page.tsx`— y por eso se declara, y el control
 * `C-F7-01` exige que **toda** ruta pública esté en una de las dos. Una pantalla
 * nueva obliga así a decidir a cuál pertenece, en vez de caer en un
 * comportamiento por omisión que nadie eligió.
 *
 * `:param` es un segmento variable: casa con cualquier valor, pero con **uno**.
 * Por eso `legales/terminos/fuerza-indigo`, que tiene tres segmentos, no la toca
 * y cae en la atrapatodo como cualquier otra página.
 */

/** Rutas que sirven **lo suyo**: el gestor no puede publicar en ellas. */
export const RUTAS_DEL_CODIGO: readonly string[] = [
  'accesibilidad',
  'buscar',
  'contacto',
  'directorio',
  'directorio/:param',
  'herramientas',
  'herramientas/logotipo/:param',
  'legales/accesibilidad',
  'sin-conexion',
  'solicitar-apoyo',
  'verificar',
  'verificar/:param',
  'votar/:param',
];

/**
 * Rutas que **son** una forma de publicar contenido del gestor.
 *
 * No se reservan: una página en esa dirección es exactamente lo que se espera.
 * Se declaran para que el control sepa que están clasificadas y no falte
 * ninguna por revisar.
 */
export const RUTAS_QUE_SIRVEN_CONTENIDO: readonly string[] = ['legales/:param', 'noticias', 'noticias/:param'];

function casa(ruta: string, partes: readonly string[]): boolean {
  const patron = ruta.split('/');
  if (patron.length !== partes.length) return false;
  return patron.every((segmento, i) => segmento === ':param' || segmento === partes[i]);
}

/** ¿Esta dirección la sirve el código con contenido propio, en vez del gestor? */
export function estaReservada(slug: string): boolean {
  const partes = slug.split('/');
  return RUTAS_DEL_CODIGO.some((ruta) => casa(ruta, partes));
}
