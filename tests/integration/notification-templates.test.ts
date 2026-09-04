import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createTestDatabase, type TestDatabase } from './helpers/database';

/**
 * Las plantillas que el código pide tienen que estar sembradas.
 *
 * El defecto que esta prueba impide es real y estuvo vivo toda la Fase 2: al
 * renombrar `InboundInquiry` a `SupportRequest` (D-F2-003) se cambió el código
 * de la plantilla en el caso de uso y no en la semilla. El acuse de la entrada
 * pública fallaba **siempre**, y no se notaba: el envío va por la cola, así que
 * quien escribía no veía ningún error y el trabajo se reintentaba en silencio
 * hasta agotarse.
 *
 * Se leen los códigos del propio código fuente en vez de mantener una lista
 * aparte, porque una lista aparte se desincroniza igual que se desincronizó la
 * semilla.
 */

let base: TestDatabase;

beforeAll(async () => {
  base = await createTestDatabase('plantillas');
  await base.seed();
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

/** Recorre el código productivo buscando `templateCode: 'ALGO'`. */
function codigosQuePideElCodigo(): Set<string> {
  const encontrados = new Set<string>();
  const raices = ['src', 'app'];

  const recorrer = (directorio: string): void => {
    for (const entrada of readdirSync(directorio)) {
      const completa = path.join(directorio, entrada);
      if (statSync(completa).isDirectory()) {
        if (entrada === 'generated' || entrada === 'node_modules') continue;
        recorrer(completa);
        continue;
      }
      if (!/\.tsx?$/.test(entrada)) continue;

      const contenido = readFileSync(completa, 'utf8');
      for (const coincidencia of contenido.matchAll(/templateCode:\s*'([A-Z0-9_]+)'/g)) {
        const codigo = coincidencia[1];
        if (codigo !== undefined) encontrados.add(codigo);
      }
    }
  };

  for (const raiz of raices) recorrer(raiz);
  return encontrados;
}

describe('cada plantilla que el código pide existe publicada', () => {
  it('no hay ningún código de plantilla sin sembrar', async () => {
    const pedidos = codigosQuePideElCodigo();
    expect(pedidos.size).toBeGreaterThan(0);

    const sembradas = new Set(
      (
        await base.prisma.notificationTemplate.findMany({
          where: { status: 'PUBLISHED', channel: 'EMAIL', locale: 'es-MX' },
          select: { code: true },
        })
      ).map((fila) => fila.code),
    );

    const faltantes = [...pedidos].filter((codigo) => !sembradas.has(codigo));
    expect(faltantes).toEqual([]);
  });

  it('el acuse de la entrada pública está entre ellas', async () => {
    // Se nombra a propósito: es la que faltaba, y nombrarla hace que un
    // renombrado futuro rompa esta prueba en vez de romper el acuse en silencio.
    const acuse = await base.prisma.notificationTemplate.findFirst({
      where: { code: 'SUPPORT_REQUEST_ACK', status: 'PUBLISHED' },
      select: { subject: true },
    });
    expect(acuse).not.toBeNull();
  });

  it('el comprobante de pago dice que no es una factura fiscal', async () => {
    // No es un detalle de redacción: presentar un comprobante como factura es
    // exactamente lo que el PRD §26 evita, porque la plataforma vincula
    // comprobantes y no sustituye a un sistema de facturación autorizado.
    const comprobante = await base.prisma.notificationTemplate.findFirstOrThrow({
      where: { code: 'PAYMENT_RECEIPT', status: 'PUBLISHED' },
      select: { bodyTemplate: true },
    });
    expect(comprobante.bodyTemplate).toContain('No es una factura fiscal');
  });

  it('el aviso de cobro fallido dice qué pasa después', async () => {
    const aviso = await base.prisma.notificationTemplate.findFirstOrThrow({
      where: { code: 'PAYMENT_FAILED_NOTICE', status: 'PUBLISHED' },
      select: { bodyTemplate: true, variables: true },
    });
    // Quien recibe «no pudimos cobrarte» sin saber qué pasa después se queda
    // esperando lo peor.
    expect(aviso.bodyTemplate).toContain('{{graceNotice}}');
    expect(aviso.bodyTemplate).toContain('No se te ha cobrado nada');
  });
});
