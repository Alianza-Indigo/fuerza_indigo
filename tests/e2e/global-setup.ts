import { Client } from 'pg';

import { loadLocalEnv } from '@/platform/config/local-env';
import { prepararCuentas } from './cuentas';

/**
 * Preparación única de las pruebas de extremo a extremo.
 *
 * Hace tres cosas, y las tres existen por una razón concreta:
 *
 * 1. **Deja la entrada pública en cero.** El formulario corta el envío en serie
 *    desde un mismo origen, y en estas pruebas todos los envíos vienen del
 *    mismo: al tercer o cuarto pase de la suite contra la misma base, el límite
 *    salta y una prueba falla por su propio éxito anterior. Bajarlo o
 *    desactivarlo sería quitar una protección real para que las pruebas
 *    pasaran; borrar lo que ellas mismas escribieron no quita nada.
 *
 * 2. **Prepara las cuentas de las pantallas con sesión.** La Fase 4 construye
 *    casi todo detrás de una sesión, y la puerta universal exige validar la
 *    accesibilidad y las dos anchuras de pantalla: sin cuentas, esa validación
 *    dejaría fuera la mayor parte de la fase. La contraseña se pasa a las
 *    pruebas por `E2E_PASSWORD`, nunca por un archivo del repositorio.
 *
 * 3. **Comprueba que el aviso de privacidad esté publicado**, y si no lo está
 *    lo dice con todas sus letras en vez de dejar que cinco pruebas fallen con
 *    un mensaje que no explica nada. Publicarlo es un acto de la organización y
 *    la semilla lo deja en borrador a propósito (ADR-0045), así que en una
 *    instalación nueva **hay que publicarlo** antes de correr esto.
 */
export default async function globalSetup(): Promise<void> {
  loadLocalEnv();

  const connectionString = process.env['DIRECT_URL'];
  if (connectionString === undefined || connectionString === '') {
    throw new Error('Las pruebas de extremo a extremo necesitan DIRECT_URL. Consulte docs/ENVIRONMENT.md.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query<{ publicados: string }>(
      `SELECT count(*)::text AS publicados FROM consent_version
       WHERE code = 'PRIVACY_NOTICE_PUBLIC_INTAKE' AND status = 'PUBLISHED'`,
    );

    if (Number(rows[0]?.publicados ?? '0') === 0) {
      throw new Error(
        'No hay ningún aviso de privacidad publicado para la entrada pública, así que el formulario\n' +
          'se negará a recabar datos y las pruebas del formulario fallarán.\n' +
          'La semilla lo deja en borrador a propósito: publicarlo es un acto de la organización.\n' +
          "Para correr las pruebas, publíquelo:\n" +
          "  UPDATE consent_version SET status = 'PUBLISHED' WHERE code = 'PRIVACY_NOTICE_PUBLIC_INTAKE';",
      );
    }

    await client.query('DELETE FROM support_request');
  } finally {
    await client.end();
  }

  const cuentas = await prepararCuentas(connectionString);
  // Se comparte por el entorno del proceso: las pruebas corren en el mismo, y
  // así la contraseña no toca el disco ni el repositorio.
  process.env['E2E_PASSWORD'] = cuentas.password;
  process.env['E2E_EMAIL_PERSONA'] = cuentas.persona;
  process.env['E2E_EMAIL_SECRETARIA'] = cuentas.secretaria;
}
