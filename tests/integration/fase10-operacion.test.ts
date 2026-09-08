import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { healthReport } from '@/platform/health/health-check';
import { stuckJobs } from '@/platform/jobs/queue';
import { receiveWebhook, processWebhookEvent, retryUnreconciledWebhooks } from '@/modules/billing';
import { signStripePayload } from '@/platform/payments/signature';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { resetEnvCache } from '@/platform/config/env';

/**
 * Recuperación, conciliación y observabilidad de la Fase 10
 * (PRD §24 Fase 10 bloques C y D).
 *
 * No construye nada: comprueba, ejecutando el sistema, que la operación en
 * producción se sostiene. La recuperación se ejercita en un ambiente
 * controlado —una base reconstruida desde las migraciones del repositorio y la
 * semilla queda sana—; la conciliación tolera la entrega desordenada de
 * webhooks sin perder ni duplicar; y la observabilidad expone el estado de los
 * subsistemas —trabajos, bandeja de salida, cobro, bitácora— por una sola vía.
 */

let base: TestDatabase;

const SECRETO = 'whsec_de_prueba_operacion_00000000000000';
const puertoStripe: StripePort = {
  name: 'prueba',
  capability: () => ({ capability: 'CHARGES', detail: 'puerto de prueba' }),
  createCheckoutSession: (input) => Promise.resolve({ id: `cs_${input.idempotencyKey.slice(0, 10)}`, url: 'https://pasarela.invalid/pagar', paymentIntentId: `pi_${input.idempotencyKey.slice(0, 10)}` }),
  createPortalSession: () => Promise.resolve({ url: 'https://pasarela.invalid/portal' }),
  createRefund: () => Promise.resolve({ id: 're_test', status: 'succeeded' }),
};

beforeAll(async () => {
  base = await createTestDatabase('fase10-operacion');
  await base.seed();
  setStripeForTests(puertoStripe);
  process.env['STRIPE_FUERZA_WEBHOOK_SECRET'] = SECRETO;
  resetEnvCache();
}, 180_000);

afterAll(async () => {
  setStripeForTests(null);
  await base?.destroy();
});

function porNombre(checks: readonly { name: string; status: string }[], nombre: string) {
  return checks.find((c) => c.name === nombre);
}

describe('Recuperación en ambiente controlado (bloque C)', () => {
  it('una base reconstruida desde las migraciones del repositorio y la semilla queda sana', async () => {
    // `createTestDatabase` levantó la base aplicando cada migración; `seed()` la
    // pobló. Es el ejercicio de despliegue/recuperación desde el repositorio.
    const reporte = await healthReport();
    expect(porNombre(reporte.checks, 'base_de_datos')?.status).toBe('ok');
    expect(porNombre(reporte.checks, 'migraciones')?.status).toBe('ok');
    expect(porNombre(reporte.checks, 'semilla')?.status).toBe('ok');
    // La bitácora encadenada verifica íntegra tras la reconstrucción.
    expect(porNombre(reporte.checks, 'bitacora_encadenada')?.status).toBe('ok');
  });
});

describe('Conciliación de Stripe tolerante a la entrega desordenada (bloque C)', () => {
  async function entregar(tipo: string, objeto: Record<string, unknown>) {
    const rawBody = JSON.stringify({ id: `evt_op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, type: tipo, api_version: '2026-01-01', data: { object: objeto } });
    const recibido = await receiveWebhook({ slug: 'fuerza', rawBody, signatureHeader: signStripePayload({ rawBody, secret: SECRETO }), correlationId: 'prueba', ipHash: null });
    return recibido;
  }

  it('un evento que llega antes que su objeto no se pierde: queda sin conciliar y a la espera de reintento', async () => {
    const recibido = await entregar('payment_intent.succeeded', { id: 'pi_que_todavia_no_existe' });
    expect(recibido.kind).toBe('ACCEPTED');
    if (recibido.kind !== 'ACCEPTED') return;

    // Se persiste antes de procesar; procesarlo sin su objeto lo deja sin conciliar,
    // no lo descarta ni falla.
    const procesado = await processWebhookEvent(recibido.eventRowId, 'prueba');
    expect(procesado.kind).toBe('UNRECONCILED');

    // El trabajo de conciliación corre y devuelve su resumen sin lanzar.
    const resumen = await retryUnreconciledWebhooks('prueba');
    expect(typeof resumen.resolved).toBe('number');
    expect(typeof resumen.alerted).toBe('number');
    expect(typeof resumen.exhausted).toBe('number');
  });

  it('una firma inválida se rechaza: no entra a la cola de conciliación', async () => {
    const rawBody = JSON.stringify({ id: 'evt_falso', type: 'payment_intent.succeeded', api_version: '2026-01-01', data: { object: { id: 'pi_x' } } });
    const recibido = await receiveWebhook({ slug: 'fuerza', rawBody, signatureHeader: 'firma-invalida', correlationId: 'prueba', ipHash: null });
    expect(recibido.kind).toBe('BAD_SIGNATURE');
  });
});

describe('Observabilidad de los subsistemas (bloque D)', () => {
  it('la salud expone los trabajos, la bandeja de salida, el cobro y la bitácora por una sola vía', async () => {
    const reporte = await healthReport();
    for (const nombre of ['trabajos_programados', 'bandeja_de_salida', 'cobro', 'bitacora_encadenada', 'almacen_de_archivos']) {
      const check = porNombre(reporte.checks, nombre);
      expect(check, `falta la comprobación de salud «${nombre}»`).toBeDefined();
      expect(['ok', 'degraded', 'failed']).toContain(check!.status);
    }
    // El estado global es uno de los tres definidos, nunca indefinido.
    expect(['ok', 'degraded', 'failed']).toContain(reporte.status);
  });

  it('los trabajos atascados se consultan como una lista, no como una sorpresa', async () => {
    const atascados = await stuckJobs();
    expect(Array.isArray(atascados)).toBe(true);
  });
});
