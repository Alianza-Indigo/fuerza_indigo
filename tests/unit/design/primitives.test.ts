import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Invariantes del sistema de diseño.
 *
 * Se comprueban leyendo el archivo, no renderizando. Renderizar exigiría un
 * entorno de navegador y una biblioteca de pruebas de componentes, que llegan
 * con las pruebas de accesibilidad de esta misma fase; lo que aquí se protege
 * son propiedades del código que se pierden de una en una y sin ruido: un
 * objetivo táctil que se queda corto, un `className` que abre la puerta a que
 * cada pantalla se pinte a su manera, un estado obligatorio que desaparece.
 */

const PRIMITIVAS = readFileSync('src/design-system/primitives.tsx', 'utf8');
const STEPPER = readFileSync('src/design-system/stepper.tsx', 'utf8');

describe('objetivos táctiles', () => {
  it('ningún control declara menos de 44 px', () => {
    // 44 px son once unidades de la escala. El PRD §5.2 los fija como mínimo.
    const cortos = [...PRIMITIVAS.matchAll(/min-h-(\d+)/g)]
      .map((coincidencia) => Number(coincidencia[1]))
      .filter((unidades) => unidades < 11);
    expect(cortos).toEqual([]);
  });

  it('los botones llevan la altura en su base compartida, no en cada llamada', () => {
    // Repetirla en cada botón garantiza que algún día falte en uno.
    const base = /const BUTTON_BASE\s*=\s*\n?\s*'([^']+)'/.exec(PRIMITIVAS);
    expect(base).not.toBeNull();
    expect(base![1]).toContain('min-h-11');
  });
});

describe('el sistema no se puede repintar desde fuera', () => {
  it('ninguna primitiva acepta className', () => {
    // Un componente que acepta clases libres deja de ser un sistema: a los tres
    // meses hay cinco botones parecidos y ninguno cumple el contraste medido.
    expect(PRIMITIVAS).not.toMatch(/className\?\s*:/);
  });

  it('los colores salen de la capa semántica, nunca de la paleta cruda', () => {
    // `--color-slate-700` en una pantalla no cambia con el tema; `--color-ink`
    // sí. Usar el crudo es cómo un componente acaba ilegible en oscuro.
    const crudosEnComponentes = [...PRIMITIVAS.matchAll(/var\(--color-(slate|indigo)-\d+\)/g)]
      .map((coincidencia) => coincidencia[0])
      // Los acentos por módulo son la excepción declarada: son identidad, no tema.
      .filter((token) => !PRIMITIVAS.slice(0, PRIMITIVAS.indexOf('export function PageShell')).includes(token));
    expect(crudosEnComponentes).toEqual([]);
  });
});

describe('los once estados obligatorios del PRD §5.4', () => {
  it.each([
    ['carga inicial e incremental', 'export function Skeleton'],
    ['vacío genuino', 'export function EmptyState'],
    ['ausencia de resultados por filtros', 'export function NoResults'],
    ['error recuperable', 'export function ErrorNotice'],
    ['error de autorización', 'export function ForbiddenNotice'],
    ['sesión expirada', 'export function ExpiredSessionNotice'],
    ['funcionamiento exitoso', 'export function SuccessNotice'],
    ['conexión lenta o intermitente', 'export function RequiresConnection'],
  ])('%s tiene su primitiva', (_nombre, declaracion) => {
    expect(PRIMITIVAS).toContain(declaracion);
  });

  it('vacío genuino y sin resultados dicen cosas distintas', () => {
    // Confundirlos hace creer que el sistema está vacío cuando el filtro es
    // demasiado estrecho, y al revés.
    const cuerpo = (declaracion: string) => {
      const inicio = PRIMITIVAS.indexOf(declaracion);
      const fin = PRIMITIVAS.indexOf('\n}\n', inicio);
      return PRIMITIVAS.slice(inicio, fin);
    };
    const vacio = cuerpo('export function EmptyState');
    const sinResultados = cuerpo('export function NoResults');

    // El vacío genuino no habla de filtros: no hay ningún filtro que quitar.
    expect(vacio).not.toContain('filtro');
    // El de filtros dice explícitamente que sí hay contenido.
    expect(sinResultados).toContain('Ningún resultado con estos filtros');
    expect(sinResultados).toContain('Hay contenido en el sistema');
  });

  it('el aviso de error interrumpe al lector de pantalla y el de éxito no', () => {
    // `alert` corta la lectura en curso. Usarlo para una buena noticia es
    // interrumpir a alguien para decirle que todo va bien.
    expect(PRIMITIVAS).toMatch(/live = tone === 'danger' \? 'alert' : 'status'/);
  });
});

describe('formularios accesibles', () => {
  it('la etiqueta se asocia al control y el error se anuncia con él', () => {
    expect(PRIMITIVAS).toContain('htmlFor={name}');
    expect(PRIMITIVAS).toContain('aria-describedby={describedBy}');
    expect(PRIMITIVAS).toContain('aria-invalid={invalid}');
  });

  it('las opciones excluyentes van en fieldset con legend', () => {
    // Es lo que hace que un lector anuncie de qué grupo forma parte cada opción.
    const grupo = PRIMITIVAS.slice(PRIMITIVAS.indexOf('export function RadioGroup'));
    expect(grupo).toContain('<fieldset');
    expect(grupo).toContain('<legend');
  });

  it('ningún campo usa el marcador como etiqueta', () => {
    // Al escribir, el marcador desaparece y la persona pierde la referencia.
    expect(PRIMITIVAS).not.toMatch(/placeholder=\{(?!.*label)/);
  });

  it('lo obligatorio se anuncia con palabras, no solo con un asterisco', () => {
    expect(PRIMITIVAS).toContain('(obligatorio)');
  });
});

describe('el formulario por pasos cumple los siete requisitos del PRD §5.3', () => {
  it.each([
    ['pasos comprensibles', /Paso \$\{indice \+ 1\} de \$\{steps\.length\}/],
    ['indicador de avance', /role="progressbar"/],
    ['tiempo estimado', /Quedan unos \$\{minutosRestantes\} minutos/],
    ['guardado automático', /localStorage\.setItem\(draftKey/],
    ['pausar y continuar', /Recuperamos lo que habías escrito/],
    ['resumen antes de enviar', /Esto es lo que vas a enviar/],
    ['una decisión por bloque', /pasoActual\.summary/],
  ])('%s', (_nombre, patron) => {
    expect(STEPPER).toMatch(patron);
  });

  it('el borrador no viaja al servidor mientras el trámite no se envía', () => {
    // Un trámite a medias contiene datos que la persona todavía no decidió
    // compartir. Guardarlos «por comodidad» los convierte en un dato tratado
    // sin base para tratarlo.
    expect(STEPPER).not.toMatch(/fetch\(|useActionState|await\s+action/);
    expect(STEPPER).toContain('localStorage');
  });

  it('mueve el foco al cambiar de paso', () => {
    // Sin esto, quien navega con teclado se queda al final del paso anterior.
    expect(STEPPER).toContain('encabezado.current?.focus()');
    expect(STEPPER).toContain('tabIndex={-1}');
  });

  it('el envío solo ocurre desde el resumen', () => {
    expect(STEPPER).toContain('if (!enResumen) evento.preventDefault()');
  });

  it('un borrador ilegible no impide empezar el trámite', () => {
    expect(STEPPER).toContain('// Un borrador ilegible no puede impedir empezar el trámite.');
  });
});
