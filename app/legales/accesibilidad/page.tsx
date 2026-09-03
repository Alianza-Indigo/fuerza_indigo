import { PageShell, Card } from '@/design-system/primitives';

export const metadata = { title: 'Accesibilidad' };

/**
 * Declaración de accesibilidad.
 *
 * Dice lo que la plataforma cumple **hoy**, no lo que aspira a cumplir: una
 * declaración que promete de más es peor que ninguna, porque quien la lee toma
 * decisiones basándose en ella.
 */
export default function AccessibilityPage() {
  return (
    <PageShell
      title="Accesibilidad"
      description="Qué cumple hoy esta plataforma y qué está en construcción. Sin promesas por adelantado."
    >
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Lo que ya funciona</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            <li>Todos los campos tienen etiqueta visible, nunca solo texto de marcador.</li>
            <li>Los errores se muestran junto al campo que los provoca, en lenguaje claro.</li>
            <li>El foco del teclado es siempre visible y el orden de recorrido es el de lectura.</li>
            <li>Hay un enlace para saltar directamente al contenido.</li>
            <li>Los objetivos táctiles miden al menos 44 píxeles.</li>
            <li>La ampliación del texto no está bloqueada: puedes acercar hasta el 500 %.</li>
            <li>Si tu sistema pide reducir el movimiento, la plataforma lo respeta.</li>
            <li>El tema claro y el oscuro siguen la preferencia de tu sistema.</li>
            <li>Las tablas anchas se desplazan dentro de su propio marco, sin mover la página entera.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Lo que está en construcción</h2>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            El centro de preferencias sensoriales —control de densidad visual, modo de enfoque y tamaño de texto
            persistente por persona— forma parte de la siguiente fase de construcción, junto con el sitio público
            completo. Hasta entonces, esta plataforma respeta las preferencias que configures en tu sistema
            operativo o en tu navegador.
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Si algo te impide usar la plataforma</h2>
          <p className="mt-3 text-sm">
            Escríbenos a{' '}
            <a href="mailto:contacto@fuerzaindigo.lat" className="underline underline-offset-4">
              contacto@fuerzaindigo.lat
            </a>{' '}
            y dinos qué te bloquea. No necesitas usar términos técnicos: describe qué intentabas hacer y qué pasó.
          </p>
        </Card>
      </div>
    </PageShell>
  );
}
