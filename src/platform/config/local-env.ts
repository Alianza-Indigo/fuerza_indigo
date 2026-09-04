import { loadEnvConfig } from '@next/env';

/**
 * Carga `.env.local` con el mismo cargador que usa la aplicación.
 *
 * Las herramientas del repositorio —migraciones, semillas, pruebas de
 * integración— tienen que ver el valor que verá el servidor y no una versión
 * distinta del mismo archivo. El cargador nativo de Node no expande variables y
 * el de Next sí: leer el mismo archivo con los dos da dos valores distintos
 * para un hash Argon2id, y ninguno de los dos avisa (véase `env-file.ts`).
 *
 * `@next/env` **omite `.env.local` cuando `NODE_ENV` vale `test`**, para que un
 * proyecto no arrastre a sus pruebas los secretos de quien las ejecuta. Aquí
 * hace falta lo contrario y está dicho en `docs/ENVIRONMENT.md`: las pruebas de
 * integración corren contra PostgreSQL de verdad con las credenciales de
 * desarrollo. Por eso se cambia el modo durante la lectura y se restaura
 * enseguida: es un desvío de tres líneas frente a mantener un segundo archivo
 * de entorno que se desincronizaría del primero.
 *
 * En la integración continua las variables ya vienen puestas por el flujo de
 * trabajo y no hay archivo que leer: volver a cargarlo allí pisaría valores de
 * otra máquina, así que no se hace.
 */
export function loadLocalEnv(cwd: string = process.cwd()): void {
  if (process.env['CI'] === 'true') return;

  // `NODE_ENV` está declarado de solo lectura para que nadie lo cambie en medio
  // de la aplicación. Aquí se cambia y se restaura dentro de la misma función,
  // antes de que se haya leído ninguna configuración, que es el único momento
  // en que hacerlo no puede confundir a nada.
  const entorno = process.env as Record<string, string | undefined>;
  const modoOriginal = entorno['NODE_ENV'];
  if (modoOriginal === 'test') entorno['NODE_ENV'] = 'development';

  try {
    loadEnvConfig(cwd, true, { info: () => undefined, error: () => undefined });
  } finally {
    if (modoOriginal === undefined) delete entorno['NODE_ENV'];
    else entorno['NODE_ENV'] = modoOriginal;
  }
}
