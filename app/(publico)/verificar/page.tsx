import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Field, PageShell, Prose, Section, SubmitButton } from '@/design-system/primitives';


export const metadata: Metadata = {
  title: 'Verificar una credencial',
  description:
    'Comprueba si una credencial de Fuerza Índigo está vigente. Escanea su código QR o teclea el código impreso.',
};

/**
 * Entrada del verificador público (PRD §7.4, F4-CRE-003).
 *
 * Quien escanea el QR llega directo al resultado; esta pantalla es para quien
 * **no puede escanear**: el código va impreso en la credencial en bloques de
 * cinco, con un alfabeto elegido para poder dictarlo por teléfono sin
 * confundir la I con el 1 ni la O con el 0. En una oficina territorial sin
 * cámara, esta es la única puerta que existe.
 */
export default async function VerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  // El formulario envía por GET, sin acción de servidor ni JavaScript: así
  // funciona igual con el guion desactivado, en un navegador viejo de una
  // oficina territorial o detrás de un proxy que no deja pasar `POST`. Verificar
  // no cambia nada, así que `GET` es además lo que corresponde.
  const { codigo } = await searchParams;
  const limpio = (codigo ?? '').trim().replace(/\s+/g, '');
  // Sin código no hay nada que consultar, y llevar a la pantalla de resultado
  // con las manos vacías registraría una consulta que nadie hizo.
  if (limpio !== '') redirect(`/verificar/${encodeURIComponent(limpio)}`);

  return (
    <PageShell
      title="Verificar una credencial"
      description="Comprueba si una credencial de Fuerza Índigo está vigente en este momento."
    >
      <div className="space-y-8">
        <Section title="Escribe el código impreso">
          <Card>
            <form action="/verificar" method="get" className="space-y-4">
              <Field
                name="codigo"
                label="Código de verificación"
                required
                hint="Está impreso en la credencial, en cuatro bloques de cinco. Los espacios dan igual."
                autoComplete="off"
              />
              <SubmitButton>Verificar</SubmitButton>
            </form>
          </Card>
        </Section>

        <Prose>
          <h2>Qué vas a ver</h2>
          <p>
            Solo lo que hace falta para saber si el documento vale: el nombre autorizado, qué acredita,
            su estado y hasta cuándo. No verás datos de contacto, ni el número de miembro, ni ninguna
            otra información de la persona.
          </p>
          <h2>Qué registramos</h2>
          <p>
            Contamos cuántas veces se usa el verificador, por hora y por tipo de dispositivo. No
            guardamos tu dirección, ni quién eres, ni qué credencial consultaste tú en particular. Sirve
            para saber si esto se usa, no para saber quién mira a quién.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
