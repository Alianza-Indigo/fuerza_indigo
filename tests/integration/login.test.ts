import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login } from '@/modules/identity';
import { RATE_LIMITS, checkRateLimit, lockoutFor } from '@/platform/auth/rate-limit';
import { resolveSession } from '@/platform/auth/session';
import { hashToken } from '@/platform/kernel/ids';
import { hashPassword } from '@/platform/auth/password';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { crearPersonaConCuenta, PASSWORD, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Inicio de sesión (PRD §20.1, docs/SECURITY.md §2).
 *
 * La propiedad que estas pruebas protegen es la indistinguibilidad: una cuenta
 * que no existe, una contraseña incorrecta y una cuenta deshabilitada responden
 * **lo mismo**. Cualquier diferencia —en el mensaje, en el código, en el tiempo—
 * convierte el formulario de acceso en un instrumento para enumerar el padrón de
 * un sindicato de personas neurodivergentes, que es exactamente el dato que este
 * proyecto no puede dejar filtrar.
 */

let base: TestDatabase;
let activa: PersonaDePrueba;
let deshabilitada: PersonaDePrueba;
let invitada: PersonaDePrueba;

const contexto = (ipHash: string | null = 'ip-de-prueba') => ({
  correlationId: `correlacion-${Math.random().toString(36).slice(2)}`,
  ipHash,
  userAgentSummary: 'prueba de integración',
  deviceLabel: 'Equipo de prueba',
});

beforeAll(async () => {
  base = await createTestDatabase('acceso');
  activa = await crearPersonaConCuenta(base.prisma, { givenName: 'Activa', status: 'ACTIVE' });
  deshabilitada = await crearPersonaConCuenta(base.prisma, { givenName: 'Baja', status: 'DISABLED' });
  invitada = await crearPersonaConCuenta(base.prisma, { givenName: 'Invitada', status: 'INVITED' });
}, 120_000);

afterAll(async () => {
  await base.destroy();
});

describe('acceso correcto', () => {
  it('abre sesión y devuelve un testigo que la base reconoce', async () => {
    const resultado = await login({ email: activa.email, password: PASSWORD }, contexto());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const sesion = await resolveSession(resultado.data.token);
    expect(sesion?.userId).toBe(activa.userId);
    expect(resultado.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('la base guarda el hash del testigo y no el testigo', async () => {
    const resultado = await login({ email: activa.email, password: PASSWORD }, contexto());
    if (!resultado.ok) throw resultado.error;

    const fila = await base.prisma.session.findUniqueOrThrow({
      where: { id: resultado.data.sessionId },
      select: { tokenHash: true },
    });
    expect(fila.tokenHash).toBe(hashToken(resultado.data.token));
    expect(fila.tokenHash).not.toBe(resultado.data.token);

    // Comprobación directa contra la tabla: ninguna columna contiene el testigo.
    const { rows } = await base.sql.query<{ presente: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM "session" WHERE "tokenHash" = $1) AS presente`,
      [resultado.data.token],
    );
    expect(rows[0]?.presente).toBe(false);
  });

  it('el correo se normaliza: mayúsculas y espacios no impiden entrar', async () => {
    const resultado = await login(
      { email: `  ${activa.email.toUpperCase()}  `, password: PASSWORD },
      contexto(),
    );
    expect(resultado.ok).toBe(true);
  });

  it('restablece el contador de intentos fallidos', async () => {
    await base.prisma.user.update({ where: { id: activa.userId }, data: { failedAttempts: 3 } });
    await login({ email: activa.email, password: PASSWORD }, contexto());
    const usuaria = await base.prisma.user.findUniqueOrThrow({
      where: { id: activa.userId },
      select: { failedAttempts: true, lockedUntil: true, lastLoginAt: true },
    });
    expect(usuaria.failedAttempts).toBe(0);
    expect(usuaria.lockedUntil).toBeNull();
    expect(usuaria.lastLoginAt).not.toBeNull();
  });

  it('deja constancia del acceso en la bitácora de seguridad, con el correo enmascarado', async () => {
    const resultado = await login({ email: activa.email, password: PASSWORD }, contexto());
    if (!resultado.ok) throw resultado.error;

    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'LOGIN_SUCCESS' },
      orderBy: { occurredAt: 'desc' },
      select: { subjectLabel: true, actorId: true },
    });
    expect(evento.subjectLabel).not.toBe(activa.email);
    expect(evento.subjectLabel).toContain('…');
    expect(evento.actorId).toBe(activa.actorId);
  });
});

describe('indistinguibilidad de los fallos', () => {
  it('cuenta inexistente, contraseña incorrecta y cuenta deshabilitada responden idéntico', async () => {
    const respuestas = await Promise.all([
      login({ email: 'nadie@ejemplo.invalid', password: PASSWORD }, contexto('ip-a')),
      login({ email: activa.email, password: 'contraseña que no es la suya' }, contexto('ip-b')),
      login({ email: deshabilitada.email, password: PASSWORD }, contexto('ip-c')),
      login({ email: invitada.email, password: PASSWORD }, contexto('ip-d')),
    ]);

    for (const respuesta of respuestas) {
      expect(respuesta.ok).toBe(false);
      if (respuesta.ok) continue;
      expect(respuesta.error.code).toBe('UNAUTHENTICATED');
      expect(respuesta.error.message).toBe('El correo o la contraseña no coinciden.');
      // Ni el mensaje ni los detalles pueden decir cuál de los cuatro casos fue.
      expect(respuesta.error.details).toBeUndefined();
      expect(JSON.stringify(respuesta.error.toPublicJSON())).not.toMatch(/deshabilit|invitad|existe|bloquead/i);
    }
  });

  it('el motivo real sí queda en la bitácora, que es donde se investiga', async () => {
    await login({ email: 'fantasma@ejemplo.invalid', password: PASSWORD }, contexto('ip-motivo'));
    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'LOGIN_FAILURE', ipHash: 'ip-motivo' },
      orderBy: { occurredAt: 'desc' },
      select: { detail: true, subjectLabel: true },
    });
    expect(JSON.stringify(evento.detail)).toContain('cuenta inexistente');
    expect(evento.subjectLabel).not.toContain('fantasma@');
  });

  it('la contraseña nunca llega a la bitácora', async () => {
    await login({ email: activa.email, password: 'secreto-que-no-debe-aparecer' }, contexto('ip-secreto'));
    const { rows } = await base.sql.query<{ presente: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "security_event" WHERE detail::text LIKE '%secreto-que-no-debe-aparecer%'
      ) AS presente`,
    );
    expect(rows[0]?.presente).toBe(false);
  });

  it('un correo mal formado se rechaza como validación, no como credencial incorrecta', async () => {
    const resultado = await login({ email: 'no-es-correo', password: PASSWORD }, contexto());
    expect(resultado.ok).toBe(false);
    // Aquí sí conviene distinguir: no revela nada sobre ninguna cuenta y evita
    // que alguien crea que su contraseña falló cuando el problema es la errata.
    expect(!resultado.ok && resultado.error.code).toBe('VALIDATION');
  });
});

describe('bloqueo progresivo y límite de tasa', () => {
  it('cinco fallos bloquean la cuenta temporalmente', async () => {
    const sujeto = await crearPersonaConCuenta(base.prisma, { givenName: 'Bloqueable' });
    for (let i = 0; i < 5; i += 1) {
      await login({ email: sujeto.email, password: 'incorrecta y larga' }, contexto(`ip-bloqueo-${i}`));
    }

    const usuaria = await base.prisma.user.findUniqueOrThrow({
      where: { id: sujeto.userId },
      select: { failedAttempts: true, lockedUntil: true },
    });
    expect(usuaria.failedAttempts).toBe(5);
    expect(usuaria.lockedUntil).not.toBeNull();
    expect(usuaria.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Con la contraseña correcta tampoco entra mientras dura el bloqueo, y la
    // respuesta sigue sin decir que está bloqueada.
    const intento = await login({ email: sujeto.email, password: PASSWORD }, contexto('ip-bloqueo-5'));
    expect(intento.ok).toBe(false);
    expect(!intento.ok && intento.error.message).toBe('El correo o la contraseña no coinciden.');
  }, 60_000);

  it('el bloqueo vence solo: no deja a nadie fuera para siempre', () => {
    expect(lockoutFor(4)).toBeNull();
    expect(lockoutFor(5)).not.toBeNull();

    const primero = lockoutFor(5)!.getTime() - Date.now();
    const septimo = lockoutFor(7)!.getTime() - Date.now();
    expect(septimo).toBeGreaterThan(primero);

    // Con un tope: sin él, una cuenta atacada quedaría inaccesible durante
    // semanas y la medida de seguridad se volvería el ataque.
    const extremo = lockoutFor(40)!.getTime() - Date.now();
    expect(extremo).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });

  it('el límite por cuenta se activa tras el número declarado de fallos', async () => {
    const sujeto = await crearPersonaConCuenta(base.prisma, { givenName: 'Limitable' });
    let limitado = false;
    for (let i = 0; i < RATE_LIMITS.loginByAccount.maxAttempts + 1; i += 1) {
      const resultado = await login({ email: sujeto.email, password: 'incorrecta y larga' }, contexto(`ip-var-${i}`));
      if (!resultado.ok && resultado.error.code === 'RATE_LIMITED') {
        limitado = true;
        expect(resultado.error.retryAfterSeconds).toBeGreaterThan(0);
        break;
      }
    }
    expect(limitado).toBe(true);
  }, 60_000);

  it('un origen desconocido no agota el cupo de todo el mundo', async () => {
    // Si la ausencia de origen omitiera el filtro, el recuento abarcaría los
    // fallos de TODO el sistema: bastaría un atacante sin origen identificable
    // para dejar fuera a las personas legítimas.
    const conOrigen = await checkRateLimit('LOGIN_FAILURE', { ipHash: 'ip-inexistente-y-limpia' }, RATE_LIMITS.loginByIp);
    const sinOrigen = await checkRateLimit('LOGIN_FAILURE', { ipHash: null }, RATE_LIMITS.loginByIp);
    const totales = await base.prisma.securityEvent.count({ where: { kind: 'LOGIN_FAILURE' } });

    expect(totales).toBeGreaterThan(0);
    expect(conOrigen.attempts).toBe(0);
    expect(sinOrigen.attempts).toBeLessThan(totales);
  });

  it('sin ningún discriminante, el recuento se niega a ejecutarse', async () => {
    await expect(checkRateLimit('LOGIN_FAILURE', {}, RATE_LIMITS.loginByIp)).rejects.toThrow(
      /exige al menos un discriminante/,
    );
  });
});

describe('elevación transparente de parámetros', () => {
  it('un hash con parámetros antiguos se recifra al entrar, sin que la persona lo note', async () => {
    const sujeto = await crearPersonaConCuenta(base.prisma, { givenName: 'Antigua' });

    // Se simula una credencial creada con parámetros más débiles de los vigentes.
    const { hash } = await hashPassword(PASSWORD);
    const credencial = await base.prisma.credential.findFirstOrThrow({
      where: { userId: sujeto.userId },
      select: { id: true },
    });
    await base.prisma.credential.update({
      where: { id: credencial.id },
      data: { secretHash: hash, algorithmParams: { algorithm: 'argon2id', memoryCost: 4096, timeCost: 1, parallelism: 1, outputLen: 32 } },
    });

    const resultado = await login({ email: sujeto.email, password: PASSWORD }, contexto('ip-recifrado'));
    expect(resultado.ok).toBe(true);

    const despues = await base.prisma.credential.findUniqueOrThrow({
      where: { id: credencial.id },
      select: { secretHash: true, algorithmParams: true },
    });
    expect((despues.algorithmParams as { memoryCost: number }).memoryCost).toBe(19_456);
    expect(despues.secretHash).not.toBe(hash);

    // Y la contraseña sigue siendo la misma para la persona.
    expect((await login({ email: sujeto.email, password: PASSWORD }, contexto('ip-recifrado-2'))).ok).toBe(true);
  }, 60_000);
});
