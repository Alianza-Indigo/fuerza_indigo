import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  backoffMs,
  claimBatch,
  clearHandlersForTests,
  dispatchOutbox,
  enqueue,
  markFailed,
  markSucceeded,
  onDomainEvent,
  publishDomainEvent,
  stuckJobs,
  type ClaimedJob,
} from '@/platform/jobs/queue';
import { runJob } from '@/platform/jobs/handlers';
import { transaction } from '@/platform/db/unit-of-work';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion } from './helpers/fixtures';

/**
 * Cola de trabajos y bandeja de salida (ADR-0017, ADR-0025, PRD §17.5).
 *
 * Las dos piezas existen por la misma razón: en un entorno sin servidor propio
 * no hay proceso que sobreviva entre peticiones, de modo que lo que ha de
 * ocurrir después tiene que quedar **escrito** en la misma transacción que el
 * hecho que lo origina. Lo que se prueba aquí es justamente eso: que no existe
 * un estado intermedio en el que el hecho conste y la orden derivada se pierda.
 */

let base: TestDatabase;
let actorId: string;

beforeAll(async () => {
  base = await createTestDatabase('trabajos');
  actorId = await actorDeMigracion(base.prisma);
}, 120_000);

afterEach(() => {
  clearHandlersForTests();
});

afterAll(async () => {
  await base.destroy();
});

describe('encolado idempotente', () => {
  it('la misma clave de negocio no crea dos trabajos vivos', async () => {
    const primero = await enqueue({ jobType: 'mail-retry', businessKey: 'aviso-unico', payload: { to: 'a@b.lat' } });
    const segundo = await enqueue({ jobType: 'mail-retry', businessKey: 'aviso-unico', payload: { to: 'a@b.lat' } });

    expect(primero.created).toBe(true);
    expect(segundo.created).toBe(false);
    expect(segundo.id).toBe(primero.id);
    expect(await base.prisma.backgroundJob.count({ where: { businessKey: 'aviso-unico' } })).toBe(1);
  });

  it('un trabajo ya terminado no bloquea al siguiente con la misma clave', async () => {
    const primero = await enqueue({ jobType: 'mail-retry', businessKey: 'aviso-repetible' });
    await markSucceeded(primero.id, { enviado: true });

    const segundo = await enqueue({ jobType: 'mail-retry', businessKey: 'aviso-repetible' });
    expect(segundo.created).toBe(true);
    expect(segundo.id).not.toBe(primero.id);
  });
});

/**
 * `claimBatch` recibe la **identidad de quien despacha**, no un tipo de trabajo:
 * un solo despachador atiende la cola entera. Las pruebas localizan su trabajo
 * por identificador dentro del lote.
 */
async function tomarPorId(id: string, quien = 'prueba'): Promise<ClaimedJob> {
  for (let intento = 0; intento < 5; intento += 1) {
    const lote = await claimBatch(`${quien}-${intento}`, 50);
    const encontrado = lote.find((trabajo) => trabajo.id === id);
    if (encontrado !== undefined) return encontrado;
    if (lote.length === 0) break;
  }
  throw new Error(`El trabajo ${id} no apareció en ningún lote.`);
}

