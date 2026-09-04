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
 * Claves de la pasarela para las pruebas.
 *
 * Desde la Fase 4 el entorno exige valor para las seis (`ACTIVE_PHASE`), y con
 * razón: una instalación productiva no debe arrancar sin ellas. Una máquina de
 * desarrollo, en cambio, tiene `.env.local` con los campos vacíos hasta que
 * alguien pega sus claves de prueba, y ahí la exigencia dejaría sin correr a
 * toda la suite por una razón que nada tiene que ver con lo que prueba.
 *
 * Se rellenan **solo si faltan**: donde ya vienen puestas —la integración
 * continua las declara— se respetan, porque las pruebas de la pasarela firman
 * con ellas y pisarlas rompería justo lo que comprueban.
 *
 * Ninguna corresponde a una cuenta: llevan el prefijo que la plataforma espera y
 * el resto del texto dice en voz alta que no sirven para cobrar.
 */
const CLAVES_DE_PRUEBA: Record<string, string> = {
  STRIPE_FUERZA_SECRET_KEY: 'sk_test_pruebas_fuerza_no_es_una_cuenta_real',
  STRIPE_FUERZA_WEBHOOK_SECRET: 'whsec_pruebas_fuerza_no_es_una_cuenta_real',
  NEXT_PUBLIC_STRIPE_FUERZA_PUBLISHABLE_KEY: 'pk_test_pruebas_fuerza_no_es_una_cuenta_real',
  STRIPE_ALIANZA_SECRET_KEY: 'sk_test_pruebas_alianza_no_es_una_cuenta_real',
  STRIPE_ALIANZA_WEBHOOK_SECRET: 'whsec_pruebas_alianza_no_es_una_cuenta_real',
  NEXT_PUBLIC_STRIPE_ALIANZA_PUBLISHABLE_KEY: 'pk_test_pruebas_alianza_no_es_una_cuenta_real',
};

for (const [nombre, valor] of Object.entries(CLAVES_DE_PRUEBA)) {
  if ((process.env[nombre] ?? '') === '') process.env[nombre] = valor;
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
