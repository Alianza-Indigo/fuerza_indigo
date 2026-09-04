import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { record, siteReport } from '@/platform/analytics';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  contextoRaiz,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';


/**
 * Medición agregada del sitio (F2-OPS-002).
 *
 * Lo que se comprueba no es que sepa contar, sino la propiedad que hace que
 * llamarla «respetuosa de la privacidad» sea cierto y no una etiqueta: **no
 * existe una fila por visita**. Mil visitas a la portada en la misma hora dejan
 * una fila con mil, no mil filas. Sin filas por visita no hay recorrido que
 * reconstruir.
 */

let base: TestDatabase;
let sinFacultades: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('metrics');
  await base.seed();
  await entidadPrincipal(base.prisma);
  sinFacultades = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

beforeEach(async () => {
  // Se limpia con la conexión propietaria y no con la de la aplicación: a esta
  // última la migración le retira `DELETE` y `TRUNCATE` sobre la tabla, y que no
  // pueda es precisamente una de las cosas que se comprueban más abajo.
  await base.sql.query('TRUNCATE TABLE "site_metric"');
});

describe('no existe una fila por visita', () => {
  it('cien visitas a la misma ruta en la misma hora dejan una sola fila', async () => {
    for (let i = 0; i < 100; i += 1) {
      await record('PAGE_VIEW', { route: '/', userAgentClass: 'MOBILE' });
    }

    const filas = await base.prisma.siteMetric.findMany({ where: { event: 'PAGE_VIEW' } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.count).toBe(100);
  });

  it('la hora se guarda en punto: sin minutos no se encadenan visitas', async () => {
    await record('PAGE_VIEW', { route: '/contacto' });

    const fila = await base.prisma.siteMetric.findFirstOrThrow({ where: { route: '/contacto' } });
    expect(fila.occurredAtHour.getUTCMinutes()).toBe(0);
    expect(fila.occurredAtHour.getUTCSeconds()).toBe(0);
    expect(fila.occurredAtHour.getUTCMilliseconds()).toBe(0);
  });

  it('la tabla no tiene ninguna columna que pueda señalar a una persona', async () => {
    const { rows } = await base.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'site_metric' ORDER BY column_name`,
    );
    const columnas = rows.map((fila) => fila.column_name);

    expect(columnas.sort()).toEqual(
      ['count', 'event', 'id', 'occurredAtHour', 'route', 'userAgentClass'].sort(),
    );

    // Ni huella de origen, ni persona, ni sesión, ni correlación. La lista de
    // arriba ya lo dice, y esta comprobación lo dice por su nombre para que un
    // añadido futuro falle con un mensaje que se entienda.
    for (const prohibida of ['ipHash', 'personId', 'sessionId', 'correlationId', 'userAgent', 'fingerprint']) {
      expect(columnas, `apareció la columna ${prohibida}`).not.toContain(prohibida);
    }
  });

  it('el término de la búsqueda no llega a la base ni por la ruta', async () => {
    await record('SEARCH_WITHOUT_RESULTS', { route: '/buscar?q=despido+injustificado' });

    const filas = await base.prisma.siteMetric.findMany({});
    expect(filas.map((fila) => fila.route)).toEqual(['/buscar']);
    expect(JSON.stringify(filas)).not.toContain('despido');
  });

  it('una ruta con folio dentro se agrupa y el folio no se guarda', async () => {
    await record('PAGE_VIEW', { route: '/gestion/mensajes/FI-2026-ABCDEFGH' });

    const filas = await base.prisma.siteMetric.findMany({});
    expect(filas.map((fila) => fila.route)).toEqual(['/*']);
    expect(JSON.stringify(filas)).not.toContain('FI-2026');
  });
});

describe('la aplicación incrementa y lee, pero no borra', () => {
  it('borrar un contador desde la aplicación falla con permiso denegado', async () => {
    await record('PAGE_VIEW', { route: '/' });

    await expect(base.prisma.siteMetric.deleteMany({})).rejects.toThrow(/permission denied|permiso/i);

    // Y el contador sigue ahí: una medición agregada que se puede borrar desde
    // una petición web deja de servir para rendir cuentas de lo que el sitio
    // hizo, y no hay ninguna razón legítima para que una petición la borre.
    expect(await base.prisma.siteMetric.count()).toBe(1);
  });
});

describe('contar nunca rompe una página', () => {
  it('un fallo al escribir no lanza', async () => {
    // Un evento fuera del enumerado hace fallar la escritura en el motor. Lo que
    // importa es que la función devuelva sin lanzar: quien está leyendo la
    // página tiene que verla igual.
    await expect(record('NO_EXISTE' as never, { route: '/' })).resolves.toBeUndefined();
  });
});

describe('informe', () => {
  it('separa el tráfico automatizado del de personas', async () => {
    await record('PAGE_VIEW', { route: '/', userAgentClass: 'MOBILE' });
    await record('PAGE_VIEW', { route: '/', userAgentClass: 'DESKTOP' });
    for (let i = 0; i < 50; i += 1) await record('PAGE_VIEW', { route: '/', userAgentClass: 'BOT' });

    const informe = await siteReport(await contextoRaiz());
    expect(informe.ok).toBe(true);
    if (!informe.ok) return;

    expect(informe.data.paginasVistas).toBe(2);
    expect(informe.data.visitasDeRastreadores).toBe(50);
    expect(informe.data.porRuta).toEqual([{ route: '/', count: 2 }]);
  });

  it('cuenta por separado las búsquedas con y sin resultados', async () => {
    await record('SEARCH_WITH_RESULTS', { route: '/buscar' });
    await record('SEARCH_WITHOUT_RESULTS', { route: '/buscar' });
    await record('SEARCH_WITHOUT_RESULTS', { route: '/buscar' });

    const informe = await siteReport(await contextoRaiz());
    if (!informe.ok) throw new Error(informe.error.message);

    expect(informe.data.busquedasConResultados).toBe(1);
    expect(informe.data.busquedasSinResultados).toBe(2);
  });

  it('sin facultad de leer la salud técnica no se ve el informe', async () => {
    const resultado = await siteReport(await contextoDe(base.prisma, sinFacultades));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});

/** Un nombramiento sin facultades técnicas tampoco alcanza el informe. */
describe('alcance', () => {
  it('un rol de comunicación no lo alcanza', async () => {
    const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
    const comunicacion = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Prensa' });
    await nombrar(base.prisma, {
      userId: comunicacion.userId,
      roleCode: 'COMMUNICATIONS',
      grantedById: quienNombra.userId,
      legalEntityId: await entidadPrincipal(base.prisma),
    });

    const resultado = await siteReport(await contextoDe(base.prisma, comunicacion));
    expect(resultado.ok).toBe(false);
  });
});