describe('toma de trabajos con bloqueo', () => {
  it('dos despachos simultáneos no se llevan el mismo trabajo', async () => {
    // Es lo que garantiza `FOR UPDATE SKIP LOCKED`. Sin él, dos instancias
    // tomarían el mismo trabajo y el efecto se ejecutaría dos veces.
    for (let i = 0; i < 6; i += 1) {
      await enqueue({ jobType: 'mail-retry', businessKey: `concurrente-${i}` });
    }

    const [uno, otro] = await Promise.all([claimBatch('despachador-a', 3), claimBatch('despachador-b', 3)]);
    const identificadores = [...uno, ...otro].map((trabajo) => trabajo.id);
    expect(new Set(identificadores).size).toBe(identificadores.length);
  }, 60_000);

  it('un trabajo con fecha futura no se toma todavía', async () => {
    const { id } = await enqueue({
      jobType: 'programado',
      businessKey: 'para-mañana',
      runAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const lote = await claimBatch('despachador-futuro', 50);
    expect(lote.map((trabajo) => trabajo.id)).not.toContain(id);
  });

  it('la carga viaja íntegra hasta el manejador', async () => {
    const { id } = await enqueue({
      jobType: 'con-carga',
      businessKey: 'carga-1',
      payload: { to: 'destino@ejemplo.invalid', n: 7 },
    });
    const tomado = await tomarPorId(id, 'despachador-carga');
    expect(tomado.payload).toEqual({ to: 'destino@ejemplo.invalid', n: 7 });
  });
});

describe('reintentos y fallo definitivo', () => {
  it('la espera crece y tiene tope', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(3));
    expect(backoffMs(3)).toBeLessThan(backoffMs(5));
    // Sin tope, el quinto reintento de un trabajo caería semanas después.
    expect(backoffMs(50)).toBe(15 * 60 * 1000);
  });

  it('reintenta hasta agotar y entonces queda marcado con alerta', async () => {
    // Un trabajo que deja de reintentar en silencio es un trabajo que nadie
    // investiga: por eso `alertedAt` se escribe justo al agotarse.
    const { id } = await enqueue({ jobType: 'fallido', businessKey: 'siempre-falla', maxAttempts: 2 });

    const primero = await tomarPorId(id, 'despachador-fallo-1');
    expect((await markFailed(primero, new Error('la dependencia no respondió'))).willRetry).toBe(true);

    await base.prisma.backgroundJob.update({ where: { id }, data: { runAt: new Date() } });
    const segundo = await tomarPorId(id, 'despachador-fallo-2');
    expect((await markFailed(segundo, new Error('la dependencia no respondió'))).willRetry).toBe(false);

    const fila = await base.prisma.backgroundJob.findUniqueOrThrow({
      where: { id },
      select: { status: true, attempts: true, alertedAt: true, lastError: true },
    });
    expect(fila.status).toBe('FAILED');
    expect(fila.attempts).toBe(2);
    expect(fila.alertedAt).not.toBeNull();
    expect(fila.lastError).toContain('la dependencia no respondió');
  }, 60_000);

  it('los trabajos agotados aparecen en el informe de atascados', async () => {
    const atascados = await stuckJobs();
    expect(atascados.find((entrada) => entrada.jobType === 'fallido')?.count).toBeGreaterThan(0);
  });

  it('un tipo de trabajo sin manejador falla de forma explícita', async () => {
    // Darlo por bueno sin hacer nada sería peor: el trabajo quedaría como
    // exitoso y su efecto no habría ocurrido.
    const { id } = await enqueue({ jobType: 'inexistente', businessKey: 'sin-manejador' });
    const trabajo = await tomarPorId(id, 'despachador-sin-manejador');
    await expect(runJob(trabajo)).rejects.toThrow(/No hay manejador/);
  });

  it('el manejador de reenvío exige destinatario y plantilla', async () => {
    const { id } = await enqueue({ jobType: 'mail-retry', businessKey: 'sin-datos', payload: {} });
    const trabajo = await tomarPorId(id, 'despachador-sin-datos');
    await expect(runJob(trabajo)).rejects.toThrow(/destinatario ni plantilla/);
  });

  it('una carga con tipos equivocados se trata como ausente, no como «[object Object]»', async () => {
    const { id } = await enqueue({
      jobType: 'mail-retry',
      businessKey: 'tipos-raros',
      payload: { to: { correo: 'anidado@ejemplo.invalid' }, templateCode: 42 },
    });
    const trabajo = await tomarPorId(id, 'despachador-tipos');
    await expect(runJob(trabajo)).rejects.toThrow(/destinatario ni plantilla/);
  });
});

