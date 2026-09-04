import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FileClassification, FileContextKind } from '@prisma-client/enums';
import { authorizeDownload, redeemDownload } from '@/platform/files';
import { detectsAs } from '@/platform/files/file-service';
import { newPublicId } from '@/platform/kernel/ids';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, contextoDe, crearPersonaConCuenta, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * E2E-14 y prueba negativa 13 (docs/TEST_PLAN.md §4, docs/PERMISSIONS.md §9).
 *
 * Criterio de la Fase 1: **un archivo privado no puede abrirse mediante su URL
 * persistente sin autorización**. Aquí se comprueban las dos mitades de esa
 * promesa: que la política decide en cada intento, y que conocer el
 * identificador de un archivo ajeno no sirve de nada —ni siquiera para saber
 * que existe—.
 */

let base: TestDatabase;
let propietaria: PersonaDePrueba;
let ajena: PersonaDePrueba;
let delegada: PersonaDePrueba;
let secretaria: PersonaDePrueba;
let entidadId: string;
let archivoInterno: string;
let archivoClinico: string;

async function crearArchivo(opciones: {
  classification: FileClassification;
  contextKind: FileContextKind;
  ownerPersonId?: string | null;
}): Promise<string> {
  const autor = await actorDeMigracion(base.prisma);
  const creado = await base.prisma.fileObject.create({
    data: {
      publicId: newPublicId(),
      legalEntityId: entidadId,
      ownerPersonId: opciones.ownerPersonId ?? null,
      classification: opciones.classification,
      contextKind: opciones.contextKind,
      originalFileName: 'documento.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024n,
      createdByActorId: autor,
      updatedByActorId: autor,
    },
    select: { id: true },
  });
  return creado.id;
}

