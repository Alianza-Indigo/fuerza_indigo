import { db } from '@/platform/db/client';
import {
  accesoDeLaFicha,
  logotipoDeLaFicha,
  moduloDeLaFicha,
  type FichaDelEcosistema,
} from '../domain/link';

/**
 * Lectura del catálogo del ecosistema (PRD §12.4).
 *
 * Una sola función, sin actor y sin banderas. El catálogo es **público**: no
 * hay elegibilidad, ni derechos, ni recomendaciones calculadas, y quien decide
 * es la persona. El portal personal enseña exactamente lo mismo, y por eso lee
 * de aquí en vez de tener su propia consulta: dos consultas paralelas es cómo
 * el sitio público y el portal acaban enseñando catálogos distintos.
 *
 * No admite un parámetro para incluir lo oculto. Si un día hace falta listar lo
 * oculto —y hace falta, para administrarlo—, eso es otra función con su permiso,
 * no una bandera en esta. Una bandera `incluirOcultas` acaba pasada en verdadero
 * desde la ruta pública; es el error clásico de este tipo de módulo y en este
 * repositorio ya se evitó una vez, en las consultas de contenido.
 */
export async function catalogoPublicado(): Promise<readonly FichaDelEcosistema[]> {
  const fichas = await db().ecosystemLink.findMany({
    where: { operationalStatus: 'ACTIVE', publishedAt: { not: null } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      code: true,
      name: true,
      summary: true,
      audienceText: true,
      accentToken: true,
      externalUrl: true,
      logoFileId: true,
      legalEntity: { select: { shortName: true } },
    },
  });

  return fichas.map((ficha) => ({
    code: ficha.code,
    name: ficha.name,
    summary: ficha.summary,
    audienceText: ficha.audienceText,
    modulo: moduloDeLaFicha(ficha.accentToken),
    accesoUrl: accesoDeLaFicha(ficha.externalUrl),
    logotipoUrl: logotipoDeLaFicha(ficha.code, ficha.logoFileId),
    responsable: ficha.legalEntity?.shortName ?? null,
  }));
}
