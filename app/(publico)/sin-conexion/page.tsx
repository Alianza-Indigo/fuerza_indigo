import Link from 'next/link';
import { Card, PageShell, Prose, Section } from '@/design-system/primitives';

export const metadata = {
  title: 'Sin conexión',
  // No se indexa: es una pantalla de emergencia del propio dispositivo, no
  // contenido que nadie deba encontrar en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Pantalla que se muestra cuando no hay red y la página pedida no está guardada
 * (F2-PWA-003).
 *
 * Existe como ruta de verdad y no como una cadena dentro del trabajador de
 * servicio, por dos razones: se guarda al instalar como cualquier otra página,
 * y lleva la cabecera, el pie y los tokens del sistema, de modo que quien se
 * queda sin señal no aterriza en una pantalla que parece de otro sitio.
 *
 * Dice qué se puede hacer sin conexión y qué no. Un «parece que estás sin
 * conexión» a secas deja a la persona probando el mismo botón otra vez.
 */
export default function SinConexionPage() {
  return (
    <PageShell
      title="Estás sin conexión"
      description="No pudimos cargar esta página porque ahora mismo no hay red."
      width="lectura"
    >
      <div className="space-y-8">
        <Section title="Qué puedes hacer ahora" level={2}>
          <Prose>
            <ul className="list-disc space-y-2 pl-6 marker:text-[var(--color-accent)]">
              <li>Volver a las páginas que ya habías abierto: siguen guardadas en este dispositivo.</li>
              <li>Seguir escribiendo en un formulario que tengas abierto. No cierres la pestaña.</li>
              <li>Reintentar cuando vuelva la señal; el navegador cargará la versión al día.</li>
            </ul>
          </Prose>
        </Section>

        <Section title="Qué no funciona sin conexión" level={2}>
          <Prose>
            <p>
              Enviar un formulario, entrar a tu cuenta y consultar cualquier información tuya necesitan red. No
              guardamos nada de eso en el dispositivo a propósito: un expediente o una solicitud de apoyo en la caché
              del navegador sobreviven al cierre de sesión y al préstamo del teléfono.
            </p>
          </Prose>
        </Section>

        <Card tone="warning">
          <Prose>
            <p>
              Si tu situación es una urgencia, el <strong>911</strong> funciona sin datos móviles, con cualquier
              compañía y sin saldo.
            </p>
          </Prose>
        </Card>

        <Prose>
          <p>
            <Link href="/" className="underline underline-offset-4">
              Volver al inicio
            </Link>
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
