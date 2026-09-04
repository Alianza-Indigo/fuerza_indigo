import { describe, expect, it } from 'vitest';
import { accountFromSlug } from '@/platform/payments';

/**
 * Selección de cuenta por dirección de webhook (PRD §11.2).
 *
 * Cada entidad recibe sus eventos en su propia dirección, y de ahí sale con qué
 * secreto se verifica la firma. Una traducción laxa —aceptar mayúsculas, o
 * cualquier cosa que empiece por «fuerza»— haría que un evento de una entidad se
 * procesara contra la otra, que es el caso «cuenta cruzada» del PRD §22.
 */
describe('accountFromSlug', () => {
  it('traduce las dos direcciones contratadas', () => {
    expect(accountFromSlug('fuerza')).toBe('FUERZA');
    expect(accountFromSlug('alianza')).toBe('ALIANZA');
  });

  it.each([
    'FUERZA',
    'Fuerza',
    'fuerza-indigo',
    'fuerzax',
    '../fuerza',
    '',
    'alianza/',
    'otra',
  ])('rechaza %s en vez de aproximar', (slug) => {
    expect(accountFromSlug(slug)).toBeNull();
  });
});