beforeAll(async () => {
  base = await createTestDatabase('archivos');
  await base.seed();

  const entidad = await base.prisma.legalEntity.findFirstOrThrow({
    where: { code: 'FUERZA_INDIGO' },
    select: { id: true },
  });
  entidadId = entidad.id;

  propietaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Propietaria' });
  ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Ajena' });
  delegada = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada' });

  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria' });
  // Todos los nombramientos van a la misma entidad que los archivos: es lo que
  // hace que las denegaciones de estas pruebas se deban a lo que cada una mide
  // —titularidad, compartimento, pase— y no al aislamiento por entidad.
  for (const [userId, roleCode] of [
    [propietaria.userId, 'UNION_MEMBER'],
    [ajena.userId, 'UNION_MEMBER'],
    [delegada.userId, 'TERRITORIAL_DELEGATE'],
    [secretaria.userId, 'EXECUTIVE_SECRETARY'],
  ] as const) {
    await nombrar(base.prisma, {
      userId,
      roleCode,
      grantedById: secretaria.userId,
      legalEntityId: entidadId,
    });
  }

  archivoInterno = await crearArchivo({
    classification: 'INTERNAL',
    contextKind: 'GOVERNANCE',
    ownerPersonId: propietaria.personId,
  });
  archivoClinico = await crearArchivo({
    classification: 'CLINICAL',
    contextKind: 'CIAN',
    ownerPersonId: propietaria.personId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

describe('E2E-14 · conocer el identificador de un archivo ajeno no sirve de nada', () => {
  it('quien no tiene el permiso recibe «no encontrado», no «no autorizado»', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    const resultado = await authorizeDownload(actor, archivoInterno);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // NOT_FOUND y no FORBIDDEN: un «no tienes permiso» confirmaría que el
    // archivo existe, que ya es información sobre otra persona.
    expect(resultado.error.code).toBe('NOT_FOUND');
  });

  it('un archivo inexistente y uno fuera de alcance responden exactamente lo mismo', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    const inexistente = await authorizeDownload(actor, '00000000-0000-4000-8000-000000000000');
    const ajenoReal = await authorizeDownload(actor, archivoInterno);

    expect(inexistente.ok).toBe(false);
    expect(ajenoReal.ok).toBe(false);
    if (inexistente.ok || ajenoReal.ok) return;

    expect(ajenoReal.error.code).toBe(inexistente.error.code);
    expect(ajenoReal.error.message).toBe(inexistente.error.message);
    expect(JSON.stringify(ajenoReal.error.toPublicJSON())).toBe(
      JSON.stringify(inexistente.error.toPublicJSON()).replaceAll(
        '00000000-0000-4000-8000-000000000000',
        archivoInterno,
      ),
    );
  });

  it('el intento denegado queda registrado con el identificador, que sí es para la bitácora', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    await authorizeDownload(actor, archivoInterno);

    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'FILE_ACCESS_DENIED', actorId: ajena.actorId },
      orderBy: { occurredAt: 'desc' },
      select: { detail: true },
    });
    expect(JSON.stringify(evento.detail)).toContain(archivoInterno);

    const auditoria = await base.prisma.auditEvent.findFirstOrThrow({
      where: { objectId: archivoInterno, outcome: 'DENIED', actorId: ajena.actorId },
      orderBy: { occurredAt: 'desc' },
      select: { outcome: true },
    });
    expect(auditoria.outcome).toBe('DENIED');
  });

  it('la persona propietaria sí obtiene su pase', async () => {
    const actor = await contextoDe(base.prisma, propietaria);
    const resultado = await authorizeDownload(actor, archivoInterno);
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data.path).toContain(archivoInterno);
    expect(resultado.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('prueba negativa 13 · el pase no sustituye a la autorización', () => {
  async function pase(persona: PersonaDePrueba, fileId: string) {
    const actor = await contextoDe(base.prisma, persona);
    const resultado = await authorizeDownload(actor, fileId);
    if (!resultado.ok) throw resultado.error;
    const url = new URL(`https://ejemplo.invalid${resultado.data.path}`);
    return {
      actor,
      exp: Number(url.searchParams.get('exp')),
      sig: url.searchParams.get('sig') ?? '',
    };
  }

  it('un pase emitido para una persona no sirve a otra', async () => {
    // Es el caso del enlace reenviado por mensajería. La firma incluye al actor:
    // copiarla no transfiere la autorización.
    const emitido = await pase(propietaria, archivoInterno);
    const otra = await contextoDe(base.prisma, ajena);

    const resultado = await redeemDownload(otra, archivoInterno, emitido.exp, emitido.sig);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
  });

  it('un pase con la firma alterada se rechaza y se registra como crítico', async () => {
    const emitido = await pase(propietaria, archivoInterno);
    const alterada = `${emitido.sig.slice(0, -2)}00`;

    const resultado = await redeemDownload(emitido.actor, archivoInterno, emitido.exp, alterada);
    expect(resultado.ok).toBe(false);

    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'FILE_ACCESS_DENIED', severity: 'CRITICAL' },
      orderBy: { occurredAt: 'desc' },
      select: { detail: true },
    });
    expect(JSON.stringify(evento.detail)).toContain('firma del pase no válida');
  });

  it('un pase vencido no sirve, aunque su firma sea auténtica', async () => {
    const emitido = await pase(propietaria, archivoInterno);
    const vencido = Math.floor(Date.now() / 1000) - 10;
    const resultado = await redeemDownload(emitido.actor, archivoInterno, vencido, emitido.sig);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.internalReason).toContain('venció');
  });

  it('revocar el nombramiento invalida un pase ya emitido', async () => {
    // Es la razón de que el canje vuelva a evaluar la política. Sin esa segunda
    // evaluación, un enlace obtenido antes de la revocación seguiría abriendo el
    // archivo hasta que venciera.
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Revocada' });
    const secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien Nombra' });
    const asignacionId = await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'TERRITORIAL_DELEGATE',
      grantedById: secretaria.userId,
      legalEntityId: entidadId,
    });

    const archivo = await crearArchivo({ classification: 'INTERNAL', contextKind: 'GOVERNANCE' });
    const emitido = await pase(persona, archivo);

    // El pase atraviesa la autorización y solo se detiene en el almacén, que
    // en pruebas no tiene contenido. El motivo interno lo distingue de una
    // denegación de política, que es lo que debe aparecer después.
    const antes = await redeemDownload(emitido.actor, archivo, emitido.exp, emitido.sig);
    expect(antes.ok).toBe(false);
    expect(!antes.ok && antes.error.internalReason).toContain('no tiene contenido almacenado');

    await base.prisma.roleAssignment.update({
      where: { id: asignacionId },
      data: { revokedAt: new Date(), revokeReason: 'prueba de invalidación del pase' },
    });

    const despues = await contextoDe(base.prisma, persona);
    const resultado = await redeemDownload(despues, archivo, emitido.exp, emitido.sig);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
    // Ahora se detiene antes, en la política: el pase dejó de valer.
    expect(!resultado.ok && resultado.error.internalReason).not.toContain('no tiene contenido almacenado');
    expect(!resultado.ok && resultado.error.internalReason).toContain('permiso');
  }, 60_000);

  it('la vigencia del pase es más corta cuanto más sensible es el archivo', async () => {
    const interno = await pase(propietaria, archivoInterno);
    const clinico = await contextoDe(base.prisma, propietaria);
    const ticketClinico = await authorizeDownload(clinico, archivoClinico);

    // La propietaria alcanza su archivo clínico por ser suyo, sin necesidad de
    // compartimento: el compartimento acota a terceros, no a la titular.
    if (ticketClinico.ok) {
      const url = new URL(`https://ejemplo.invalid${ticketClinico.data.path}`);
      expect(Number(url.searchParams.get('exp'))).toBeLessThan(interno.exp);
    }
  });
});

