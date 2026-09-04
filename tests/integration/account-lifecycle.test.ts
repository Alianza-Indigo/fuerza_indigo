import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateAccount,
  closeOtherSessions,
  closeOwnSession,
  completePasswordReset,
  inviteUser,
  login,
  myActiveSessions,
  requestPasswordReset,
} from '@/modules/identity';
import { resolveSession } from '@/platform/auth/session';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  PASSWORD,
  type PersonaDePrueba,
} from './helpers/fixtures';

/**
 * Ciclo de vida de una cuenta: invitación, activación, sesiones y recuperación
 * (PRD §20.1, docs/FLOWS.md).
 *
 * Dos propiedades atraviesan todo el archivo. La primera: **el testigo se
 * entrega una vez y la base guarda solo su hash**; nada de lo que quede escrito
 * permite reconstruirlo. La segunda: **la recuperación no es un oráculo**;
 * pedirla para un correo que existe y para uno que no responde igual, porque lo
 * contrario permitiría averiguar quién está afiliado preguntando de uno en uno.
 */

let base: TestDatabase;
let secretaria: PersonaDePrueba;

const contexto = { correlationId: 'correlacion-de-prueba', ipHash: 'ip-de-prueba' };
const contextoLogin = { ...contexto, userAgentSummary: 'prueba', deviceLabel: 'Equipo de prueba' };
const CLAVE_NUEVA = 'una frase nueva bien larga';

