import type { ReactNode } from 'react';

/**
 * Renderizador de Markdown a elementos de React.
 *
 * **Nunca produce una cadena de HTML.** No hay `dangerouslySetInnerHTML` en
 * ninguna parte, de modo que no existe el camino por el que un contenido
 * editorial podría inyectar marcado. Es la razón de escribirlo en vez de traer
 * un analizador con su sanitizador: el sanitizador es una lista de lo que se
 * quita, y basta una omisión; aquí solo puede salir lo que este archivo
 * construye, que es una lista de lo que se permite.
 *
 * El subconjunto es deliberadamente pequeño: encabezados, párrafos, listas,
 * citas, código, enlaces, negrita y cursiva. Es lo que un comunicado sindical
 * necesita. Lo que no está, no se pinta como texto crudo ni se ignora: se
 * muestra tal cual, que es lo que menos sorprende a quien escribió.
 */

interface Opciones {
  /** Nivel del primer encabezado. La página ya tiene su `h1`. */
  readonly headingOffset?: number;
}

export function Markdown({ source, headingOffset = 1 }: { source: string } & Opciones) {
  return <>{renderBlocks(source, { headingOffset })}</>;
}

function renderBlocks(source: string, opciones: Required<Opciones>): ReactNode[] {
  const lineas = source.replace(/\r\n/g, '\n').split('\n');
  const salida: ReactNode[] = [];
  let indice = 0;
  let clave = 0;

  while (indice < lineas.length) {
    const linea = lineas[indice] ?? '';

    if (linea.trim() === '') {
      indice += 1;
      continue;
    }

    // Encabezado
    const encabezado = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (encabezado !== null) {
      const nivel = Math.min(6, encabezado[1]!.length + opciones.headingOffset);
      const Etiqueta = `h${nivel}` as 'h2';
      const tamaño =
        nivel <= 2 ? 'text-2xl' : nivel === 3 ? 'text-xl' : nivel === 4 ? 'text-lg' : 'text-base';
      salida.push(
        <Etiqueta key={clave++} className={`mt-8 font-semibold ${tamaño} first:mt-0`}>
          {renderInline(encabezado[2]!)}
        </Etiqueta>,
      );
      indice += 1;
      continue;
    }

    // Cita
    if (linea.startsWith('> ')) {
      const partes: string[] = [];
      while (indice < lineas.length && (lineas[indice] ?? '').startsWith('> ')) {
        partes.push((lineas[indice] ?? '').slice(2));
        indice += 1;
      }
      salida.push(
        <blockquote
          key={clave++}
          className="my-4 border-l-4 border-[var(--color-accent)] bg-[var(--color-accent-soft)] py-2 pl-4"
        >
          {renderInline(partes.join(' '))}
        </blockquote>,
      );
      continue;
    }

    // Bloque de código
    if (linea.startsWith('```')) {
      const partes: string[] = [];
      indice += 1;
      while (indice < lineas.length && !(lineas[indice] ?? '').startsWith('```')) {
        partes.push(lineas[indice] ?? '');
        indice += 1;
      }
      indice += 1;
      salida.push(
        <pre
          key={clave++}
          className="my-4 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-4 text-sm"
        >
          <code>{partes.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Lista
    const esItem = (valor: string) => /^\s*([-*]|\d+\.)\s+/.test(valor);
    if (esItem(linea)) {
      const ordenada = /^\s*\d+\./.test(linea);
      const items: string[] = [];
      while (indice < lineas.length && esItem(lineas[indice] ?? '')) {
        items.push((lineas[indice] ?? '').replace(/^\s*([-*]|\d+\.)\s+/, ''));
        indice += 1;
      }
      const Etiqueta = ordenada ? 'ol' : 'ul';
      salida.push(
        <Etiqueta
          key={clave++}
          className={`my-4 space-y-2 pl-6 ${ordenada ? 'list-decimal' : 'list-disc'} marker:text-[var(--color-accent)]`}
        >
          {items.map((item, posicion) => (
            <li key={posicion}>{renderInline(item)}</li>
          ))}
        </Etiqueta>,
      );
      continue;
    }

    // Separador
    if (/^-{3,}$/.test(linea.trim())) {
      salida.push(<hr key={clave++} className="my-8 border-[var(--color-line)]" />);
      indice += 1;
      continue;
    }

    // Párrafo: hasta la siguiente línea en blanco.
    const parrafo: string[] = [];
    while (
      indice < lineas.length &&
      (lineas[indice] ?? '').trim() !== '' &&
      !/^(#{1,6}\s|>\s|```|-{3,}$)/.test(lineas[indice] ?? '') &&
      !esItem(lineas[indice] ?? '')
    ) {
      parrafo.push(lineas[indice] ?? '');
      indice += 1;
    }
    salida.push(
      <p key={clave++} className="my-4 leading-relaxed">
        {renderInline(parrafo.join(' '))}
      </p>,
    );
  }

  return salida;
}

/**
 * Marcado dentro de una línea.
 *
 * Se procesa por recorrido y no con reemplazo de cadenas, precisamente para no
 * construir HTML en ningún momento intermedio.
 */
function renderInline(texto: string): ReactNode[] {
  const salida: ReactNode[] = [];
  let resto = texto;
  let clave = 0;

  const patron =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/;

  while (resto.length > 0) {
    const coincidencia = patron.exec(resto);
    if (coincidencia === null) {
      salida.push(resto);
      break;
    }

    if (coincidencia.index > 0) salida.push(resto.slice(0, coincidencia.index));

    if (coincidencia[2] !== undefined) {
      salida.push(<strong key={clave++}>{coincidencia[2]}</strong>);
    } else if (coincidencia[4] !== undefined) {
      salida.push(<em key={clave++}>{coincidencia[4]}</em>);
    } else if (coincidencia[6] !== undefined) {
      salida.push(
        <code key={clave++} className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-sm">
          {coincidencia[6]}
        </code>,
      );
    } else if (coincidencia[8] !== undefined && coincidencia[9] !== undefined) {
      salida.push(renderLink(clave++, coincidencia[8], coincidencia[9]));
    }

    resto = resto.slice(coincidencia.index + coincidencia[0].length);
  }

  return salida;
}

/**
 * Enlace con destino comprobado.
 *
 * Solo se admiten rutas del propio sitio y `http`/`https`/`mailto`. Un
 * `javascript:` escrito en un contenido editorial sería ejecución de código
 * desde el CMS, y la política de contenido no lo detendría porque no es un
 * script en línea sino la acción de un enlace.
 *
 * Los enlaces externos abren en la misma pestaña, salvo que se marquen: abrir
 * ventanas sin avisar desorienta, y `noopener` sin `target` no hace falta.
 */
function renderLink(clave: number, etiqueta: string, destino: string): ReactNode {
  const seguro = /^(\/|https?:\/\/|mailto:|#)/i.test(destino) && !/^javascript:/i.test(destino);

  if (!seguro) {
    // No se descarta en silencio: se muestra el texto para que quien escribió
    // vea que su enlace no salió y pueda corregirlo.
    return (
      <span key={clave} title="Enlace no admitido">
        {etiqueta}
      </span>
    );
  }

  const externo = /^https?:\/\//i.test(destino);
  return (
    <a
      key={clave}
      href={destino}
      className="font-medium text-[var(--color-accent-ink)] underline underline-offset-4"
      {...(externo ? { rel: 'noopener noreferrer' } : {})}
    >
      {etiqueta}
      {externo && <span className="sr-only"> (se abre en otro sitio)</span>}
    </a>
  );
}
