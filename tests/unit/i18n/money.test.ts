import { describe, expect, it } from 'vitest';
import {
  exponentOf,
  formatDateShort,
  formatMoney,
  parseAmountToMinor,
  startOfDayInZone,
  todayInZone,
} from '@/platform/i18n';

/**
 * La conversión de dinero es el sitio donde se pierde un centavo sin que nadie
 * lo note hasta la conciliación. Estas pruebas fijan el comportamiento exacto
 * de la captura y de la presentación.
 */

describe('capturar un importe', () => {
  it('convierte pesos con centavos a unidades menores', () => {
    expect(parseAmountToMinor('150.00', 'MXN')).toEqual({ ok: true, minor: 15000n });
    expect(parseAmountToMinor('150', 'MXN')).toEqual({ ok: true, minor: 15000n });
    expect(parseAmountToMinor('0.01', 'MXN')).toEqual({ ok: true, minor: 1n });
    expect(parseAmountToMinor('0', 'MXN')).toEqual({ ok: true, minor: 0n });
  });

  it('completa los centavos que faltan en vez de descolocarlos', () => {
    // «150.5» son ciento cincuenta pesos con cincuenta centavos, no con cinco.
    expect(parseAmountToMinor('150.5', 'MXN')).toEqual({ ok: true, minor: 15050n });
  });

  it('acepta la coma decimal, que es como se escribe en media América', () => {
    expect(parseAmountToMinor('150,75', 'MXN')).toEqual({ ok: true, minor: 15075n });
  });

  it('acepta separadores de millares cuando el patrón es inequívoco', () => {
    expect(parseAmountToMinor('1,500', 'MXN')).toEqual({ ok: true, minor: 150000n });
    expect(parseAmountToMinor('1,500.50', 'MXN')).toEqual({ ok: true, minor: 150050n });
    expect(parseAmountToMinor('$ 2 000', 'MXN')).toEqual({ ok: true, minor: 200000n });
  });

  it('el punto es siempre decimal, nunca millares', () => {
    // Si el punto se leyera alguna vez como separador de millares, «150.005»
    // valdría ciento cincuenta mil cinco pesos. Es un error de mil veces en un
    // cobro que sale de verdad, y no lo delata ninguna pantalla.
    expect(parseAmountToMinor('150.005', 'MXN').ok).toBe(false);
    expect(parseAmountToMinor('1.500', 'MXN').ok).toBe(false);
    expect(parseAmountToMinor('1.50', 'MXN')).toEqual({ ok: true, minor: 150n });
  });

  it('no redondea una fracción de centavo: la rechaza', () => {
    // Redondear aquí sería inventar dinero, y hacia arriba o hacia abajo
    // siempre le toca a alguien.
    expect(parseAmountToMinor('150.005', 'MXN').ok).toBe(false);
    expect(parseAmountToMinor('0.001', 'MXN').ok).toBe(false);
  });

  it('rechaza lo que no es una cantidad', () => {
    for (const entrada of ['', '   ', 'ciento cincuenta', '15O.00', '-150', '1e5', '150..00']) {
      expect(parseAmountToMinor(entrada, 'MXN').ok).toBe(false);
    }
  });

  it('no pasa por coma flotante', () => {
    // 1.15 * 100 vale 114.99999999999999 en JavaScript. Este es el caso que
    // obliga a que la conversión sea aritmética entera sobre cadenas.
    expect(parseAmountToMinor('1.15', 'MXN')).toEqual({ ok: true, minor: 115n });
    expect(parseAmountToMinor('8.29', 'MXN')).toEqual({ ok: true, minor: 829n });
    expect(Math.round(1.15 * 100)).not.toBe(114);
  });

  it('conserva importes mayores que el entero seguro de JavaScript', () => {
    const resultado = parseAmountToMinor('90071992547409919.91', 'MXN');
    expect(resultado).toEqual({ ok: true, minor: 9007199254740991991n });
  });
});

describe('presentar un importe', () => {
  it('presenta unidades menores como moneda', () => {
    expect(formatMoney(15000n, 'MXN')).toContain('150.00');
    expect(formatMoney(1n, 'MXN')).toContain('0.01');
  });

  it('presenta importes negativos, que existen en un reembolso', () => {
    expect(formatMoney(-15000n, 'MXN')).toContain('150.00');
    expect(formatMoney(-15000n, 'MXN')).toMatch(/-|−|\(/);
  });

  it('presenta exacto un importe mayor que el entero seguro', () => {
    expect(formatMoney(9007199254740991991n, 'MXN')).toContain('90,071,992,547,409,919.91');
  });

  it('ida y vuelta: lo que se captura es lo que se presenta', () => {
    for (const escrito of ['150.00', '0.01', '1,500.50', '99999.99']) {
      const capturado = parseAmountToMinor(escrito, 'MXN');
      if (!capturado.ok) throw new Error(`no se capturó ${escrito}`);
      const presentado = formatMoney(capturado.minor, 'MXN');
      const devuelto = parseAmountToMinor(presentado.replace(/[^\d.,]/g, ''), 'MXN');
      expect(devuelto).toEqual({ ok: true, minor: capturado.minor });
    }
  });
});

describe('el exponente es del catálogo de monedas, no una constante suelta', () => {
  it('las monedas que la plataforma cobra tienen dos decimales', () => {
    expect(exponentOf('MXN')).toBe(2);
    expect(exponentOf('USD')).toBe(2);
  });
});

describe('un día del calendario no es un instante', () => {
  it('el 1 de enero en México empieza a las 06:00 UTC, no a medianoche', () => {
    // Con `new Date('2026-01-01T00:00:00Z')` un precio acordado para enero
    // empezaba a regir a las seis de la tarde del 31 de diciembre y se
    // presentaba con la fecha del día anterior.
    const inicio = startOfDayInZone('2026-01-01', 'America/Mexico_City');
    expect(inicio?.toISOString()).toBe('2026-01-01T06:00:00.000Z');
  });

  it('se presenta con el día que se capturó', () => {
    const inicio = startOfDayInZone('2026-01-01', 'America/Mexico_City');
    if (inicio === null) throw new Error('no se convirtió');
    expect(formatDateShort(inicio, { locale: 'es-MX', timeZone: 'America/Mexico_City' })).toContain('1 ene 2026');
  });

  it('respeta el horario de verano de zonas que lo tienen', () => {
    // Madrid está en UTC+1 en enero y en UTC+2 en julio.
    expect(startOfDayInZone('2026-01-15', 'Europe/Madrid')?.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(startOfDayInZone('2026-07-15', 'Europe/Madrid')?.toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('rechaza lo que no es una fecha del calendario', () => {
    for (const entrada of ['', '2026-1-1', 'mañana', '2026/01/01']) {
      expect(startOfDayInZone(entrada, 'America/Mexico_City')).toBeNull();
    }
  });

  it('el día de hoy es el de quien mira, no el del servidor', () => {
    // A las 02:00 UTC del día 2 todavía es día 1 en México.
    const instante = new Date('2026-03-02T02:00:00.000Z');
    expect(todayInZone('America/Mexico_City', instante)).toBe('2026-03-01');
    expect(todayInZone('UTC', instante)).toBe('2026-03-02');
  });
});