describe('prueba negativa 4 · compartimento clínico', () => {
  it('la Secretaría Ejecutiva no tiene el compartimento clínico', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    expect([...actor.compartments]).toContain('UNION');
    expect([...actor.compartments]).not.toContain('CLINICAL');
  });

  it('con la descarga sensible pero sin asignación, el archivo clínico ajeno no se abre', async () => {
    // La denegación llega por la comprobación 4 —asignación viva sobre el
    // expediente— antes que por la 6, porque ese es el orden del contrato. En la
    // Fase 1 no existen todavía expedientes que asignar, de modo que la
    // comprobación de compartimento sobre archivos no es alcanzable aquí: se
    // ejercita en las pruebas del motor, y de extremo a extremo en la Fase 8,
    // cuando el CIAN tenga expedientes reales.
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await authorizeDownload(actor, archivoClinico);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('NOT_FOUND');
    expect(resultado.error.internalReason).toContain('asignación viva');
  });

  it('un rol sindical sin descarga sensible tampoco alcanza el archivo clínico', async () => {
    const actor = await contextoDe(base.prisma, delegada);
    const resultado = await authorizeDownload(actor, archivoClinico);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
  });

  it('la denegación de material clínico se registra como crítica', async () => {
    const actor = await contextoDe(base.prisma, delegada);
    await authorizeDownload(actor, archivoClinico);
    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'FILE_ACCESS_DENIED', actorId: delegada.actorId },
      orderBy: { occurredAt: 'desc' },
      select: { severity: true },
    });
    expect(evento.severity).toBe('CRITICAL');
  });
});

describe('validación del contenido por sus primeros bytes (PRD §20.5)', () => {
  it('reconoce un PDF auténtico', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(detectsAs('application/pdf', pdf)).toBe(true);
  });

  it('rechaza un ejecutable renombrado a PDF', () => {
    // Es el caso que motiva comprobar el contenido: la extensión y la cabecera
    // declarada las elige quien sube el archivo.
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect(detectsAs('application/pdf', elf)).toBe(false);
  });

  it('rechaza un tipo que no está en la lista de admitidos', () => {
    expect(detectsAs('application/x-msdownload', new Uint8Array([0x4d, 0x5a]))).toBe(false);
  });

  it('un archivo vacío no pasa por ningún tipo', () => {
    expect(detectsAs('application/pdf', new Uint8Array())).toBe(false);
  });
});
