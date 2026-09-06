import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import { cambiarVisibilidad, catalogoCompleto, catalogoPublicado, editarFicha } from '@/modules/ecosystem';

/**
 * Los ocho criterios del PRD §24 Fase 7.
 *
 * Se comprueban **ejecutando el sistema** y mirando después lo que quedó en la
 * base con las credenciales de la aplicación. Nunca leyendo el código: que una
 * función se llame `accesoDeLaFicha` no dice nada sobre lo que hace, y un
 * criterio comprobado por lectura es una opinión con formato de prueba.
 */

let base: TestDatabase;
let comunicacion: PersonaDePrueba;
let agremiada: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('fase7-criterios');
  await base.seed();

  const entidadId = await entidadPrincipal(base.prisma);
  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  comunicacion = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Comunica' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona', familyName: 'Agremiada' });

  await nombrar(base.prisma, {
    userId: comunicacion.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
  await nombrar(base.prisma, {
    userId: agremiada.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const TEXTOS = {
  name: 'NEXO',
  summary: 'Herramienta de vinculación del ecosistema, con su propia operación.',
  audienceText: 'Personas y organizaciones del ecosistema.',
  accentToken: 'HERRAMIENTAS' as const,
  sortOrder: '50',
};

async function idDe(code: string): Promise<string> {
  const ficha = await base.prisma.ecosystemLink.findUniqueOrThrow({ where: { code }, select: { id: true } });
  return ficha.id;
}

describe('F7-QA-001 · una plataforma se agrega sin cambiar el núcleo de membresías', () => {
  it('crear una ficha nueva no toca ninguna tabla de afiliación ni de cobro', async () => {
    const antes = {
      membresias: await base.prisma.membership.count(),
      solicitudes: await base.prisma.membershipApplication.count(),
      calidades: await base.prisma.membershipType.count(),
      productos: await base.prisma.catalogProduct.count(),
      pagos: await base.prisma.payment.count(),
    };

    const actorId = (await base.prisma.actor.findFirstOrThrow({ where: { kind: 'MIGRATION' } })).id;
    await base.prisma.ecosystemLink.create({
      data: {
        code: 'PLATAFORMA_NUEVA',
        name: 'Plataforma nueva',
        summary: 'Una plataforma que se incorpora al ecosistema más adelante.',
        audienceText: 'Quien la necesite.',
        sortOrder: 60,
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
    });

    const despues = {
      membresias: await base.prisma.membership.count(),
      solicitudes: await base.prisma.membershipApplication.count(),
      calidades: await base.prisma.membershipType.count(),
      productos: await base.prisma.catalogProduct.count(),
      pagos: await base.prisma.payment.count(),
    };

    expect(despues).toEqual(antes);
  });
});

describe('F7-QA-002 · ninguna ficha tiene un botón sin dirección real configurable', () => {
  it('sin dirección no llega acceso, y con dirección llega la que se configuró', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);
    const nexoId = await idDe('NEXO');

    const sinDireccion = (await catalogoPublicado()).find((f) => f.code === 'NEXO');
    expect(sinDireccion?.accesoUrl).toBeNull();

    await editarFicha(actor, { ...TEXTOS, linkId: nexoId, externalUrl: 'https://nexo.ejemplo.mx/entrar' });

    const conDireccion = (await catalogoPublicado()).find((f) => f.code === 'NEXO');
    expect(conDireccion?.accesoUrl).toBe('https://nexo.ejemplo.mx/entrar');

    // Y la dirección es configurable de verdad: se cambia y se ve el cambio,
    // sin que nadie despliegue nada.
    await editarFicha(actor, { ...TEXTOS, linkId: nexoId, externalUrl: 'https://nexo.ejemplo.mx/otra' });
    expect((await catalogoPublicado()).find((f) => f.code === 'NEXO')?.accesoUrl).toBe(
      'https://nexo.ejemplo.mx/otra',
    );
  });
});

describe('F7-QA-003 · CIAN y CENI aparecen exclusivamente como accesos externos', () => {
  it('no existe en la base nada que opere CIAN o CENI desde aquí', async () => {
    const tablas = (
      await base.prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      )
    ).map((t) => t.table_name);

    // Ni expediente, ni agenda, ni evaluación, ni cobro de esas plataformas.
    for (const prohibida of [
      'cian_case',
      'cian_appointment',
      'cian_session',
      'ceni_assessment',
      'ceni_certificate',
      'ceni_organization',
      'tool_entitlement',
      'tool_launch',
      'external_identity_link',
    ]) {
      expect(tablas).not.toContain(prohibida);
    }

    // Lo único que hay de ellas es su ficha.
    const columnas = (
      await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'ecosystem_link'`,
      )
    ).map((c) => c.column_name);
    expect(columnas).not.toContain('entitlementId');
    expect(columnas).not.toContain('lastLaunchAt');
    expect(columnas).not.toContain('externalUserId');
  });

  it('ningún enumerado del sistema vuelve a nombrar una operación de CIAN o CENI', async () => {
    const valores = await base.prisma.$queryRawUnsafe<{ valor: string }[]>(
      `SELECT e.enumlabel AS valor FROM pg_enum e`,
    );
    const nombres = valores.map((v) => v.valor);
    for (const prohibido of ['CIAN_CARE', 'CIAN_ATTENTION', 'CIAN_SERVICE', 'TOOL_ACCESS', 'TOOL_IDENTITY_EXCHANGE']) {
      expect(nombres).not.toContain(prohibido);
    }
  });
});

describe('F7-QA-004 · quien pulsa sabe, antes de pulsar, que sale de Fuerza Índigo', () => {
  it('la ficha que llega a la pantalla trae el nombre con el que se anuncia la salida', async () => {
    // El aviso se compone en la tarjeta con el nombre de la ficha, y se
    // comprueba en el navegador (`tests/e2e/catalogo-ecosistema.spec.ts`).
    // Aquí se comprueba lo que hace falta para que ese aviso pueda escribirse:
    // que la ficha llegue con nombre propio y no con un identificador.
    const fichas = await catalogoPublicado();
    for (const ficha of fichas) {
      expect(ficha.name.trim().length).toBeGreaterThan(1);
      expect(ficha.name).not.toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe('F7-QA-005 · el acceso es únicamente redirección externa', () => {
  it('la dirección no lleva ningún dato de la persona, aunque quien mire tenga sesión', async () => {
    const actorAgremiada = await contextoDe(base.prisma, agremiada);
    const fichas = await catalogoPublicado();

    const serializado = JSON.stringify(fichas);
    expect(serializado).not.toContain(actorAgremiada.personId ?? 'sin-persona');
    expect(serializado).not.toContain(actorAgremiada.actorId);

    for (const ficha of fichas) {
      if (ficha.accesoUrl === null) continue;
      const url = new URL(ficha.accesoUrl);
      expect([...url.searchParams.keys()]).toEqual([]);
      expect(url.hash).toBe('');
      expect(url.username).toBe('');
    }
  });

  it('el catálogo devuelve lo mismo con sesión y sin ella', async () => {
    const sinSesion = await catalogoPublicado();
    // La consulta pública no recibe actor: no hay forma de que devuelva otra
    // cosa según quién pregunte, y eso es lo que hace que no haya elegibilidad.
    expect(catalogoPublicado.length).toBe(0);
    const otraVez = await catalogoPublicado();
    expect(otraVez).toEqual(sinSesion);
  });
});

describe('F7-QA-006 · ninguna dirección de acceso está escrita en un componente', () => {
  it('cambiar la dirección en la base cambia lo que sale al público, sin tocar código', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);
    const nexoId = await idDe('NEXO');

    await editarFicha(actor, { ...TEXTOS, linkId: nexoId, externalUrl: 'https://cambiada-en-la-base.mx/' });
    expect((await catalogoPublicado()).find((f) => f.code === 'NEXO')?.accesoUrl).toBe(
      'https://cambiada-en-la-base.mx/',
    );

    await editarFicha(actor, { ...TEXTOS, linkId: nexoId, externalUrl: '' });
    expect((await catalogoPublicado()).find((f) => f.code === 'NEXO')?.accesoUrl).toBeNull();
  });
});

describe('F7-QA-007 · la falla de una plataforma externa no bloquea el portal central', () => {
  it('el catálogo se sirve entero sin llamar a ninguna plataforma', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);
    const nexoId = await idDe('NEXO');

    // Un dominio reservado por norma para que nunca resuelva.
    await editarFicha(actor, {
      ...TEXTOS,
      linkId: nexoId,
      externalUrl: 'https://esta-plataforma-no-existe.invalid/entrar',
    });

    // Medir el tiempo no serviría: un dominio inexistente falla al instante, y
    // la prueba pasaría igual aunque el catálogo estuviera llamando. Lo que se
    // afirma es más fuerte y se comprueba de la única forma que puede fallar:
    // **no hay ninguna llamada**. Si la hubiera, la caída de esa plataforma se
    // convertiría en una espera del portal central.
    const original = globalThis.fetch;
    let llamadas = 0;
    globalThis.fetch = (...args: Parameters<typeof fetch>) => {
      llamadas += 1;
      return original(...args);
    };

    try {
      const fichas = await catalogoPublicado();

      expect(llamadas, 'el catálogo llamó a una plataforma externa').toBe(0);
      expect(fichas.find((f) => f.code === 'NEXO')?.accesoUrl).toBe(
        'https://esta-plataforma-no-existe.invalid/entrar',
      );
      expect(fichas.length).toBeGreaterThan(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('F7-QA-008 · todas las fichas siguen el mismo patrón, sin casos especiales', () => {
  it('CIAN y CENI se administran con el mismo caso de uso que NeuroPlan, ADIA y NEXO', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    for (const code of ['CIAN', 'CENI', 'NEUROPLAN', 'ADIA', 'NEXO']) {
      const id = await idDe(code);
      const resultado = await editarFicha(actor, {
        ...TEXTOS,
        linkId: id,
        name: code,
        externalUrl: `https://${code.toLowerCase()}.ejemplo.mx/`,
      });
      expect(resultado.ok, `${code} no se pudo editar`).toBe(true);

      const oculta = await cambiarVisibilidad(actor, { linkId: id, publicar: false });
      expect(oculta.ok, `${code} no se pudo ocultar`).toBe(true);

      const visible = await cambiarVisibilidad(actor, { linkId: id, publicar: true });
      expect(visible.ok, `${code} no se pudo publicar`).toBe(true);
    }

    const completo = await catalogoCompleto(actor);
    expect(completo.ok).toBe(true);
    if (completo.ok) {
      // Todas llegan con la misma forma: si alguna necesitara un campo propio,
      // aquí faltaría o sobraría una clave.
      const formas = new Set(completo.data.map((f) => Object.keys(f).sort().join(',')));
      expect(formas.size).toBe(1);
    }
  });
});
