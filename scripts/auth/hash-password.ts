#!/usr/bin/env tsx
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { hashPassword, checkPasswordPolicy } from '../../src/platform/auth/password';

/**
 * Genera el hash Argon2id del Superadmin raíz (PRD §4.4).
 *
 *   npm run auth:hash-password
 *
 * La contraseña se pide por entrada oculta y **nunca** se escribe en el
 * historial del intérprete, en un archivo ni en un registro. Lo único que sale
 * por pantalla es el hash, que es lo que va en `SUPERADMIN_PASSWORD_HASH`.
 *
 * No se acepta pasar la contraseña como argumento: quedaría en el historial del
 * intérprete y en la lista de procesos, visible para cualquiera en la máquina.
 */

/** Lee sin mostrar lo tecleado ni dejar rastro en el terminal. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const output = stdout as NodeJS.WriteStream & { muted?: boolean };
    const originalWrite = output.write.bind(output);

    output.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      if (output.muted === true && typeof chunk === 'string' && !chunk.includes('\n')) return true;
      return (originalWrite as (c: unknown, ...r: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof output.write;

    rl.question(prompt, (answer) => {
      output.muted = false;
      output.write = originalWrite;
      rl.close();
      stdout.write('\n');
      resolve(answer);
    });
    output.muted = true;
  });
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    console.error(
      'Este comando no acepta la contraseña como argumento: quedaría en el historial del intérprete\n' +
        'y en la lista de procesos. Ejecútelo sin argumentos y escríbala cuando se la pida.',
    );
    process.exit(1);
  }

  console.log('Generación del hash de la contraseña del Superadmin raíz.');
  console.log('Lo que teclee no se mostrará ni quedará guardado en ninguna parte.\n');

  const password = await askHidden('Contraseña: ');
  const confirmation = await askHidden('Repita la contraseña: ');

  if (password !== confirmation) {
    console.error('\nLas dos contraseñas no coinciden. No se generó nada.');
    process.exit(1);
  }

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    console.error('\nLa contraseña no cumple la política:');
    for (const problem of policy.problems) console.error(`  · ${problem}`);
    process.exit(1);
  }

  const { hash, params } = await hashPassword(password);

  console.log('\nCopie esta línea en su archivo de entorno o en el panel de Vercel:\n');
  console.log(`SUPERADMIN_PASSWORD_HASH=${hash}\n`);
  console.log(
    `Parámetros usados: Argon2id, memoria ${params.memoryCost} KiB, ${params.timeCost} iteraciones, paralelismo ${params.parallelism}.`,
  );
  console.log('No guarde la contraseña original en ningún archivo del repositorio.');
}

main().catch((error: unknown) => {
  console.error('No se pudo generar el hash:', error instanceof Error ? error.message : error);
  process.exit(1);
});
