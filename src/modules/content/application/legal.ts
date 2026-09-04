import { db } from '@/platform/db/client';

/**
 * Páginas legales por entidad jurídica (F2-CMS-003, PRD §16.1).
 *
 * Fuerza Índigo y Alianza Índigo son personas morales distintas. Cada una
 * responde por su propio aviso de privacidad, sus propios términos y su propia
 * vía para ejercer derechos de datos, y publicarlos bajo un solo texto sería
 * atribuirle a una lo que dice la otra.
 *
 * La dirección de un documento legal se compone así:
 *
 *     legales/<documento>              → texto común a las dos entidades
 *     legales/<documento>/<entidad>    → texto propio de esa entidad
 *
 * Es una convención sobre la dirección y no una columna nueva a propósito: la
 * dirección ya es única, ya se administra desde el panel editorial y ya la ve
 * quien escribe el contenido. Una columna paralela obligaría a mantener dos
 * fuentes de la misma verdad, que es como acaban discrepando.
 *
 * Lo que **no** vive aquí es la declaración de accesibilidad: describe el
 * comportamiento del programa, así que es una página de código que cambia con
 * el programa y en el mismo cambio.
 */

export interface LegalDocument {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly bodyMarkdown: string;
  readonly publishedAt: Date | null;
  /** Código de la entidad, o `null` si el texto es común a las dos. */
  readonly legalEntityCode: string | null;
  readonly legalEntityShortName: string | null;
}

/**
 * Versiones publicadas de un documento legal, una por entidad.
 *
 * Devuelve una lista y no una sola página porque quien lee tiene derecho a ver
 * las dos: alguien que trata con las dos entidades necesita saber qué dice cada
 * una, y elegir por él cuál le corresponde sería decidir en su lugar.
 */
export async function publishedLegalDocuments(documento: string): Promise<LegalDocument[]> {
  const normalizado = documento.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizado)) return [];

  const filas = await db().contentPage.findMany({
    where: {
      status: 'PUBLISHED',
      accessLevel: 'PUBLIC',
      archivedAt: null,
      currentVersionId: { not: null },
      OR: [{ slug: `legales/${normalizado}` }, { slug: { startsWith: `legales/${normalizado}/` } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    select: {
      slug: true,
      publishedAt: true,
      legalEntity: { select: { code: true, shortName: true } },
      currentVersion: { select: { title: true, summary: true, bodyMarkdown: true } },
    },
  });

  return filas
    .filter((fila) => fila.currentVersion !== null)
    // Una página bajo `legales/<documento>/<entidad>` sin entidad asignada es
    // una dirección que promete algo que la fila no cumple: se descarta en vez
    // de mostrarla como si fuera el texto común, que diría otra cosa.
    .filter((fila) => fila.slug === `legales/${normalizado}` || fila.legalEntity !== null)
    .map((fila) => ({
      slug: fila.slug,
      title: fila.currentVersion!.title,
      summary: fila.currentVersion!.summary,
      bodyMarkdown: fila.currentVersion!.bodyMarkdown,
      publishedAt: fila.publishedAt,
      legalEntityCode: fila.legalEntity?.code ?? null,
      legalEntityShortName: fila.legalEntity?.shortName ?? null,
    }));
}
