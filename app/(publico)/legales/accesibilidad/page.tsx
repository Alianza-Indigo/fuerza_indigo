import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageShell, Prose, Section } from '@/design-system/primitives';

export const metadata: Metadata = {
  title: 'Declaración de accesibilidad',
  description:
    'Qué cumple hoy la plataforma de Fuerza Índigo, qué falta y cómo avisarnos si algo te impide usarla.',
};

/**
 * Declaración de accesibilidad (PRD §5.3, §16.4).
 *
 * Dice lo que la plataforma cumple **hoy**, no lo que aspira a cumplir: una
 * declaración que promete de más es peor que ninguna, porque quien la lee toma
 * decisiones basándose en ella.
 *
 * Es una página de código y no de gestor de contenidos a propósito. Describe el
 * comportamiento del programa, así que tiene que cambiar cuando cambia el
 * programa, en el mismo cambio y revisada por quien lo hizo. Un texto editable
 * aparte se queda viejo sin que nadie se entere.
 *
 * Los ajustes se hacen en `/accesibilidad`; aquí solo se declara el estado.
 */
export default function DeclaracionAccesibilidadPage() {
  return (
    <PageShell
      title="Declaración de accesibilidad"
      description="Qué cumple hoy esta plataforma y qué todavía no. Sin promesas por adelantado."
      width="lectura"
    >
      <div className="space-y-10">
        <Card tone="accent">
          <Prose>
            <p>
              Si lo que buscas es <strong>cambiar</strong> cómo se ve el sitio —tamaño del texto, espacio, movimiento,
              tema— eso se hace en{' '}
              <Link href="/accesibilidad" className="underline underline-offset-4">
                Cómo se ve este sitio
              </Link>
              . Esta página solo declara el estado de cumplimiento.
            </p>
          </Prose>
        </Card>

        <Section title="Grado de conformidad" level={2}>
          <Prose>
            <p>
              Fuerza Índigo se compromete con el nivel <strong>AA</strong> de las Pautas de Accesibilidad para el
              Contenido Web (WCAG) 2.2. La plataforma es <strong>parcialmente conforme</strong>: las partes
              construidas cumplen los criterios que se enumeran abajo, y quedan áreas del sitio todavía en
              construcción que se irán publicando por fases.
            </p>
            <p>
              El contraste de todos los colores de la interfaz no es una afirmación de buena fe: se calcula en cada
              ejecución de las pruebas automáticas a partir de los mismos valores que usa la hoja de estilos, y si un
              color baja del umbral la construcción falla. El texto normal supera 7:1 (nivel AAA) y ningún elemento de
              control baja de 3:1.
            </p>
          </Prose>
        </Section>

        <Section title="Lo que ya funciona" level={2}>
          <Prose>
            <ul className="list-disc space-y-2 pl-6 marker:text-[var(--color-accent)]">
              <li>Todos los campos tienen etiqueta visible, nunca solo texto de marcador.</li>
              <li>Los errores se muestran junto al campo que los provoca, en lenguaje claro y sin culpar a nadie.</li>
              <li>El foco del teclado es siempre visible y el orden de recorrido es el de lectura.</li>
              <li>Hay un enlace para saltar directamente al contenido, al principio de cada página.</li>
              <li>Los objetivos táctiles miden al menos 44 píxeles de lado.</li>
              <li>La ampliación del texto no está bloqueada: puedes acercar hasta el 200 % sin perder contenido.</li>
              <li>Si tu sistema pide reducir el movimiento, la plataforma lo respeta aunque no configures nada.</li>
              <li>El tema claro y el oscuro siguen la preferencia de tu sistema, y puedes fijar uno de los dos.</li>
              <li>
                Puedes ajustar tamaño de texto, densidad visual, movimiento y modo de enfoque, y la preferencia se
                guarda: si tienes cuenta, viaja contigo entre dispositivos.
              </li>
              <li>Las tablas anchas se desplazan dentro de su propio marco, sin mover la página entera.</li>
              <li>Los menús de navegación funcionan sin JavaScript y se manejan con el teclado.</li>
              <li>Nada parpadea, se reproduce solo ni cambia de página sin que lo pidas.</li>
              <li>El color nunca es el único medio para transmitir una información.</li>
            </ul>
          </Prose>
        </Section>

        <Section title="Lo que todavía no está" level={2}>
          <Prose>
            <p>
              Las secciones del sitio cuyo contenido depende de módulos aún no construidos —afiliación, directorio,
              herramientas, CIAN, CENI y eventos— existen como páginas y se irán llenando conforme se publiquen esos
              módulos. Mientras tanto lo dicen abiertamente en lugar de mostrar un ejemplo inventado.
            </p>
            <p>
              No hemos hecho todavía una auditoría externa con personas usuarias de lectores de pantalla. Está
              planeada antes de la apertura pública, y su informe se publicará aquí, diga lo que diga.
            </p>
          </Prose>
        </Section>

        <Section title="Si algo te impide usar la plataforma" level={2}>
          <Prose>
            <p>
              Escríbenos a{' '}
              <a href="mailto:contacto@fuerzaindigo.lat" className="underline underline-offset-4">
                contacto@fuerzaindigo.lat
              </a>{' '}
              y dinos qué te bloquea. No necesitas usar términos técnicos ni citar ninguna norma: describe qué
              intentabas hacer y qué pasó. Una barrera reportada es una barrera que podemos quitar.
            </p>
          </Prose>
        </Section>
      </div>
    </PageShell>
  );
}
