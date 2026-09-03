import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { hashToken, newOpaqueToken, newPublicId } from '../../src/platform/kernel/ids';

/**
 * Arranque de la primera Secretaría Ejecutiva.
 *
 * **Por qué hace falta un guion y no una pantalla.** Nombrar exige el permiso
 * `access.role.assign`, que en el catálogo solo tiene la Secretaría Ejecutiva.
 * El Superadmin raíz no lo tiene y no debe tenerlo: administra la plataforma y
 * no gobierna el sindicato (docs/PERMISSIONS.md §8). En un despliegue nuevo no
 * existe todavía ninguna Secretaría, de modo que no hay nadie dentro del sistema
 * capaz de crear la primera. Ese primer nombramiento viene necesariamente de
 * fuera, igual que la contraseña del actor raíz.
 *
 * El guion se **niega a ejecutarse** si ya existe una Secretaría vigente: a
 * partir de ese momento los nombramientos son un acto institucional que ocurre
 * dentro de la plataforma, con su motivo escrito y su registro en la bitácora,
 * y una puerta trasera desde la consola dejaría de tener justificación.
 */

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (connectionString === undefined || connectionString === '') {
  throw new Error('Falta DIRECT_URL (o DATABASE_URL).');
}

const appUrl = (process.env['APP_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function preguntar(texto: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    rl.question(texto, (respuesta) => {
      rl.close();
      resolve(respuesta.trim());
    });
  });
}

async function main(): Promise<void> {
  const rol = await prisma.role.findUnique({ where: { code: 'EXECUTIVE_SECRETARY' }, select: { id: true } });
  if (rol === null) {
    throw new Error('El catálogo de roles no está sembrado. Ejecute primero `npm run db:seed`.');
  }

  const ahora = new Date();
  const vigente = await prisma.roleAssignment.findFirst({
    where: {
      roleId: rol.id,
      revokedAt: null,
      startsAt: { lte: ahora },
      OR: [{ endsAt: null }, { endsAt: { gt: ahora } }],
    },
    select: { id: true, user: { select: { email: true } } },
  });

  if (vigente !== null) {
    const correo = vigente.user.email;
    const local = correo.slice(0, correo.indexOf('@'));
    const enmascarado = local.length <= 3 ? `${local[0] ?? ''}…` : `${local.slice(0, 2)}…${local.slice(-1)}`;
    throw new Error(
      `Ya existe una Secretaría Ejecutiva vigente (${enmascarado}${correo.slice(correo.indexOf('@'))}). ` +
        'Los nombramientos posteriores se realizan desde la plataforma, en Gestión → Nombramientos, ' +
        'donde quedan con motivo escrito y registro en la bitácora.',
    );
  }

  console.log('\nArranque de la primera Secretaría Ejecutiva.');
  console.log('Se creará la cuenta y se imprimirá un enlace de activación de un solo uso.\n');

  const email = (await preguntar('Correo electrónico: ')).toLowerCase();
  const givenName = await preguntar('Nombre: ');
  const familyName = await preguntar('Primer apellido: ');
  const secondFamilyName = await preguntar('Segundo apellido (opcional): ');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('El correo no tiene un formato válido.');
  if (givenName === '' || familyName === '') throw new Error('El nombre y el primer apellido son obligatorios.');

  const duplicado = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (duplicado !== null) throw new Error('Ya existe una cuenta con ese correo.');

  const actorArranque = await prisma.actor.findFirst({ where: { kind: 'MIGRATION' }, select: { id: true } });
  if (actorArranque === null) {
    throw new Error('Falta el actor de migración. Ejecute primero `npm run db:seed`.');
  }

  const token = newOpaqueToken();

  await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        publicId: newPublicId(),
        givenName,
        familyName,
        secondFamilyName: secondFamilyName === '' ? null : secondFamilyName,
        primaryEmail: email,
        createdByActorId: actorArranque.id,
        updatedByActorId: actorArranque.id,
      },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        personId: person.id,
        email,
        status: 'INVITED',
        mustChangePassword: true,
        createdByActorId: actorArranque.id,
        updatedByActorId: actorArranque.id,
      },
      select: { id: true },
    });

    await tx.actor.create({ data: { kind: 'PERSON', userId: user.id, label: `${givenName} ${familyName}` } });

    await tx.passwordReset.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    // El nombramiento se atribuye a la propia cuenta creada, porque no hay otra
    // persona en el sistema a quien atribuirlo. La bitácora lo registra como
    // acto de arranque, que es exactamente lo que es.
    await tx.roleAssignment.create({
      data: {
        userId: user.id,
        roleId: rol.id,
        grantedById: user.id,
        grantReason: 'Nombramiento de arranque de la primera Secretaría Ejecutiva, ejecutado desde la consola de operación.',
      },
    });

    await tx.securityEvent.create({
      data: {
        kind: 'PRIVILEGE_GRANTED',
        severity: 'CRITICAL',
        detail: { origen: 'guion de arranque', rol: 'EXECUTIVE_SECRETARY' },
        correlationId: `arranque-${Date.now()}`,
      },
    });
  });

  console.log('\nSecretaría Ejecutiva creada.');
  console.log('Enlace de activación, válido siete días y de un solo uso:\n');
  console.log(`  ${appUrl}/activar/${token}\n`);
  console.log('Entréguelo por un canal que no sea este registro y no vuelva a ejecutar este guion:');
  console.log('a partir de ahora los nombramientos se hacen en Gestión → Nombramientos.\n');
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
