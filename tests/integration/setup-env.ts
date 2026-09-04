import { hashPassword } from '@/platform/auth/password';
import { loadLocalEnv } from '@/platform/config/local-env';

/**
 * Preparación del entorno en cada proceso de trabajo.
 *
 * `globalSetup` se ejecuta en el proceso principal y las pruebas en otro: las
 * variables no cruzan solas. En desarrollo se toman de `.env.local` con el mismo
 * cargador que usa el servidor; en la CI ya vienen puestas por el flujo de
 * trabajo, y volver a cargarlas allí las pisaría con valores de otra máquina.
 */
loadLocalEnv();

/**
 * Contraseña del Superadmin raíz durante las pruebas.
 *
 * El hash se calcula aquí y **no** se escribe en ningún archivo del
 * repositorio: un hash de contraseña versionado es un secreto versionado,
 * aunque sea de prueba, y acaba copiado a un despliegue real por alguien que
 * supone que estaba ahí por algo.
 */
export const ROOT_TEST_PASSWORD = 'clave de prueba del superadmin raiz';

/**
 * Se impone **siempre**, incluso si el entorno ya traía un hash.
 *
 * Las pruebas comprueban que esta contraseña abre y que otras no. Respetar el
 * valor heredado haría que el resultado dependiera de la clave que cada quien
 * tenga en su máquina o de la que la CI haya generado por su lado: la misma
 * prueba pasaría aquí y fallaría allá sin que nada del código cambiara. Un
 * hecho que se comprueba tiene que estar puesto por quien lo comprueba.
 */
process.env['SUPERADMIN_PASSWORD_HASH'] = (await hashPassword(ROOT_TEST_PASSWORD)).hash;
