import { describe, expect, it } from 'vitest';
import { maskEmail } from '@/platform/audit/audit-service';
import {
  classifyUserAgent,
  fingerprint,
  hashIp,
  hashToken,
  newCorrelationId,
  newOpaqueToken,
  newPublicId,
  safeEquals,
  summarizeUserAgent,
} from '@/platform/kernel/ids';

describe('newPublicId', () => {
  it('no usa las letras que se confunden al dictarse por teléfono', () => {
    // Estos códigos se leen en voz alta en oficinas territoriales y se
    // transcriben a mano. I, L, O y U se confunden con 1, 1, 0 y V.
    const muestra = Array.from({ length: 300 }, () => newPublicId()).join('');
    for (const letra of ['I', 'L', 'O', 'U']) {
      expect(muestra.includes(letra), `el alfabeto incluye ${letra}`).toBe(false);
    }
  });

  it('produce identificadores distintos', () => {
    const generados = new Set(Array.from({ length: 2000 }, () => newPublicId()));
    expect(generados.size).toBe(2000);
  });

  it('respeta la longitud pedida', () => {
    expect(newPublicId()).toHaveLength(22);
    expect(newPublicId(8)).toHaveLength(8);
  });

  it('no revela orden ni antigüedad: dos consecutivos no comparten prefijo', () => {
    const primero = newPublicId();
    const segundo = newPublicId();
    expect(primero.slice(0, 6)).not.toBe(segundo.slice(0, 6));
  });
});

describe('newCorrelationId', () => {
  it('es un UUID', () => {
    expect(newCorrelationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('newOpaqueToken y hashToken', () => {
  it('el testigo tiene al menos 32 bytes de entropía', () => {
    const token = newOpaqueToken();
    expect(Buffer.from(token, 'base64url').length).toBe(32);
  });

  it('el hash es estable y no permite recuperar el testigo', () => {
    const token = newOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it('dos testigos distintos producen hashes distintos', () => {
    expect(hashToken(newOpaqueToken())).not.toBe(hashToken(newOpaqueToken()));
  });
});

describe('hashIp', () => {
  it('la misma dirección con la misma sal se reconoce', () => {
    expect(hashIp('198.51.100.7', 'sal')).toBe(hashIp('198.51.100.7', 'sal'));
  });

  it('la sal separa los espacios: la misma dirección no se correlaciona entre propósitos', () => {
    expect(hashIp('198.51.100.7', 'sal-a')).not.toBe(hashIp('198.51.100.7', 'sal-b'));
  });

  it('no conserva la dirección en claro', () => {
    expect(hashIp('198.51.100.7', 'sal')).not.toContain('198.51.100.7');
  });

  it('la ausencia de dirección no se convierte en un valor falso', () => {
    expect(hashIp(null, 'sal')).toBeNull();
    expect(hashIp('', 'sal')).toBeNull();
  });
});

describe('safeEquals', () => {
  it('reconoce cadenas iguales', () => {
    expect(safeEquals('abcdef', 'abcdef')).toBe(true);
  });

  it('distingue cadenas distintas de igual longitud', () => {
    expect(safeEquals('abcdef', 'abcdeg')).toBe(false);
  });

  it('devuelve falso, y no lanza, ante longitudes distintas', () => {
    // Lanzar delataría por la vía de la excepción justo lo que la comparación
    // en tiempo constante intenta no delatar por la vía del reloj.
    expect(safeEquals('corto', 'muchísimo más largo')).toBe(false);
    expect(safeEquals('', 'x')).toBe(false);
  });

  it('trata correctamente los acentos y la eñe', () => {
    expect(safeEquals('mañana', 'mañana')).toBe(true);
    expect(safeEquals('mañana', 'manana')).toBe(false);
  });
});

describe('summarizeUserAgent', () => {
  it('acota la cadena a 200 caracteres', () => {
    expect(summarizeUserAgent('x'.repeat(500))).toHaveLength(200);
  });

  it('la ausencia se conserva como ausencia', () => {
    expect(summarizeUserAgent(null)).toBeNull();
    expect(summarizeUserAgent('')).toBeNull();
  });
});

describe('classifyUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'MOBILE'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'MOBILE'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', 'DESKTOP'],
    ['curl/8.5.0', 'BOT'],
    ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'BOT'],
    ['HeadlessChrome/120.0', 'BOT'],
    [null, 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ])('clasifica %s como %s', (agente, esperado) => {
    expect(classifyUserAgent(agente)).toBe(esperado);
  });
});

describe('fingerprint', () => {
  it('el mismo identificador produce la misma huella', () => {
    expect(fingerprint('persona@ejemplo.lat', 'sal')).toBe(fingerprint('persona@ejemplo.lat', 'sal'));
  });

  it('normaliza mayúsculas y espacios: es el mismo correo', () => {
    expect(fingerprint('  Persona@Ejemplo.LAT ', 'sal')).toBe(fingerprint('persona@ejemplo.lat', 'sal'));
  });

  it('no colisiona donde la máscara sí colisiona', () => {
    // Es la razón de existir de esta función. `maskEmail` reduce ambos correos a
    // «pe…o@dominio.lat», de modo que usarla como clave del límite de intentos
    // hacía que los fallos contra una cuenta bloquearan la otra (`D-F1-015`).
    expect(maskEmail('pedro@dominio.lat')).toBe(maskEmail('pedrito@dominio.lat'));
    expect(maskEmail('ana.perez@x.lat')).toBe(maskEmail('antonio.gomez@x.lat'));

    expect(fingerprint('pedro@dominio.lat', 'sal')).not.toBe(fingerprint('pedrito@dominio.lat', 'sal'));
    expect(fingerprint('ana.perez@x.lat', 'sal')).not.toBe(fingerprint('antonio.gomez@x.lat', 'sal'));
  });

  it('no conserva el identificador en claro', () => {
    const huella = fingerprint('persona@ejemplo.lat', 'sal');
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella).not.toContain('persona');
    expect(huella).not.toContain('ejemplo');
  });

  it('la sal separa los espacios: la misma cuenta no se correlaciona entre propósitos', () => {
    expect(fingerprint('persona@ejemplo.lat', 'sal-a')).not.toBe(fingerprint('persona@ejemplo.lat', 'sal-b'));
  });
});
