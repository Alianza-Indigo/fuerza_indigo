/**
 * Plantillas y composición de documentos institucionales: la parte pura.
 *
 * Vive aparte porque **se comprueba sola**. Que la sustitución de variables sea
 * determinista, que el texto que entra no pueda traer marcado y que el
 * documento compuesto sea siempre el mismo con los mismos valores son
 * afirmaciones que una prueba verifica sin base de datos ni almacén de
 * archivos, y que quien reciba un documento puede volver a comprobar por su
 * cuenta (docs/ARCHITECTURE.md §4.2).
 */

/** Código de plantilla: mayúsculas, números y guiones bajos. */
export const CODIGO_DE_PLANTILLA = /^[A-Z][A-Z0-9_]{2,59}$/;
/** Nombre admisible de variable. */
export const NOMBRE_DE_VARIABLE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
/** Marca de sustitución: `{{nombre}}`. */
export const MARCA_DE_VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,39})\s*\}\}/g;

/** Variables que el cuerpo de una plantilla usa, sin repetir. */
export function variablesUsadas(bodyTemplate: string): readonly string[] {
  const encontradas = new Set<string>();
  for (const coincidencia of bodyTemplate.matchAll(MARCA_DE_VARIABLE)) {
    const nombre = coincidencia[1];
    if (nombre !== undefined) encontradas.add(nombre);
  }
  return [...encontradas];
}

/** Variables declaradas de una plantilla, leídas de su columna `variables`. */
export function variablesDeclaradas(variables: unknown): readonly string[] {
  if (!Array.isArray(variables)) return [];
  return variables.filter((valor): valor is string => typeof valor === 'string' && NOMBRE_DE_VARIABLE.test(valor));
}


/** Escapa el texto que entra al documento. Un valor no puede traer marcado. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sustituye las variables del cuerpo por sus valores.
 *
 * Es una función pura y determinista: los mismos valores producen exactamente
 * el mismo texto, que es lo que permite comprobar años después que el archivo
 * guardado corresponde con la plantilla y con la instantánea de variables.
 */
export function renderizarCuerpo(bodyTemplate: string, valores: Readonly<Record<string, string>>): string {
  return bodyTemplate.replace(MARCA_DE_VARIABLE, (_coincidencia, nombre: string) =>
    escaparHtml(valores[nombre] ?? ''),
  );
}

/** Documento completo, listo para guardarse y para imprimirse. */
export function componerDocumento(input: {
  readonly titulo: string;
  readonly entidad: string;
  readonly serie: string;
  readonly folio: string;
  readonly emitidoEl: Date;
  readonly cuerpo: string;
}): string {
  const fecha = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'America/Mexico_City',
  }).format(input.emitidoEl);

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(input.titulo)} · ${escaparHtml(input.folio)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0; padding: 2.5rem 2rem; font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; color: #111; background: #fff; }
main { max-width: 44rem; margin: 0 auto; }
header { border-bottom: 2px solid #111; padding-bottom: 1rem; margin-bottom: 2rem; }
h1 { font-size: 16pt; margin: 0 0 .25rem; }
.meta { font-size: 10pt; color: #444; }
.cuerpo p { margin: 0 0 1rem; }
footer { margin-top: 3rem; border-top: 1px solid #999; padding-top: .75rem; font-size: 9pt; color: #444; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
<main>
<header>
<h1>${escaparHtml(input.titulo)}</h1>
<p class="meta">${escaparHtml(input.entidad)}</p>
<p class="meta">Serie ${escaparHtml(input.serie)} · Folio ${escaparHtml(input.folio)} · Emitido el ${escaparHtml(fecha)}</p>
</header>
<div class="cuerpo">
${input.cuerpo}
</div>
<footer>
<p>Documento emitido por la plataforma institucional. Folio ${escaparHtml(input.folio)}.</p>
</footer>
</main>
</body>
</html>
`;
}

