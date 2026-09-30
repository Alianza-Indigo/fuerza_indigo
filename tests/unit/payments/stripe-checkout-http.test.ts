import { afterEach, describe, expect, it, vi } from 'vitest';
import { stripe, type CheckoutLineItem } from '@/platform/payments/stripe-port';

vi.mock('@/platform/config/env', () => ({ env: () => ({ STRIPE_FUERZA_SECRET_KEY: 'sk_test_unit' }) }));

afterEach(() => vi.unstubAllGlobals());

async function sentForm(mode: 'payment' | 'subscription', interval: string | null, stripePriceId: string | null = null) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'cs_test', url: 'https://checkout.invalid', payment_intent: null }) });
  vi.stubGlobal('fetch', fetchMock);
  await stripe().createCheckoutSession({
    account: 'FUERZA', customerEmail: 'test@example.invalid', stripeCustomerId: null,
    mode, lineItems: [{ stripePriceId, amountMinor: 12500n, currency: 'MXN', productName: 'Cuota', quantity: 1, interval } satisfies CheckoutLineItem],
    successUrl: 'https://example.invalid/ok', cancelUrl: 'https://example.invalid/cancel',
    idempotencyKey: 'test', metadata: {},
  });
  return new URLSearchParams(fetchMock.mock.calls[0]![1].body as string);
}

describe('Stripe recibe la periodicidad del catálogo', () => {
  it.each([['MONTH', 'month', '1'], ['QUARTER', 'month', '3'], ['SEMESTER', 'month', '6'], ['YEAR', 'year', '1']])('%s se cobra con el intervalo correcto', async (interval, unit, count) => {
    const form = await sentForm('subscription', interval);
    expect(form.get('line_items[0][price_data][recurring][interval]')).toBe(unit);
    expect(form.get('line_items[0][price_data][recurring][interval_count]')).toBe(count);
  });
  it('el pago único no envía recurring', async () => {
    const form = await sentForm('payment', null);
    expect(form.has('line_items[0][price_data][recurring][interval]')).toBe(false);
  });
  it('un price_id existente conserva su configuración en Stripe', async () => {
    const form = await sentForm('subscription', 'MONTH', 'price_test');
    expect(form.get('line_items[0][price]')).toBe('price_test');
    expect(form.has('line_items[0][price_data][recurring][interval]')).toBe(false);
  });
});
