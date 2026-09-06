import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, entidadPrincipal } from './helpers/fixtures';

/**
 * Lo que el motor garantiza sobre el catálogo del ecosistema (PRD §12, Fase 7).
 *
 * Aquí no se prueba ningún caso de uso. Se prueba que las promesas de la ficha
 * **no dependan de que el código las respete**: que una dirección de acceso sea
 * siempre absoluta y cifrada, que «publicada» sea un hecho y no un adjetivo de
 * la interfaz, y que el código de la ficha no se pueda reescribir.
 *
 * Importa más de lo que parece porque este catálogo manda gente fuera del
 * sitio. Una dirección mal formada aquí no rompe una pantalla: lleva a una
 * persona a escribir su contraseña donde no debe.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;

beforeAll(async () => {
  base = await createTestDatabase('ecosistema');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function ficha(overrides: Record<string, unknown> = {}) {
  return base.prisma.ecosystemLink.create({
    data: {
      code: `prueba-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Plataforma de prueba',
      summary: 'Una ficha para comprobar lo que la base sostiene.',
      audienceText: 'Personas que prueban cosas.',
      legalEntityId: entidadId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, code: true, externalUrl: true, operationalStatus: true },
  });
}

describe('la dirección de acceso', () => {
  it('admite ausencia: una ficha sin dirección es un estado legítimo', async () => {
    const creada = await ficha();
    expect(creada.externalUrl).toBeNull();
  });

  it('admite una dirección absoluta y cifrada', async () => {
    const creada = await ficha({ externalUrl: 'https://ejemplo.mx/acceso' });
    expect(creada.externalUrl).toBe('https://ejemplo.mx/acceso');
  });

  it('rechaza una dirección sin cifrar', async () => {
    await expect(ficha({ externalUrl: 'http://ejemplo.mx' })).rejects.toThrow(
      /direccion_externa_absoluta_y_cifrada/,
    );
  });

  it('rechaza una dirección relativa, que no sacaría a nadie del sitio', async () => {
    await expect(ficha({ externalUrl: '/cian' })).rejects.toThrow(/direccion_externa_absoluta_y_cifrada/);
  });

  it('rechaza la cadena vacía, que es el disfraz de «no hay dirección»', async () => {
    await expect(ficha({ externalUrl: '' })).rejects.toThrow(/direccion_externa_absoluta_y_cifrada/);
  });
});

describe('el estado operativo', () => {
  it('no admite una ficha activa sin fecha de publicación', async () => {
    await expect(ficha({ operationalStatus: 'ACTIVE' })).rejects.toThrow(
      /publicacion_coherente_con_el_estado/,
    );
  });

  it('no admite una ficha oculta que finja estar publicada', async () => {
    await expect(ficha({ operationalStatus: 'HIDDEN', publishedAt: new Date() })).rejects.toThrow(
      /publicacion_coherente_con_el_estado/,
    );
  });

  it('admite la combinación coherente', async () => {
    const creada = await ficha({ operationalStatus: 'ACTIVE', publishedAt: new Date() });
    expect(creada.operationalStatus).toBe('ACTIVE');
  });
});

describe('lo que la aplicación no puede reescribir', () => {
  it('no puede cambiar el código de una ficha', async () => {
    const creada = await ficha();
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE "ecosystem_link" SET "code" = 'otro' WHERE "id" = '${creada.id}'`,
      ),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });

  it('sí puede cambiar la dirección, que es justo lo que se administra sin desplegar', async () => {
    const creada = await ficha();
    await base.prisma.ecosystemLink.update({
      where: { id: creada.id },
      data: { externalUrl: 'https://otra.mx', updatedByActorId: actorId },
    });
    const releida = await base.prisma.ecosystemLink.findUniqueOrThrow({
      where: { id: creada.id },
      select: { externalUrl: true },
    });
    expect(releida.externalUrl).toBe('https://otra.mx');
  });
});

describe('lo que este catálogo deliberadamente no tiene', () => {
  it('no existe ninguna tabla de derechos, lanzamientos o identidad hacia las plataformas externas', async () => {
    const tablas = await base.prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const nombres = tablas.map((t) => t.table_name);
    for (const prohibida of [
      'tool_definition',
      'tool_plan',
      'tool_entitlement',
      'tool_launch',
      'external_identity_link',
    ]) {
      expect(nombres).not.toContain(prohibida);
    }
  });

  it('la ficha guarda texto y dirección, y ninguna columna de operación ajena', async () => {
    const columnas = await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ecosystem_link'`,
    );
    const nombres = columnas.map((c) => c.column_name).sort();
    expect(nombres).toEqual([
      'accentToken',
      'audienceText',
      'code',
      'createdAt',
      'createdByActorId',
      'externalUrl',
      'id',
      'legalEntityId',
      'logoFileId',
      'name',
      'operationalStatus',
      'publishedAt',
      'rowVersion',
      'sortOrder',
      'summary',
      'updatedAt',
      'updatedByActorId',
    ]);
  });
});

describe('la semilla del catálogo', () => {
  it('deja las cinco fichas visibles y ninguna con dirección inventada', async () => {
    const fichas = await base.prisma.ecosystemLink.findMany({
      where: { code: { in: ['CIAN', 'CENI', 'NEUROPLAN', 'ADIA', 'NEXO'] } },
      select: { code: true, externalUrl: true, operationalStatus: true, summary: true, audienceText: true },
      orderBy: { sortOrder: 'asc' },
    });

    expect(fichas.map((f) => f.code)).toEqual(['CIAN', 'CENI', 'NEUROPLAN', 'ADIA', 'NEXO']);
    for (const f of fichas) {
      expect(f.externalUrl).toBeNull();
      expect(f.operationalStatus).toBe('ACTIVE');
      expect(f.summary.length).toBeGreaterThan(20);
      expect(f.audienceText.length).toBeGreaterThan(10);
    }
  });

  it('no pisa la dirección que alguien ya administró', async () => {
    await base.prisma.ecosystemLink.update({
      where: { code: 'CIAN' },
      data: { externalUrl: 'https://configurada-por-la-organizacion.mx', updatedByActorId: actorId },
    });

    await base.seed();

    const despues = await base.prisma.ecosystemLink.findUniqueOrThrow({
      where: { code: 'CIAN' },
      select: { externalUrl: true },
    });
    expect(despues.externalUrl).toBe('https://configurada-por-la-organizacion.mx');
  });

  it('quien mantiene el sitio público administra el catálogo, y el actor raíz no', async () => {
    const conElPermiso = await base.prisma.role.findMany({
      where: { permissions: { some: { permission: { code: 'ecosystem.link.manage' } } } },
      select: { code: true },
    });
    expect(conElPermiso.map((r) => r.code).sort()).toEqual(['COMMUNICATIONS']);
  });
});
