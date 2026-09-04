import { Client } from 'pg';

import { loadLocalEnv } from '@/platform/config/local-env';

/**
 * Preparación única de las pruebas de extremo a extremo.
 *
 * Hace dos cosas, y las dos existen por una razón concreta:
 *
 * 1. **Deja la entrada pública en cero.** El formulario corta el envío en serie
 *    desde un mismo origen, y en estas pruebas todos los envíos vienen del
 *    mismo: al tercer o cuarto pase de la suite contra la misma base, el límite
 *    salta y una prueba falla por su propio éxito anterior. Bajarlo o
 *    desactivarlo sería quitar una protección real para que las pruebas
 *    pasaran; borrar lo que ellas mismas escribieron no quita nada.
 *
 * 2. **Comprueba que el aviso de privacidad esté publicado**, y si no lo está
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
}
