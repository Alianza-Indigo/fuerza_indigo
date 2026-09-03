import { existsSync } from 'node:fs';
import { hashPassword } from '@/platform/auth/password';

/**
 * Preparación del entorno en cada proceso de trabajo.
 *
 * `globalSetup` se ejecuta en el proceso principal y las pruebas en otro: las
 * variables no cruzan solas. En desarrollo se toman de `.env.local`; en la CI ya
 * vienen puestas por el flujo de trabajo, y volver a cargarlas allí las pisaría
 * con valores de otra máquina.
 */
if (process.env['CI'] !== 'true' && existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

/**
 * Contraseña del Superadmin raíz durante las pruebas.
 *
 * El hash se calcula aquí y **no** se escribe en ningún archivo del
 * repositorio: un hash de contraseña versionado es un secreto versionado,
 * aunque sea de prueba, y acaba copiado a un despliegue real por alguien que
 * supone que estaba ahí por algo.
 */
export const ROOT_TEST_PASSWORD = 'clave de prueba del superadmin raiz';

if ((process.env['SUPERADMIN_PASSWORD_HASH'] ?? '') === '') {
  const { hash } = await hashPassword(ROOT_TEST_PASSWORD);
  process.env['SUPERADMIN_PASSWORD_HASH'] = hash;
}