describe('bandeja de salida', () => {
  it('el evento se escribe en la misma transacción que el hecho', async () => {
    // Si el hecho se confirma y el evento no, la orden derivada se pierde para
    // siempre. Aquí se revierte a propósito: no debe quedar ni una cosa ni otra.
    const antes = await base.prisma.outboxMessage.count();

    await expect(
      transaction(async (tx) => {
        await publishDomainEvent(tx, {
          eventName: 'prueba.revertida',
          payload: { valor: 1 },
          correlationId: 'correlacion-revertida',
          actorId,
        });
        throw new Error('el hecho falló después de publicar');
      }),
    ).rejects.toThrow('el hecho falló después de publicar');

    expect(await base.prisma.outboxMessage.count()).toBe(antes);
  });

  it('entrega a todos los manejadores registrados', async () => {
    const recibido: string[] = [];
    onDomainEvent('pago.confirmado', 'derechos', async (payload) => {
      recibido.push(`derechos:${String(payload['pagoId'])}`);
      return Promise.resolve();
    });
    onDomainEvent('pago.confirmado', 'aviso', async () => {
      recibido.push('aviso');
      return Promise.resolve();
    });

    await transaction((tx) =>
      publishDomainEvent(tx, {
        eventName: 'pago.confirmado',
        payload: { pagoId: 'pago-1' },
        correlationId: 'correlacion-pago',
        actorId,
      }),
    );

    const resultado = await dispatchOutbox();
    expect(resultado.delivered).toBe(2);
    expect(recibido.sort()).toEqual(['aviso', 'derechos:pago-1']);
  });

  it('reintentar no duplica el efecto de un manejador ya entregado', async () => {
    let veces = 0;
    onDomainEvent('pago.repetido', 'contador', async () => {
      veces += 1;
      return Promise.resolve();
    });

    await transaction((tx) =>
      publishDomainEvent(tx, {
        eventName: 'pago.repetido',
        payload: {},
        correlationId: 'correlacion-repetida',
        actorId,
      }),
    );

    await dispatchOutbox();
    await dispatchOutbox();
    await dispatchOutbox();
    expect(veces).toBe(1);
  });

  it('un manejador que falla no impide que los demás del mismo mensaje se entreguen', async () => {
    let bueno = 0;
    onDomainEvent('pago.parcial', 'roto', () => Promise.reject(new Error('el servicio no respondió')));
    onDomainEvent('pago.parcial', 'sano', async () => {
      bueno += 1;
      return Promise.resolve();
    });

    await transaction((tx) =>
      publishDomainEvent(tx, {
        eventName: 'pago.parcial',
        payload: {},
        correlationId: 'correlacion-parcial',
        actorId,
      }),
    );

    const resultado = await dispatchOutbox();
    expect(bueno).toBe(1);
    expect(resultado.failed).toBe(1);

    const mensaje = await base.prisma.outboxMessage.findFirstOrThrow({
      where: { eventName: 'pago.parcial' },
      select: { status: true, attempts: true, availableAt: true },
    });
    // Vuelve a quedar pendiente, con espera: el manejador sano ya no se
    // reejecutará, porque su entrega quedó registrada.
    expect(mensaje.status).toBe('PENDING');
    expect(mensaje.attempts).toBe(1);
    expect(mensaje.availableAt.getTime()).toBeGreaterThan(Date.now());

    const entregas = await base.prisma.outboxDelivery.findMany({
      where: { outboxMessage: { eventName: 'pago.parcial' } },
      select: { handlerCode: true, status: true, lastError: true },
      orderBy: { handlerCode: 'asc' },
    });
    expect(entregas.map((entrega) => [entrega.handlerCode, entrega.status])).toEqual([
      ['roto', 'FAILED'],
      ['sano', 'DELIVERED'],
    ]);
    expect(entregas[0]?.lastError).toContain('el servicio no respondió');
  }, 60_000);

  it('un evento sin manejadores no se descarta en silencio', async () => {
    await transaction((tx) =>
      publishDomainEvent(tx, {
        eventName: 'nadie.escucha',
        payload: {},
        correlationId: 'correlacion-huerfana',
        actorId,
      }),
    );

    await dispatchOutbox();
    const mensaje = await base.prisma.outboxMessage.findFirstOrThrow({
      where: { eventName: 'nadie.escucha' },
      select: { status: true, lastError: true },
    });
    expect(mensaje.status).toBe('DELIVERED');
    expect(mensaje.lastError).toContain('Sin manejadores registrados');
  });

  it('la bandeja de salida no se puede borrar con el rol de aplicación', async () => {
    const mensaje = await base.prisma.outboxMessage.findFirstOrThrow({ select: { id: true } });
    await expect(
      base.prisma.$executeRawUnsafe(`DELETE FROM "outbox_message" WHERE id = '${mensaje.id}'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });
});