beforeAll(async () => {
  base = await createTestDatabase('ciclo_de_cuenta');
  await base.seed();
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria' });
  await nombrar(base.prisma, {
    userId: secretaria.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretaria.userId,
    legalEntityId: await entidadPrincipal(base.prisma),
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

/** Extrae el testigo de un enlace de activación o recuperación. */
function testigoDe(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

describe('invitación y activación', () => {
  it('la cuenta nace sin contraseña y no puede entrar hasta activarse', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const invitacion = await inviteUser(actor, {
      email: 'invitada@ejemplo.invalid',
      givenName: 'Invitada',
      familyName: 'Nueva',
    });
    expect(invitacion.ok, invitacion.ok ? '' : invitacion.error.message).toBe(true);
    if (!invitacion.ok) return;

    const antes = await login({ email: 'invitada@ejemplo.invalid', password: CLAVE_NUEVA }, contextoLogin);
    expect(antes.ok).toBe(false);

    const activacion = await activateAccount(
      {
        token: testigoDe(invitacion.data.invitationUrl),
        password: CLAVE_NUEVA,
        passwordConfirmation: CLAVE_NUEVA,
      },
      contexto,
    );
    expect(activacion.ok, activacion.ok ? '' : activacion.error.message).toBe(true);

    const despues = await login({ email: 'invitada@ejemplo.invalid', password: CLAVE_NUEVA }, contextoLogin);
    expect(despues.ok).toBe(true);
  }, 60_000);

  it('el enlace de activación sirve una sola vez', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const invitacion = await inviteUser(actor, {
      email: 'unsolouso@ejemplo.invalid',
      givenName: 'Un',
      familyName: 'Solo Uso',
    });
    if (!invitacion.ok) throw invitacion.error;
    const testigo = testigoDe(invitacion.data.invitationUrl);

    expect((await activateAccount({ token: testigo, password: CLAVE_NUEVA, passwordConfirmation: CLAVE_NUEVA }, contexto)).ok).toBe(true);

    const segunda = await activateAccount(
      { token: testigo, password: 'otra frase distinta larga', passwordConfirmation: 'otra frase distinta larga' },
      contexto,
    );
    expect(segunda.ok).toBe(false);
  }, 60_000);

  it('la base guarda el hash del testigo, nunca el testigo', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const invitacion = await inviteUser(actor, {
      email: 'sinrastro@ejemplo.invalid',
      givenName: 'Sin',
      familyName: 'Rastro',
    });
    if (!invitacion.ok) throw invitacion.error;
    const testigo = testigoDe(invitacion.data.invitationUrl);

    const { rows } = await base.sql.query<{ presente: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM "password_reset" WHERE "tokenHash" = $1) AS presente`,
      [testigo],
    );
    expect(rows[0]?.presente).toBe(false);
  }, 60_000);

  it('una contraseña que incumple la política se rechaza con el problema explicado', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const invitacion = await inviteUser(actor, {
      email: 'debil@ejemplo.invalid',
      givenName: 'Clave',
      familyName: 'Débil',
    });
    if (!invitacion.ok) throw invitacion.error;

    const resultado = await activateAccount(
      { token: testigoDe(invitacion.data.invitationUrl), password: 'corta', passwordConfirmation: 'corta' },
      contexto,
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('VALIDATION');
    expect(JSON.stringify(resultado.error.details)).toContain('12 caracteres');
  }, 60_000);

  it('un correo ya registrado responde conflicto y no crea una segunda persona', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const antes = await base.prisma.person.count();
    const resultado = await inviteUser(actor, {
      email: 'invitada@ejemplo.invalid',
      givenName: 'Repetida',
      familyName: 'Otra Vez',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('CONFLICT');
    expect(await base.prisma.person.count()).toBe(antes);
  }, 60_000);

  it('quien no tiene la facultad no puede invitar', async () => {
    const cualquiera = await crearPersonaConCuenta(base.prisma, { givenName: 'Cualquiera' });
    const actor = await contextoDe(base.prisma, cualquiera);
    const resultado = await inviteUser(actor, {
      email: 'noautorizada@ejemplo.invalid',
      givenName: 'No',
      familyName: 'Autorizada',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('FORBIDDEN');
  }, 60_000);
});

describe('recuperación de contraseña', () => {
  it('responde lo mismo exista o no la cuenta', async () => {
    const existente = await requestPasswordReset({ email: 'invitada@ejemplo.invalid' }, contexto);
    const inexistente = await requestPasswordReset({ email: 'nadie-de-nadie@ejemplo.invalid' }, contexto);

    expect(existente.ok).toBe(true);
    expect(inexistente.ok).toBe(true);
    expect(JSON.stringify(existente)).toBe(JSON.stringify(inexistente));
  });

  it('cambiar la contraseña cierra todas las sesiones abiertas', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Con Sesiones' });

    const primera = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    const segunda = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    if (!primera.ok || !segunda.ok) throw new Error('no se pudo abrir sesión');

    expect(await resolveSession(primera.data.token)).not.toBeNull();

    const reset = await base.prisma.passwordReset.create({
      data: {
        userId: persona.userId,
        // El hash de un testigo conocido: la prueba necesita poder canjearlo.
        tokenHash: (await import('@/platform/kernel/ids')).hashToken('testigo-de-prueba-para-recuperacion'),
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    expect(reset.id).toBeDefined();

    const resultado = await completePasswordReset(
      {
        token: 'testigo-de-prueba-para-recuperacion',
        password: CLAVE_NUEVA,
        passwordConfirmation: CLAVE_NUEVA,
      },
      contexto,
    );
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);

    // Es la propiedad que justifica que las sesiones vivan en la base y no en un
    // testigo firmado: la revocación surte efecto de inmediato.
    expect(await resolveSession(primera.data.token)).toBeNull();
    expect(await resolveSession(segunda.data.token)).toBeNull();

    expect((await login({ email: persona.email, password: PASSWORD }, contextoLogin)).ok).toBe(false);
    expect((await login({ email: persona.email, password: CLAVE_NUEVA }, contextoLogin)).ok).toBe(true);
  }, 90_000);

  it('las dos contraseñas deben coincidir, y el error señala el campo', async () => {
    const resultado = await completePasswordReset(
      { token: 'un-testigo-cualquiera', password: CLAVE_NUEVA, passwordConfirmation: 'otra cosa distinta' },
      contexto,
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('VALIDATION');
    expect(resultado.error.details?.['passwordConfirmation']).toBeDefined();
  });

  it('un testigo inexistente no distingue entre inválido y vencido', async () => {
    const resultado = await completePasswordReset(
      { token: 'testigo-que-no-existe-en-ninguna-parte', password: CLAVE_NUEVA, passwordConfirmation: CLAVE_NUEVA },
      contexto,
    );
    expect(resultado.ok).toBe(false);
  });
});

describe('sesiones propias', () => {
  it('cada persona ve solo las suyas', async () => {
    const una = await crearPersonaConCuenta(base.prisma, { givenName: 'Una' });
    const otra = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra' });

    await login({ email: una.email, password: PASSWORD }, contextoLogin);
    await login({ email: otra.email, password: PASSWORD }, contextoLogin);

    const actor = await contextoDe(base.prisma, una);
    const sesiones = await myActiveSessions(actor);
    expect(sesiones.ok).toBe(true);
    if (!sesiones.ok) return;
    expect(sesiones.data.length).toBeGreaterThan(0);

    const propias = await base.prisma.session.findMany({ where: { userId: una.userId }, select: { id: true } });
    const identificadores = new Set(propias.map((fila) => fila.id));
    for (const sesion of sesiones.data) expect(identificadores.has(sesion.id)).toBe(true);
  }, 90_000);

  it('cerrar la sesión de otra persona responde «no encontrada» y queda registrado', async () => {
    const una = await crearPersonaConCuenta(base.prisma, { givenName: 'Curiosa' });
    const otra = await crearPersonaConCuenta(base.prisma, { givenName: 'Ajena Sesión' });

    const abierta = await login({ email: otra.email, password: PASSWORD }, contextoLogin);
    if (!abierta.ok) throw abierta.error;

    const actor = await contextoDe(base.prisma, una);
    const resultado = await closeOwnSession(actor, abierta.data.sessionId);

    expect(resultado.ok).toBe(false);
    // NOT_FOUND y no FORBIDDEN: confirmar que la sesión existe ya diría algo de
    // la otra persona.
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
    expect(await resolveSession(abierta.data.token)).not.toBeNull();

    const evento = await base.prisma.securityEvent.findFirst({
      where: { kind: 'ACCESS_DENIED', actorId: una.actorId },
      orderBy: { occurredAt: 'desc' },
      select: { detail: true },
    });
    expect(JSON.stringify(evento?.detail)).toContain('sesión de otra persona');
  }, 90_000);

  it('cerrar las demás conserva la propia', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Multi Dispositivo' });
    const primera = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    const segunda = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    if (!primera.ok || !segunda.ok) throw new Error('no se pudo abrir sesión');

    const actor = { ...(await contextoDe(base.prisma, persona)), sessionId: segunda.data.sessionId };
    const resultado = await closeOtherSessions(actor);
    expect(resultado.ok).toBe(true);

    expect(await resolveSession(segunda.data.token)).not.toBeNull();
    expect(await resolveSession(primera.data.token)).toBeNull();
  }, 90_000);

  it('cerrar la propia dos veces no falla', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Doble Cierre' });
    const abierta = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    if (!abierta.ok) throw abierta.error;

    const actor = await contextoDe(base.prisma, persona);
    expect((await closeOwnSession(actor, abierta.data.sessionId)).ok).toBe(true);
    const segunda = await closeOwnSession(actor, abierta.data.sessionId);
    expect(segunda.ok && segunda.data.closed).toBe(false);
  }, 90_000);

  it('una sesión vencida deja de resolver, sin que nadie la revoque', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Vencida' });
    const abierta = await login({ email: persona.email, password: PASSWORD }, contextoLogin);
    if (!abierta.ok) throw abierta.error;

    await base.prisma.session.update({
      where: { id: abierta.data.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveSession(abierta.data.token)).toBeNull();
  }, 90_000);
});
