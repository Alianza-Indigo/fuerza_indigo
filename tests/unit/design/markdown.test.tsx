import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '@/design-system/markdown';

/**
 * Renderizador de Markdown.
 *
 * Lo que estas pruebas protegen no es el formato bonito: es que **ningún
 * contenido editorial pueda inyectar marcado ni ejecución**. El CMS lo escriben
 * personas con facultad de comunicación, no atacantes; pero una cuenta
 * comprometida de esa área no debe poder convertir una nota de prensa en un
 * vector, y la política de contenido no detendría un `javascript:` en un enlace
 * porque no es un script en línea.
 *
 * Se renderiza a texto para poder afirmar sobre la salida real, no sobre el
 * código que la produce.
 */

const pintar = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe('el marcado del contenido nunca se interpreta como HTML', () => {
  it('una etiqueta escrita en el contenido sale como texto', () => {
    const salida = pintar('Hola <script>alert(1)</script> mundo');
    expect(salida).not.toContain('<script>');
    expect(salida).toContain('&lt;script&gt;');
  });

  it('un atributo de evento queda dentro de un nodo de texto, no de una etiqueta', () => {
    const salida = pintar('<img src=x onerror="alert(1)">');
    // Lo que importa no es que la cadena «onerror» desaparezca —sale escapada,
    // como texto que se lee— sino que no exista ninguna etiqueta real.
    expect(salida).not.toMatch(/<img/i);
    expect(salida).toContain('&lt;img');
    // Las comillas del atributo también salen escapadas: no pueden cerrar un
    // atributo del marcado que las rodea.
    expect(salida).not.toContain('onerror="alert');
  });

  it('un iframe queda como texto', () => {
    expect(pintar('<iframe src="https://ejemplo.invalid"></iframe>')).not.toContain('<iframe');
  });
});

describe('enlaces', () => {
  it('admite rutas del sitio', () => {
    const salida = pintar('Ve a [las delegaciones](/delegaciones).');
    expect(salida).toContain('href="/delegaciones"');
  });

  it('admite enlaces externos y avisa de que salen del sitio', () => {
    const salida = pintar('[Diario Oficial](https://dof.gob.mx)');
    expect(salida).toContain('href="https://dof.gob.mx"');
    expect(salida).toContain('rel="noopener noreferrer"');
    expect(salida).toContain('se abre en otro sitio');
  });

  it('admite correo', () => {
    expect(pintar('[Escríbenos](mailto:contacto@ejemplo.lat)')).toContain('href="mailto:contacto@ejemplo.lat"');
  });

  it('rechaza javascript: y no lo convierte en enlace', () => {
    // La política de contenido no detendría esto: no es un script en línea,
    // es la acción de un enlace.
    const salida = pintar('[Pulsa aquí](javascript:alert(1))');
    expect(salida).not.toContain('javascript:');
    expect(salida).not.toContain('<a');
    // El texto sí se muestra, para que quien escribió vea que no salió.
    expect(salida).toContain('Pulsa aquí');
  });

  it('rechaza data: y otros esquemas', () => {
    for (const destino of ['data:text/html,<script>alert(1)</script>', 'vbscript:msgbox', 'file:///etc/passwd']) {
      const salida = pintar(`[texto](${destino})`);
      expect(salida, destino).not.toContain('<a');
    }
  });
});

describe('estructura', () => {
  it('los encabezados empiezan en h2, porque la página ya tiene su h1', () => {
    const salida = pintar('# Título de sección');
    expect(salida).toContain('<h2');
    expect(salida).not.toContain('<h1');
  });

  it('no baja de h6 aunque se aniden más niveles', () => {
    expect(pintar('###### muy profundo')).toContain('<h6');
  });

  it('pinta listas con y sin orden', () => {
    expect(pintar('- uno\n- dos')).toContain('<ul');
    expect(pintar('1. uno\n2. dos')).toContain('<ol');
  });

  it('agrupa las líneas seguidas en un solo párrafo', () => {
    const salida = pintar('primera línea\nsegunda línea\n\notro párrafo');
    expect((salida.match(/<p /g) ?? []).length).toBe(2);
  });

  it('pinta citas y código', () => {
    expect(pintar('> una cita del estatuto')).toContain('<blockquote');
    expect(pintar('```\nun bloque\n```')).toContain('<pre');
    expect(pintar('el `identificador` en línea')).toContain('<code');
  });

  it('pinta negrita y cursiva', () => {
    expect(pintar('esto es **importante**')).toContain('<strong>importante</strong>');
    expect(pintar('esto es *matizado*')).toContain('<em>matizado</em>');
  });
});

describe('robustez', () => {
  it('un contenido vacío no rompe', () => {
    expect(pintar('')).toBe('');
    expect(pintar('\n\n\n')).toBe('');
  });

  it('un marcado a medias se muestra tal cual, sin romper la página', () => {
    // Que alguien deje un asterisco suelto no puede tumbar una noticia.
    expect(pintar('un **cierre que falta')).toContain('un **cierre que falta');
    expect(pintar('[enlace sin destino]')).toContain('[enlace sin destino]');
  });

  it('conserva los acentos y la eñe', () => {
    expect(pintar('Año de la inclusión en Michoacán')).toContain('Año de la inclusión en Michoacán');
  });
});
